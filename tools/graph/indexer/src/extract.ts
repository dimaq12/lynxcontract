//@realizes: [contracts/graph#Extractor]
// Pure extraction: input file texts -> sorted node/edge/fts lists per spec §2. No I/O, no SQLite.
import { parseDocument, walkEntries, parseListValue, parseStubHeader, scanMarkers, Block, Entry } from '@lynx/core';
import { nodeId, cmpStr, hashName } from './ids';
import { MethodLocator, regexLocator } from './locator';

export interface InputFile {
  /** Workspace-relative posix path. */
  path: string;
  text: string;
}

export interface IndexInputs {
  template: InputFile[];
  manifests: InputFile[];
  generated: InputFile[];
  reports: InputFile[];
  /** Path prefix of the generated tree, e.g. 'fixtures/generated/acme-corelab'. */
  generatedRoot?: string;
  /** Method-declaration locator; defaults to regexLocator. Its id feeds the generation hash. */
  locator?: MethodLocator;
}

export interface GraphNode {
  id: string;
  kind: string;
  name?: string;
  file?: string;
  line?: number;
  attrs: Record<string, unknown>;
}

export interface GraphEdge {
  src: string;
  dst: string;
  kind: string;
  attrs: Record<string, unknown>;
}

export interface FtsRow {
  node_id: string;
  body: string;
}

export interface Extraction {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fts: FtsRow[];
}

