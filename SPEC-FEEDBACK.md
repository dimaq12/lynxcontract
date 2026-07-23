# SPEC-FEEDBACK — implementation feedback toward Lynx Graph v1.0 / LynxContract v1.4

House rule: when the spec or grammar was insufficient, the item stopped, got recorded here with
the conservative reading taken, and the spec was NOT silently edited. First filled during the
Lynx Graph phase-1 build (2026-07-23).

> **v1.0 resolution (2026-07-23):** `spec/lynx-graph-mcp-spec-v1.0.md` shipped. Every graph-spec
> item below is now resolved there: readings **blessed as normative** — items 1 (RULE grammar),
> 2 (marker `cites` its file), 3 (`//@covers:`), 4 (manifest grammar), 7 (unregistered-fill
> pseudo-path), 8 (`impact_of` edge alphabet), 9 (FINDING grammar), 11 (`member_of` scoped to
> stub/contract/target), 13 (deep cycles are `lynxctl`'s), 16 (drift folds gaps_in/
> deviations_in), 17 (drift named as lint's sibling surface, §5.1); readings **replaced** —
> items 5/14 (unnamed-block/marker ids are now content-hash names, spec §3.1 — the one breaking
> change, full re-index required) and 15 (CODEOWNERS is now gitignore-glob against module root
> paths, §6.1). §6.4 gained the snapshot registry (`.lynx-snapshots/`, `--snapshot`,
> server auto-register, `lynx_snapshots`, diff refs by generation/prefix/path/`live`) — closing
> the gap that the time axis existed in code but had no operational workflow. Items 10 and
> 19–21 remain open toward LynxContract core v1.4 (they are core-grammar concerns).

## lynx-graph-mcp-spec-v0.2.md

1. **§2 `rule` nodes — no anchor syntax defined.** "One oracle bullet / stub rule with a stable
   anchor" says what a rule is, not how it is written. Reading taken: markdown bullet grammar
   `- RULE[<kebab-id>]: <text> [-> binds <contract-ref>]`; the optional `binds` tail creates the
   §2 `binds` edge. Candidate for v1.0: bless a rule syntax (or an `//@rule:` block in the core
   grammar).
2. **§2 marker→code association — edge kind unspecified.** The edge table defines `predicts`
   (deviation→finding) and `explains` (gap→marker) but nothing linking a marker to the file it
   sits in. Reading taken: `marker --cites--> target|stub`. v1.0 should name this edge.
3. **§2 `covers` (test_case→clause) — no declaration syntax.** How does a test case declare
   which clause it covers? Reading taken: a `//@covers: [<clause-ref>]` comment line immediately
   above the test method. Candidate for the core grammar (§4 key or §13 addition).
4. **§20.6 manifest — content defined, syntax not.** Reading taken: markdown with a fills table
   (`| {{Token}} | value | status |`) plus bullet grammar `- INSTANCE[{{Token}}]: A, B, C`,
   `- BLOCKED[<target-path>]: <reason>`, `- SCOPE-REDUCED[<clause-ref>]: <reason>`
   (the §20.8-8/9 escape hatches need a *declared* home; this is it).
5. **§3 stable ids vs unnamed blocks.** `kind:file#name` is only stable when blocks are named;
   unnamed blocks get `<kind>@<line>` names, which shift with edits. Conservative reading:
   ids survive *re-indexing* (spec's literal claim), not arbitrary edits. v1.0 should require
   names on indexable blocks or define a content-hash fallback.
6. **CLOSED:** §2 method granularity — web-tree-sitter WASM locator implemented (kotlin via
   @tree-sitter-grammars/tree-sitter-kotlin 1.1, java via tree-sitter-java 0.23; regex stays
   the zero-dep default). Locator id feeds the generation hash so indexes built with
   different locators never claim byte-equality. Note: the kotlin grammar package peer-
   depends on native tree-sitter we don't use — workspace .npmrc sets legacy-peer-deps.
7. **Unregistered fill tokens — id home unspecified.** A used-but-unregistered `{{Token}}` has
   no registry file to anchor its id. Reading taken: pseudo-path `fill_token:unregistered#<T>`.
8. **§5 `impact_of` traversal — edge-kind set unspecified.** "Via multiplier ranges and
   `depends`" leaves the closure alphabet open. Reading taken: forward over
   `instantiates|generates|declares|realized_by|cites`, reverse over `cites|realizes`.
9. **CLOSED:** `finding` nodes needed a report format — declared it (recorded in the Tools
   contract): `- FINDING[<id>]: class=<c> run=<r> [at=<file>[:<line>]] [grouped=<id>]
   [marker=<file>:<line>] — <text>`; `marker=` resolving to a deviation marker emits the §2
   `predicts` edge. v1.0 should bless this grammar (or replace it deliberately).

## Phase 2 (org layer, spec §6) readings — 2026-07-23

10. **§19.1 `enum X:` spelling is not YAML-ish-parseable.** The core grammar's worked example
    (`enum FeedStatus:`) has a space inside the key, which the KEY_LINE grammar cannot carry.
    Reading taken: an entry whose CHILDREN declare `frozen:`/`closed:` is an enum surface,
    keyed by a plain identifier (`CaptureStatus:`). v1.4 of the core spec should either bless
    the ident-key form or extend the key grammar.
11. **§2 `member_of` ("any node → module")** — emitting it for every marker/clause/fill would
    double the edge table for no query the views need. Conservative subset emitted:
    stub/contract/target; all other nodes carry `attrs.module`. v1.0 should scope the edge.
12. **§4 shard caches — implemented** (initially deferred, closed same day): per-module
    extraction JSON cached in memory + on disk keyed `<module>-<generation>.json`, stale
    entries pruned; watch mode rebuilds O(changed modules). Contract-tested: incremental
    output byte-equals a from-scratch build.
13. **§6.3 layer-violation view covers `restricts` hits and direct 2-cycles only**; deep cycle
    detection (§17) needs a recursive check outside a plain view — deferred to `lynxctl`.
14. **§6.4 diff of unnamed-block contracts is noisy by construction** — `kind:file#kind@line`
    ids shift when lines move (see item 5); diff classes stay correct but produce
    added+removed pairs for renamed lines. Same fix as item 5 (require names / hash ids).
15. **CODEOWNERS pattern matching is name-based**, not full gitignore-glob semantics —
    patterns are matched against module names (prefix/containment). Full glob matching is a
    v1.0 nicety.
16. **§5 `gaps_in`/`deviations_in` folded into `lynx_drift`** (tool-count guidance: fold
    variants into parameters; both listings ride the drift report with the same scope
    filter). v1.0 should bless the folded shape or insist on separate tools.
17. **Drift is a separate surface from lint** — `contract_drift` views (signature-unrealized,
    undeclared-method, unexplained-marker, contract-without-code) are deliberately NOT in
    `lint_violations`: lint = §20.8 presence/count/cross-reference invariants, drift =
    contract↔code fidelity signals. The spec's scope note (§20.8) implies but never names
    this surface; v1.0 should.
18. **CLOSED:** `trace_requirement` and `runs` implemented on top of the item-9 grammar —
    the §5 tool surface is now fully implemented (17 tools incl. drift/explain_divergence).

## Corrections to research/tech-stack-research-2026-07.md

- better-sqlite3 **12.12.0 does not exist** (latest 12.x is 12.11.1); pinned **13.0.1** instead —
  N-API prebuilds install cleanly on Node 26 (verified), FTS5 present, SQLite 3.53.3.
- `localeCompare` is a determinism hazard the recipe missed: sort order depends on ICU locale,
  breaking cross-machine byte-identity. All indexer sorts use a plain `<`/`>` comparator
  (`cmpStr`); caught by the build-twice byte-compare contract-test.

## Unification debt (mission §architecture)

- **CLOSED (same day):** `tools/graph/core` extraction is unified — the LSP now consumes
  `@lynx/core` (file: dependency + project reference; private copies deleted after a
  byte-diff proved zero drift). Both suites green: 46 extension + 64 graph tests. vsce
  cannot pack symlinked deps — `tools/vscode/scripts/vsce-pack.js` dereferences for
  packaging and restores the symlink.

## Go/Python subsets (2026-07-23, heritage restoration)

19. **`#@` marker restored** (heritage v0.2: `#@` Python / `//@` Go, "tools accept both").
    Implemented as LanguageProfiles in @lynx/core: the parser accepts BOTH markers
    everywhere; a profile only decides what tooling emits. v1.4 of the JVM spec should
    re-absorb the heritage marker rule into §2 (it was dropped in the port).
20. **§11 concurrency keys stay one superset** for the subsets (spawns/sends_to/... are
    already generic; suspends/dispatcher are JVM-flavored, asyncio/goroutine profiles would
    lint key applicability per language). Per-language key linting is a v1.4 profile concern.
21. **Python docstring tag form not implemented** (the JVM KDoc form's §2.2 sibling would be
    reST/Google-style docstring tags) — #@ line form only. v1.4 candidate.

## De-productization errata (2026-07-23)

22. The template-insufficiency marker is now **`TEMPLATE-GAP`** across the spec family,
    parser, views and fixtures; the previous spelling is retired with no legacy alias. Graph
    schema stamped 1.0.1 (the marker-kind literal appears in the drift views; shard caches
    invalidate via the generation hash).
23. Doc-id-shaped example citations, an internal-looking resolver-class name, and run-metric
    literals in §18/§20 prose were generalized — examples stay pedagogical, numbers stay
    approximate, nothing quotes a real artifact.
