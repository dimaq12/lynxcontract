//@realizes: [contracts/server#Parser]
// Contract-test: assertions read off the Parser contract's post clauses.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseDocument, walkEntries, parseListValue } from '@lynx/core';

const URI = 'file:///tmp/lynx-test/Sample.kt';

test('post: blocks preserve source order with kind, name, entries tree', () => {
  const text = [
    '//@module:',
    '//@  layer: integration',
    '//@',
    '//@contract: RegisterDeviceRoute.handle',
    '//@  pre: command.id != null',
    'class RegisterDeviceRoute',
  ].join('\n');
  const f = parseDocument(text, URI);
  assert.equal(f.blocks.length, 2);
  assert.equal(f.blocks[0].kind, 'module');
  assert.equal(f.blocks[1].kind, 'contract');
  assert.equal(f.blocks[1].name, 'RegisterDeviceRoute.handle');
  assert.equal(f.blocks[1].entries[0].key, 'pre');
  assert.equal(f.blocks[1].attachedTo, 'RegisterDeviceRoute');
});

test('post: every entry carries exact line + column ranges for key and value', () => {
  const text = '//@contract:\n//@  post: result != null';
  const f = parseDocument(text, URI);
  const post = f.blocks[0].entries[0];
  assert.equal(post.line, 1);
  // line is `//@  post: result != null` — key `post` starts at col 5
  assert.equal(post.keyRange!.start, 5);
  assert.equal(post.keyRange!.end, 9);
  assert.equal(text.split('\n')[1].slice(post.valueRange!.start, post.valueRange!.end), 'result != null');
});

test('post: raw-block children (| values) are NEVER parsed as keys — mermaid survives', () => {
  const text = [
    '//@graph: m',
    '//@  dataflow: |',
    '//@    ```mermaid',
    '//@    flowchart LR',
    '//@      IN --> OUT',
    '//@    ```',
    '//@  vanilla: "plain module"',
  ].join('\n');
  const f = parseDocument(text, URI);
  const dataflow = f.blocks[0].entries.find((e) => e.key === 'dataflow')!;
  assert.equal(dataflow.rawBlock, true);
  assert.equal(dataflow.children.length, 4);
  assert.ok(dataflow.children.every((c) => c.key === undefined));
  // the sibling after the raw block is parsed as a normal key again
  assert.ok(f.blocks[0].entries.some((e) => e.key === 'vanilla'));
});

test('post: result.fills lists every {{Token}} with its range', () => {
  const text = '//@messaging:\n//@  consumes:\n//@    topic: {{Provider}}.{{Domain}}.command.open';
  const f = parseDocument(text, URI);
  assert.deepEqual(f.fills.map((x) => x.token), ['Provider', 'Domain']);
  const first = f.fills[0];
  assert.equal(text.split('\n')[2].slice(first.start, first.end), '{{Provider}}');
});

test('shorthand //@pre: opens an implicit contract block (§4)', () => {
  const f = parseDocument('//@pre: x != 0\nfun f(x: Int) {}', URI);
  assert.equal(f.blocks.length, 1);
  assert.equal(f.blocks[0].kind, 'contract');
  assert.equal(f.blocks[0].implicit, true);
  assert.equal(f.blocks[0].entries[0].key, 'pre');
});

test('//@end sentinel closes the block (§2.1)', () => {
  const f = parseDocument('//@contract:\n//@  pre: a > 0\n//@end\n//@module:\n//@  layer: libs', URI);
  assert.equal(f.blocks.length, 2);
  assert.equal(f.blocks[0].endLine, 2);
});

test('KDoc tag form parses to the same block shape (§2.2)', () => {
  const text = [
    '/**',
    ' * Reserves units.',
    ' *',
    ' * @contract',
    ' * @pre  units > 0 && capacity >= units',
    ' * @post capacity == old(capacity) - units',
    ' */',
    'fun reserve(units: Long) {}',
  ].join('\n');
  const f = parseDocument(text, URI);
  assert.equal(f.blocks.length, 1);
  assert.equal(f.blocks[0].form, 'kdoc');
  assert.deepEqual(f.blocks[0].entries.map((e) => e.key), ['pre', 'post']);
});

test('produces list items carry inline keys and nested children (§13)', () => {
  const text = [
    '//@messaging:',
    '//@  produces:',
    '//@    - topic: devices.event.device-registered',
    '//@      as: DeviceRegistered',
    '//@    - topic: devices.event.device-open-failed',
    '//@      when: raises PermanentException',
  ].join('\n');
  const f = parseDocument(text, URI);
  const produces = f.blocks[0].entries.find((e) => e.key === 'produces')!;
  const items = produces.children.filter((c) => c.listItem);
  assert.equal(items.length, 2);
  assert.equal(items[0].key, 'topic');
  assert.equal(items[0].value, 'devices.event.device-registered');
  assert.equal(items[0].children[0].key, 'as');
  assert.equal(items[1].children[0].key, 'when');
});

test('trailing # comment is split off the value and kept (drop rationale depends on it)', () => {
  const f = parseDocument('//@messaging:\n//@  errors:\n//@    CallbackNoise: drop   # a callback answers no command', URI);
  const errors = f.blocks[0].entries[0];
  const route = errors.children[0];
  assert.equal(route.key, 'CallbackNoise');
  assert.equal(route.value, 'drop');
  assert.equal(route.comment, 'a callback answers no command');
});

test('raises: a parser never throws on malformed input — degrades to fewer blocks', () => {
  const garbage = '//@contract\n//@  :::\n//@ - -\n//@]]]\nnot lynx at all\n//@  pre missing colon eventually';
  assert.doesNotThrow(() => parseDocument(garbage, URI));
});

test('parseListValue returns items with exact offsets', () => {
  const items = parseListValue('[a.kt, b/c.kt]', 10);
  assert.deepEqual(items.map((i) => i.item), ['a.kt', 'b/c.kt']);
  assert.equal(items[0].start, 11);
});

test('walkEntries flattens the tree pre-order', () => {
  const f = parseDocument('//@messaging:\n//@  consumes:\n//@    topic: a.b.command.c\n//@    group: g', URI);
  const keys = walkEntries(f.blocks[0].entries).map((e) => e.key);
  assert.deepEqual(keys, ['consumes', 'topic', 'group']);
});
