# Lynx Graph — the contract↔code index, served over MCP

Implements `spec/lynx-graph-mcp-spec-v1.0.md` — the shipped v1.0 (single-workspace core §1–§5
plus the §6 monorepo hologram, the §6.4 snapshot registry and §3.1 content-hash ids).
Three packages: `core/` (shared LynxContract parser), `indexer/` (deterministic SQLite build),
`mcp-server/` (stdio MCP surface). Contract tree in `contracts/graph.lynx.md`; all tests are
derived from those contracts.

## Build & test

```bash
cd tools/graph
npm install
npm run build
npm test            # 85 contract-tests, incl. build-twice byte-identity proof
```

## Index something

```bash
# single module:
node indexer/out/cli.js \
  --template <dir-with-*.lynx.*> \
  --manifest instantiations/<name>.md \
  --generated <generated-tree-dir> \
  --reports <reports-dir> \
  --out /tmp/my-module.db
# fixtures shortcut:
npm run index:fixtures

# workspace (org) — declare sources once in lynx-sources.json:
#   { "modules": [{ "name": "telemetry", "template": "...", "manifests": ["..."],
#                   "generated": "...", "reports": "..." }, ...],
#     "codeowners": "CODEOWNERS" }
node indexer/out/cli.js --config lynx-sources.json --out /tmp/org.db [--cache .lynx-cache]
# live index — @parcel/watcher + per-module shard cache, rebuilds O(changed modules):
node indexer/out/cli.js --config lynx-sources.json --out /tmp/org.db --watch --cache .lynx-cache
# time axis (§6.4): --snapshot registers each build in .lynx-snapshots/<generation>.db
node indexer/out/cli.js --config lynx-sources.json --out /tmp/org.db --snapshot
```

The index is a single SQLite file. Building twice from identical inputs yields **byte-identical
files** (generation id = content hash of inputs; no timestamps anywhere).

## Serve over MCP

```bash
node mcp-server/out/server.js --db /tmp/my-module.db     # stdio; logs to stderr
# add --sources lynx-sources.json to enable lynx_propose_change (the guarded write path)
# and the snapshot registry (auto-derived <sources-dir>/.lynx-snapshots; override: --snapshots <dir>).
# The served generation is auto-registered at startup, so every served index is diffable later.
```

Claude Code / MCP client config:

```json
{
  "mcpServers": {
    "lynx-graph": {
      "command": "node",
      "args": ["/path/to/tools/graph/mcp-server/out/server.js", "--db", "/tmp/my-module.db"]
    }
  }
}
```

## Tools

| tool | question it answers |
|---|---|
| `lynx_schema` | what does the graph look like? (DDL, kinds, id format, worked queries) |
| `lynx_query` | anything — read-only SELECT, row-capped, truncation-flagged |
| `lynx_contract_of` | which contract governs this file/line? (+ fills in force, bound rules) |
| `lynx_why` | why does this generated line exist? (edge path, not prose) |
| `lynx_impact_of` | what must be regenerated if this changes? |
| `lynx_lint` | which §20.8 invariants are violated right now? |
| `lynx_drift` | **where did contract and code diverge?** — unrealized signatures, undeclared methods, unexplained markers, contracts without code (+ gap ledger, declared deviations) |
| `lynx_explain_divergence` | is this specific divergence expected? — `predicted` (deviation marker) / `catalogued` (gap) / `candidate_defect` (with the contracts/rules that should have covered it) |
| `lynx_realizations_of` | which targets/methods realize this contract (and vice versa)? |
| `lynx_runs` | historical findings across instantiation runs; "which contract produced findings in ≥N runs" |
| `lynx_trace_requirement` | the audit chain: requirement → fills → instances → targets → tests → run findings |

Resource: `lynx://node/<id>` — any node with its in/out edges, by stable id
(`kind:file#name[@instance]`). Every result carries `index_generation`.

## Ten example queries

Served live by `lynx_schema`; the same list:

1. `SELECT * FROM lint_violations`
2. `SELECT id, name, line FROM nodes WHERE kind='contract' AND file='...'`
3. `SELECT e.dst FROM edges e WHERE e.kind='realized_by' AND e.src LIKE 'contract:%...%'`
4. `SELECT n.name topic, e.kind, e.src FROM nodes n JOIN edges e ON e.dst=n.id WHERE n.kind='topic'`
5. `SELECT id, blocked_reason FROM targets WHERE exists_on_disk=0`
6. `SELECT node_id FROM fts WHERE fts MATCH 'idempotent'`
7. `SELECT marker_kind, file, line, text FROM markers`
8. `SELECT t.name token, v.name value FROM nodes t JOIN edges e ON e.src=t.id AND e.kind='instantiates' JOIN nodes v ON v.id=e.dst WHERE t.kind='fill_token'`
9. `WITH RECURSIVE reach(id) AS (SELECT '<node-id>' UNION SELECT e.dst FROM edges e JOIN reach ON e.src=reach.id) SELECT id FROM reach`
10. `SELECT g.name gap, e.dst marker FROM nodes g LEFT JOIN edges e ON e.src=g.id AND e.kind='explains' WHERE g.kind='gap'`

## Org scale — the monorepo hologram (spec §6)

Phase 2 tools (same server, org-built index):

