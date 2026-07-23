# Lynx Graph — tech-stack research (2026-07-23)

Three parallel web-research passes (storage engines · MCP ecosystem · runtime/infra) plus local
micro-benchmarks on the dev machine, to answer one question: **does the decided stack
(better-sqlite3 + FTS5 + recursive CTEs, TS/Node, stdio MCP) hold up, or is there better?**

**Verdict: the stack holds — with named refinements.** No decision reverses; several get
sharper (pinning, determinism recipe, watcher choice, read-only enforcement, result caps).

---

## 1. Storage: better-sqlite3 confirmed

| Engine | Verdict | Why (dated evidence) |
|---|---|---|
| **better-sqlite3** | ✅ **keep** | v13 (Jul 2026) moved to N-API with prebuilds *inside* the npm package — install pain gone; fastest measured binding (1.22M point-lookups/s vs 1.07M for node:sqlite, sqg.dev 2026-01); FTS5 compiled in; bundled SQLite = pinnable for determinism. Pin **12.12.0** now (13.x is days old; 13.0.1 already fixed a 13.0.0 regression), re-evaluate 13.x after soak. |
| node:sqlite (built-in) | fallback only | Still "Release Candidate" not Stable (Node 26 docs); **official binaries ship without FTS5** (nodejs/node#56951 — disqualifying); SQLite version floats with Node ⇒ breaks byte-determinism. Keep the driver shim thin so a later switch is cheap. |
| DuckDB | ❌ | Wrong shape: ~7x slower point lookups (columnar), FTS is a rebuild-oriented sidecar, columnar file format non-deterministic. Wins only on whole-graph analytics we don't have. |
| **Kuzu** | ❌ **hard no** | Upstream archived 2025-10-10; team acqui-hired by Apple (EU DMA filing, Feb 2026). Forks (LadybugDB, Vela, bighorn) are months old. ROADMAP's "Kuzu only if traversals dominate" is now "never Kuzu; revisit forks ≥2027 if ever". |
| Turso DB / libSQL | ❌ not now | Turso (Rust rewrite) officially beta; libSQL de-prioritized and slowest measured client (49–61K ops/s). Revisit 2027. |
| PGlite | ❌ | WASM Postgres, single-connection, non-deterministic heap layout. |

**Local ground truth (this machine, Node 22.17):** better-sqlite3 installs in 7 s from
prebuilds (SQLite 3.53.3); FTS5 works; recursive-CTE transitive closure over a 100K-edge /
20K-node reach: **66 ms**. Our 2–6-hop queries are comfortably in-range; for the hot
`impact_of`/`org_impact_of` paths at depth ≥4 over hub-heavy graphs, the indexer SHOULD
precompute a bounded closure table (per edge-kind) rather than lean on raw `WITH RECURSIVE`.

**Determinism recipe (this is the load-bearing refinement).** Byte-identity is *conditional*:
- pin the SQLite build (bundled by better-sqlite3 — never the OS/Node one);
- fresh DB per shard; explicit `page_size` before first write; `journal_mode=OFF`,
  `synchronous=OFF`, `temp_store=MEMORY` (crash-safety irrelevant: rebuild on failure);
- sorted deterministic insert order, indexes created **after** inserts, one transaction;
- finalize with **`VACUUM INTO 'shard.tmp'`** (canonical page layout) → fsync file →
  `rename()` over target → fsync dir; publish read-only (`immutable=1` URI — content-hash-named
  shards never change);
- **never WAL for artifacts** (random salts in `-wal`/`-shm`, checkpoint-timing-dependent bytes);
- determinism = **rebuild-level**, not patch-level: incremental patches mutate pages
  non-canonically — re-vacuum a shard after patching before publishing its hash;
- CI test: build twice, `cmp` bytes.

Bulk-write reality check: batched single-transaction inserts through better-sqlite3 run
~50–300K rows/s — a full 10^6-edge org index rebuilds in seconds.

## 2. MCP: SDK 1.x now, spec 2025-11-25, stdio stays

- **Spec to build against: 2025-11-25** (current stable). The 2026-07-28 revision (RC,
  finalizing now) is about stateless HTTP scale-out — no substantive stdio changes; it also
  deprecates MCP `logging` (→ stderr) and adds result cache-control (`ttlMs`) worth adopting
  later. **SDK: raw `@modelcontextprotocol/sdk` 1.29.x**, no framework (FastMCP et al. add
  sessions/auth/CLI we don't need and lag the spec). SDK v2 is beta; migrate late 2026 via
  their codemod — keep tool handlers transport-agnostic and thin so that stays mechanical.
- **Read-only enforcement, layered, engine-first**: (1) open DB `readonly: true` —
  unbypassable; (2) single-statement discipline: `prepare()` rejects trailing statements,
  require `stmt.reader === true`, token deny-list for `ATTACH`/`PRAGMA` as belt-and-braces,
  statement timeout, audit-log every query to stderr; (3) when we bump to Node ≥24, add
  `setAuthorizer` (SQLITE_DENY all but SELECT/READ) via node:sqlite — better-sqlite3 lacks the
  API. Do NOT rely on `PRAGMA query_only` (the queried SQL can flip it).
- **Result policy**: Claude Code truncates tool results at ~25K tokens — design so truncation
  never happens. `query()` default cap ~50 rows / ~10 KB serialized, explicit
  `truncated: true` + `next_offset`; `limit` param capped at a few hundred. Use
  `outputSchema`/`structuredContent` for compact typed tools (`contract_of`, `why`,
  `impact_of`, `lint`) — but NOT for `query`/`hologram` (spec's mirror-to-text SHOULD doubles
  payload). Validation failures return `isError: true` with corrective hints (SEP-1303), never
  protocol errors.
- **Citations via `resource_link`** result items (`lynx://contract/<id>`) — spec-blessed,
  fetchable, and linked resources need NOT be enumerated in `resources/list` (use a
  `ResourceTemplate`; never enumerate 10^5 nodes).
- **Subscriptions reality check**: advertise `resources.subscribe`/`listChanged` (cheap), but
  Claude Code doesn't consume resource subscriptions yet (claude-code#7252) — primary freshness
  mechanism is stamping every result with `index_generation`/`indexed_at`.
- **Tool surface**: ~15 tools is at the comfort ceiling (tool metadata can eat 20–40% of
  context; GitHub's server grew toolsets because "too many tools cause tool confusion").
  Prefix everything `lynx_` (SEP-986 naming), fold variants into params, ship the 5–6
  highest-impact tools first, grow against evals.
- **Prior art validates the premise**: Codebase-Memory (arXiv:2603.27277, Feb 2026) — code
  knowledge graph over MCP hits **83% answer quality at 10× fewer tokens / 2.1× fewer tool
  calls** vs file exploration (92%). Its gap (graph-only loses ~9 quality points) is exactly
  why our escape hatches exist: arbitrary `query()` + stable ids pointing back to source.
  CodeGraph (commercial) ships our precise architecture (local + SQLite + tree-sitter + MCP)
  for generic ASTs — our differentiation is contract semantics, not parsing.
- **Testing**: MCP Inspector for dev loop; CI e2e via the SDK's `InMemoryTransport`
  client↔server pair (no subprocess) + MCPJam for conformance/evals.

## 3. Runtime & infra

| Concern | Decision | Evidence |
|---|---|---|
| Runtime | **Node 22 now, CI on Node 24 LTS** (permission model stable, node:sqlite RC). Bun: keep *compatible* (driver shim, WASM-only deps), never *target* — 2026 leak reports in long-running processes (Trigger.dev, The Register 2026-04), bun:sqlite "3–6x" claim debunked (oven-sh/bun#4776); better-sqlite3 hits ABI mismatches under Bun anyway. |
| Watcher | **`@parcel/watcher` 2.6.x**, not chokidar. Native per-platform backends, directory-granular inotify, proven at VSCode/Nx/Tailwind scale; chokidar is pure-JS and FD-hungry at 10^5 files. Document `fs.inotify.max_user_watches=524288`; keep rescan+hash-diff fallback for missed events/ENOSPC. Exclude build dirs at watcher level. |
| Hashing | **xxhash-wasm** (xxh64; xxh128 for global keys) — ~3.5–9 GB/s, zero native deps, identical on Node/Bun. 10^5 files ≈ <1 s cold; disk dominates, not hash. |
| Worker pool | **Piscina 5.x** (alive: v5.3.0 Jul 2026). Workers receive *paths* (not contents), batch ~100 files/task, pool ≈ physical cores. Parse is CPU-bound; SQLite write is single-writer anyway. |
| Method locator | **web-tree-sitter (WASM)** + official `tree-sitter-java` + `fwcd/tree-sitter-kotlin`. WASM is ~2–3x slower than native but ~1–3 ms per generated file — far under budget — and dodges node-tree-sitter's Node-24 ABI/prebuild churn (#238, #268). ctags fallback rejected (Kotlin PEG parser has pathological-slowdown reports). ⚠ Validate tree-sitter-kotlin on OUR generated corpus first: 61.2% PSI structural fidelity overall, but declaration-level extraction (all we need) is its solid zone. |

## 4. Actions taken / to take

- [x] Verified locally: better-sqlite3 prebuild install, FTS5, 66 ms closure benchmark.
- [x] CLAUDE.md architecture amended: pinned versions, @parcel/watcher, determinism recipe,
      read-only layering, result caps, `lynx_` prefix (this doc is the rationale).
- [x] Spec §4 wording: watcher made implementation-neutral.
- [ ] Build-phase: closure-table precompute for hot deep traversals (indexer concern, §2/§4).
- [ ] Determinism CI check (build twice, byte-compare) — add to acceptance.
- [ ] Re-evaluate better-sqlite3 13.x after soak; node:sqlite when Stable + FTS5; SDK v2 when
      2026-07-28 spec lands in clients.

*Full agent reports (with ~60 dated source links) available in the research session; this doc
is the curated synthesis.*
