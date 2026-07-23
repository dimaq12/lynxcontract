//@realizes: [contracts/graph#Extractor]
// Contract-test: assertions read off the Extractor contract's rules.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { loadInputs } from '../build';
import { extract } from '../extract';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const inputs = loadInputs({
  root: ROOT,
  templateDir: path.join(ROOT, 'fixtures/template'),
  manifestFiles: [path.join(ROOT, 'fixtures/instantiations/acme-corelab.md')],
  generatedDir: path.join(ROOT, 'fixtures/generated/acme-corelab'),
  reportsDir: path.join(ROOT, 'fixtures/reports'),
});
const g = extract(inputs);

test('rule: every spec-§2 node kind reachable from fixtures is emitted', () => {
  const kinds = new Set(g.nodes.map((n) => n.kind));
  for (const k of ['stub', 'contract', 'rule', 'fill_token', 'fill_value', 'instance', 'target', 'method', 'marker', 'gap', 'clause', 'test_case', 'topic', 'pin', 'quirk', 'finding']) {
    assert.ok(kinds.has(k), `missing node kind ${k}`);
  }
});

test('rule: multiplier stub emits one target per declared instance, existence per disk', () => {
  const targets = g.nodes.filter((n) => n.kind === 'target' && n.id.includes('external/messages/commands/'));
  assert.equal(targets.length, 3);
  const byName = Object.fromEntries(targets.map((t) => [t.name, t.attrs]));
  assert.equal(byName['external/messages/commands/StartCapture.kt'].exists, 1);
  assert.equal(byName['external/messages/commands/StopCapture.kt'].exists, 0);
  assert.equal(byName['external/messages/commands/StopCapture.kt'].blocked_reason, null);
  assert.equal(byName['external/messages/commands/ResetCapture.kt'].exists, 0);
  assert.match(String(byName['external/messages/commands/ResetCapture.kt'].blocked_reason), /unpinned/);
});

test('rule: unresolved anchors keep resolved=0 and are never dropped', () => {
  const dangling = g.edges.filter((e) => e.attrs.resolved === 0);
  assert.ok(dangling.some((e) => String(e.attrs.ref).includes('shared/envelope#EnvelopeRoute')));
});

test('token closure: unregistered fill marked registered=0; registered ones 1', () => {
  const region = g.nodes.find((n) => n.kind === 'fill_token' && n.name === 'Region');
  const command = g.nodes.find((n) => n.kind === 'fill_token' && n.name === 'Command');
  assert.equal(region?.attrs.registered, 0);
  assert.equal(command?.attrs.registered, 1);
});

test('clauses: raises + produces-when extracted; covers edge resolves; scope reduction lands on the clause', () => {
  const clauses = g.nodes.filter((n) => n.kind === 'clause');
  assert.ok(clauses.some((c) => c.name === 'StartCaptureRoute.handle.raises.PermanentException'));
  assert.ok(clauses.some((c) => c.name === 'StartCaptureRoute.handle.raises.RetryableException'));
  const pw = clauses.find((c) => c.name === 'StartCaptureRoute.produces-when.PermanentException');
  assert.match(String(pw?.attrs.scope_reduced), /shared envelope/);
  const covers = g.edges.find((e) => e.kind === 'covers');
  assert.equal(covers?.attrs.resolved, 1);
  assert.ok(covers?.dst.endsWith('StartCaptureRoute.handle.raises.PermanentException'));
});

test('topics: consumes/produces edges meet at shared topic nodes', () => {
  const produced = g.edges.filter((e) => e.kind === 'produces').map((e) => e.dst);
  const consumed = g.edges.filter((e) => e.kind === 'consumes').map((e) => e.dst);
  assert.ok(produced.includes('topic:telemetry.event.capture-started'));
  assert.ok(consumed.includes('topic:corelab.telemetry.command.open-capture'));
});

test('gap ledger: explains edge reaches the cited marker', () => {
  const explains = g.edges.filter((e) => e.kind === 'explains');
  assert.equal(explains.length, 1);
  assert.ok(explains[0].src.endsWith('G-001'));
  assert.ok(explains[0].dst.includes('template-gap'));
});

test('method mapping: generated handle() realizes the contract by signature', () => {
  const m = g.edges.find((e) => e.kind === 'realizes' && e.src.startsWith('method:') && e.src.endsWith('#handle'));
  assert.ok(m, 'no method realizes edge');
  assert.ok(m!.dst.endsWith('StartCaptureRoute.handle'));
});

test('post: output is sorted and a second extraction is deep-equal (determinism)', () => {
  const ids = g.nodes.map((n) => n.id);
  assert.deepEqual(ids, [...ids].sort());
  const g2 = extract(inputs);
  assert.deepEqual(g2, g);
});

test('spec §3.1: unnamed-block and marker ids survive line shifts (content-hash names)', () => {
  const stub = [
    '// TARGET: src/Route.kt',
    '// REALIZATION: generate',
    '',
    '//@module:',
    '//@  layer: core',
    '//@  package: com.acme.demo',
    '',
    '// TEMPLATE-GAP: lookup absent from the template; stubbed',
    '//@contract: Route.handle',
    '//@  signature: fun handle(): Unit',
  ].join('\n');
  const mk = (text: string) => extract({
    template: [{ path: 'tpl/Route.lynx.kt', text }],
    manifests: [], generated: [], reports: [],
  });
  const before = mk(stub);
  const after = mk('// a new comment line shifts everything below\n' + stub);
  const idsOf = (e: typeof before, kind: string) => e.nodes.filter((n) => n.kind === kind).map((n) => n.id).sort();
  assert.deepEqual(idsOf(after, 'contract'), idsOf(before, 'contract'), 'contract ids shifted with lines');
  assert.deepEqual(idsOf(after, 'marker'), idsOf(before, 'marker'), 'marker ids shifted with lines');
  const unnamed = before.nodes.find((n) => n.kind === 'contract' && n.name?.startsWith('module@'));
  assert.ok(unnamed && /^module@h[0-9a-f]{8}$/.test(unnamed.name!), `content-hash name expected, got ${unnamed?.name}`);
});

test('spec §3.1: identical unnamed blocks disambiguate deterministically (-2, -3, …)', () => {
  const marker = '// TEMPLATE-GAP: same text';
  const e = extract({
    template: [{ path: 'tpl/Twin.lynx.kt', text: `// TARGET: src/T.kt\n// REALIZATION: generate\n${marker}\n${marker}\n` }],
    manifests: [], generated: [], reports: [],
  });
  const names = e.nodes.filter((n) => n.kind === 'marker').map((n) => n.id.split('#')[1]).sort();
  assert.equal(names.length, 2);
  assert.ok(/^template-gap@h[0-9a-f]{8}$/.test(names[0]), names[0]);
  assert.equal(names[1], `${names[0]}-2`);
});
