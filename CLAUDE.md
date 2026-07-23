# Mission: build Lynx Graph (the contract↔code MCP)

Build **Lynx Graph** — the contract↔code index served over MCP — in this repository, implementing
`spec/lynx-graph-mcp-spec-v0.2.md`. Read that spec fully first; it is the contract for what you
are building. Also read `README.md`, `skills/README.md`, and skim
`spec/lynxcontract-spec-kotlin-java-v1.3.md` §7 and §20 (the grammar you'll be parsing and the
lint invariants you'll be materializing).

## Environment

- Node.js v26 is on PATH.
- Git identity is configured repo-locally. Commit in meaningful increments.

## Method — this repo eats its own dog food

- Follow `skills/contract-first/SKILL.md`: write LynxContract `//@` contracts for your own
  modules BEFORE implementing them (see `tools/vscode/contracts/` for how the LSP did it —
  contracts in a `contracts/` dir, one stub per future source file, contract-derived tests).
- Phase 0 for this project = the two specs above are your pinned upstream; reconcile against
  them, and record any spec insufficiency you hit in `SPEC-FEEDBACK.md` (file + section + what
  was underspecified + the reading you took). Do NOT silently edit the spec; v0.1 → v1.0 happens
  together with your implementation feedback, deliberately.

## Architecture (decided — do not relitigate)

TypeScript. Three packages under `tools/graph/`:

1. `core/` — the LynxContract parser EXTRACTED from `tools/vscode/server/src` into a shared
   package (the LSP becomes its consumer later; copy-then-extract is fine for now — note the
   unification step in SPEC-FEEDBACK.md; do not break the extension).
2. `indexer/` — parse template tree + instantiation manifest(s) + generated tree(s) + optional
   run reports → SQLite per spec §2–§4. `better-sqlite3` (pin 13.0.1 — N-API prebuilds work
   across Node versions; 12.x lacks Node-26 prebuilds), FTS5,
   `nodes`/`edges` tables, stable ids `kind:file#name[@instance]`, deterministic output —
   follow the determinism recipe in `research/tech-stack-research-2026-07.md` §1
   (journal_mode=OFF build, sorted inserts, indexes last, `VACUUM INTO` → atomic rename;
   CI builds twice and byte-compares). Watch mode via `@parcel/watcher` (NOT chokidar);
   hashing via `xxhash-wasm`; parallel parse via Piscina (paths not contents, ~100 files/task);
   method locator via web-tree-sitter WASM (tree-sitter-java + fwcd/tree-sitter-kotlin —
   validate the Kotlin grammar on the fixture corpus first).
3. `mcp-server/` — raw `@modelcontextprotocol/sdk` 1.29.x (no framework; v2 migration when the
   2026-07-28 spec lands in clients), stdio transport, spec revision 2025-11-25, the §5 tool
   surface with a `lynx_` name prefix. Priority order: `schema()` → `query(sql)` → `contract_of`
   → `why` → `impact_of` → `lint` (the §20.8 invariants as SQL views) → the rest.
   `propose_change` LAST and only if time allows — it is the only write path and must re-run
   lint before accepting. Read-only enforcement is layered and engine-first: DB opened
   `readonly: true`; single prepared statement with `stmt.reader === true`; ATTACH/PRAGMA token
   deny-list; audit-log every query to stderr. Results: `query()` caps at 50 rows/~10 KB with
   `truncated`+`next_offset`; typed tools use `outputSchema`; citations are `resource_link`
   items (`lynx://…` via ResourceTemplate); every result stamps `index_generation`; validation
   failures are `isError: true` with corrective hints. Rationale + sources:
   `research/tech-stack-research-2026-07.md`.

Phasing: single-workspace core (spec §1–§5) FIRST, to acceptance. The org layer — spec §6, the
monorepo hologram (module shards, topic dedup, `modules`/`owners_of`/`org_impact_of`/`hologram`/
`diff`, org lint views) — is phase 2 on top of a green core; its shard model must not leak into
core tables beyond the namespaced-id scheme (spec §3).

## Test data

- In-repo fixtures MUST be fictional (Acme/CoreLab flavored — see the spec's §18 example
  profile and `tools/vscode/examples/`). Author a small fixture corpus: ~6 stubs incl. one
  MULTIPLIER, a mini manifest with fills, a mini generated tree with `// TEMPLATE-GAP:` and
  `# etalon deviation:` markers, so every node/edge kind in spec §2 has at least one instance.
- For phase 2 (org layer) the corpus needs a SECOND fictional module sharing one topic with the
  first (producer in one, consumer in the other), a CODEOWNERS file, one `restricts` violation
  and one orphan topic — so every §6.3 hologram view and org lint has a fixture instance.
- De-productization gate: everything committed here is fictional; a pre-commit grep for
  non-fictional product names must stay at zero — this repository knows only Acme.

## Acceptance

- `schema()`, `query()`, `contract_of()`, `why()`, `impact_of()`, `lint()` return correct,
  node-id-cited results against the fixture corpus (contract-derived tests prove it).
- `tools/graph/README.md`: build, run, MCP client config snippet, 10 example queries.
- Determinism proof: the test suite builds the fixture index twice and byte-compares the files.
- Phase 2 (only after the above is green): `modules()`, `org_impact_of()`, `hologram()`,
  `diff()` and the §6.3 org views return correct, cited results against the two-module corpus.
- The house honesty rule applies to you: when the spec or grammar is insufficient, STOP on that
  item, record it in SPEC-FEEDBACK.md, take the conservative reading — never silently guess.
