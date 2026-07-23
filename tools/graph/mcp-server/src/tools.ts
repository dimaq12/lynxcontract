//@realizes: [contracts/graph#Tools]
// SDK-agnostic tool implementations over a read-only SQLite handle.
// Validation failures return {isError:true, message} — never throw (MCP SEP-1303: validation errors as tool results).
import Database from 'better-sqlite3';
import { EXAMPLE_QUERIES } from '@lynx/indexer/out/schema';

export interface ToolError {
  isError: true;
  message: string;
}

export interface QueryResult {
  index_generation: string;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  next_offset?: number;
}

const DENY_TOKENS = /\b(ATTACH|PRAGMA|DETACH|VACUUM|REINDEX|ANALYZE)\b/i;
const DEFAULT_LIMIT = 50;
const HARD_LIMIT = 500;

export class LynxTools {
  protected db: Database.Database;
  readonly generation: string;

  constructor(dbPath: string) {
    // Engine-first read-only: unbypassable for writes.
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
    this.generation = (this.db.prepare("SELECT value FROM meta WHERE key='index_generation'").get() as { value: string }).value;
  }

  close(): void {
    this.db.close();
  }

  private stamp<T extends object>(result: T): T & { index_generation: string } {
    return { ...result, index_generation: this.generation };
  }

  schema(): object {
    const tables = this.db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'fts_%' ORDER BY name").all();
    const kinds = this.db.prepare('SELECT kind, count(*) n FROM nodes GROUP BY kind ORDER BY kind').all();
    const edgeKinds = this.db.prepare('SELECT kind, count(*) n FROM edges GROUP BY kind ORDER BY kind').all();
    return this.stamp({
      id_format: 'kind:file#name[@instance]',
      tables,
      node_kinds: kinds,
      edge_kinds: edgeKinds,
      example_queries: EXAMPLE_QUERIES,
    });
  }

