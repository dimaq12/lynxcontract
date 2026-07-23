//@realizes: [contracts/graph#Tools]
// Contract-test: the drift + explain_divergence rules of the Tools contract.
import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildIndex, loadInputs } from '@lynx/indexer/out/build';
import { LynxTools } from '../tools';

const ROOT = path.resolve(__dirname, '..', '..', '..');
let tools: LynxTools;

before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-drift-'));
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

interface DriftRow { class: string; node_id: string; message: string }

test('lynx_drift: declared signature with no realizing method in an existing file', () => {
  const r = tools.drift() as { drift: DriftRow[] };
  const row = r.drift.find((d) => d.class === 'signature-unrealized');
  assert.ok(row, 'signature-unrealized missing');
  assert.ok(row!.node_id.endsWith('CaptureMapper.toFailedEvent'));
  assert.match(row!.message, /toFailedEvent/);
});

test('lynx_drift: undeclared method — code the contract layer does not know', () => {
  const r = tools.drift() as { drift: DriftRow[] };
  const row = r.drift.find((d) => d.class === 'undeclared-method');
  assert.ok(row);
  assert.ok(row!.node_id.endsWith('#retryBackoff'));
});

test('lynx_drift: unexplained RECONSTRUCTED marker surfaces; explained TEMPLATE-GAP does not; deviations are excluded', () => {
  const r = tools.drift() as { drift: DriftRow[] };
  const unexplained = r.drift.filter((d) => d.class === 'unexplained-marker');
  assert.ok(unexplained.some((d) => d.node_id.includes('reconstructed')));
  assert.ok(!unexplained.some((d) => d.node_id.includes('template-gap')), 'G-001-explained template-gap wrongly reported');
  assert.ok(!r.drift.some((d) => d.node_id.includes('deviation')), 'deviation is declared divergence, not drift');
});

test('lynx_drift: matched contracts (handle, toEvent) produce NO drift; scope filters; gaps/deviations listed', () => {
  const r = tools.drift() as { drift: DriftRow[]; gaps: { name: string }[]; deviations: { file: string }[] };
  assert.ok(!r.drift.some((d) => d.node_id.endsWith('StartCaptureRoute.handle')));
  assert.ok(!r.drift.some((d) => d.node_id.endsWith('CaptureMapper.toEvent')));
  assert.deepEqual(r.gaps.map((g) => g.name), ['G-001', 'G-002']);
  assert.equal(r.deviations.length, 1);
  const scoped = tools.drift('CaptureMapper') as { drift: DriftRow[] };
  assert.ok(scoped.drift.every((d) => d.node_id.includes('CaptureMapper')));
});

test('lynx_explain_divergence: predicted — deviation on the stub that generates the file, marker cited', () => {
  const r = tools.explainDivergence('internal/CaptureMapper.kt', 12, 'reference logs raw payload, canon does not') as { classification: string; citations: string[] };
  assert.equal(r.classification, 'predicted');
  assert.ok(r.citations[0].includes('deviation'));
});

test('lynx_explain_divergence: catalogued — gap ledger explains the marker in this file, gap cited', () => {
  const r = tools.explainDivergence('internal/StartCaptureRoute.kt', 5, 'envelope unwrap inlined at the route') as { classification: string; citations: string[] };
  assert.equal(r.classification, 'catalogued');
  assert.ok(r.citations[0].endsWith('G-001'));
});

test('lynx_explain_divergence: candidate_defect — cites the contracts/rules that should have covered it', () => {
  const r = tools.explainDivergence('external/messages/commands/StartCapture.kt', 3, 'field deviceId renamed to party_id') as {
    classification: string; should_have_covered: { contracts: string[] };
  };
  assert.equal(r.classification, 'candidate_defect');
  assert.ok(Array.isArray(r.should_have_covered.contracts));
});
