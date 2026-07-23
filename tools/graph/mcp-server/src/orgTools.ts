//@realizes: [contracts/graph#OrgTools]
// §6.4 org tools over the same read-only handle. Unmapped stays unmapped (§6.5).
import Database from 'better-sqlite3';
import { listSnapshots, resolveSnapshotRef } from '@lynx/indexer/out/snapshots';
import { LynxTools, ToolError } from './tools';

export interface DiffChange {
  class: string;
  id: string;
  detail?: string;
}

export interface OrgToolsOptions {
  /** The snapshot registry (spec §6.4); lynx_snapshots/lynx_diff resolve refs against it. */
  snapshotDir?: string;
}

const SNAPSHOT_REF_HINT =
  "A snapshot ref is a registered generation id (or unambiguous prefix — see lynx_snapshots), a path to an index .db file, or 'live' (the served index).";

export class OrgTools extends LynxTools {
  private readonly snapshotDir?: string;
  private readonly dbFile: string;

  constructor(dbPath: string, opts: OrgToolsOptions = {}) {
    super(dbPath);
    this.dbFile = dbPath;
    this.snapshotDir = opts.snapshotDir;
  }

  private orgStamp<T extends object>(result: T): T & { index_generation: string } {
    return { ...result, index_generation: this.generation };
  }

  /** Spec §6.4: the registry listing — the discovery half of diff. */
  snapshots(): object {
    if (!this.snapshotDir) {
      return this.orgStamp({
        snapshots: [],
        hint: 'No snapshot registry configured — start the server with --sources (or --snapshots <dir>), or register snapshots with lynx-index --snapshot.',
      });
    }
    return this.orgStamp({ registry: this.snapshotDir, snapshots: listSnapshots(this.snapshotDir, this.generation) });
  }

  /** Resolve two snapshot refs (generation | prefix | path | 'live') and diff them. */
  diffRefs(refA: string, refB: string): object | ToolError {
    const paths: string[] = [];
    for (const ref of [refA, refB]) {
      const r = resolveSnapshotRef(ref, this.snapshotDir, this.dbFile);
      if ('error' in r) {
        const known = r.generations.length > 0 ? ` Registered generations: ${r.generations.join(', ')}.` : '';
        return { isError: true, message: `${r.error}. ${SNAPSHOT_REF_HINT}${known}` };
      }
      paths.push(r.path);
    }
    return OrgTools.diff(paths[0], paths[1]);
  }

  modules(): object {
    const rows = this.db.prepare('SELECT * FROM org_health ORDER BY module').all() as { module: string }[];
    const owners = this.db.prepare('SELECT owner, module FROM org_ownership ORDER BY owner').all() as { owner: string; module: string }[];
    return this.orgStamp({
      modules: rows.map((r) => ({ ...r, owners: owners.filter((o) => o.module === r.module).map((o) => o.owner) })),
    });
  }

  ownersOf(ref: string): object | ToolError {
    // module name / module id directly
    const direct = this.db.prepare(
      "SELECT owner FROM org_ownership WHERE module=? OR module='module:' || ? ORDER BY owner",
    ).all(ref, ref) as { owner: string }[];
    if (direct.length > 0) return this.orgStamp({ ref, owners: direct.map((o) => o.owner) });
    // any node id / topic: find its module(s), then their owners
    const modules = this.db.prepare(`
      SELECT DISTINCT json_extract(n.attrs,'$.module') AS m FROM nodes n
      WHERE (n.id=? OR n.id LIKE '%' || ? || '%') AND json_extract(n.attrs,'$.module') IS NOT NULL
      UNION
      SELECT DISTINCT json_extract(pn.attrs,'$.module') FROM nodes t
      JOIN edges e ON e.dst=t.id AND e.kind IN ('produces','consumes') JOIN nodes pn ON pn.id=e.src
      WHERE t.kind='topic' AND (t.name=? OR t.id=?)`).all(ref, ref, ref, ref) as { m: string }[];
    const mods = modules.map((x) => x.m).filter(Boolean);
    if (mods.length === 0) return { isError: true, message: `No module resolves for '${ref}' — unmapped.` };
    const owners = new Set<string>();
    for (const m of mods) {
      for (const o of this.db.prepare("SELECT owner FROM org_ownership WHERE module='module:' || ?").all(m) as { owner: string }[]) {
        owners.add(o.owner);
      }
    }
    return this.orgStamp({ ref, modules: mods.sort(), owners: [...owners].sort() });
  }

  orgImpactOf(ref: string): object | ToolError {
    const node = (this.db.prepare('SELECT id FROM nodes WHERE id=?').get(ref)
      ?? this.db.prepare("SELECT id FROM nodes WHERE name=? ORDER BY CASE kind WHEN 'fill_token' THEN 0 WHEN 'contract' THEN 1 WHEN 'topic' THEN 2 WHEN 'rule' THEN 3 ELSE 4 END, id LIMIT 1").get(ref)
      ?? this.db.prepare('SELECT id FROM nodes WHERE id LIKE ? ORDER BY id LIMIT 1').get(`%${ref}%`)) as { id: string } | undefined;
    if (!node) return { isError: true, message: `No node matches '${ref}'.` };
    // Blast radius: the impact closure ALSO crosses topics — forward through produces, back out through consumes.
    const reach = this.db.prepare(`
      WITH RECURSIVE reach(id) AS (
        SELECT ?
        UNION
        SELECT e.dst FROM edges e JOIN reach ON e.src = reach.id
          AND e.kind IN ('instantiates','generates','declares','realized_by','cites','produces')
        UNION
        SELECT e.src FROM edges e JOIN reach ON e.dst = reach.id
          AND e.kind IN ('cites','realizes','consumes')
      )
      SELECT n.id, n.kind, json_extract(n.attrs,'$.module') AS module FROM reach JOIN nodes n ON n.id=reach.id ORDER BY n.id`).all(node.id) as { id: string; kind: string; module: string | null }[];
    const modules = [...new Set(reach.map((r) => r.module).filter((m): m is string => !!m))].sort();
    const owners = new Set<string>();
    for (const m of modules) {
      for (const o of this.db.prepare("SELECT owner FROM org_ownership WHERE module='module:' || ?").all(m) as { owner: string }[]) {
        owners.add(o.owner);
      }
    }
    return this.orgStamp({
      root: node.id,
      affected_modules: modules,
      owners: [...owners].sort(),
      regeneration_set: reach.filter((r) => r.kind === 'target').map((r) => r.id),
      tests: reach.filter((r) => r.kind === 'test_case').map((r) => r.id),
      topics_crossed: reach.filter((r) => r.kind === 'topic').map((r) => r.id),
    });
  }

