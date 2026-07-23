//@realizes: [contracts/graph#OrgTools]
// Contract-test: assertions read off the OrgTools contract's rules.
import { test, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadInputs } from '@lynx/indexer/out/build';
import { buildOrgIndex, OrgInputs } from '@lynx/indexer/out/org';
import { OrgTools } from '../orgTools';
import { ToolError } from '../tools';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function orgInputs(mutate?: (f: { path: string; text: string }) => string): OrgInputs {
  const telemetry = loadInputs({
    root: ROOT,
    templateDir: path.join(ROOT, 'fixtures/template'),
    manifestFiles: [path.join(ROOT, 'fixtures/instantiations/acme-corelab.md')],
    generatedDir: path.join(ROOT, 'fixtures/generated/acme-corelab'),
    reportsDir: path.join(ROOT, 'fixtures/reports'),
  });
  const notify = loadInputs({
    root: ROOT,
    templateDir: path.join(ROOT, 'fixtures/org/notify/template'),
    manifestFiles: [],
  });
  if (mutate) {
    telemetry.template = telemetry.template.map((f) => ({ ...f, text: mutate(f) }));
  }
  return {
    modules: [
      { name: 'telemetry', inputs: telemetry },
      { name: 'notify', inputs: notify },
    ],
    codeowners: { path: 'fixtures/org/CODEOWNERS', text: fs.readFileSync(path.join(ROOT, 'fixtures/org/CODEOWNERS'), 'utf8') },
  };
}

let tools: OrgTools;
let dir: string;
let orgDb: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-orgtools-'));
  orgDb = path.join(dir, 'org.db');
  buildOrgIndex(orgInputs(), orgDb);
  tools = new OrgTools(orgDb);
});

after(() => tools.close());

function ok<T extends object>(r: T | ToolError): T {
  assert.ok(!('isError' in r && r.isError), `unexpected tool error: ${(r as ToolError).message}`);
  return r as T;
}

test('lynx_modules: inventory with layer, health counters and owners', () => {
  const r = ok(tools.modules()) as { modules: { module: string; layer: string; owners: string[]; lint_violations: number }[] };
  assert.equal(r.modules.length, 2);
  const notify = r.modules.find((m) => m.module === 'module:notify')!;
  assert.equal(notify.layer, 'core');
  assert.deepEqual(notify.owners.sort(), ['@acme/notify-team', '@acme/platform-leads']);
});

test('lynx_owners_of: module, node id and topic all resolve to principals', () => {
  const byModule = ok(tools.ownersOf('telemetry')) as { owners: string[] };
  assert.deepEqual(byModule.owners, ['@acme/telemetry-team']);
  const byTopic = ok(tools.ownersOf('telemetry.event.capture-started')) as { owners: string[]; modules: string[] };
  assert.ok(byTopic.modules.includes('notify') && byTopic.modules.includes('telemetry'));
  assert.ok(byTopic.owners.includes('@acme/notify-team'));
});

test('lynx_org_impact_of: blast radius crosses the topic into the consuming module and names its owners', () => {
  const r = ok(tools.orgImpactOf('StartCaptureRoute')) as { affected_modules: string[]; owners: string[]; topics_crossed: string[] };
  assert.deepEqual(r.affected_modules, ['notify', 'telemetry']);
  assert.ok(r.owners.includes('@acme/notify-team'));
  assert.ok(r.topics_crossed.includes('topic:telemetry.event.capture-started'));
});

test('lynx_hologram: mermaid flowchart with modules and topics; json rows; scope filter', () => {
  const mm = ok(tools.hologram(undefined, 'mermaid')) as { mermaid: string };
  assert.match(mm.mermaid, /^flowchart LR/);
  assert.ok(mm.mermaid.includes('telemetry.event.capture-started'));
  assert.ok(mm.mermaid.includes('M_telemetry') && mm.mermaid.includes('M_notify'));
  const json = ok(tools.hologram('notification-sent', 'json')) as { mesh: { topic: string }[] };
  assert.ok(json.mesh.every((r) => r.topic.includes('notification-sent')));
});

