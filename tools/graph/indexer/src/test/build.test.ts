//@realizes: [contracts/graph#DeterministicBuild]
// Contract-test: post "building twice from identical inputs yields byte-identical files".
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { buildIndex, loadInputs, generationOf } from '../build';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const inputs = loadInputs({
  root: ROOT,
  templateDir: path.join(ROOT, 'fixtures/template'),
  manifestFiles: [path.join(ROOT, 'fixtures/instantiations/acme-corelab.md')],
  generatedDir: path.join(ROOT, 'fixtures/generated/acme-corelab'),
  reportsDir: path.join(ROOT, 'fixtures/reports'),
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-graph-'));

test('post: building twice yields byte-identical files', () => {
  const a = buildIndex({ inputs, outFile: path.join(dir, 'a.db') });
  const b = buildIndex({ inputs, outFile: path.join(dir, 'b.db') });
  assert.equal(a.generation, b.generation);
  assert.ok(fs.readFileSync(a.outFile).equals(fs.readFileSync(b.outFile)), 'index files differ byte-wise');
});

test('rules: generation is a content hash, meta carries versions, no wall-clock', () => {
  const out = path.join(dir, 'c.db');
  const r = buildIndex({ inputs, outFile: out });
  assert.equal(r.generation, generationOf(inputs));
  const db = new Database(out, { readonly: true });
  const meta = Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((m) => [m.key, m.value]));
  assert.equal(meta.index_generation, r.generation);
  assert.equal(meta.lynxcontract_spec_version, '1.3-jvm');
  db.close();
});

test('lint views: the fixture corpus trips exactly the five designed invariants', () => {
  const out = path.join(dir, 'd.db');
  buildIndex({ inputs, outFile: out });
  const db = new Database(out, { readonly: true });
  const rows = db.prepare('SELECT invariant, node_id FROM lint_violations ORDER BY invariant').all() as { invariant: string; node_id: string }[];
  const byInvariant = new Map<string, string[]>();
  for (const r of rows) byInvariant.set(r.invariant, [...(byInvariant.get(r.invariant) ?? []), r.node_id]);

  assert.deepEqual([...byInvariant.keys()].sort(), [
    'anchor-resolution', 'output-target-completion', 'realization-completeness', 'test-case-completion', 'token-closure',
  ]);
  assert.ok(byInvariant.get('realization-completeness')!.some((id) => id.includes('BrokenStub')));
  assert.ok(byInvariant.get('token-closure')!.some((id) => id.includes('Region')));
  assert.ok(byInvariant.get('output-target-completion')!.some((id) => id.includes('StopCapture')));
  assert.ok(byInvariant.get('test-case-completion')!.some((id) => id.includes('RetryableException')));
  db.close();
});

test('raises: missing output directory is an error', () => {
  assert.throws(() => buildIndex({ inputs, outFile: path.join(dir, 'no-such-dir', 'x.db') }), /does not exist/);
});

test('FTS works over contract text in the built index', () => {
  const out = path.join(dir, 'e.db');
  buildIndex({ inputs, outFile: out });
  const db = new Database(out, { readonly: true });
  const hits = db.prepare("SELECT node_id FROM fts WHERE fts MATCH 'idempotent'").all() as { node_id: string }[];
  assert.ok(hits.some((h) => h.node_id.includes('StartCaptureRoute')));
  db.close();
});
