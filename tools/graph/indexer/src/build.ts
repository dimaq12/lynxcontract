//@realizes: [contracts/graph#DeterministicBuild]
// The research-doc determinism recipe, verbatim: fresh DB, journal OFF, sorted inserts,
// indexes last, VACUUM INTO -> atomic rename. No wall-clock anywhere in the file.
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { extract, IndexInputs, Extraction } from './extract';
import { cmpStr } from './ids';
import { DDL, INDEX_DDL, VIEW_DDL, GRAPH_SCHEMA_VERSION, LYNXCONTRACT_SPEC_VERSION } from './schema';

export interface BuildOptions {
  inputs: IndexInputs;
  outFile: string;
}

export interface BuildResult {
  outFile: string;
  /** Content hash of all inputs — the index generation id. Never a timestamp. */
  generation: string;
  counts: { nodes: number; edges: number };
}

/** Deterministic content hash over every input file (path + text, sorted). */
export function generationOf(inputs: IndexInputs): string {
  const h = crypto.createHash('sha256');
  const all = [...inputs.template, ...inputs.manifests, ...inputs.generated, ...inputs.reports]
    .sort((a, b) => cmpStr(a.path, b.path));
  for (const f of all) {
    h.update(f.path);
    h.update('\0');
    h.update(f.text);
    h.update('\0');
  }
  // Different locators produce different graphs — the generation must say so (never claim
  // byte-equality across locator implementations).
  h.update('locator:' + (inputs.locator?.id ?? 'regex@1'));
  // Different extractor versions produce different graphs from the same inputs; the shard
  // cache is keyed by generation, so a code upgrade must change it (cache is never a semantic).
  h.update('schema:' + GRAPH_SCHEMA_VERSION);
  return h.digest('hex').slice(0, 16);
}

export function buildIndex(opts: BuildOptions): BuildResult {
  return writeDeterministic(extract(opts.inputs), generationOf(opts.inputs), opts.outFile);
}

/** The full determinism recipe over an already-extracted graph (shared with the org builder). */
export function writeDeterministic(extraction: Extraction, generation: string, outFile: string): BuildResult {
  const dir = path.dirname(outFile);
  if (!fs.existsSync(dir)) throw new Error(`output directory does not exist: ${dir}`);

  const workFile = outFile + '.work';
  const tmpFile = outFile + '.tmp';
  for (const f of [workFile, tmpFile]) if (fs.existsSync(f)) fs.unlinkSync(f);

  const db = new Database(workFile);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.pragma('temp_store = MEMORY');
  db.pragma('page_size = 4096');
  db.exec(DDL);

  writeAll(db, extraction, generation);

  db.exec(INDEX_DDL);
  db.exec(VIEW_DDL);
  db.exec(`VACUUM INTO '${tmpFile.replace(/'/g, "''")}'`);
  db.close();
  fs.unlinkSync(workFile);

  const fd = fs.openSync(tmpFile, 'r');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmpFile, outFile);
  const dfd = fs.openSync(dir, 'r');
  fs.fsyncSync(dfd);
  fs.closeSync(dfd);

  return { outFile, generation, counts: { nodes: extraction.nodes.length, edges: extraction.edges.length } };
}

function writeAll(db: Database.Database, extraction: Extraction, generation: string): void {
  const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  const insertNode = db.prepare('INSERT INTO nodes (id, kind, name, file, line, attrs) VALUES (?, ?, ?, ?, ?, ?)');
  const insertEdge = db.prepare('INSERT INTO edges (src, dst, kind, attrs) VALUES (?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO fts (node_id, body) VALUES (?, ?)');

  db.transaction(() => {
    insertMeta.run('graph_schema_version', GRAPH_SCHEMA_VERSION);
    insertMeta.run('lynxcontract_spec_version', LYNXCONTRACT_SPEC_VERSION);
    insertMeta.run('index_generation', generation);
    for (const n of extraction.nodes) {
      insertNode.run(n.id, n.kind, n.name ?? null, n.file ?? null, n.line ?? null, canonicalJson(n.attrs));
    }
    for (const e of extraction.edges) {
      insertEdge.run(e.src, e.dst, e.kind, canonicalJson(e.attrs));
    }
    for (const r of extraction.fts) insertFts.run(r.node_id, r.body);
  })();
}

/** JSON with sorted keys — attrs serialization must not depend on insertion order. */
function canonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// ---- input loading helpers (I/O lives here, not in extract) ----

export function loadInputs(opts: { templateDir: string; manifestFiles: string[]; generatedDir?: string; reportsDir?: string; root: string }): IndexInputs {
  const rel = (p: string) => path.relative(opts.root, p).split(path.sep).join('/');
  const read = (p: string) => ({ path: rel(p), text: fs.readFileSync(p, 'utf8') });
  const walk = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => cmpStr(a.name, b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  return {
    template: walk(opts.templateDir).map(read),
    manifests: opts.manifestFiles.map(read),
    generated: opts.generatedDir ? walk(opts.generatedDir).map(read) : [],
    reports: opts.reportsDir ? walk(opts.reportsDir).map(read) : [],
    generatedRoot: opts.generatedDir ? rel(opts.generatedDir) : undefined,
  };
}
