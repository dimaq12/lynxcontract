//@realizes: [contracts/graph#Lynxctl]
// Contract-test: output format, exit codes, flags, deep-cycle detection.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { runLynxctl, dependencyCycles } from '../lynxctl';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function makeWorkspace(): { dir: string; config: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynxctl-ws-'));
  fs.cpSync(path.join(ROOT, 'fixtures'), path.join(dir, 'fixtures'), { recursive: true });
  const config = path.join(dir, 'lynx-sources.json');
  fs.writeFileSync(config, JSON.stringify({
    modules: [
      { name: 'telemetry', template: 'fixtures/template', manifests: ['fixtures/instantiations/acme-corelab.md'], generated: 'fixtures/generated/acme-corelab', reports: 'fixtures/reports' },
      { name: 'notify', template: 'fixtures/org/notify/template' },
    ],
    codeowners: 'fixtures/org/CODEOWNERS',
  }));
  return { dir, config };
}

test('exit 1 with one tab-separated finding per line, file:line resolved', () => {
  const { config } = makeWorkspace();
  const r = runLynxctl(['--config', config]);
  assert.equal(r.code, 1);
  assert.ok(r.lines.length >= 6, `expected >=6 findings, got ${r.lines.length}`);
  for (const line of r.lines) {
    assert.match(line, /^[\w-]+\t\S+\t.+$/, `bad line format: ${line}`);
  }
  assert.ok(r.lines.some((l) => l.startsWith('realization-completeness\tfixtures/template/BrokenStub.lynx.kt:')));
  assert.ok(r.lines.some((l) => l.startsWith('orphan-topic')));
});

test('--no-org restricts to §20.8 module invariants; --scope filters; --drift appends fidelity rows', () => {
  const { config } = makeWorkspace();
  const noOrg = runLynxctl(['--config', config, '--no-org']);
  assert.ok(!noOrg.lines.some((l) => l.startsWith('orphan-topic') || l.startsWith('privacy-taint') || l.startsWith('layer-violation')));
  const scoped = runLynxctl(['--config', config, '--scope', 'BrokenStub']);
  assert.equal(scoped.lines.length, 1);
  const drift = runLynxctl(['--config', config, '--drift']);
  assert.ok(drift.lines.some((l) => l.startsWith('undeclared-method')));
});

test('usage error -> exit 2', () => {
  assert.equal(runLynxctl([]).code, 2);
});

test('deep dependency cycles are detected beyond 2-cycles', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE edges (src TEXT, dst TEXT, kind TEXT, attrs TEXT DEFAULT '{}')");
  const ins = db.prepare("INSERT INTO edges (src, dst, kind) VALUES (?, ?, 'depends')");
  ins.run('module:a', 'module:b');
  ins.run('module:b', 'module:c');
  ins.run('module:c', 'module:a');
  const cycles = dependencyCycles(db);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].length, 4); // a -> b -> c -> a
  db.close();
});