const CONTRACT_KINDS = new Set(['contract', 'messaging', 'flow', 'graph', 'module', 'observability', 'plugin']);
const RULE_RE = /^-\s*RULE\[([\w.-]+)\]:\s*(.*?)(?:\s*->\s*binds\s+(\S+))?\s*$/;
const FILL_ROW_RE = /^\|\s*\{\{(\w+)\}\}\s*\|\s*([^|]*?)\s*\|/;
const INSTANCE_RE = /^-\s*INSTANCE\[\{\{(\w+)\}\}\]:\s*(.+)$/;
const BLOCKED_RE = /^-\s*BLOCKED\[([^\]]+)\]:\s*(.+)$/;
const SCOPE_REDUCED_RE = /^-\s*SCOPE-REDUCED\[([^\]]+)\]:\s*(.+)$/;
const PIN_RE = /^-\s*PIN\[([^\]]+)\]:\s*(.+)$/;
const QUIRK_RE = /^-\s*QUIRK\[([^\]]+)\]:\s*(.+)$/;
const GAP_RE = /^-\s*GAP\[([\w.-]+)\]:\s*(.*?)(?:\s*\(marker:\s*([^)]+)\))?\s*$/;
const FINDING_RE = /^-\s*FINDING\[([\w.-]+)\]:\s*class=(\w+)\s+run=([\w.-]+)(?:\s+at=(\S+?))?(?:\s+grouped=([\w.-]+))?(?:\s+marker=(\S+))?\s*[—-]\s*(.*)$/;
const COVERS_RE = /(?:\/\/|#)@covers:\s*\[([^\]]+)\]/;
const METHOD_RE = /^\s*(?:override\s+)?(?:public\s+|private\s+|internal\s+)?fun\s+([A-Za-z_]\w*)/;
const FILL_USE_RE = /\{\{([A-Za-z]\w*)\}\}/g;

function isLynxFile(path: string): boolean {
  return /\.lynx(\.|$)/.test(path);
}

/** Spec §3.1: named blocks keep their name; unnamed ones get a content-hash name (line-shift-immune). */
function blockName(block: Block, taken: Set<string>): string {
  return block.name ?? hashName(block.kind, blockText(block), taken);
}

function normalizePath(p: string): string {
  return p.replace(/\.lynx(?=\.|$)/, '').replace(/\.(kt|kts|java|go|py|rs|md)$/, '');
}

export function extract(inputs: IndexInputs): Extraction {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const fts: FtsRow[] = [];
  /** References resolved after all contracts are known. */
  const pendingRefs: { src: string; ref: string; kind: string }[] = [];

  const addNode = (n: GraphNode): GraphNode => {
    const existing = nodes.get(n.id);
    if (existing) return existing;
    nodes.set(n.id, n);
    return n;
  };
  const addEdge = (src: string, dst: string, kind: string, attrs: Record<string, unknown> = {}) => {
    edges.set(`${src}\u0000${dst}\u0000${kind}`, { src, dst, kind, attrs });
  };

  // ---- pass 0: fill registry ----
  const registry = new Map<string, { source?: string; file: string }>();
  for (const f of [...inputs.template].sort((a, b) => cmpStr(a.path, b.path))) {
    if (!/fill[-_]registry/i.test(f.path)) continue;
    for (const line of f.text.split(/\r?\n/)) {
      const m = FILL_ROW_RE.exec(line);
      if (m && !registry.has(m[1])) registry.set(m[1], { source: m[2] || undefined, file: f.path });
    }
  }

  const fillTokenId = (token: string): string => {
    const reg = registry.get(token);
    return reg ? nodeId('fill_token', reg.file, token) : nodeId('fill_token', 'unregistered', token);
  };
  for (const [token, reg] of [...registry.entries()].sort()) {
    addNode({ id: fillTokenId(token), kind: 'fill_token', name: token, file: reg.file, attrs: { registered: 1, source: reg.source ?? null } });
  }

  // ---- pass 1: template stubs, contracts, clauses, topics, rules, pins ----
  interface ContractRec { id: string; name: string; file: string; block: Block; }
  const contracts: ContractRec[] = [];
  const stubHeaders = new Map<string, ReturnType<typeof parseStubHeader>>();

  const template = [...inputs.template].sort((a, b) => cmpStr(a.path, b.path));
  for (const f of template) {
    if (isLynxFile(f.path)) {
      const header = parseStubHeader(f.text);
      stubHeaders.set(f.path, header);
      addNode({
        id: nodeId('stub', f.path), kind: 'stub', file: f.path, attrs: {
          target: header.target?.value ?? null,
          realization: header.realization?.mode ?? null,
          copy_source: header.realization?.source ?? null,
          multiplier: header.multiplier ? 1 : 0,
        },
      });
    }
    const parsed = parseDocument(f.text, f.path);
    const takenBlockNames = new Set<string>();
    for (const block of parsed.blocks) {
      if (!block.known || !CONTRACT_KINDS.has(block.kind)) continue;
      const bname = blockName(block, takenBlockNames);
      const cid = nodeId('contract', f.path, bname);
      contracts.push({ id: cid, name: bname, file: f.path, block });
      addNode({ id: cid, kind: 'contract', name: bname, file: f.path, line: block.startLine, attrs: { block_kind: block.kind } });
      if (isLynxFile(f.path)) addEdge(nodeId('stub', f.path), cid, 'declares');
      fts.push({ node_id: cid, body: blockText(block) });
    }
    // fill usages
    FILL_USE_RE.lastIndex = 0;
    const seenTokens = new Set<string>();
    let fm: RegExpExecArray | null;
    while ((fm = FILL_USE_RE.exec(f.text)) !== null) seenTokens.add(fm[1]);
    for (const token of [...seenTokens].sort()) {
      const id = fillTokenId(token);
      addNode({ id, kind: 'fill_token', name: token, attrs: { registered: registry.has(token) ? 1 : 0 } });
      if (isLynxFile(f.path)) addEdge(nodeId('stub', f.path), id, 'cites');
    }
    // rules and pins in markdown
    const lines = f.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const r = RULE_RE.exec(lines[i]);
      if (r) {
        const rid = nodeId('rule', f.path, r[1]);
        addNode({ id: rid, kind: 'rule', name: r[1], file: f.path, line: i, attrs: { text: r[2] } });
        fts.push({ node_id: rid, body: r[2] });
        if (r[3]) pendingRefs.push({ src: rid, ref: r[3], kind: 'binds' });
      }
      const p = PIN_RE.exec(lines[i]);
      if (p) addNode({ id: nodeId('pin', f.path, p[1]), kind: 'pin', name: p[1], file: f.path, line: i, attrs: { revision: p[2] } });
      const q = QUIRK_RE.exec(lines[i]);
      if (q) addNode({ id: nodeId('quirk', f.path, q[1]), kind: 'quirk', name: q[1], file: f.path, line: i, attrs: { text: q[2] } });
    }
    // §20.4 provenance markers live template-side too (etalon deviations on stubs)
    if (isLynxFile(f.path)) {
      const takenMarkerNames = new Set<string>();
      for (const marker of scanMarkers(f.text)) {
        const mid = nodeId('marker', f.path, hashName(marker.kind, marker.text, takenMarkerNames));
        addNode({ id: mid, kind: 'marker', name: marker.text, file: f.path, line: marker.line, attrs: { marker_kind: marker.kind } });
        addEdge(mid, nodeId('stub', f.path), 'cites');
      }
    }
  }

  // second sweep over contract blocks now that all contracts exist
  const resolveContract = (ref: string): string | undefined => {
    const hash = ref.indexOf('#');
    const refPath = hash >= 0 ? ref.slice(0, hash) : ref;
    const refName = hash >= 0 ? ref.slice(hash + 1) : undefined;
    const hit = contracts.find((c) => {
      if (refName && !(c.name === refName || c.name.endsWith('.' + refName))) return false;
      if (refPath) {
        const a = normalizePath(c.file);
        const b = normalizePath(refPath);
        if (!(a === b || a.endsWith('/' + b) || a.endsWith(b))) return false;
      }
      return true;
    });
    return hit?.id;
  };

  for (const c of contracts) {
    // selected attrs the org layer reads (§6.1 connective tissue)
    const cNode = nodes.get(c.id)!;
    const sig = c.block.entries.find((en) => en.key === 'signature')?.value;
    if (sig) cNode.attrs.signature = sig;
    if (c.block.kind === 'module') {
      for (const key of ['layer', 'package']) {
        const v = c.block.entries.find((en) => en.key === key)?.value;
        if (v) cNode.attrs[key] = v;
      }
      for (const key of ['depends', 'restrictions']) {
        const v = c.block.entries.find((en) => en.key === key)?.value;
        if (v) cNode.attrs[key] = parseListValue(v, 0).map((i) => i.item);
      }
    }
    if (c.block.kind === 'flow') {
      const priv = c.block.entries.find((en) => en.key === 'privacy')?.value;
      if (priv) cNode.attrs.privacy = priv;
      // `from: topic X` / `to: topic X` are consumes/produces declarations too (§14 node grammar)
      for (const [key, edgeKind] of [['from', 'consumes'], ['to', 'produces']] as const) {
        const v = c.block.entries.find((en) => en.key === key)?.value;
        const m = v ? /^topic\s+(\S+)$/.exec(v) : null;
        if (m) addEdge(c.id, topicNode(m[1]), edgeKind);
      }
    }
    // §19.1 frozen/closed enum surfaces
    for (const e of c.block.entries) {
      if (e.key && e.children.some((ch) => ch.key === 'frozen' || ch.key === 'closed')) {
        const esId = nodeId('enum_surface', c.file, e.key);
        const values = e.children.find((ch) => ch.key === 'values')?.value;
        addNode({
          id: esId, kind: 'enum_surface', name: e.key, file: c.file, line: e.line, attrs: {
            frozen: e.children.find((ch) => ch.key === 'frozen')?.value ?? null,
            closed: e.children.find((ch) => ch.key === 'closed')?.value ?? null,
            values: values ? parseListValue(values, 0).map((i) => i.item.replace(/^["']|["']$/g, '')) : [],
          },
        });
        addEdge(c.id, esId, 'freezes');
      }
    }
    for (const e of walkEntries(c.block.entries)) {
      if (e.key === 'realizes' && e.value) {
        for (const item of parseListValue(e.value, 0)) {
          const dst = resolveContract(item.item);
          addEdge(c.id, dst ?? nodeId('contract', 'unresolved', item.item), 'realizes', { ref: item.item, resolved: dst ? 1 : 0 });
        }
      }
      if (e.key === 'raises') {
        for (const child of e.children) {
          if (!child.key) continue;
          const clid = nodeId('clause', c.file, `${c.name}.raises.${child.key}`);
          addNode({ id: clid, kind: 'clause', name: `${c.name}.raises.${child.key}`, file: c.file, line: child.line, attrs: { clause_kind: 'raises', exception: child.key, predicate: child.value ?? null } });
          addEdge(c.id, clid, 'declares');
        }
      }
      if (e.key === 'consumes') {
        const topicE = [e, ...walkEntries(e.children)].find((x) => x.key === 'topic');
        if (topicE?.value) {
          const tid = topicNode(topicE.value);
          addEdge(c.id, tid, 'consumes');
        }
      }
      if (e.key === 'produces') {
        for (const item of e.children.filter((ch) => ch.listItem)) {
          const parts = [item, ...walkEntries(item.children)];
          const topicE = parts.find((x) => x.key === 'topic');
          const whenE = parts.find((x) => x.key === 'when');
          if (topicE?.value) addEdge(c.id, topicNode(topicE.value), 'produces', whenE?.value ? { when: whenE.value } : {});
          const wm = whenE?.value ? /^raises\s+([\w.]+)/.exec(whenE.value) : null;
          if (wm) {
            const clid = nodeId('clause', c.file, `${c.name}.produces-when.${wm[1]}`);
            addNode({ id: clid, kind: 'clause', name: `${c.name}.produces-when.${wm[1]}`, file: c.file, line: whenE!.line, attrs: { clause_kind: 'produces-when', exception: wm[1] } });
            addEdge(c.id, clid, 'declares');
          }
        }
      }
    }
  }

  function topicNode(topic: string): string {
    const clean = topic.trim();
    const id = nodeId('topic', clean);
    addNode({ id, kind: 'topic', name: clean, attrs: {} });
    return id;
  }

  // ---- pass 2: manifests (fill values, instances, blocked, scope reductions) ----
  const fillValues = new Map<string, string>(); // token -> value
  const instancesByToken = new Map<string, string[]>();
  const blocked = new Map<string, string>();
  const scopeReduced = new Map<string, string>();

  for (const mf of [...inputs.manifests].sort((a, b) => cmpStr(a.path, b.path))) {
    for (const line of mf.text.split(/\r?\n/)) {
      const fr = FILL_ROW_RE.exec(line);
      if (fr && registry.has(fr[1]) && !fillValues.has(fr[1]) && !/fill[-_]registry/i.test(mf.path)) {
        fillValues.set(fr[1], fr[2]);
        const vid = nodeId('fill_value', mf.path, fr[1]);
        addNode({ id: vid, kind: 'fill_value', name: fr[2], file: mf.path, attrs: { token: fr[1] } });
        addEdge(fillTokenId(fr[1]), vid, 'instantiates');
      }
      const im = INSTANCE_RE.exec(line);
      if (im) {
        const list = im[2].split(',').map((s) => s.trim()).filter(Boolean);
        instancesByToken.set(im[1], list);
        for (const inst of list) {
          const iid = nodeId('instance', mf.path, inst);
          addNode({ id: iid, kind: 'instance', name: inst, file: mf.path, attrs: { token: im[1], instantiation: mf.path } });
          const vid = nodeId('fill_value', mf.path, im[1]);
          if (nodes.has(vid)) addEdge(vid, iid, 'instantiates');
          else addEdge(fillTokenId(im[1]), iid, 'instantiates');
        }
      }
      const bm = BLOCKED_RE.exec(line);
      if (bm) blocked.set(bm[1], bm[2]);
      const sm = SCOPE_REDUCED_RE.exec(line);
      if (sm) scopeReduced.set(sm[1], sm[2]);
    }
  }

  for (const [clauseRef, reason] of scopeReduced) {
    const clause = [...nodes.values()].find((n) => n.kind === 'clause' && n.id.endsWith(clauseRef));
    if (clause) clause.attrs.scope_reduced = reason;
  }

  // ---- pass 3: planned targets from stubs × instances ----
  const generatedPaths = new Set(inputs.generated.map((g) => g.path));
  const relGenerated = (p: string): string =>
    inputs.generatedRoot && p.startsWith(inputs.generatedRoot + '/') ? p.slice(inputs.generatedRoot.length + 1) : p;
  const generatedRel = new Set([...generatedPaths].map(relGenerated));

  const substitute = (tpl: string, extra?: Record<string, string>): string =>
    tpl.replace(/\{\{(\w+)\}\}/g, (_, tok) => extra?.[tok] ?? fillValues.get(tok) ?? `{{${tok}}}`);

  // fills in force apply to declared packages (the org layer matches module packages by prefix)
  for (const n of nodes.values()) {
    if (n.kind === 'contract' && typeof n.attrs.package === 'string' && (n.attrs.package as string).includes('{{')) {
      n.attrs.package = substitute(n.attrs.package as string);
    }
  }

  for (const [stubPath, header] of [...stubHeaders.entries()].sort()) {
    if (!header.target || header.realization?.mode === 'n/a') continue;
    const sid = nodeId('stub', stubPath);
    const tokensInTarget = [...header.target.value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const multiplierToken = header.multiplier ? tokensInTarget.find((t) => instancesByToken.has(t)) : undefined;

    const planOne = (targetPath: string, instance?: string) => {
      const tid = nodeId('target', targetPath);
      const inst = instance ? [...nodes.values()].find((n) => n.kind === 'instance' && n.name === instance) : undefined;
      addNode({
        id: tid, kind: 'target', name: targetPath, file: targetPath, attrs: {
          exists: generatedRel.has(targetPath) ? 1 : 0,
          blocked_reason: blocked.get(targetPath) ?? null,
          ...(inst ? { instantiation: inst.attrs.instantiation } : {}),
        },
      });
      addEdge(sid, tid, 'generates', instance ? { instance } : {});
      if (instance) {
        const inst = [...nodes.values()].find((n) => n.kind === 'instance' && n.name === instance);
        if (inst) addEdge(inst.id, tid, 'generates');
      }
    };

    if (multiplierToken) {
      for (const inst of instancesByToken.get(multiplierToken)!) {
        planOne(substitute(header.target.value, { [multiplierToken]: inst }), inst);
      }
    } else {
      planOne(substitute(header.target.value));
    }
  }

  // realizedBy edges now that targets exist
  for (const c of contracts) {
    for (const e of walkEntries(c.block.entries)) {
      if (e.key !== 'realizedBy' || !e.value) continue;
      for (const item of parseListValue(e.value, 0)) {
        const ref = substitute(item.item);
        const target = [...nodes.values()].find((n) => n.kind === 'target' && (n.id === nodeId('target', ref) || n.name!.endsWith('/' + ref) || n.name === ref));
        addEdge(c.id, target?.id ?? nodeId('target', ref), 'realized_by', { ref: item.item, resolved: target ? 1 : 0 });
      }
    }
  }

  // ---- pass 4: generated tree (methods, markers, test cases) ----
  const clauseNodes = () => [...nodes.values()].filter((n) => n.kind === 'clause');
  for (const g of [...inputs.generated].sort((a, b) => cmpStr(a.path, b.path))) {
    const rel = relGenerated(g.path);
    const tid = nodeId('target', rel);
    if (!nodes.has(tid)) {
      addNode({ id: tid, kind: 'target', name: rel, file: rel, attrs: { exists: 1, planned: 0, blocked_reason: null } });
    }
    const takenMarkerNames = new Set<string>();
    for (const marker of scanMarkers(g.text)) {
      const mid = nodeId('marker', rel, hashName(marker.kind, marker.text, takenMarkerNames));
      addNode({ id: mid, kind: 'marker', name: marker.text, file: rel, line: marker.line, attrs: { marker_kind: marker.kind } });
      addEdge(mid, tid, 'cites');
    }
    if (/\.(kt|kts|java|go|py|rs)$/.test(g.path)) {
      const isTest = /test/i.test(rel);
      if (isTest) {
        // Language-aware test-case detection: the locator finds the test fns/defs; each
        // //@covers (or #@covers) comment binds to the nearest declaration below it (§20.8-9).
        const locator = inputs.locator ?? regexLocator;
        const lines = g.text.split(/\r?\n/);
        for (const decl of locator.locate(g.path, g.text)) {
          const tcid = nodeId('test_case', rel, decl.name);
          addNode({ id: tcid, kind: 'test_case', name: decl.name, file: rel, line: decl.line, attrs: {} });
          addEdge(tid, tcid, 'declares');
          // scan comment lines immediately above the declaration for a covers annotation
          for (let k = decl.line - 1; k >= 0; k--) {
            const cov = COVERS_RE.exec(lines[k]);
            if (cov) {
              for (const ref of cov[1].split(',').map((s) => s.trim()).filter(Boolean)) {
                const clause = clauseNodes().find((n) => n.id.endsWith(ref) || n.name!.endsWith(ref));
                addEdge(tcid, clause?.id ?? nodeId('clause', 'unresolved', ref), 'covers', { ref, resolved: clause ? 1 : 0 });
              }
              break;
            }
            if (lines[k].trim() !== '' && !/^\s*(\/\/|#|\*)/.test(lines[k])) break; // stop at real code
          }
        }
      } else {
        const locator = inputs.locator ?? regexLocator;
        for (const decl of locator.locate(g.path, g.text)) {
          const mid = nodeId('method', rel, decl.name);
          addNode({ id: mid, kind: 'method', name: decl.name, file: rel, line: decl.line, attrs: {} });
          addEdge(tid, mid, 'declares');
          const owner = contracts.find((c) => {
            const sig = c.block.entries.find((en) => en.key === 'signature')?.value;
            const realized = walkEntries(c.block.entries).some((en) => en.key === 'realizedBy' && en.value !== undefined && substitute(en.value).includes(rel.split('/').pop()!.replace(/\.(kt|kts|java|go|py|rs)$/, '')));
            const sigHit = sig !== undefined && [`fun ${decl.name}(`, `func ${decl.name}(`, `def ${decl.name}(`, `fn ${decl.name}(`].some((x) => sig.includes(x));
            return sigHit || (realized && c.name.endsWith('.' + decl.name));
          });
          if (owner) addEdge(mid, owner.id, 'realizes', { matched_by: 'signature' });
        }
      }
    }
  }

  // ---- pass 5: reports (gap ledger) ----
  for (const rf of [...inputs.reports].sort((a, b) => cmpStr(a.path, b.path))) {
    const lines = rf.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const g = GAP_RE.exec(lines[i]);
      if (!g) continue;
      const gid = nodeId('gap', rf.path, g[1]);
      addNode({ id: gid, kind: 'gap', name: g[1], file: rf.path, line: i, attrs: { text: g[2] } });
      fts.push({ node_id: gid, body: g[2] });
      if (g[3]) {
        const markerRef = g[3].trim();
        const marker = [...nodes.values()].find((n) => n.kind === 'marker' && `${n.file}:${(n.line ?? 0) + 1}`.endsWith(markerRef));
        if (marker) addEdge(gid, marker.id, 'explains');
      }
    }
    // BATTLE-REPORT findings (§2): classified divergences of an instantiation run
    for (let i = 0; i < lines.length; i++) {
      const fm = FINDING_RE.exec(lines[i]);
      if (!fm) continue;
      const fid = nodeId('finding', rf.path, fm[1]);
      addNode({
        id: fid, kind: 'finding', name: fm[1], file: rf.path, line: i, attrs: {
          class: fm[2], run: fm[3], grouped_id: fm[5] ?? null, text: fm[7],
        },
      });
      fts.push({ node_id: fid, body: fm[7] });
      if (fm[4]) {
        const atFile = fm[4].split(':')[0];
        const target = [...nodes.values()].find((n) => n.kind === 'target' && (n.name === atFile || n.name!.endsWith('/' + atFile)));
        if (target) addEdge(fid, target.id, 'cites');
      }
      if (fm[6]) {
        const marker = [...nodes.values()].find((n) => n.kind === 'marker' && `${n.file}:${(n.line ?? 0) + 1}`.endsWith(fm[6]));
        if (marker) addEdge(marker.id, fid, 'predicts');
      }
    }
  }

  // resolve deferred rule binds
  for (const pr of pendingRefs) {
    const dst = resolveContract(pr.ref);
    addEdge(pr.src, dst ?? nodeId('contract', 'unresolved', pr.ref), pr.kind, { ref: pr.ref, resolved: dst ? 1 : 0 });
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => cmpStr(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => cmpStr(a.src, b.src) || cmpStr(a.dst, b.dst) || cmpStr(a.kind, b.kind)),
    fts: fts.sort((a, b) => cmpStr(a.node_id, b.node_id) || cmpStr(a.body, b.body)),
  };
}

function blockText(block: Block): string {
  const parts: string[] = [block.kind, block.name ?? ''];
  const visit = (e: Entry) => {
    if (e.key) parts.push(e.key);
    if (e.value) parts.push(e.value);
    e.children.forEach(visit);
  };
  block.entries.forEach(visit);
  return parts.filter(Boolean).join(' ');
}