  query(sql: string, limit?: number, offset?: number): QueryResult | ToolError {
    if (DENY_TOKENS.test(sql)) {
      return { isError: true, message: 'Only plain read-only SELECT is allowed (no ATTACH/PRAGMA/DDL). Rephrase as a SELECT over nodes/edges/fts/views — call lynx_schema for the model.' };
    }
    const cap = Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), HARD_LIMIT);
    const skip = Math.max(0, offset ?? 0);
    let stmt: Database.Statement;
    try {
      stmt = this.db.prepare(sql); // rejects multi-statement input
    } catch (e) {
      return { isError: true, message: `SQL error: ${(e as Error).message}. Call lynx_schema for tables, views and worked examples.` };
    }
    if (!stmt.reader) {
      return { isError: true, message: 'Statement returns no rows — only SELECT queries are served.' };
    }
    let rows: Record<string, unknown>[];
    try {
      rows = stmt.all() as Record<string, unknown>[];
    } catch (e) {
      return { isError: true, message: `Query failed: ${(e as Error).message}` };
    }
    const window = rows.slice(skip, skip + cap);
    const columns = window.length > 0 ? Object.keys(window[0]) : stmt.columns().map((c) => c.name);
    return this.stamp({
      columns,
      rows: window.map((r) => columns.map((c) => r[c])),
      truncated: rows.length > skip + cap,
      ...(rows.length > skip + cap ? { next_offset: skip + cap } : {}),
    }) as QueryResult;
  }

  contractOf(file: string, line?: number): object | ToolError {
    const candidates = this.db.prepare(
      "SELECT id, name, file, line, attrs FROM nodes WHERE kind='contract' AND (file=? OR file LIKE '%/' || ?) ORDER BY line",
    ).all(file, file) as { id: string; name: string; file: string; line: number | null; attrs: string }[];
    if (candidates.length === 0) {
      // fall back: contract realized_by a target with this path
      const viaTarget = this.db.prepare(
        "SELECT n.id, n.name, n.file, n.line, n.attrs FROM edges e JOIN nodes n ON n.id=e.src WHERE e.kind='realized_by' AND (e.dst LIKE 'target:%' || ?) ORDER BY n.line",
      ).all(file) as typeof candidates;
      if (viaTarget.length === 0) return { isError: true, message: `No contract governs '${file}' — unmapped (the honest answer, spec §7.1).` };
      return this.stamp({ governing: viaTarget, via: 'realized_by' });
    }
    let pick = candidates;
    if (line !== undefined) {
      const at = [...candidates].reverse().find((c) => (c.line ?? 0) <= line);
      if (at) pick = [at];
    }
    const withBinds = pick.map((c) => ({
      ...c,
      attrs: JSON.parse(c.attrs),
      bound_rules: (this.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='binds'").all(c.id) as { src: string }[]).map((r) => r.src),
      fills_in_force: this.db.prepare(
        "SELECT t.name token, v.name value FROM nodes t JOIN edges e ON e.src=t.id AND e.kind='instantiates' JOIN nodes v ON v.id=e.dst AND v.kind='fill_value' WHERE t.kind='fill_token' ORDER BY t.name",
      ).all(),
    }));
    return this.stamp({ governing: withBinds, via: 'file' });
  }

  why(file: string, line: number): object | ToolError {
    // method containing the line
    const method = this.db.prepare(
      "SELECT id, name, line FROM nodes WHERE kind='method' AND (file=? OR file LIKE '%/' || ?) AND line<=? ORDER BY line DESC LIMIT 1",
    ).get(file, file, line) as { id: string; name: string } | undefined;
    if (!method) {
      return { isError: true, message: `No method mapped at ${file}:${line} — body lines answer with their method's obligations, and this file has no indexed method (§2 granularity floor).` };
    }
    const path: { edge: string; from: string; to: string }[] = [];
    const contracts = this.db.prepare("SELECT dst FROM edges WHERE src=? AND kind='realizes'").all(method.id) as { dst: string }[];
    for (const c of contracts) {
      path.push({ edge: 'realizes', from: method.id, to: c.dst });
      for (const cl of this.db.prepare("SELECT dst FROM edges WHERE src=? AND kind='declares'").all(c.dst) as { dst: string }[]) {
        if (cl.dst.startsWith('clause:')) path.push({ edge: 'declares', from: c.dst, to: cl.dst });
      }
      // stub-level provenance: the declaring stub and rules bound to ANY of its contracts
      for (const s of this.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='declares' AND src LIKE 'stub:%'").all(c.dst) as { src: string }[]) {
        path.push({ edge: 'declares', from: s.src, to: c.dst });
        for (const sib of this.db.prepare("SELECT dst FROM edges WHERE src=? AND kind='declares'").all(s.src) as { dst: string }[]) {
          for (const r of this.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='binds'").all(sib.dst) as { src: string }[]) {
            path.push({ edge: 'binds', from: r.src, to: sib.dst });
          }
        }
      }
      for (const r of this.db.prepare("SELECT src FROM edges WHERE dst=? AND kind='binds'").all(c.dst) as { src: string }[]) {
        path.push({ edge: 'binds', from: r.src, to: c.dst });
      }
    }
    if (contracts.length === 0) {
      return this.stamp({ method: method.id, path, note: 'method indexed but not matched to a contract — unmapped, not guessed' });
    }
    return this.stamp({ method: method.id, path });
  }

  impactOf(ref: string): object | ToolError {
    // exact id first, then exact name with kind priority, then substring — never an arbitrary LIKE hit
    const node = (this.db.prepare('SELECT id FROM nodes WHERE id=?').get(ref)
      ?? this.db.prepare("SELECT id FROM nodes WHERE name=? ORDER BY CASE kind WHEN 'fill_token' THEN 0 WHEN 'contract' THEN 1 WHEN 'rule' THEN 2 WHEN 'fill_value' THEN 3 ELSE 4 END, id LIMIT 1").get(ref)
      ?? this.db.prepare('SELECT id FROM nodes WHERE id LIKE ? ORDER BY id LIMIT 1').get(`%${ref}%`)) as { id: string } | undefined;
    if (!node) return { isError: true, message: `No node matches '${ref}'. Try lynx_query: SELECT id FROM nodes WHERE id LIKE '%...%'` };
    const reach = this.db.prepare(`
      WITH RECURSIVE reach(id) AS (
        SELECT ?
        UNION
        SELECT e.dst FROM edges e JOIN reach ON e.src = reach.id
          AND e.kind IN ('instantiates','generates','declares','realized_by','cites')
        UNION
        SELECT e.src FROM edges e JOIN reach ON e.dst = reach.id
          AND e.kind IN ('cites','realizes')
      )
      SELECT n.id, n.kind FROM reach JOIN nodes n ON n.id = reach.id ORDER BY n.id`).all(node.id) as { id: string; kind: string }[];
    return this.stamp({
      root: node.id,
      regeneration_set: reach.filter((r) => r.kind === 'target').map((r) => r.id),
      tests: reach.filter((r) => r.kind === 'test_case').map((r) => r.id),
      full_reach: reach.map((r) => r.id),
    });
  }

  lint(scope?: string): object {
    const rows = scope
      ? this.db.prepare("SELECT * FROM lint_violations WHERE node_id LIKE '%' || ? || '%' ORDER BY invariant, node_id").all(scope)
      : this.db.prepare('SELECT * FROM lint_violations ORDER BY invariant, node_id').all();
    return this.stamp({ violations: rows, clean: (rows as unknown[]).length === 0 });
  }

  realizationsOf(ref: string): object | ToolError {
    const rows = this.db.prepare(`
      SELECT e.src, e.dst, e.kind, e.attrs FROM edges e
      WHERE e.kind IN ('realizes','realized_by','generates')
        AND (e.src LIKE '%' || ? || '%' OR e.dst LIKE '%' || ? || '%')
      ORDER BY e.src, e.dst`).all(ref, ref);
    if ((rows as unknown[]).length === 0) return { isError: true, message: `No realization edges match '${ref}' — unmapped.` };
    return this.stamp({ edges: rows });
  }

  /** The contract↔code divergence surface. Drift ≠ lint: lint is §20.8 invariants, this is fidelity. */
  drift(scope?: string): object {
    const like = scope ? `%${scope}%` : '%';
    const rows = this.db.prepare("SELECT * FROM contract_drift WHERE node_id LIKE ? ORDER BY class, node_id").all(like);
    const gaps = this.db.prepare(`
      SELECT g.id, g.name, json_extract(g.attrs,'$.text') AS text, e.dst AS explains_marker
      FROM nodes g LEFT JOIN edges e ON e.src=g.id AND e.kind='explains'
      WHERE g.kind='gap' AND (g.id LIKE ? OR ? = '%') ORDER BY g.id`).all(like, like);
    const deviations = this.db.prepare(`
      SELECT id, name AS text, file, line FROM nodes
      WHERE kind='marker' AND json_extract(attrs,'$.marker_kind')='deviation' AND (file LIKE ? OR ? = '%')
      ORDER BY id`).all(like, like);
    return this.stamp({ drift: rows, gaps, deviations, clean: (rows as unknown[]).length === 0 });
  }

  /** Spec §5: classify an observed divergence — predicted | catalogued | candidate_defect, in that order. */
  explainDivergence(file: string, line: number, observed: string): object {
    // predicted: a declared etalon deviation — on the file itself, or on the stub that generates it
    const predicted = this.db.prepare(`
      SELECT DISTINCT n.id, n.name FROM nodes n
      WHERE n.kind='marker' AND json_extract(n.attrs,'$.marker_kind')='deviation'
        AND (n.file=? OR n.file LIKE '%/' || ?
          OR EXISTS (
            SELECT 1 FROM edges cite
            JOIN edges gen ON gen.src=cite.dst AND gen.kind='generates'
            JOIN nodes t ON t.id=gen.dst
            WHERE cite.src=n.id AND cite.kind='cites' AND (t.name=? OR t.name LIKE '%' || ?)))
      ORDER BY n.id`).all(file, file, file, file) as { id: string; name: string }[];
    if (predicted.length > 0) {
      return this.stamp({
        classification: 'predicted', observed,
        citations: predicted.map((p) => p.id),
        note: 'declared etalon deviation — the divergence is expected and documented (§20.4)',
      });
    }
    // catalogued: a gap-ledger entry explains a marker in this file, or names the file
    const catalogued = this.db.prepare(`
      SELECT DISTINCT g.id FROM nodes g
      LEFT JOIN edges e ON e.src=g.id AND e.kind='explains'
      LEFT JOIN nodes m ON m.id=e.dst
      WHERE g.kind='gap' AND ((m.file=? OR m.file LIKE '%/' || ?) OR instr(coalesce(json_extract(g.attrs,'$.text'),''), ?)>0)
      ORDER BY g.id`).all(file, file, file) as { id: string }[];
    if (catalogued.length > 0) {
      return this.stamp({
        classification: 'catalogued', observed,
        citations: catalogued.map((c) => c.id),
        note: 'recorded in the gap ledger of an instantiation run',
      });
    }
    // candidate_defect: nothing covers it — cite what SHOULD have
    const gov = this.contractOf(file, line);
    const governing = 'isError' in gov ? [] : (gov as { governing: { id: string; bound_rules?: string[] }[] }).governing;
    const contracts = governing.map((c) => c.id);
    if (contracts.length === 0) {
      // fall back through the generation chain: target ← generates ← stub → declares → contracts
      const viaStub = this.db.prepare(`
        SELECT DISTINCT dc.dst AS id FROM nodes t
        JOIN edges gen ON gen.dst=t.id AND gen.kind='generates' AND instr(gen.src,'stub:')>0
        JOIN edges dc ON dc.src=gen.src AND dc.kind='declares'
        WHERE t.kind='target' AND (t.name=? OR t.name LIKE '%/' || ?) ORDER BY dc.dst`).all(file, file) as { id: string }[];
      contracts.push(...viaStub.map((r) => r.id));
    }
    return this.stamp({
      classification: 'candidate_defect', observed,
      should_have_covered: {
        contracts,
        rules: [...new Set(governing.flatMap((c) => c.bound_rules ?? []))],
      },
      note: 'no deviation marker and no gap entry covers this — treat as a defect until adjudicated (§20.4)',
    });
  }

  /** Spec §5 runs: historical findings across instantiation runs, with per-contract recurrence. */
  runs(filter?: { run?: string; class?: string; min_runs?: number }): object {
    const where: string[] = ["kind='finding'"];
    const params: unknown[] = [];
    if (filter?.run) { where.push("json_extract(attrs,'$.run')=?"); params.push(filter.run); }
    if (filter?.class) { where.push("json_extract(attrs,'$.class')=?"); params.push(filter.class); }
    const findings = this.db.prepare(`
      SELECT id, name, json_extract(attrs,'$.run') AS run, json_extract(attrs,'$.class') AS class,
             json_extract(attrs,'$.grouped_id') AS grouped_id, json_extract(attrs,'$.text') AS text
      FROM nodes WHERE ${where.join(' AND ')} ORDER BY id`).all(...params);
    const recurrence = this.db.prepare(`
      SELECT rb.src AS contract, count(DISTINCT json_extract(f.attrs,'$.run')) AS runs, count(*) AS findings
      FROM nodes f
      JOIN edges ct ON ct.src=f.id AND ct.kind='cites'
      JOIN edges rb ON rb.dst=ct.dst AND rb.kind='realized_by'
      WHERE f.kind='finding'
      GROUP BY rb.src HAVING runs >= ? ORDER BY runs DESC, contract`).all(filter?.min_runs ?? 1);
    return this.stamp({ findings, contracts_by_recurrence: recurrence });
  }

  /** Spec §5 trace_requirement: the audit chain requirement → fills → targets → tests → findings. */
  traceRequirement(ref: string): object | ToolError {
    const token = (this.db.prepare("SELECT id, name, attrs FROM nodes WHERE kind='fill_token' AND (name=? OR id=?)").get(ref, ref)
      ?? this.db.prepare("SELECT t.id, t.name, t.attrs FROM nodes v JOIN edges e ON e.dst=v.id AND e.kind='instantiates' JOIN nodes t ON t.id=e.src WHERE v.kind='fill_value' AND (v.name=? OR v.id=?)").get(ref, ref)) as { id: string; name: string; attrs: string } | undefined;
    if (!token) return { isError: true, message: `'${ref}' resolves to no fill token or value — trace starts at a requirement (registry row) or its answer.` };

    const fills = this.db.prepare("SELECT v.id, v.name AS value, v.file AS manifest FROM edges e JOIN nodes v ON v.id=e.dst AND v.kind='fill_value' WHERE e.src=? AND e.kind='instantiates'").all(token.id);
    const reach = this.db.prepare(`
      WITH RECURSIVE reach(id) AS (
        SELECT ?
        UNION
        SELECT e.dst FROM edges e JOIN reach ON e.src = reach.id
          AND e.kind IN ('instantiates','generates','declares','realized_by')
        UNION
        SELECT e.src FROM edges e JOIN reach ON e.dst = reach.id AND e.kind='cites'
      )
      SELECT n.id, n.kind FROM reach JOIN nodes n ON n.id=reach.id`).all(token.id) as { id: string; kind: string }[];
    const targets = reach.filter((r) => r.kind === 'target').map((r) => r.id).sort();
    const findings = this.db.prepare(`
      SELECT DISTINCT f.id, json_extract(f.attrs,'$.run') AS run, json_extract(f.attrs,'$.class') AS class
      FROM nodes f JOIN edges e ON e.src=f.id AND e.kind='cites'
      WHERE f.kind='finding' AND e.dst IN (${targets.map(() => '?').join(',') || "''"})
      ORDER BY f.id`).all(...targets);
    return this.stamp({
      requirement: { id: token.id, token: token.name, source: JSON.parse(token.attrs).source ?? null },
      fills,
      instances: reach.filter((r) => r.kind === 'instance').map((r) => r.id).sort(),
      targets,
      tests: reach.filter((r) => r.kind === 'test_case').map((r) => r.id).sort(),
      findings,
    });
  }

  node(id: string): object | ToolError {
    const n = this.db.prepare('SELECT * FROM nodes WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!n) return { isError: true, message: `No node '${id}'.` };
    const out = this.db.prepare('SELECT dst, kind FROM edges WHERE src=? ORDER BY dst').all(id);
    const inn = this.db.prepare('SELECT src, kind FROM edges WHERE dst=? ORDER BY src').all(id);
    return this.stamp({ ...n, attrs: JSON.parse(n.attrs as string), edges_out: out, edges_in: inn });
  }
}
