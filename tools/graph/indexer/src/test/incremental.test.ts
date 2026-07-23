//@realizes: [contracts/graph#IncrementalBuild]
// Contract-test: cache is an optimization, never a semantic — incremental == full rebuild, byte-wise.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IncrementalOrgBuilder } from '../incremental';
import { loadOrgConfig } from '../config';
import { buildOrgIndex } from '../org';

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** Copy the fixture workspace into a tmp dir so mutation never touches the repo. */
function makeWorkspace(): { dir: string; config: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-ws-'));
  fs.cpSync(path.join(ROOT, 'fixtures'), path.join(dir, 'fixtures'), { recursive: true });
  const config = path.join(dir, 'lynx-sources.json');
  fs.writeFileSync(config, JSON.stringify({
    modules: [
      { name: 'telemetry', template: 'fixtures/template', manifests: ['fixtures/instantiations/acme-corelab.md'], generated: 'fixtures/generated/acme-corelab', reports: 'fixtures/reports' },
      { name: 'notify', template: 'fixtures/org/notify/template' },
    ],
    codeowners: 'fixtures/org/CODEOWNERS',
  }, null, 2));
  return { dir, config };
}

test('rule: first build extracts everything; unchanged rebuild is fully cached and byte-identical', () => {
  const { dir, config } = makeWorkspace();
  const builder = new IncrementalOrgBuilder(config, path.join(dir, 'org.db'), path.join(dir, 'cache'));

  const first = builder.build();
  assert.deepEqual(builder.stats.extracted.sort(), ['notify', 'telemetry']);
  const bytes1 = fs.readFileSync(path.join(dir, 'org.db'));

  const second = builder.build();
  assert.deepEqual(builder.stats.cached.sort(), ['notify', 'telemetry']);
  assert.deepEqual(builder.stats.extracted, []);
  assert.equal(second.generation, first.generation);
  assert.ok(fs.readFileSync(path.join(dir, 'org.db')).equals(bytes1));
});

test('rule: a changed module re-extracts alone; output byte-equals a from-scratch full build', () => {
  const { dir, config } = makeWorkspace();
  const builder = new IncrementalOrgBuilder(config, path.join(dir, 'org.db'), path.join(dir, 'cache'));
  builder.build();

  const target = path.join(dir, 'fixtures/org/notify/template/NotifyRoute.lynx.kt');
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('ordering: none', 'ordering: per-key'));

  const incremental = builder.build();
  assert.deepEqual(builder.stats.extracted, ['notify']);
  assert.deepEqual(builder.stats.cached, ['telemetry']);

  const fullOut = path.join(dir, 'full.db');
  const full = buildOrgIndex(loadOrgConfig(config), fullOut);
  assert.equal(incremental.generation, full.generation);
  assert.ok(fs.readFileSync(path.join(dir, 'org.db')).equals(fs.readFileSync(fullOut)), 'incremental != full rebuild');
});

test('rule: disk cache survives a new builder instance; stale entries are pruned', () => {
  const { dir, config } = makeWorkspace();
  const cacheDir = path.join(dir, 'cache');
  new IncrementalOrgBuilder(config, path.join(dir, 'org.db'), cacheDir).build();

  const cold = new IncrementalOrgBuilder(config, path.join(dir, 'org2.db'), cacheDir);
  cold.build();
  assert.deepEqual(cold.stats.cached.sort(), ['notify', 'telemetry'], 'disk cache not used by a cold builder');

  const target = path.join(dir, 'fixtures/org/notify/template/NotifyRoute.lynx.kt');
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8') + '\n');
  cold.build();
  const files = fs.readdirSync(cacheDir).filter((f) => f.startsWith('notify-'));
  assert.equal(files.length, 1, 'stale notify shard not pruned');
});
