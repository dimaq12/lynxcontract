//@realizes: [contracts/graph#SnapshotRegistry]
// Spec §6.4 — the time axis operationalized: a content-addressed directory of index snapshots
// (.lynx-snapshots/<generation>.db beside the sources config), shared by the CLI, watch mode
// and the MCP server. Registration is idempotent; generations are input-content hashes.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SnapshotRow {
  generation: string;
  path: string;
  bytes: number;
  live?: boolean;
}

export function snapshotDirFor(configPath: string): string {
  return path.join(path.dirname(path.resolve(configPath)), '.lynx-snapshots');
}

/** Copy the built index into the registry. Never rewrites an existing generation. */
export function writeSnapshot(dbFile: string, generation: string, dir: string): { path: string; written: boolean } {
  const dst = path.join(dir, `${generation}.db`);
  if (fs.existsSync(dst)) return { path: dst, written: false };
  fs.mkdirSync(dir, { recursive: true });
  const tmp = dst + '.tmp';
  fs.copyFileSync(dbFile, tmp);
  fs.renameSync(tmp, dst);
  return { path: dst, written: true };
}

/** Registry listing; tolerates a missing dir, ignores non-`<hex>.db` files. */
export function listSnapshots(dir: string, liveGeneration?: string): SnapshotRow[] {
  if (!fs.existsSync(dir)) return [];
  const rows: SnapshotRow[] = [];
  for (const f of fs.readdirSync(dir).sort()) {
    const m = /^([0-9a-f]{8,64})\.db$/.exec(f);
    if (!m) continue;
    const p = path.join(dir, f);
    rows.push({ generation: m[1], path: p, bytes: fs.statSync(p).size, ...(m[1] === liveGeneration ? { live: true } : {}) });
  }
  return rows;
}

/** A snapshot ref is a generation id, an unambiguous prefix, an index file path, or 'live'. */
export function resolveSnapshotRef(
  ref: string,
  dir?: string,
  livePath?: string,
): { path: string } | { error: string; generations: string[] } {
  const generations = dir ? listSnapshots(dir).map((r) => r.generation) : [];
  if (ref === 'live') {
    return livePath ? { path: livePath } : { error: "'live' requires a served index", generations };
  }
  if (fs.existsSync(ref) && fs.statSync(ref).isFile()) return { path: ref };
  if (dir) {
    const hits = generations.filter((g) => g === ref || g.startsWith(ref));
    if (hits.length === 1) return { path: path.join(dir, hits[0] + '.db') };
    if (hits.length > 1) return { error: `generation prefix '${ref}' is ambiguous (${hits.join(', ')})`, generations };
  }
  return { error: `'${ref}' is not a registered generation, an index file path, or 'live'`, generations };
}
