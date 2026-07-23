//@realizes: [contracts/graph#SnapshotRegistry]
// Contract-test: assertions read off the SnapshotRegistry contract's rules.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { snapshotDirFor, writeSnapshot, listSnapshots, resolveSnapshotRef } from '../snapshots';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-snapshots-'));
const registry = path.join(dir, '.lynx-snapshots');
const dbA = path.join(dir, 'a.db');
const dbB = path.join(dir, 'b.db');
fs.writeFileSync(dbA, 'index-content-a');
fs.writeFileSync(dbB, 'index-content-b');
const GEN_A = 'aaaa1111bbbb2222';
const GEN_B = 'bbbb3333cccc4444';

test('snapshotDirFor: .lynx-snapshots beside the sources config', () => {
  assert.equal(snapshotDirFor(path.join(dir, 'lynx-sources.json')), registry);
});

test('rule: registration is idempotent — an existing generation is NEVER rewritten', () => {
  const first = writeSnapshot(dbA, GEN_A, registry);
  assert.equal(first.written, true);
  assert.equal(fs.readFileSync(first.path, 'utf8'), 'index-content-a');
  const again = writeSnapshot(dbB, GEN_A, registry); // different content, same generation
  assert.equal(again.written, false);
  assert.equal(fs.readFileSync(again.path, 'utf8'), 'index-content-a', 'existing snapshot was rewritten');
});

test('rule: listSnapshots tolerates a missing dir and ignores non-<hex>.db files', () => {
  assert.deepEqual(listSnapshots(path.join(dir, 'nowhere')), []);
  fs.writeFileSync(path.join(registry, 'README.txt'), 'junk');
  fs.writeFileSync(path.join(registry, 'not-hex.db'), 'junk');
  writeSnapshot(dbB, GEN_B, registry);
  const rows = listSnapshots(registry, GEN_B);
  assert.deepEqual(rows.map((r) => r.generation), [GEN_A, GEN_B]);
  assert.equal(rows.find((r) => r.generation === GEN_B)?.live, true);
  assert.equal(rows.find((r) => r.generation === GEN_A)?.live, undefined);
});

test('rule: resolveSnapshotRef — generation, unambiguous prefix, file path, live', () => {
  const byGen = resolveSnapshotRef(GEN_A, registry);
  assert.ok('path' in byGen && byGen.path.endsWith(`${GEN_A}.db`));
  const byPrefix = resolveSnapshotRef('aaaa', registry);
  assert.ok('path' in byPrefix && byPrefix.path.endsWith(`${GEN_A}.db`));
  const byPath = resolveSnapshotRef(dbA, registry);
  assert.ok('path' in byPath && byPath.path === dbA);
  const live = resolveSnapshotRef('live', registry, dbB);
  assert.ok('path' in live && live.path === dbB);
});

test('rule: ambiguous prefix and unknown ref return the registered generations for the hint', () => {
  writeSnapshot(dbA, 'bbbb5555dddd6666', registry); // collides with GEN_B on the 'bbbb' prefix
  const collide = resolveSnapshotRef('bbbb', registry);
  assert.ok('error' in collide && /ambiguous/.test(collide.error));
  assert.ok('error' in collide && collide.generations.includes(GEN_A));
  const unknown = resolveSnapshotRef('zzzz', registry);
  assert.ok('error' in unknown && /not a registered generation/.test(unknown.error));
  const noLive = resolveSnapshotRef('live', registry);
  assert.ok('error' in noLive && /live/.test(noLive.error));
});
