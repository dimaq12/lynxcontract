//@realizes: [contracts/graph#Tools]
// Contract-test: one assertion set per rule of the Tools contract, against the fixture index.
import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildIndex, loadInputs } from '@lynx/indexer/out/build';
import { LynxTools, ToolError, QueryResult } from '../tools';

const ROOT = path.resolve(__dirname, '..', '..', '..');
let tools: LynxTools;
let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-mcp-'));
  const out = path.join(dir, 'fixtures.db');
  buildIndex({
    outFile: out,
    inputs: loadInputs({
      root: ROOT,
      templateDir: path.join(ROOT, 'fixtures/template'),
      manifestFiles: [path.join(ROOT, 'fixtures/instantiations/acme-corelab.md')],
      generatedDir: path.join(ROOT, 'fixtures/generated/acme-corelab'),
      reportsDir: path.join(ROOT, 'fixtures/reports'),
    }),
  });
  tools = new LynxTools(out);
});

after(() => tools.close());

function ok<T extends object>(r: T | ToolError): T {
  assert.ok(!('isError' in r && r.isError), `unexpected tool error: ${(r as ToolError).message}`);
  return r as T;
}

test('lynx_schema: agent bootstraps from it alone — DDL, kinds, >=10 worked examples', () => {
  const s = ok(tools.schema()) as { tables: unknown[]; node_kinds: { kind: string }[]; example_queries: unknown[]; index_generation: string };
  assert.ok(s.tables.length >= 4);
  assert.ok(s.node_kinds.some((k) => k.kind === 'contract'));
  assert.ok(s.example_queries.length >= 10);
  assert.ok(s.index_generation.length === 16);
});

test('lynx_query: SELECT works and every result carries index_generation', () => {
  const r = ok(tools.query("SELECT id FROM nodes WHERE kind='topic' ORDER BY id")) as QueryResult;
  assert.ok(r.rows.some((row) => row[0] === 'topic:telemetry.event.capture-started'));
  assert.equal(r.index_generation, tools.generation);
});

test('lynx_query: row cap + truncation flag + next_offset', () => {
  const r = ok(tools.query('SELECT id FROM nodes ORDER BY id', 3)) as QueryResult;
  assert.equal(r.rows.length, 3);
  assert.equal(r.truncated, true);
  assert.equal(r.next_offset, 3);
  const page2 = ok(tools.query('SELECT id FROM nodes ORDER BY id', 3, 3)) as QueryResult;
  assert.notDeepEqual(page2.rows, r.rows);
});

test('lynx_query: engine-first read-only — writes, PRAGMA, ATTACH, multi-statement all refused as isError (never throw)', () => {
  for (const sql of [
    "INSERT INTO nodes VALUES ('x','x',null,null,null,'{}')",
    'PRAGMA journal_mode=WAL',
    "ATTACH DATABASE '/tmp/evil.db' AS evil",
    'SELECT 1; SELECT 2',
    'DROP TABLE nodes',
  ]) {
    const r = tools.query(sql);
    assert.ok('isError' in r && r.isError, `expected refusal for: ${sql}`);
  }
});

test('lynx_contract_of: governing block by template file, with bound rules and fills in force', () => {
  const r = ok(tools.contractOf('StartCaptureRoute.lynx.kt', 12)) as { governing: { id: string; bound_rules: string[]; fills_in_force: { token: string; value: string }[] }[] };
  assert.ok(r.governing[0].id.includes('StartCaptureRoute'));
  assert.ok(r.governing[0].bound_rules.some((b) => b.includes('no-provider-prefix')));
  assert.ok(r.governing[0].fills_in_force.some((f) => f.token === 'Provider' && f.value === 'corelab'));
});

test('lynx_contract_of: generated file resolves via realized_by; unknown file is honest unmapped', () => {
  const r = ok(tools.contractOf('internal/StartCaptureRoute.kt')) as { via: string };
  assert.equal(r.via, 'realized_by');
  const miss = tools.contractOf('no/such/File.kt');
  assert.ok('isError' in miss && /unmapped/.test(miss.message));
});

test('lynx_why: edge path from method to contract, not prose', () => {
  const r = ok(tools.why('internal/StartCaptureRoute.kt', 8)) as { method: string; path: { edge: string; from: string; to: string }[] };
  assert.ok(r.method.includes('handle'));
  assert.ok(r.path.some((p) => p.edge === 'realizes' && p.to.endsWith('StartCaptureRoute.handle')));
  assert.ok(r.path.some((p) => p.edge === 'binds'));
});

test('lynx_impact_of: fill token reaches all its multiplier targets and tests', () => {
  const r = ok(tools.impactOf('Command')) as { regeneration_set: string[] };
  const cmds = r.regeneration_set.filter((t) => t.includes('external/messages/commands/'));
  assert.equal(cmds.length, 3);
});

test('lynx_lint: the five designed violations, filterable by scope', () => {
  const r = ok(tools.lint()) as { violations: { invariant: string }[]; clean: boolean };
  assert.equal(r.clean, false);
  assert.equal(new Set(r.violations.map((v) => v.invariant)).size, 5);
  const scoped = ok(tools.lint('BrokenStub')) as { violations: unknown[] };
  assert.equal(scoped.violations.length, 1);
});

test('lynx_realizations_of + node resource: cited ids resolve', () => {
  const r = ok(tools.realizationsOf('StartCaptureRoute')) as { edges: { src: string }[] };
  assert.ok(r.edges.length > 0);
  const n = ok(tools.node('topic:telemetry.event.capture-started')) as { edges_in: { src: string; kind: string }[] };
  assert.ok(n.edges_in.some((e) => e.kind === 'produces'));
});
