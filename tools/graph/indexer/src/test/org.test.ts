//@realizes: [contracts/graph#OrgExtractor]
// Contract-test: assertions read off the OrgExtractor contract's rules.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { loadInputs } from '../build';
import { extractOrg, buildOrgIndex, OrgInputs } from '../org';

const ROOT = path.resolve(__dirname, '..', '..', '..');

export function orgInputs(): OrgInputs {
  return {
    modules: [
      {
        name: 'telemetry',
        inputs: loadInputs({
          root: ROOT,
          templateDir: path.join(ROOT, 'fixtures/template'),
          manifestFiles: [path.join(ROOT, 'fixtures/instantiations/acme-corelab.md')],
          generatedDir: path.join(ROOT, 'fixtures/generated/acme-corelab'),
          reportsDir: path.join(ROOT, 'fixtures/reports'),
        }),
      },
      {
        name: 'notify',
        inputs: loadInputs({
          root: ROOT,
          templateDir: path.join(ROOT, 'fixtures/org/notify/template'),
          manifestFiles: [],
        }),
      },
    ],
    codeowners: { path: 'fixtures/org/CODEOWNERS', text: fs.readFileSync(path.join(ROOT, 'fixtures/org/CODEOWNERS'), 'utf8') },
  };
}

const g = extractOrg(orgInputs());

test('rule: module-local ids gain the module prefix; topic ids are NEVER namespaced', () => {
  assert.ok(g.nodes.some((n) => n.id.startsWith('telemetry/stub:')));
  assert.ok(g.nodes.some((n) => n.id.startsWith('notify/contract:')));
  const shared = g.nodes.filter((n) => n.id === 'topic:telemetry.event.capture-started');
  assert.equal(shared.length, 1);
  const producers = g.edges.filter((e) => e.dst === 'topic:telemetry.event.capture-started' && e.kind === 'produces');
  const consumers = g.edges.filter((e) => e.dst === 'topic:telemetry.event.capture-started' && e.kind === 'consumes');
  assert.ok(producers.some((e) => e.src.startsWith('telemetry/')));
  assert.ok(consumers.some((e) => e.src.startsWith('notify/')));
});

test('rule: module nodes carry fill-substituted package; depends/restrictions resolve to module edges', () => {
  const telemetry = g.nodes.find((n) => n.id === 'module:telemetry')!;
  assert.equal(telemetry.attrs.package, 'com.acme.corelab.telemetry');
  assert.ok(g.edges.some((e) => e.src === 'module:notify' && e.dst === 'module:telemetry' && e.kind === 'depends'));
  assert.ok(g.edges.some((e) => e.src === 'module:telemetry' && e.dst === 'module:notify' && e.kind === 'restricts'));
});

test('rule: CODEOWNERS -> owner nodes + owns edges', () => {
  assert.ok(g.nodes.some((n) => n.id === 'owner:@acme/telemetry-team'));
  assert.ok(g.edges.some((e) => e.src === 'owner:@acme/notify-team' && e.dst === 'module:notify' && e.kind === 'owns'));
  assert.ok(g.edges.some((e) => e.src === 'owner:@acme/platform-leads' && e.dst === 'module:notify' && e.kind === 'owns'));
});

test('rule: frozen/closed entries become enum_surface nodes with freezes edges (§19.1)', () => {
  const surface = g.nodes.find((n) => n.kind === 'enum_surface')!;
  assert.equal(surface.name, 'CaptureStatus');
  assert.deepEqual(surface.attrs.values, ['OPEN', 'COMPLETE', 'ON HOLD']);
  assert.ok(g.edges.some((e) => e.dst === surface.id && e.kind === 'freezes'));
});

test('rule: member_of edges for stub/contract/target', () => {
  assert.ok(g.edges.some((e) => e.kind === 'member_of' && e.src.startsWith('telemetry/target:') && e.dst === 'module:telemetry'));
  assert.ok(g.edges.some((e) => e.kind === 'member_of' && e.src.startsWith('notify/contract:') && e.dst === 'module:notify'));
});