  hologram(scope?: string, format: 'json' | 'mermaid' = 'json'): object {
    const rows = (scope
      ? this.db.prepare("SELECT * FROM org_event_mesh WHERE topic LIKE '%' || ? || '%' OR producer_module LIKE '%' || ? || '%' OR consumer_module LIKE '%' || ? || '%' ORDER BY topic").all(scope, scope, scope)
      : this.db.prepare('SELECT * FROM org_event_mesh ORDER BY topic').all()) as {
        topic: string; producer_module: string | null; consumer_module: string | null;
      }[];
    if (format === 'json') {
      return this.orgStamp({ mesh: rows });
    }
    const lines = ['flowchart LR'];
    const seen = new Set<string>();
    const idOf = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_');
    for (const r of rows) {
      const t = `T_${idOf(r.topic)}`;
      if (!seen.has(t)) { seen.add(t); lines.push(`  ${t}[("${r.topic}")]`); }
      for (const [mod, dir] of [[r.producer_module, 'in'], [r.consumer_module, 'out']] as const) {
        if (!mod) continue;
        const m = `M_${idOf(mod)}`;
        if (!seen.has(m)) { seen.add(m); lines.push(`  ${m}["${mod}"]`); }
        const edge = dir === 'in' ? `  ${m} --> ${t}` : `  ${t} --> ${m}`;
        if (!seen.has(edge)) { seen.add(edge); lines.push(edge); }
      }
    }
    return this.orgStamp({ mermaid: lines.join('\n') });
  }

  /** Contract-level changelog between two snapshots (§6.4). Static: opens both files read-only. */
  static diff(snapshotA: string, snapshotB: string): object | ToolError {
    let a: Database.Database, b: Database.Database;
    try {
      a = new Database(snapshotA, { readonly: true, fileMustExist: true });
      b = new Database(snapshotB, { readonly: true, fileMustExist: true });
    } catch (e) {
      return { isError: true, message: `Cannot open snapshot: ${(e as Error).message}. ${SNAPSHOT_REF_HINT}` };
    }
    try {
      const gen = (db: Database.Database) => (db.prepare("SELECT value FROM meta WHERE key='index_generation'").get() as { value: string }).value;
      const nodesOf = (db: Database.Database) => new Map((db.prepare('SELECT id, kind, attrs FROM nodes').all() as { id: string; kind: string; attrs: string }[]).map((n) => [n.id, n]));
      const edgesOf = (db: Database.Database) => new Map((db.prepare('SELECT src, dst, kind FROM edges').all() as { src: string; dst: string; kind: string }[]).map((e) => [`${e.src} ${e.dst} ${e.kind}`, e]));

      const na = nodesOf(a), nb = nodesOf(b), ea = edgesOf(a), eb = edgesOf(b);
      const changes: DiffChange[] = [];

      for (const [id, n] of nb) {
        if (!na.has(id)) changes.push({ class: n.kind === 'topic' ? 'new-topic' : `node-added:${n.kind}`, id });
      }
      for (const [id, n] of na) {
        if (!nb.has(id)) changes.push({ class: `node-removed:${n.kind}`, id });
      }
      for (const [key, e] of eb) {
        if (!ea.has(key)) {
          const cls = e.kind === 'consumes' ? 'new-consumer'
            : e.kind === 'depends' && e.src.startsWith('module:') ? 'layer-edge-introduced'
            : `edge-added:${e.kind}`;
          changes.push({ class: cls, id: key });
        }
      }
      for (const key of ea.keys()) {
        if (!eb.has(key)) changes.push({ class: 'edge-removed', id: key });
      }
      // frozen-surface evolution (§19.1): member added is a tracked change; member removed violates the freeze
      for (const [id, n] of na) {
        if (n.kind !== 'enum_surface' || !nb.has(id)) continue;
        const va = new Set<string>(JSON.parse(n.attrs).values ?? []);
        const vb = new Set<string>(JSON.parse(nb.get(id)!.attrs).values ?? []);
        for (const v of vb) if (!va.has(v)) changes.push({ class: 'enum-member-added', id, detail: v });
        for (const v of va) if (!vb.has(v)) changes.push({ class: 'freeze-violated', id, detail: `member removed: ${v}` });
      }
      changes.sort((x, y) => (x.class < y.class ? -1 : x.class > y.class ? 1 : x.id < y.id ? -1 : 1));
      return { a_generation: gen(a), b_generation: gen(b), changes };
    } finally {
      a.close();
      b.close();
    }
  }
}
