//@realizes: [contracts/graph#MethodLocator]
// Contract-test: regex/tree-sitter parity, tree-sitter superiority cases, generation identity.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { regexLocator, createTreeSitterLocator, MethodLocator } from '../locator';
import { buildIndex, loadInputs, generationOf } from '../build';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ROUTE_KT = fs.readFileSync(path.join(ROOT, 'fixtures/generated/acme-corelab/internal/StartCaptureRoute.kt'), 'utf8');

let ts: MethodLocator | undefined;
test.before(async () => {
  ts = await createTreeSitterLocator();
});

test('regex locator finds the fixture declarations with lines', () => {
  const decls = regexLocator.locate('internal/StartCaptureRoute.kt', ROUTE_KT);
  assert.deepEqual(decls.map((d) => d.name), ['handle', 'retryBackoff']);
});

test('tree-sitter locator: parity with regex on plain generated Kotlin', (t) => {
  if (!ts) return t.skip('tree-sitter wasm not available');
  const a = regexLocator.locate('internal/StartCaptureRoute.kt', ROUTE_KT).map((d) => `${d.name}@${d.line}`);
  const b = ts!.locate('internal/StartCaptureRoute.kt', ROUTE_KT).map((d) => `${d.name}@${d.line}`);
  assert.deepEqual(b, a);
});

test('tree-sitter finds declarations regex cannot (annotated one-liner, backtick name, Java)', (t) => {
  if (!ts) return t.skip('tree-sitter wasm not available');
  const kotlin = 'class X {\n    @Deprecated("old") fun legacy(): Int = 1\n    fun `weird name`(): Unit {}\n}';
  const kt = ts!.locate('X.kt', kotlin).map((d) => d.name);
  assert.ok(kt.includes('legacy'), `missing annotated fun: ${kt}`);
  assert.ok(kt.includes('weird name'), `missing backtick fun: ${kt}`);
  assert.deepEqual(regexLocator.locate('X.kt', kotlin).map((d) => d.name), [], 'regex unexpectedly matched');

  const java = 'class A {\n    public long backoff(int attempt) { return attempt * 250L; }\n}';
  assert.deepEqual(ts!.locate('A.java', java).map((d) => d.name), ['backoff']);
});

test('locator id feeds the generation hash — never byte-equality across locators; per-locator determinism holds', (t) => {
  if (!ts) return t.skip('tree-sitter wasm not available');
  const inputs = () => loadInputs({
    root: ROOT,
    templateDir: path.join(ROOT, 'fixtures/template'),
    manifestFiles: [path.join(ROOT, 'fixtures/instantiations/acme-corelab.md')],
    generatedDir: path.join(ROOT, 'fixtures/generated/acme-corelab'),
    reportsDir: path.join(ROOT, 'fixtures/reports'),
  });
  const regexIn = inputs();
  const tsIn = inputs();
  tsIn.locator = ts;
  assert.notEqual(generationOf(regexIn), generationOf(tsIn));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-loc-'));
  const a = buildIndex({ inputs: tsIn, outFile: path.join(dir, 'a.db') });
  const tsIn2 = inputs();
  tsIn2.locator = ts;
  const b = buildIndex({ inputs: tsIn2, outFile: path.join(dir, 'b.db') });
  assert.equal(a.generation, b.generation);
  assert.ok(fs.readFileSync(a.outFile).equals(fs.readFileSync(b.outFile)));
});
