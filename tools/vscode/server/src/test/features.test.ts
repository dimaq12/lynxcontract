//@realizes: [contracts/server#Features]
// Contract-test: assertions read off the Features contract's rules/post clauses.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseDocument } from '@lynx/core';
import { completion, hover, definition, documentSymbols, foldingRanges, semanticTokens, TOKEN_TYPES } from '../features';
import { WorkspaceIndex } from '../workspaceIndex';

const URI = 'file:///tmp/lynx-test/Sample.kt';

test('completion inside a block offers ONLY that kind\'s keys', () => {
  const text = '//@messaging:\n//@  ';
  const file = parseDocument(text, URI);
  const items = completion(file, '//@  ', { line: 1, character: 5 }) as { label: string }[];
  const labels = items.map((i) => i.label);
  assert.ok(labels.includes('consumes'));
  assert.ok(labels.includes('errors'));
  assert.ok(!labels.includes('layer'));      // module key must not leak into messaging
  assert.ok(!labels.includes('through'));    // flow key must not leak into messaging
});

test('completion after //@ at top level offers the 7 block starters + shorthand', () => {
  const file = parseDocument('//@', URI);
  const items = completion(file, '//@', { line: 0, character: 3 }) as { label: string }[];
  const labels = items.map((i) => i.label);
  for (const k of ['contract:', 'module:', 'messaging:', 'flow:', 'graph:', 'observability:', 'plugin:']) {
    assert.ok(labels.includes(k), `missing starter ${k}`);
  }
  assert.ok(labels.includes('pre'));
});

test('completion after an enum key offers its closed value set', () => {
  const text = '//@messaging:\n//@  ordering: ';
  const file = parseDocument(text, URI);
  const items = completion(file, '//@  ordering: ', { line: 1, character: 15 }) as { label: string }[];
  assert.deepEqual(items.map((i) => i.label), ['per-key', 'per-partition', 'none']);
});

test('hover text comes from SpecModel docs and cites the spec §', () => {
  const text = '//@messaging:\n//@  idempotent: false';
  const file = parseDocument(text, URI);
  const h = hover(file, '//@  idempotent: false', { line: 1, character: 7 });
  assert.ok(h);
  assert.match(h!.contents.value, /§13\.1/);
  assert.match(h!.contents.value, /re-delivery/);
});

test('hover on a block kind describes the block', () => {
  const file = parseDocument('//@flow:', URI);
  const h = hover(file, '//@flow:', { line: 0, character: 5 });
  assert.ok(h);
  assert.match(h!.contents.value, /§14/);
});

test('definition on a realizes value jumps to the contract block line, not just the file', () => {
  const index = new WorkspaceIndex();
  index.refreshContent(
    'file:///tmp/lynx-test/contracts/register-device.lynx.kt',
    '// header line\n//@contract: RegisterDeviceRoute.handle\n//@  post: result != null',
  );
  const line = '//@realizes: [contracts/register-device#RegisterDeviceRoute.handle]';
  const d = definition(index, line, { line: 0, character: 20 });
  assert.ok(d);
  assert.equal(d!.uri, 'file:///tmp/lynx-test/contracts/register-device.lynx.kt');
  assert.equal((d!.range as { start: { line: number } }).start.line, 1);
});

test('document symbols: one named symbol per block', () => {
  const text = [
    '//@module:',
    '//@  layer: integration',
    '//@',
    '//@contract: RegisterDeviceRoute.handle',
    '//@  pre: command.id != null',
  ].join('\n');
  const file = parseDocument(text, URI);
  const syms = documentSymbols(file) as { name: string }[];
  assert.equal(syms.length, 2);
  assert.equal(syms[0].name, '@module');
  assert.equal(syms[1].name, '@contract: RegisterDeviceRoute.handle');
});

interface DecodedTok { line: number; start: number; length: number; type: string }

function decode(data: number[]): DecodedTok[] {
  const out: DecodedTok[] = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i];
    start = data[i] === 0 ? start + data[i + 1] : data[i + 1];
    out.push({ line, start, length: data[i + 2], type: TOKEN_TYPES[data[i + 3]] });
  }
  return out;
}

function at(toks: DecodedTok[], line: number, text: string, source: string[]): DecodedTok | undefined {
  const col = source[line].indexOf(text);
  return toks.find((t) => t.line === line && t.start === col && t.length === text.length);
}

test('semantic tokens: role-based types per the Features contract table', () => {
  const source = [
    '//@messaging: RegisterDeviceRoute',
    '//@  consumes:',
    '//@    topic: corelab.devices.command.register-device',
    '//@    as: RegisterDevice',
    '//@    format: envelope-json',
    '//@  errors:',
    '//@    PermanentException: failed-event + dlq',
    '//@  intent: why this route exists',
  ];
  const file = parseDocument(source.join('\n'), URI);
  const toks = decode(semanticTokens(file));

  assert.equal(at(toks, 0, 'messaging', source)?.type, 'keyword');
  assert.equal(at(toks, 0, 'RegisterDeviceRoute', source)?.type, 'function');
  assert.equal(at(toks, 2, 'topic', source)?.type, 'property');
  assert.equal(at(toks, 2, 'corelab.devices.command.register-device', source)?.type, 'namespace');
  assert.equal(at(toks, 3, 'RegisterDevice', source)?.type, 'type');
  assert.equal(at(toks, 4, 'envelope-json', source)?.type, 'enumMember');
  assert.equal(at(toks, 6, 'PermanentException', source)?.type, 'class');
  assert.equal(at(toks, 6, 'failed-event', source)?.type, 'enumMember');
  assert.equal(at(toks, 6, 'dlq', source)?.type, 'enumMember');
  assert.equal(at(toks, 7, 'why this route exists', source)?.type, 'comment');
});

test('semantic tokens: fills → macro and never overlapped by value tokens', () => {
  const source = ['//@messaging:', '//@  consumes:', '//@    topic: {{Provider}}.devices.command.open'];
  const file = parseDocument(source.join('\n'), URI);
  const toks = decode(semanticTokens(file));
  assert.equal(at(toks, 2, '{{Provider}}', source)?.type, 'macro');
  for (let i = 0; i < toks.length; i++) {
    for (let j = i + 1; j < toks.length; j++) {
      const a = toks[i];
      const b = toks[j];
      assert.ok(a.line !== b.line || a.start + a.length <= b.start || b.start + b.length <= a.start,
        `overlap: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
  }
});

test('semantic tokens: expression keywords and numbers in pre/post', () => {
  const source = ['//@contract:', '//@  post: result.total == old(level) - 42'];
  const file = parseDocument(source.join('\n'), URI);
  const toks = decode(semanticTokens(file));
  assert.equal(at(toks, 1, 'old', source)?.type, 'keyword');
  assert.equal(at(toks, 1, '42', source)?.type, 'number');
});

test('semantic tokens: raw mermaid children get no tokens (left to TextMate)', () => {
  const source = ['//@graph: m', '//@  dataflow: |', '//@    flowchart LR', '//@      A --> B'];
  const file = parseDocument(source.join('\n'), URI);
  const toks = decode(semanticTokens(file));
  assert.ok(toks.every((t) => t.line < 2));
});

test('folding ranges cover multi-line block extents', () => {
  const text = '//@contract:\n//@  pre: a > 0\n//@  post: result > 0\nfun f() {}';
  const file = parseDocument(text, URI);
  const folds = foldingRanges(file) as { startLine: number; endLine: number }[];
  assert.equal(folds.length, 1);
  assert.equal(folds[0].startLine, 0);
  assert.equal(folds[0].endLine, 2);
});
