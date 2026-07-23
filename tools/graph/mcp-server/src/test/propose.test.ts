//@realizes: [contracts/graph#Propose]
// Contract-test: one assertion set per rule of the Propose contract.
import { test, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Proposer, ProposeResult } from '../propose';
import { ToolError } from '../tools';

const ROOT = path.resolve(__dirname, '..', '..', '..');
let dir: string;
let config: string;
let proposer: Proposer;
const STUB = 'fixtures/template/StartCaptureRoute.lynx.kt';

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-propose-'));
  fs.cpSync(path.join(ROOT, 'fixtures'), path.join(dir, 'fixtures'), { recursive: true });
  config = path.join(dir, 'lynx-sources.json');
  fs.writeFileSync(config, JSON.stringify({
    modules: [
      { name: 'telemetry', template: 'fixtures/template', manifests: ['fixtures/instantiations/acme-corelab.md'], generated: 'fixtures/generated/acme-corelab', reports: 'fixtures/reports' },
      { name: 'notify', template: 'fixtures/org/notify/template' },
    ],
    codeowners: 'fixtures/org/CODEOWNERS',
  }));
  proposer = new Proposer(config);
});

function stubText(): string {
  return fs.readFileSync(path.join(dir, STUB), 'utf8');
}

test('rule: no citation → rejected as isError; nothing written', () => {
  const r = proposer.propose(STUB, stubText() + '\n', '');
  assert.ok('isError' in r && /citation/.test(r.message));
  assert.ok(!fs.existsSync(path.join(dir, '.lynx-staging')));
});

test('rule: generated code is off-limits', () => {
  const r = proposer.propose('fixtures/generated/acme-corelab/internal/StartCaptureRoute.kt', '// nope', 'RULE[no-provider-prefix]');
  assert.ok('isError' in r && /generated/.test(r.message));
});

test('rule: unknown file → honest rejection naming the sources config', () => {
  const r = proposer.propose('no/such/file.lynx.kt', 'x', 'spec §5');
  assert.ok('isError' in r && /not a template\/manifest source/.test(r.message));
});

test('rule: a clean cited edit is accepted into .lynx-staging with diff classes and blast radius; real tree untouched', () => {
  const before_ = stubText();
  const edited = before_.replace('values: [OPEN, COMPLETE, "ON HOLD"]', 'values: [OPEN, COMPLETE, "ON HOLD", PARTIAL]');
  const r = proposer.propose(STUB, edited, 'manifest rev 2: PARTIAL state approved — §19.1 tracked change') as ProposeResult;
  assert.equal(r.accepted, true);
  assert.notEqual(r.baseline_generation, r.staged_generation);
  assert.ok((r.changes as { class: string; detail?: string }[]).some((c) => c.class === 'enum-member-added' && c.detail === 'PARTIAL'));
  assert.ok(r.staged_dir && fs.existsSync(path.join(r.staged_dir, STUB)));
  assert.ok(fs.existsSync(path.join(r.staged_dir!, 'index.db')));
  assert.equal(stubText(), before_, 'the real tree was modified!');
});

test('rule: an edit introducing a NEW violation is rejected listing exactly the fresh violations; nothing staged', () => {
  const stagedBefore = fs.existsSync(path.join(dir, '.lynx-staging')) ? fs.readdirSync(path.join(dir, '.lynx-staging')).length : 0;
  const edited = stubText().replace('// TARGET: internal/StartCaptureRoute.kt\n', '');
  const r = proposer.propose(STUB, edited, 'trying to drop the TARGET header') as ProposeResult;
  assert.equal(r.accepted, false);
  assert.ok(r.new_violations!.some((v) => v.invariant === 'realization-completeness'));
  const stagedAfter = fs.existsSync(path.join(dir, '.lynx-staging')) ? fs.readdirSync(path.join(dir, '.lynx-staging')).length : 0;
  assert.equal(stagedAfter, stagedBefore, 'rejected proposal left a staging dir');
});

test('rule: baseline violations do not block unrelated edits (stays-clean means no NEW violations)', () => {
  const edited = stubText().replace('//@  rate:', '//@  norate:').replace('group: corelab-telemetry-adapter', 'group: corelab-telemetry-adapter-v2');
  const r = proposer.propose(STUB, edited, 'ops: dedicated consumer group for the v2 rollout') as ProposeResult;
  assert.equal(r.accepted, true);
});