test('post: org determinism — extract twice deep-equal, build twice byte-identical', () => {
  assert.deepEqual(extractOrg(orgInputs()), g);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-org-'));
  const a = buildOrgIndex(orgInputs(), path.join(dir, 'a.db'));
  const b = buildOrgIndex(orgInputs(), path.join(dir, 'b.db'));
  assert.equal(a.generation, b.generation);
  assert.ok(fs.readFileSync(a.outFile).equals(fs.readFileSync(b.outFile)));
});

test('§6.3 hologram views over the built org index', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-org-views-'));
  const out = path.join(dir, 'org.db');
  buildOrgIndex(orgInputs(), out);
  const db = new Database(out, { readonly: true });

  const mesh = db.prepare("SELECT DISTINCT producer_module, consumer_module FROM org_event_mesh WHERE topic='telemetry.event.capture-started' AND producer_module IS NOT NULL AND consumer_module IS NOT NULL").all() as { producer_module: string; consumer_module: string }[];
  assert.ok(mesh.some((r) => r.producer_module === 'telemetry' && r.consumer_module === 'notify'));

  const orphans = (db.prepare('SELECT topic FROM org_orphan_topics ORDER BY topic').all() as { topic: string }[]).map((r) => r.topic);
  assert.deepEqual(orphans, [
    'corelab.telemetry.command.open-capture',
    'notify.event.notification-sent',
    'telemetry.event.capture-start-failed',
  ]);

  const taint = db.prepare('SELECT * FROM org_privacy_taint').all() as { consumer: string; consumer_privacy: string }[];
  assert.ok(taint.length >= 1);
  assert.ok(taint.every((t) => t.consumer.startsWith('notify/')));
  assert.ok(taint.some((t) => t.consumer_privacy === 'internal'));

  const layer = db.prepare('SELECT * FROM org_layer_violations').all() as { module: string; depends_on: string; violation: string }[];
  assert.deepEqual(layer, [{ module: 'module:notify', depends_on: 'module:telemetry', violation: 'restricted-dependency' }]);

  const health = db.prepare('SELECT module, lint_violations FROM org_health ORDER BY module').all() as { module: string; lint_violations: number }[];
  assert.deepEqual(health.map((h) => h.module), ['module:notify', 'module:telemetry']);
  assert.equal(health.find((h) => h.module === 'module:telemetry')!.lint_violations, 5);
  assert.equal(health.find((h) => h.module === 'module:notify')!.lint_violations, 1);

  const orgLint = db.prepare('SELECT DISTINCT invariant FROM org_lint_violations ORDER BY invariant').all() as { invariant: string }[];
  assert.deepEqual(orgLint.map((r) => r.invariant), ['layer-violation', 'orphan-topic', 'privacy-taint']);
  db.close();
});

test('spec §6.1 (v1.0): CODEOWNERS gitignore-glob matches module root paths', () => {
  const { codeownersMatch } = require('../org') as typeof import('../org');
  // plain name equality (convenience) and the fixture's trailing-/ dir form
  assert.ok(codeownersMatch('telemetry', 'telemetry'));
  assert.ok(codeownersMatch('telemetry/', 'telemetry'));
  // glob forms against a workspace-relative module root
  assert.ok(codeownersMatch('/services/**', 'ledger', 'services/ledger'));
  assert.ok(codeownersMatch('services/*', 'ledger', 'services/ledger'));
  assert.ok(codeownersMatch('**/ledger/', 'ledger', 'org/services/ledger'));
  assert.ok(codeownersMatch('services/led?er/', 'ledger', 'services/ledger'));
  // non-matches: anchored elsewhere, different subtree
  assert.ok(!codeownersMatch('/other/**', 'ledger', 'services/ledger'));
  assert.ok(!codeownersMatch('services/billing/', 'ledger', 'services/ledger'));
  assert.ok(!codeownersMatch('ledgerx', 'ledger', 'services/ledger'));
});
