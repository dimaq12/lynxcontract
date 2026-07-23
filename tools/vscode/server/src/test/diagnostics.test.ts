//@realizes: [contracts/server#Diagnostics]
// Contract-test: one assertion per rule in the Diagnostics contract's lint catalogue.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseDocument } from '@lynx/core';
import { validate, DEFAULT_SETTINGS, SEV, LynxDiagnostic } from '../diagnostics';
import { WorkspaceIndex } from '../workspaceIndex';

const URI = 'file:///tmp/lynx-test/Sample.kt';

function lint(text: string, settings = { ...DEFAULT_SETTINGS, acmeProfile: true }, index = new WorkspaceIndex(), uri = URI): LynxDiagnostic[] {
  return validate(parseDocument(text, uri), index, settings);
}

function codes(diags: LynxDiagnostic[]): string[] {
  return diags.map((d) => d.code);
}

test('unknown block kind → Error (§3)', () => {
  const d = lint('//@contrct:\n//@  pre: x > 0');
  assert.ok(codes(d).includes('lynx.unknown-block'));
  assert.equal(d.find((x) => x.code === 'lynx.unknown-block')!.severity, SEV.Error);
});

test('unknown key in a known block → Warning (§19)', () => {
  const d = lint('//@contract:\n//@  postcondition: x > 0');
  const hit = d.find((x) => x.code === 'lynx.unknown-key')!;
  assert.ok(hit);
  assert.equal(hit.severity, SEV.Warning);
});

test('unknownKeySeverity: off silences the unknown-key lint', () => {
  const d = lint('//@contract:\n//@  postcondition: x > 0', { ...DEFAULT_SETTINGS, unknownKeySeverity: 'off' });
  assert.ok(!codes(d).includes('lynx.unknown-key'));
});

test('enum-valued keys reject values outside the closed set → Error (§13.1)', () => {
  const d = lint('//@messaging:\n//@  ordering: alphabetical');
  assert.ok(codes(d).includes('lynx.bad-enum'));
  const d2 = lint('//@messaging:\n//@  consumes:\n//@    topic: p.d.command.a\n//@    format: xml');
  assert.ok(codes(d2).includes('lynx.bad-enum'));
});

test('old() outside post/inv → Error (§6)', () => {
  const d = lint('//@contract:\n//@  pre: old(capacity) > 0');
  assert.ok(codes(d).includes('lynx.old-scope'));
  const ok = lint('//@contract:\n//@  post: capacity == old(capacity) - amount');
  assert.ok(!codes(ok).includes('lynx.old-scope'));
});

test('`!!` inside a contract expression → Error (§5)', () => {
  const d = lint('//@contract:\n//@  pre: user!!.id > 0');
  assert.ok(codes(d).includes('lynx.bang-bang'));
  const ok = lint('//@contract:\n//@  pre: a != b');
  assert.ok(!codes(ok).includes('lynx.bang-bang'));
});

test('produces.when raises E without a matching errors route → Error (§13.3)', () => {
  const d = lint([
    '//@messaging:',
    '//@  produces:',
    '//@    - topic: devices.event.open-failed',
    '//@      when: raises PermanentException',
    '//@  errors:',
    '//@    TransientException: retry-in-process',
  ].join('\n'));
  assert.ok(codes(d).includes('lynx.unmatched-when'));
});

test('idempotent: false + retry-topic → Error "double-actuation" (§13.3)', () => {
  const d = lint([
    '//@messaging:',
    '//@  idempotent: false',
    '//@  errors:',
    '//@    RetryableException: retry-topic',
  ].join('\n'));
  assert.ok(codes(d).includes('lynx.nonidempotent-retry'));
});

test('drop without inline rationale → Error; with rationale → clean (§13.3 v1.2)', () => {
  const bad = lint('//@messaging:\n//@  errors:\n//@    Noise: drop');
  assert.ok(codes(bad).includes('lynx.drop-rationale'));
  const good = lint('//@messaging:\n//@  errors:\n//@    Noise: drop   # a callback answers no command');
  assert.ok(!codes(good).includes('lynx.drop-rationale'));
});

test('drop combined with a failed event for the same exception → Error (§13.3 v1.2)', () => {
  const d = lint([
    '//@messaging:',
    '//@  produces:',
    '//@    - topic: devices.event.open-failed',
    '//@      when: raises PermanentException',
    '//@  errors:',
    '//@    PermanentException: drop   # rationale present, still illegal with a failed event',
  ].join('\n'));
  assert.ok(codes(d).includes('lynx.drop-vs-failed'));
});

test('unknown error route → Error (§13.1 closed vocabulary)', () => {
  const d = lint('//@messaging:\n//@  errors:\n//@    E: retry-forever');
  assert.ok(codes(d).includes('lynx.bad-error-route'));
});

test('Acme: produced event with provider prefix → Error (§18.1 asymmetry rule)', () => {
  const d = lint('//@messaging:\n//@  produces:\n//@    - topic: corelab.devices.event.device-registered');
  assert.ok(codes(d).includes('lynx.event-prefix'));
});

test('Acme: consumed topic must match command template → Warning (§18.1)', () => {
  const d = lint('//@messaging:\n//@  consumes:\n//@    topic: openDeviceCommands');
  assert.ok(codes(d).includes('lynx.topic-naming'));
  const ok = lint('//@messaging:\n//@  consumes:\n//@    topic: corelab.devices.command.register-device');
  assert.ok(!codes(ok).includes('lynx.topic-naming'));
});