test('lynx_diff: enum member added is tracked; member removed violates the freeze', () => {
  const bDb = path.join(dir, 'org-b.db');
  buildOrgIndex(orgInputs((f) =>
    f.path.endsWith('StartCaptureRoute.lynx.kt')
      ? f.text.replace('values: [OPEN, COMPLETE, "ON HOLD"]', 'values: [OPEN, "ON HOLD", PARTIAL]')
      : f.text,
  ), bDb);
  const r = ok(OrgTools.diff(orgDb, bDb)) as { a_generation: string; b_generation: string; changes: { class: string; detail?: string }[] };
  assert.notEqual(r.a_generation, r.b_generation);
  assert.ok(r.changes.some((c) => c.class === 'enum-member-added' && c.detail === 'PARTIAL'));
  assert.ok(r.changes.some((c) => c.class === 'freeze-violated' && /COMPLETE/.test(c.detail ?? '')));
});

test('lynx_diff: a new consumer shows up as new-consumer', () => {
  const cDb = path.join(dir, 'org-c.db');
  const inputs = orgInputs();
  inputs.modules[1].inputs.template = inputs.modules[1].inputs.template.map((f) => ({
    ...f,
    text: f.text.replace(
      '//@flow: NotifyRoute.flow',
      '//@messaging: FailureAuditor\n//@  consumes:\n//@    topic: telemetry.event.capture-start-failed\n//@    as: CaptureStartFailed\n//@    format: envelope-json\n//@    group: notify-audit\n//@\n//@flow: NotifyRoute.flow',
    ),
  }));
  buildOrgIndex(inputs, cDb);
  const r = ok(OrgTools.diff(orgDb, cDb)) as { changes: { class: string; id: string }[] };
  assert.ok(r.changes.some((c) => c.class === 'new-consumer' && c.id.includes('capture-start-failed')));
});

test('lynx_snapshots + lynx_diff refs: registry listing, generation-prefix resolution, live, corrective hints', () => {
  const { writeSnapshot } = require('@lynx/indexer/out/snapshots') as typeof import('@lynx/indexer/out/snapshots');
  const registry = path.join(dir, '.lynx-snapshots');
  // register the baseline and a mutated build (the enum edit from the diff test above)
  const bDb = path.join(dir, 'org-snap-b.db');
  const bBuild = buildOrgIndex(orgInputs((f) =>
    f.path.endsWith('StartCaptureRoute.lynx.kt')
      ? f.text.replace('values: [OPEN, COMPLETE, "ON HOLD"]', 'values: [OPEN, "ON HOLD", PARTIAL]')
      : f.text,
  ), bDb);
  writeSnapshot(orgDb, tools.generation, registry);
  writeSnapshot(bDb, bBuild.generation, registry);

  const snapTools = new OrgTools(orgDb, { snapshotDir: registry });
  try {
    const listing = ok(snapTools.snapshots()) as { snapshots: { generation: string; live?: boolean }[] };
    assert.deepEqual(listing.snapshots.map((s) => s.generation).sort(), [tools.generation, bBuild.generation].sort());
    assert.equal(listing.snapshots.find((s) => s.generation === tools.generation)?.live, true);

    // refs: full generation for a, unambiguous prefix for b — and 'live' equals the served db
    const r = ok(snapTools.diffRefs(tools.generation, bBuild.generation.slice(0, 8))) as { changes: { class: string }[] };
    assert.ok(r.changes.some((c) => c.class === 'enum-member-added'));
    const same = ok(snapTools.diffRefs('live', tools.generation)) as { changes: unknown[] };
    assert.equal(same.changes.length, 0);

    // unresolvable ref → corrective hint naming the accepted forms and the registered generations
    const err = snapTools.diffRefs('deadbeef', 'live') as ToolError;
    assert.ok(err.isError);
    assert.match(err.message, /registered generation/i);
    assert.ok(err.message.includes(tools.generation), 'hint does not list registered generations');
  } finally {
    snapTools.close();
  }
});

test('lynx_snapshots without a registry: honest empty listing with a hint', () => {
  const bare = new OrgTools(orgDb);
  try {
    const r = ok(bare.snapshots()) as { snapshots: unknown[]; hint?: string };
    assert.deepEqual(r.snapshots, []);
    assert.match(r.hint ?? '', /--sources|--snapshots|--snapshot/);
  } finally {
    bare.close();
  }
});
