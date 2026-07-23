# Roadmap

## 1. `lynxctl` — the lint checklist as a runnable tool — SHIPPED: bin of `@lynx/indexer` (see `tools/graph/README.md`)

Spec §20.8 defines ten mechanical invariants (inventory bijection, token closure, anchor
resolution, count consistency, realization completeness, output-comment lint, single-source rule,
output-target completion, test-case completion, cross-stub consistency). Today they are enforced
by agent waves — expensive and non-deterministic. `lynxctl` makes them a command:

- reuse the LSP server's parser (`tools/vscode/server`) extracted into a shared core package;
- each invariant = a query over the parsed model; exit non-zero on violation;
- CI-friendly output (one finding per line, file:line, invariant id).

## 2. Contract↔code graph index, served over MCP — SHIPPED v1.0: `spec/lynx-graph-mcp-spec-v1.0.md`, implementation `tools/graph/` (the design below is historical)

The mapping between contracts and generated code is *declared* (TARGET paths, realizes maps,
fills, anchors, markers) — it only needs materializing into a queryable graph so that agents see
the coupling instead of grepping text.

**Stack (decided):**
- **Parser**: the shared TS core from item 1 — one parser, three consumers (LSP, lynxctl, index).
- **Store**: SQLite + FTS5 (`better-sqlite3`). Edges as a plain `edges(src, dst, kind)` table;
  recursive CTEs cover path queries. SQL is the query language every agent already speaks —
  a graph DB (Kuzu) only if deep traversals ever dominate.
- **Server**: `@modelcontextprotocol/sdk`, stdio transport, native FS watch for a live index (see research/tech-stack-research-2026-07.md).

**Tool surface:**
- `schema()` — self-describing tables, so any agent bootstraps;
- `query(sql)` — read-only arbitrary SQL: the features we didn't predict;
- `why(file, line)` — provenance chain: rule → etalon citation → requirement;
- `impact_of(fill | contract)` — the regeneration set (enables incremental regeneration);
- `contract_of` / `realizations_of`, `gaps_in`, `deviations_in`;
- lint invariants as SQL views (`SELECT * FROM lint_violations` — lynxctl and the index converge);
- diff-explainer: classify a divergence via the graph (predicted / catalogued / candidate defect);
- run-history nodes: findings of past instantiation runs, queryable across runs;
- requirements tracing: questionnaire answer → fills → files → tests → evidence (the audit view);
- guarded write path: `propose_change` runs the lint invariants before accepting a contract edit.

**UI**: a graph webview panel inside the VS Code extension (same index), plus exportable
snapshots.

## 3. Spec v1.4 candidates

- Fold the §18 example profile out of the main spec file into `profiles/`;
- dedup strategy for facts stated in multiple places (single-source rule tooling support);
- errata process formalized (v1.3 already received one in-place example fix: §18.5 vs §13.3).
