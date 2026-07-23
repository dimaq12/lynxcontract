//@realizes: [contracts/graph#Tools]
// Contract-test: lynx_runs + lynx_trace_requirement rules (BATTLE-REPORT chain).
import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildIndex, loadInputs } from '@lynx/indexer/out/build';
import { LynxTools, ToolError } from '../tools';

const ROOT = path.resolve(__dirname, '..', '..', '..');
let tools: LynxTools;

before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-trace-'));
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
  assert.ok(!('isError' in r && r.isError), `unexpected error: ${(r as ToolError).message}`);
  return r as T;
}

interface Finding { id: string; run: string; class: string; grouped_id: string | null }

test('lynx_runs: all findings with run/class/grouped attrs', () => {
  const r = ok(tools.runs()) as { findings: Finding[] };
  assert.equal(r.findings.length, 3);
  assert.ok(r.findings.some((f) => f.id.endsWith('F-003') && f.grouped_id === 'F-002' && f.run === 'run-2'));
});

test('lynx_runs: class/run filters', () => {
  const predicted = ok(tools.runs({ class: 'predicted' })) as { findings: Finding[] };
  assert.equal(predicted.findings.length, 1);
  const run2 = ok(tools.runs({ run: 'run-2' })) as { findings: Finding[] };
  assert.equal(run2.findings.length, 1);
});

test('lynx_runs: contracts_by_recurrence answers "findings in >=2 runs"', () => {
  const r = ok(tools.runs({ min_runs: 2 })) as { contracts_by_recurrence: { contract: string; runs: number }[] };
  assert.equal(r.contracts_by_recurrence.length, 1);
  assert.ok(r.contracts_by_recurrence[0].contract.endsWith('StartCaptureRoute.handle'));
  assert.equal(r.contracts_by_recurrence[0].runs, 2);
});

test('predicts edge: the declared deviation marker predicts finding F-001 (§2)', () => {
  const q = tools.query("SELECT src, dst FROM edges WHERE kind='predicts'") as { rows: unknown[][] };
  assert.equal(q.rows.length, 1);
  assert.ok(String(q.rows[0][0]).includes('deviation'));
  assert.ok(String(q.rows[0][1]).endsWith('F-001'));
});

test('lynx_trace_requirement: the full audit chain for {{Provider}}', () => {
  const r = ok(tools.traceRequirement('Provider')) as {
    requirement: { token: string; source: string };
    fills: { value: string }[];
    targets: string[];
    findings: { id: string }[];
  };
  assert.equal(r.requirement.token, 'Provider');
  assert.equal(r.requirement.source, 'REQ');
  assert.ok(r.fills.some((f) => f.value === 'corelab'));
  assert.ok(r.targets.some((t) => t.endsWith('internal/StartCaptureRoute.kt')));
  assert.ok(r.findings.some((f) => f.id.endsWith('F-002')));
});

test('lynx_trace_requirement: multiplier token {{Command}} reaches all its instances and targets', () => {
  const r = ok(tools.traceRequirement('Command')) as { instances: string[]; targets: string[] };
  assert.equal(r.instances.length, 3);
  assert.equal(r.targets.filter((t) => t.includes('external/messages/commands/')).length, 3);
});

test('lynx_trace_requirement: unresolvable ref is an honest error', () => {
  const r = tools.traceRequirement('NoSuchToken');
  assert.ok('isError' in r && /registry row/.test(r.message));
});
