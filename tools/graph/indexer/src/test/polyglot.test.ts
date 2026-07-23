//@realizes: [contracts/graph#LanguageProfiles]
// Contract-test: Go (//@) and Python (#@) subsets — heritage markers restored; the org
// hologram is polyglot because topics are language-neutral.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDocument, profileFor } from '@lynx/core';
import { loadInputs } from '../build';
import { extractOrg, OrgInputs } from '../org';
import { regexLocator, createTreeSitterLocator } from '../locator';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function polyglotOrg(): OrgInputs {
  const mod = (name: string, template: string, generated?: string, extra?: { manifests?: string[]; reports?: string }) => ({
    name,
    inputs: loadInputs({
      root: ROOT,
      templateDir: path.join(ROOT, template),
      manifestFiles: (extra?.manifests ?? []).map((m) => path.join(ROOT, m)),
      generatedDir: generated ? path.join(ROOT, generated) : undefined,
      reportsDir: extra?.reports ? path.join(ROOT, extra.reports) : undefined,
    }),
  });
  return {
    modules: [
      mod('telemetry', 'fixtures/template', 'fixtures/generated/acme-corelab', { manifests: ['fixtures/instantiations/acme-corelab.md'], reports: 'fixtures/reports' }),
      mod('notify', 'fixtures/org/notify/template'),
      mod('relay-go', 'fixtures/org/relay-go/template', 'fixtures/org/relay-go/generated'),
      mod('analytics-py', 'fixtures/org/analytics-py/template', 'fixtures/org/analytics-py/generated'),
      mod('sensor-rs', 'fixtures/org/sensor-rs/template', 'fixtures/org/sensor-rs/generated'),
    ],
    codeowners: { path: 'fixtures/org/CODEOWNERS', text: fs.readFileSync(path.join(ROOT, 'fixtures/org/CODEOWNERS'), 'utf8') },
  };
}

test('rule: #@ marker parses identically to //@ (heritage restored)', () => {
  const py = fs.readFileSync(path.join(ROOT, 'fixtures/org/analytics-py/template/analytics.lynx.py'), 'utf8');
  const parsed = parseDocument(py, 'analytics.lynx.py');
  const kinds = parsed.blocks.map((b) => b.kind);
  assert.deepEqual(kinds, ['module', 'messaging', 'contract']);
  const contract = parsed.blocks[2];
  assert.equal(contract.name, 'AnalyticsSink.ingest');
  assert.ok(contract.entries.some((e) => e.key === 'pre' && e.value === 'event.reading_id != ""'));
});

test('rule: language profiles resolve by extension (through .lynx infix)', () => {
  assert.equal(profileFor('a/B.lynx.py')?.id, 'python');
  assert.equal(profileFor('a/B.lynx.go')?.id, 'go');
  assert.equal(profileFor('a/B.lynx.rs')?.id, 'rust');
  assert.equal(profileFor('a/B.kt')?.id, 'jvm');
  assert.equal(profileFor('a/B.md'), undefined);
});

test('regex locator: rust fns (pub/async/free)', () => {
  const rs = fs.readFileSync(path.join(ROOT, 'fixtures/org/sensor-rs/generated/src/signal_scorer.rs'), 'utf8');
  assert.deepEqual(regexLocator.locate('x.rs', rs).map((d) => d.name), ['score', 'clamp01']);
});

test('regex locator: go funcs (incl. receiver methods) and python defs (incl. async)', () => {
  const go = fs.readFileSync(path.join(ROOT, 'fixtures/org/relay-go/generated/internal/relay_route.go'), 'utf8');
  assert.deepEqual(regexLocator.locate('x.go', go).map((d) => d.name), ['Handle', 'flushPending']);
  const py = fs.readFileSync(path.join(ROOT, 'fixtures/org/analytics-py/generated/analytics/report.py'), 'utf8');
  assert.deepEqual(regexLocator.locate('x.py', py).map((d) => d.name), ['ingest', 'flush_metrics']);
});

test('tree-sitter locator: parity on go/python fixtures', async (t) => {
  const ts = await createTreeSitterLocator();
  if (!ts) return t.skip('wasm unavailable');
  for (const [file, fixture] of [
    ['internal/relay_route.go', 'fixtures/org/relay-go/generated/internal/relay_route.go'],
    ['analytics/report.py', 'fixtures/org/analytics-py/generated/analytics/report.py'],
    ['src/signal_scorer.rs', 'fixtures/org/sensor-rs/generated/src/signal_scorer.rs'],
  ] as const) {
    const text = fs.readFileSync(path.join(ROOT, fixture), 'utf8');
    assert.deepEqual(
      ts.locate(file, text).map((d) => `${d.name}@${d.line}`),
      regexLocator.locate(file, text).map((d) => `${d.name}@${d.line}`),
      `parity failed for ${file}`,
    );
  }
});

test('language-aware test-case detection: rust test fns become test_case nodes (regression)', () => {
  const g = extractOrg(polyglotOrg());
  const cases = g.nodes.filter((n) => n.kind === 'test_case' && n.file!.includes('signal_test.rs')).map((n) => n.name);
  assert.deepEqual(cases.sort(), ['rejects_zero_value', 'scores_within_unit_range']);
});

test('the polyglot hologram: kotlin -> topic -> go -> topic -> python, one graph', () => {
  const g = extractOrg(polyglotOrg());

  // markers found under both comment leaders
  const templateGaps = g.nodes.filter((n) => n.kind === 'marker' && n.attrs.marker_kind === 'template-gap');
  assert.ok(templateGaps.some((m) => m.id.startsWith('relay-go/')));
  assert.ok(templateGaps.some((m) => m.id.startsWith('analytics-py/')));

  // cross-language topic chain
  const consumed = (topic: string) => g.edges.filter((e) => e.kind === 'consumes' && e.dst === `topic:${topic}`).map((e) => e.src);
  assert.ok(consumed('telemetry.event.capture-started').some((s) => s.startsWith('relay-go/')));
  assert.ok(consumed('relay.event.reading-relayed').some((s) => s.startsWith('analytics-py/')));
  assert.ok(consumed('relay.event.reading-relayed').some((s) => s.startsWith('sensor-rs/')));
  const produced = g.edges.filter((e) => e.kind === 'produces' && e.dst === 'topic:sensor.event.signal-scored');
  assert.ok(produced.some((e) => e.src.startsWith('sensor-rs/')));

  // methods realized across languages: go Handle, python ingest, rust score — matched by signature
  const realizes = g.edges.filter((e) => e.kind === 'realizes' && e.src.includes('method:'));
  assert.ok(realizes.some((e) => e.src.includes('relay_route') && e.dst.endsWith('RelayRoute.Handle')));
  assert.ok(realizes.some((e) => e.src.includes('report') && e.dst.endsWith('AnalyticsSink.ingest')));
  assert.ok(realizes.some((e) => e.src.includes('signal_scorer') && e.dst.endsWith('SignalScorer.score')));

  // stubs parsed from # TARGET headers; targets exist on disk
  const pyTarget = g.nodes.find((n) => n.id === 'analytics-py/target:analytics/report.py');
  assert.equal(pyTarget?.attrs.exists, 1);
});
