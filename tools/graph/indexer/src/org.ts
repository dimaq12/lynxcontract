//@realizes: [contracts/graph#OrgExtractor]
// Spec §6: deterministic merge of per-module extractions. Zero inference — every org edge
// comes from a declaration (§6.1). Topic ids are never namespaced: the dedup point.
import * as crypto from 'node:crypto';
import { extract, IndexInputs, Extraction, GraphNode, GraphEdge, FtsRow, InputFile } from './extract';
import { generationOf, writeDeterministic, BuildResult } from './build';
import { cmpStr } from './ids';

export interface ModuleInput {
  name: string;
  inputs: IndexInputs;
  /** Workspace-relative root path of the module (for CODEOWNERS glob matching); name is the fallback. */
  root?: string;
}

export interface OrgInputs {
  modules: ModuleInput[];
  codeowners?: InputFile;
}

export function extractOrg(org: OrgInputs): Extraction {
  return extractOrgCore(org, (m) => extract(m.inputs));
}

/** The single merge implementation; `extractModule` lets the incremental builder feed cached shards. */
export function extractOrgCore(org: OrgInputs, extractModule: (m: ModuleInput) => Extraction): Extraction {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const fts: FtsRow[] = [];

  const addEdge = (src: string, dst: string, kind: string, attrs: Record<string, unknown> = {}) => {
    edges.set(`${src}\0${dst}\0${kind}`, { src, dst, kind, attrs });
  };

  const modules = [...org.modules].sort((a, b) => cmpStr(a.name, b.name));
  const moduleMeta: { name: string; id: string; pkg?: string; depends: string[]; restricts: string[] }[] = [];

  for (const m of modules) {
    const ext = extractModule(m);
    const ns = (id: string): string => (id.startsWith('topic:') ? id : `${m.name}/${id}`);

    for (const n of ext.nodes) {
      if (n.kind === 'topic') {
        if (!nodes.has(n.id)) nodes.set(n.id, n);
        continue;
      }
      nodes.set(ns(n.id), { ...n, id: ns(n.id), attrs: { ...n.attrs, module: m.name } });
    }
    for (const e of ext.edges) addEdge(ns(e.src), ns(e.dst), e.kind, e.attrs);
    for (const r of ext.fts) fts.push({ node_id: ns(r.node_id), body: r.body });

    const moduleContract = ext.nodes.find((n) => n.kind === 'contract' && n.attrs.block_kind === 'module');
    const mid = `module:${m.name}`;
    nodes.set(mid, {
      id: mid, kind: 'module', name: m.name, attrs: {
        layer: moduleContract?.attrs.layer ?? null,
        package: moduleContract?.attrs.package ?? null,
      },
    });
    moduleMeta.push({
      name: m.name, id: mid,
      pkg: moduleContract?.attrs.package as string | undefined,
      depends: (moduleContract?.attrs.depends as string[] | undefined) ?? [],
      restricts: (moduleContract?.attrs.restrictions as string[] | undefined) ?? [],
    });
    for (const n of ext.nodes) {
      if (n.kind === 'stub' || n.kind === 'contract' || n.kind === 'target') addEdge(ns(n.id), mid, 'member_of');
    }
  }

  // module→module edges from //@module depends/restrictions package globs (§6.1)
  const matchModule = (glob: string): typeof moduleMeta[number] | undefined => {
    const prefix = glob.replace(/\.\*$/, '').replace(/\*$/, '');
    return moduleMeta.find((mm) => mm.pkg && (mm.pkg.startsWith(prefix) || prefix.startsWith(mm.pkg)));
  };
  for (const mm of moduleMeta) {
    for (const g of mm.depends) {
      const dst = matchModule(g);
      if (dst && dst.id !== mm.id) addEdge(mm.id, dst.id, 'depends', { glob: g });
    }
    for (const g of mm.restricts) {
      const dst = matchModule(g);
      if (dst && dst.id !== mm.id) addEdge(mm.id, dst.id, 'restricts', { glob: g });
    }
  }

  // CODEOWNERS → owner nodes + owns edges (§6.1): gitignore-glob against the module root path
  if (org.codeowners) {
    const roots = new Map(modules.map((m) => [m.name, m.root]));
    for (const line of org.codeowners.text.split(/\r?\n/)) {
      const m = /^\s*([^#\s]+)\s+(.+)$/.exec(line);
      if (!m) continue;
      for (const handle of m[2].trim().split(/\s+/)) {
        const oid = `owner:${handle}`;
        if (!nodes.has(oid)) nodes.set(oid, { id: oid, kind: 'owner', name: handle, attrs: {} });
        for (const mm of moduleMeta) {
          if (codeownersMatch(m[1], mm.name, roots.get(mm.name))) {
            addEdge(oid, mm.id, 'owns', { pattern: m[1] });
          }
        }
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => cmpStr(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => cmpStr(a.src, b.src) || cmpStr(a.dst, b.dst) || cmpStr(a.kind, b.kind)),
    fts: fts.sort((a, b) => cmpStr(a.node_id, b.node_id) || cmpStr(a.body, b.body)),
  };
}

/**
 * CODEOWNERS matching per spec §6.1 (v1.0): gitignore-glob against the module's
 * workspace-relative root path (`*`/`**`/`?`, leading-/ anchor, trailing-/ directory
 * semantics), with plain module-name equality kept as a convenience. A pattern owns a module
 * when it covers the module dir itself or everything under it (`foo/**` owns module foo).
 */
export function codeownersMatch(pattern: string, moduleName: string, moduleRoot?: string): boolean {
  if (pattern === moduleName) return true;
  let pat = pattern.replace(/\/\*{1,2}$/, '/').replace(/\/+$/, '/'); // `foo/**`, `foo/*`, `foo/` → dir form `foo/`
  const anchored = pat.startsWith('/');
  pat = pat.replace(/^\/+/, '').replace(/\/$/, '');
  if (!pat) return false;
  const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const seg = (s: string) => s.split('*').map((t) => t.split('?').map(esc).join('[^/]')).join('[^/]*');
  const body = pat.split('**').map(seg).join('.*');
  const rx = new RegExp(`^${anchored ? '' : '(?:.*/)?'}${body}(?:/.*)?$`);
  return [moduleRoot, moduleName].some((c) => !!c && rx.test(c));
}

/** Org generation = hash over per-module shard generations + CODEOWNERS (§4 shard merge). */
export function orgGenerationOf(org: OrgInputs): string {
  const h = crypto.createHash('sha256');
  for (const m of [...org.modules].sort((a, b) => cmpStr(a.name, b.name))) {
    h.update(m.name);
    h.update('\0');
    h.update(generationOf(m.inputs));
    h.update('\0');
  }
  if (org.codeowners) h.update(org.codeowners.text);
  return h.digest('hex').slice(0, 16);
}

export function buildOrgIndex(org: OrgInputs, outFile: string): BuildResult {
  return writeDeterministic(extractOrg(org), orgGenerationOf(org), outFile);
}
