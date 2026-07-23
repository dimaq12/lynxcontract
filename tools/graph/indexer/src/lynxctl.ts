#!/usr/bin/env node
//@realizes: [contracts/graph#Lynxctl]
// The §20.8 checklist as a CI command: one violation per line, non-zero exit on findings.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { IncrementalOrgBuilder } from './incremental';

export interface CtlResult {
  code: number;
  lines: string[];
}

interface Row {
  invariant?: string;
  class?: string;
  node_id: string;
  message: string;
}

export function runLynxctl(argv: string[]): CtlResult {
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf('--' + name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const config = arg('config');
  if (!config) {
    return { code: 2, lines: ['usage: lynxctl --config <lynx-sources.json> [--scope <substr>] [--no-org] [--drift] [--db <reuse.db>]'] };
  }

  let dbPath = arg('db');
  let temp = false;
  if (!dbPath) {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lynxctl-')), 'index.db');
    temp = true;
    new IncrementalOrgBuilder(path.resolve(config), dbPath, arg('cache')).build();
  }

  const db = new Database(dbPath, { readonly: true });
  const lines: string[] = [];
  try {
    const scope = arg('scope');
    const like = scope ? `%${scope}%` : '%';
    const push = (invariant: string, nodeId: string, message: string) => {
      const n = db.prepare('SELECT file, line FROM nodes WHERE id=?').get(nodeId) as { file: string | null; line: number | null } | undefined;
      const loc = n?.file ? `${n.file}:${n.line !== null && n.line !== undefined ? n.line + 1 : 1}` : '-';
      lines.push(`${invariant}\t${loc}\t${message}`);
    };

    for (const r of db.prepare('SELECT * FROM lint_violations WHERE node_id LIKE ? ORDER BY invariant, node_id').all(like) as Row[]) {
      push(r.invariant!, r.node_id, r.message);
    }
    if (!argv.includes('--no-org')) {
      for (const r of db.prepare('SELECT * FROM org_lint_violations WHERE node_id LIKE ? ORDER BY invariant, node_id').all(like) as Row[]) {
        push(r.invariant!, r.node_id, r.message);
      }
      for (const cycle of dependencyCycles(db)) {
        lines.push(`dependency-cycle\t-\tmodule dependency cycle: ${cycle.join(' -> ')} (§17)`);
      }
    }
    if (argv.includes('--drift')) {
      for (const r of db.prepare('SELECT * FROM contract_drift WHERE node_id LIKE ? ORDER BY class, node_id').all(like) as Row[]) {
        push(r.class!, r.node_id, r.message);
      }
    }
  } finally {
    db.close();
    if (temp) fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }

  return { code: lines.length > 0 ? 1 : 0, lines };
}

/** Deep cycle detection over module `depends` edges (§17) — beyond the SQL 2-cycle view. */
export function dependencyCycles(db: Database.Database): string[][] {
  const edges = db.prepare("SELECT src, dst FROM edges WHERE kind='depends' AND src LIKE 'module:%' AND dst LIKE 'module:%'").all() as { src: string; dst: string }[];
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.src, [...(adj.get(e.src) ?? []), e.dst].sort());

  const cycles: string[][] = [];
  const seenCycle = new Set<string>();
  const visit = (node: string, stack: string[], onStack: Set<string>) => {
    if (onStack.has(node)) {
      const cycle = [...stack.slice(stack.indexOf(node)), node];
      const key = [...new Set(cycle)].sort().join('|');
      if (!seenCycle.has(key) && cycle.length > 3) { // >3 elements = longer than a 2-cycle (a->b->a is 3)
        seenCycle.add(key);
        cycles.push(cycle);
      }
      return;
    }
    onStack.add(node);
    for (const next of adj.get(node) ?? []) visit(next, [...stack, node], onStack);
    onStack.delete(node);
  };
  for (const start of [...adj.keys()].sort()) visit(start, [], new Set());
  return cycles;
}

if (require.main === module) {
  const result = runLynxctl(process.argv.slice(2));
  for (const line of result.lines) process.stdout.write(line + '\n');
  process.exit(result.code);
}