test('Acme: failure event should end -failed → Warning (§18.1)', () => {
  const d = lint([
    '//@messaging:',
    '//@  produces:',
    '//@    - topic: devices.event.device-open-error',
    '//@      when: raises PermanentException',
    '//@  errors:',
    '//@    PermanentException: failed-event + dlq',
  ].join('\n'));
  assert.ok(codes(d).includes('lynx.failed-suffix'));
});

test('Acme: DLQ must match a §18.1 template → Warning', () => {
  const bad = lint('//@messaging:\n//@  dlq: my-dead-letters');
  assert.ok(codes(bad).includes('lynx.topic-naming'));
  const ok1 = lint('//@messaging:\n//@  dlq: corelab.devices.dlq');
  assert.ok(!codes(ok1).includes('lynx.topic-naming'));
  const ok2 = lint('//@messaging:\n//@  dlq: devices.integration.dlq.corelab');
  assert.ok(!codes(ok2).includes('lynx.topic-naming'));
});

test('acmeProfile: false disables all topic lints', () => {
  const d = lint(
    '//@messaging:\n//@  consumes:\n//@    topic: whatever\n//@  dlq: my-dead-letters',
    { ...DEFAULT_SETTINGS, acmeProfile: false },
  );
  assert.ok(!codes(d).some((c) => c.startsWith('lynx.topic') || c === 'lynx.event-prefix'));
});

test('fills and <property:X> refs are exempt from topic naming (§20.2)', () => {
  const d = lint('//@messaging:\n//@  consumes:\n//@    topic: {{Provider}}.{{Domain}}.command.{{Action}}');
  assert.ok(!codes(d).includes('lynx.topic-naming'));
});

test('dangling realizes → Error; resolvable realizes → clean (§7.1)', () => {
  const index = new WorkspaceIndex();
  index.refreshContent(
    'file:///tmp/lynx-test/contracts/register-device.lynx.kt',
    '//@contract: RegisterDeviceRoute.handle\n//@  post: result != null',
  );
  const bad = lint('//@realizes: [contracts/register-device#NoSuchContract]', DEFAULT_SETTINGS, index);
  assert.ok(codes(bad).includes('lynx.dangling-realizes'));
  const good = lint('//@realizes: [contracts/register-device#RegisterDeviceRoute.handle]', DEFAULT_SETTINGS, index);
  assert.ok(!codes(good).includes('lynx.dangling-realizes'));
  const short = lint('//@realizes: [contracts/register-device#handle]', DEFAULT_SETTINGS, index);
  assert.ok(!codes(short).includes('lynx.dangling-realizes'));
});

test('realizedBy pointing at a missing file → Warning (§7.1, contract-first pending)', () => {
  const d = lint('//@contract: X\n//@  realizedBy: [internal/DoesNotExist.kt]');
  assert.ok(codes(d).includes('lynx.missing-realization'));
});

test('graph files entry missing on disk → Error (§12.1)', () => {
  const d = lint('//@graph: m\n//@  files:\n//@    - internal/Ghost.kt   realizes: [contracts/x#y]');
  assert.ok(codes(d).includes('lynx.graph-missing-file'));
});

test('fill used but absent from the Fill Registry → Warning; no registry → silent (§20.2, §20.8)', () => {
  const noRegistry = lint('//@messaging:\n//@  consumes:\n//@    topic: {{Rogue}}.a.command.b');
  assert.ok(!codes(noRegistry).includes('lynx.unregistered-fill'));

  const index = new WorkspaceIndex();
  index.refreshContent('file:///tmp/lynx-test/fill-registry.md', '| {{Provider}} | REQ | vendor |');
  const d = lint('//@messaging:\n//@  consumes:\n//@    topic: {{Rogue}}.a.command.b', DEFAULT_SETTINGS, index);
  assert.ok(codes(d).includes('lynx.unregistered-fill'));
  const ok = lint('//@messaging:\n//@  consumes:\n//@    topic: {{Provider}}.a.command.b', DEFAULT_SETTINGS, index);
  assert.ok(!codes(ok).includes('lynx.unregistered-fill'));
});

test('a fully §13/§18-compliant block produces no messaging diagnostics', () => {
  const d = lint([
    '//@messaging:',
    '//@  consumes:',
    '//@    topic: corelab.devices.command.register-device',
    '//@    as: RegisterDevice',
    '//@    format: envelope-json',
    '//@    group: corelab-devices-adapter',
    '//@    key: deviceId',
    '//@  produces:',
    '//@    - topic: devices.event.device-registered',
    '//@      as: DeviceRegistered',
    '//@      format: envelope-json',
    '//@    - topic: devices.event.device-open-failed',
    '//@      as: DeviceOpenFailed',
    '//@      when: raises PermanentException',
    '//@  ordering: per-key',
    '//@  idempotent: true',
    '//@  errors:',
    '//@    TransientException: retry-in-process',
    '//@    RetryableException: retry-topic',
    '//@    PermanentException: failed-event + dlq',
    '//@  dlq: corelab.devices.dlq',
    '//@  headers: [acme-correlation-id, acme-core-identifier]',
  ].join('\n'));
  assert.deepEqual(codes(d), []);
});