| tool | question it answers |
|---|---|
| `lynx_modules` | module inventory: layer, health counters, CODEOWNERS owners |
| `lynx_owners_of` | who owns this module / node / topic? |
| `lynx_org_impact_of` | **blast radius** — closure crossing topics (produces → topic → consumers): affected modules, targets, tests, owners |
| `lynx_hologram` | the org event mesh as json or a mermaid flowchart |
| `lynx_snapshots` | the snapshot registry: registered generations, files, which one is live — the discovery half of `lynx_diff` |
| `lynx_diff` | contract-level changelog between two snapshots: new-topic, new-consumer, enum-member-added, freeze-violated, layer-edge-introduced. Refs: generation id \| unambiguous prefix \| file path \| `live` |
| `lynx_propose_change` | **the only write path, guarded**: a cited contract/manifest edit is accepted into `.lynx-staging/` iff lint stays clean; returns diff classes + blast radius; never touches generated code (needs `--sources`) |

§6.3 views: `org_event_mesh`, `org_orphan_topics`, `org_privacy_taint`,
`org_layer_violations`, `org_frozen_surface`, `org_ownership`, `org_health`,
`org_lint_violations`. Build an org index with `buildOrgIndex({modules, codeowners}, out)`
(`@lynx/indexer/out/org`); module ids are namespaced `module/kind:...`, topic ids never are —
producers and consumers meet at one node, and the mesh emerges from declarations alone.

## Capacity

Synthetic benchmark (regex locator, single machine, Node 26; workspaces generated with
realistic stub/generated/test proportions — one messaging block, one contract, two clauses,
one covers-test per unit):

| Workspace | Files | Nodes / edges | Full build | RSS | DB size | `modules` / `lint` / `hologram` / `drift` | point tools (`query`/`why`/`impact_of`/fts) |
|---|---|---|---|---|---|---|---|
| 40 modules × 25 units | ~3k | 14k / 21k | **0.6 s** | 184 MB | 15 MB | all < 20 ms | < 10 ms |
| 200 modules × 40 units | ~25k | 113k / 169k | **3.9 s** | 422 MB | 120 MB | 60–160 ms | < 20 ms |
| 500 modules × 60 units | ~92k | 423k / 632k | **13.4 s** | ~1 GB | 450 MB | 240–600 ms | < 30 ms |

Scaling is linear in input bytes. Practical envelope: an org of **hundreds of modules /
low-hundreds-of-thousands of graph nodes** stays interactive — sub-second tools over a
sub-15-second cold build. Known bottleneck: the incremental rebuild caches *extraction*
per-module shard, but the merged **write** phase is O(org) (~70 % of a full build at org
scale), so watch-mode latency at 25k files is ~3 s, not milliseconds. Memory: the extractor
holds the whole org in memory during a build (~10 MB per 1k files).

- Phase 1 (spec §1–§5): **done** — fixture corpus exercises every reachable node/edge kind;
  five §20.8 lint invariants as SQL views; e2e verified over real stdio transport.
- Phase 2 (spec §6): **done** — five-module Acme corpus (kotlin·go·python·rust) (shared topic, CODEOWNERS, a
  `restricts` violation, three orphan topics, a pii taint, a frozen enum surface) exercises
  every §6.3 view and org tool; org build is byte-deterministic like the core; 37 tests green.
- `propose_change` (the §5 guarded write path): **done** — citation-gated, lint-gated
  (no NEW violations), staging-only; smoked over real stdio.
- Watch mode + shard caches (§4): **done** — @parcel/watcher, per-module content-hash
  shards (memory + disk), incremental rebuild byte-equals a full build; live smoke green.
- `lynxctl` (bin of @lynx/indexer): the §20.8 checklist as a CI command — one tab-separated
  violation per line with file:line, exit 0/1/2; `--no-org`, `--scope`, `--drift`; deep
  dependency-cycle detection beyond the SQL 2-cycle view.
- `lynx_runs` + `lynx_trace_requirement`: **done** — BATTLE-REPORT grammar
  (`- FINDING[id]: class=… run=… [at=…] [grouped=…] [marker=…] — text`) yields finding nodes,
  `predicts` edges, per-contract recurrence and the requirement→fills→targets→tests→findings
  audit chain. The spec §5 surface is fully implemented (18 tools).
- Method locator: web-tree-sitter WASM (kotlin+java) with regex fallback; locator identity is
  part of the generation hash. core↔LSP unified: the extension consumes `@lynx/core`.
- **Go, Python & Rust subsets** (heritage restoration + one more): `#@` (Python) and `//@` (Go/Rust) markers parse
  everywhere; language profiles live in `@lynx/core` (`languages.ts`) — adding a language is
  a registry entry + a locator entry. Locators: regex for go `func`/py `def` + tree-sitter
  WASM grammars; sanctioned markers accept both comment leaders. The hologram is polyglot
  for free: kotlin → topic → go → topic → python∥rust is one graph (fixture-proven). Rust was added as the LanguageProfiles contract promises: one registry entry + one locator entry.
- **v1.0** (2026-07-23): spec v1.0 shipped — every SPEC-FEEDBACK reading blessed or replaced.
  Content-hash ids for unnamed blocks/markers (§3.1: line-shift-immune, the one breaking
  change — re-index required); the snapshot registry (§6.4: `--snapshot`, server
  auto-register, `lynx_snapshots`, diff refs by generation/prefix/path/`live`); CODEOWNERS
  gitignore-glob matching (§6.1); 18 tools; 85 contract-tests green.
- Known simplifications and spec gaps: `../../SPEC-FEEDBACK.md`.
