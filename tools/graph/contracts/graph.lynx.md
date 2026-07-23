# Lynx Graph — contract tree (contract-first, spec §8 + §12.1)

Realization language: TypeScript (declared extension of the §8 profile, as in
`tools/vscode/contracts/`). Three packages per the mission architecture.

```
//@graph: lynx-graph
//@  version: "1.3-jvm"
//@  files:
//@    - core/src/spec.ts                 realizes: [contracts/graph#CoreSpecModel]
//@    - core/src/parser.ts               realizes: [contracts/graph#CoreParser]
//@    - core/src/stubs.ts                realizes: [contracts/graph#StubModel]
//@    - core/src/index.ts               # re-exports only
//@    - indexer/src/ids.ts               realizes: [contracts/graph#StableIds]
//@    - indexer/src/schema.ts            realizes: [contracts/graph#GraphSchema]
//@    - indexer/src/extract.ts           realizes: [contracts/graph#Extractor]
//@    - indexer/src/build.ts             realizes: [contracts/graph#DeterministicBuild]
//@    - indexer/src/test/build.test.ts   realizes: [contracts/graph#DeterministicBuild] # contract-test
//@    - indexer/src/test/extract.test.ts realizes: [contracts/graph#Extractor] # contract-test
//@    - indexer/src/org.ts               realizes: [contracts/graph#OrgExtractor]
//@    - indexer/src/test/org.test.ts     realizes: [contracts/graph#OrgExtractor] # contract-test
//@    - indexer/src/config.ts            realizes: [contracts/graph#OrgConfig]
//@    - indexer/src/incremental.ts       realizes: [contracts/graph#IncrementalBuild]
//@    - indexer/src/watch.ts             realizes: [contracts/graph#WatchMode]
//@    - indexer/src/locator.ts           realizes: [contracts/graph#MethodLocator]
//@    - indexer/src/test/locator.test.ts realizes: [contracts/graph#MethodLocator] # contract-test
//@    - indexer/src/lynxctl.ts           realizes: [contracts/graph#Lynxctl]
//@    - indexer/src/test/lynxctl.test.ts realizes: [contracts/graph#Lynxctl] # contract-test
//@    - indexer/src/snapshots.ts         realizes: [contracts/graph#SnapshotRegistry]
//@    - indexer/src/test/snapshots.test.ts realizes: [contracts/graph#SnapshotRegistry] # contract-test
//@    - indexer/src/test/incremental.test.ts realizes: [contracts/graph#IncrementalBuild] # contract-test
//@    - mcp-server/src/propose.ts        realizes: [contracts/graph#Propose]
//@    - mcp-server/src/test/propose.test.ts realizes: [contracts/graph#Propose] # contract-test
//@    - mcp-server/src/server.ts         realizes: [contracts/graph#McpSurface]
//@    - mcp-server/src/tools.ts          realizes: [contracts/graph#Tools]
//@    - mcp-server/src/orgTools.ts       realizes: [contracts/graph#OrgTools]
//@    - mcp-server/src/test/mcp.test.ts  realizes: [contracts/graph#Tools] # contract-test
//@    - mcp-server/src/test/drift.test.ts realizes: [contracts/graph#Tools] # contract-test
//@    - mcp-server/src/test/trace.test.ts realizes: [contracts/graph#Tools] # contract-test
//@    - mcp-server/src/test/org.test.ts  realizes: [contracts/graph#OrgTools] # contract-test
//@  depends:
//@    core/src/parser.ts: [core/src/spec.ts]
//@    core/src/stubs.ts: []
//@    indexer/src/extract.ts: [core/src/parser.ts, core/src/stubs.ts, indexer/src/ids.ts]
//@    indexer/src/build.ts: [indexer/src/extract.ts, indexer/src/schema.ts, better-sqlite3]
//@    mcp-server/src/tools.ts: [indexer/src/schema.ts, better-sqlite3]
//@    mcp-server/src/server.ts: [mcp-server/src/tools.ts, @modelcontextprotocol/sdk]
//@  vanilla: "Remove contracts/ and this is a normal npm-workspaces TS monorepo: parser lib + CLI indexer + MCP server."
```

```
//@contract: CoreSpecModel
//@  lang: typescript
//@  realizedBy: [core/src/spec.ts]
//@  intent: Copy of the LSP grammar model (tools/vscode/server/src/spec.ts), extraction step 1 (copy-then-extract per mission; unification noted in SPEC-FEEDBACK.md).
//@  rules:
//@    - MUST stay byte-close to the vscode copy; divergence is a future unification hazard.
//@  assigns: []
//@
//@contract: CoreParser
//@  lang: typescript
//@  realizedBy: [core/src/parser.ts]
//@  intent: Copy of the LSP //@-block parser (parseDocument), same guarantees as the LSP Parser contract (blocks/entries/ranges/fills, never throws).
//@  assigns: []
//@
//@contract: StubModel
//@  lang: typescript
//@  realizedBy: [core/src/stubs.ts]
//@  signature: parseStubHeader(text): StubHeader; scanMarkers(text): Marker[]
//@  intent: >
//@    The §20 archetype surface the LSP never needed: TARGET/REALIZATION/MULTIPLIER
//@    stub headers (§20.1) and sanctioned generation-time markers (§20.7) —
//@    "// TEMPLATE-GAP:", "# etalon deviation:", RECONSTRUCTED fixture marker, waivers.
//@  post:
//@    - header fields carry line numbers; realization mode in {generate, copy-verbatim, n/a}
//@    - markers carry kind in {template-gap, deviation, reconstructed, waiver}, line, text
//@  raises: {}                     # tolerant like the parser; absent header -> empty fields
//@  assigns: []
//@
//@contract: StableIds
//@  lang: typescript
//@  realizedBy: [indexer/src/ids.ts]
//@  signature: nodeId(kind, file, name?, instance?): string; hashName(kind, text, taken): string
//@  intent: Stable ids per spec §3/§3.1 — `kind:file#name[@instance]`, survive re-indexing, citable.
//@  rules:
//@    - Unnamed blocks and markers get content-hash names (spec §3.1): `<kind>@h<sha256-hex-8>`
//@      over the block/marker text; same-file collisions disambiguate `-2`, `-3`, … by order
//@      of appearance. Ids survive line-shifts; an edit to the block itself changes the id.
//@  post: pure function; same inputs => same id; no timestamps, no randomness
//@  assigns: []
//@
//@contract: GraphSchema
//@  lang: typescript
//@  realizedBy: [indexer/src/schema.ts]
//@  intent: >
//@    DDL per spec §3: nodes(id,kind,name,file,line,attrs), edges(src,dst,kind,attrs),
//@    FTS5 over contract/rule/gap text, meta(graph_schema_version,
//@    lynxcontract_spec_version, index_generation), convenience views (targets, clauses,
//@    markers) and lint views culminating in lint_violations(invariant, node_id, message).
//@  rules:
//@    - Lint views cover spec-§20.8 invariants implementable from the graph alone:
//@      realization completeness (5), token closure (2), anchor resolution (3),
//@      output-target completion (8), test-case completion (9).
//@    - index_generation is the content hash of inputs — NEVER a timestamp (determinism).
//@  assigns: []
//@
//@contract: Extractor
//@  lang: typescript
//@  realizedBy: [indexer/src/extract.ts]
//@  signature: extract(inputs: IndexInputs): {nodes: Node[], edges: Edge[], fts: FtsRow[]}
//@  intent: >
//@    Pure extraction: template tree + fill registry + manifest(s) + generated tree(s) +
//@    run reports -> node/edge lists per spec §2. No I/O beyond reading the given files;
//@    no SQLite; fully unit-testable.
//@  rules:
//@    - Every spec-§2 node kind reachable from fixtures gets emitted: stub, contract,
//@      rule, fill_token, fill_value, instance, target, method, marker, gap, clause,
//@      test_case, topic, pin, quirk (finding: only from run reports when present).
//@    - Unnamed blocks and markers are named per spec §3.1 via StableIds.hashName —
//@      content-hash, never line numbers (line-shift immunity is the contract).
//@    - Anchors resolve suffix-wise like the LSP; unresolved edges keep attrs.resolved=0
//@      (they feed lint, they are never dropped).
//@    - Multiplier stubs emit one target per declared manifest instance via TARGET fill
//@      substitution; a missing on-disk target keeps exists=0 (feeds invariant 8).
//@    - Output order is deterministic: nodes sorted by id, edges by (src,dst,kind).
//@  post: pure function of inputs; emits every list sorted
//@  raises: {}
//@  assigns: []
//@
//@contract: DeterministicBuild
//@  lang: typescript
//@  realizedBy: [indexer/src/build.ts]
//@  signature: buildIndex(opts: BuildOptions): {outFile, generation, counts}
//@  intent: Write the extracted graph to a single SQLite file, byte-identically reproducible.
//@  rules:                                # the research-doc determinism recipe, verbatim
//@    - fresh DB per build; journal_mode=OFF, synchronous=OFF, temp_store=MEMORY
//@    - explicit page_size before first write; sorted inserts; indexes AFTER inserts
//@    - finalize VACUUM INTO tmp -> atomic rename over outFile
//@    - no wall-clock anywhere in the file; generation = xxhash-class content hash of inputs
//@      + locator id + graph schema version (an indexer upgrade must invalidate shard caches:
//@      the cache is keyed by generation and is never allowed to outlive the extractor)
//@  post: building twice from identical inputs yields byte-identical files   # CI-checked
//@  raises:
//@    Error: outFile directory does not exist
//@  assigns: [outFile]
//@
//@contract: Tools
//@  lang: typescript
//@  realizedBy: [mcp-server/src/tools.ts]
//@  intent: >
//@    The §5 tool implementations against a read-only DB handle, SDK-agnostic
//@    (plain functions returning JSON-able results) so tests need no transport.
//@  rules:
//@    - lynx_query: engine-first read-only — DB opened readonly; exactly one prepared
//@      statement; stmt.reader must be true; ATTACH/PRAGMA token deny-list; row cap
//@      default 50, hard cap 500; truncation flagged {truncated, next_offset}.
//@    - every result carries index_generation; citations are node ids.
//@    - lynx_schema returns DDL + kind tables + >=10 worked example queries.
//@    - lynx_contract_of(file, line?): governing contract/messaging/flow block for a
//@      location (innermost block containing line; file-level otherwise).
//@    - lynx_why(file, line): edge path method -> contract -> rule/cites, as id list —
//@      the path, not prose (spec §5).
//@    - lynx_impact_of(ref): recursive closure over generates/instantiates/realizes/
//@      depends/anchors edges from the ref node; returns targets + test_cases.
//@    - lynx_lint(scope?): SELECT from lint_violations (+ optional file-prefix scope).
//@    - lynx_drift(scope?): the contract↔code divergence surface (contract_drift views):
//@      signature-unrealized (declared signature, realized file exists, method absent),
//@      undeclared-method (code no contract knows), unexplained-marker (template-gap/
//@      reconstructed/waiver with no gap-ledger explains edge; deviations excluded — they
//@      are declared divergence §20.4), contract-without-code (realizedBy target absent);
//@      plus gaps/deviations listings (folds spec §5 gaps_in/deviations_in — SPEC-FEEDBACK).
//@      Drift is NOT part of lint_violations: lint = §20.8 invariants, drift = fidelity surface.
//@    - lynx_runs(run?, class?, min_runs?): BATTLE-REPORT findings across runs;
//@      contracts_by_recurrence joins finding→cites→target→realized_by→contract and counts
//@      DISTINCT runs — "which contract produced findings in >=N runs" (spec §5).
//@      Report grammar (declared here until spec v1.0 blesses it):
//@      `- FINDING[<id>]: class=<c> run=<r> [at=<file>[:<line>]] [grouped=<id>] [marker=<file>:<line>] — <text>`;
//@      `marker=` resolving to a deviation marker emits the §2 predicts edge.
//@    - lynx_trace_requirement(ref): fill token or value → the audit chain
//@      requirement/fills/instances/targets/tests/findings (spec §5); unresolvable ref is an
//@      honest error naming where a trace can start.
//@    - lynx_explain_divergence(file, line, observed): classify per spec §5 —
//@      predicted (cites the deviation marker, incl. markers on the stub that generates the
//@      file) | catalogued (cites the gap) | candidate_defect (cites the governing contracts
//@      and bound rules that SHOULD have covered it). Order of precedence exactly that.
//@  post: all functions pure over the DB snapshot; validation failures return {isError:true, message} — never throw
//@  assigns: []
//@
//@contract: OrgExtractor
//@  lang: typescript
//@  realizedBy: [indexer/src/org.ts]
//@  signature: extractOrg(org: OrgInputs): Extraction; buildOrgIndex(opts): BuildResult
//@  intent: >
//@    Spec §6: merge per-module extractions into one org graph with zero inference.
//@    Modules are the shards; the merge is deterministic; the connective tissue is
//@    exactly the declared one (§6.1).
//@  rules:
//@    - Module-local ids gain the `module/` prefix; `topic:` ids are NEVER namespaced —
//@      producers and consumers of one name meet at one node (§6.1, §6.2).
//@    - module nodes carry layer/package (fill-substituted); //@module depends/restrictions
//@      package globs resolve to module→module `depends`/`restricts` edges by package prefix.
//@    - CODEOWNERS -> owner nodes + `owns` edges; patterns match gitignore-glob style against
//@      the module's workspace-relative root path (`*`/`**`/`?`, leading-/ anchor, trailing-/
//@      directory), with plain module-name equality kept as a convenience (spec §6.1 v1.0).
//@    - An entry whose children declare `frozen:`/`closed:` becomes an `enum_surface` node
//@      + `freezes` edge from its contract (§19.1; the literal `enum X:` spelling is not
//@      YAML-ish-parseable — recorded in SPEC-FEEDBACK).
//@    - member_of edges emitted for stub/contract/target nodes (conservative subset of "any").
//@    - org generation = hash over per-module generations + CODEOWNERS (shard-hash merge, §4);
//@      physical shard cache files are deferred (SPEC-FEEDBACK).
//@  post: same determinism guarantees as Extractor/DeterministicBuild — sorted output, build-twice byte-identity
//@  assigns: []
//@
//@contract: OrgTools
//@  lang: typescript
//@  realizedBy: [mcp-server/src/orgTools.ts]
//@  intent: The §6.3/§6.4 surface — hologram views + org tools, SDK-agnostic like Tools.
//@  rules:
//@    - Views (schema.ts): org_event_mesh, org_orphan_topics, org_privacy_taint,
//@      org_layer_violations (restricts hits + direct 2-cycles; deep cycles deferred),
//@      org_frozen_surface, org_ownership, org_health; org_lint_violations = their union
//@      where a row is a violation.
//@    - lynx_modules: module inventory with layer, package, owner, health counters.
//@    - lynx_owners_of: CODEOWNERS principals behind any node id / module / topic.
//@    - lynx_org_impact_of: blast radius — closure that ALSO crosses topics
//@      (forward produces, reverse consumes); returns affected modules, targets, owners.
//@    - lynx_hologram(scope?, format json|mermaid): event mesh as data or a mermaid
//@      flowchart (modules as nodes, topics as queue nodes).
//@    - lynx_diff(snapshot_a, snapshot_b): classified deltas: node/edge added/removed by kind,
//@      enum-member-added, freeze-violated (member removed), new-consumer, new-topic,
//@      layer-edge-introduced. A snapshot ref resolves as generation id | unambiguous prefix |
//@      file path | the literal `live` (spec §6.4); an unresolvable ref is an isError naming
//@      the accepted forms AND the registered generations (corrective hint, never a raw
//@      engine error).
//@    - lynx_snapshots: list the registry — {generation, path, bytes, live} rows sorted by
//@      generation; honest empty list + hint when no registry dir exists.
//@  post: every result stamps index_generation; unmapped stays unmapped (§6.5)
//@  assigns: []
//@
//@contract: SnapshotRegistry
//@  lang: typescript
//@  realizedBy: [indexer/src/snapshots.ts]
//@  signature: snapshotDirFor(configPath): string; writeSnapshot(dbFile, generation, dir): {path, written}; listSnapshots(dir, liveGeneration?): SnapshotRow[]
//@  intent: >
//@    Spec §6.4 — the time axis operationalized: a content-addressed directory of index
//@    snapshots (.lynx-snapshots/<generation>.db beside the sources config) shared by the
//@    CLI (--snapshot), watch mode and the MCP server (auto-register at startup).
//@  rules:
//@    - Registration is idempotent: an existing <generation>.db is NEVER rewritten (content-
//@      addressed by the build's input hash; rewriting could only corrupt).
//@    - listSnapshots tolerates a missing dir (empty list) and ignores non-`<hex>.db` files.
//@    - resolveSnapshotRef(ref, dir, livePath): generation | unambiguous prefix | existing
//@      file path | 'live'; ambiguous prefix and unknown ref return {error} with the
//@      registered generations — the caller turns it into the corrective hint.
//@  post: pure over the filesystem arguments; no wall-clock in any persisted content
//@  assigns: [.lynx-snapshots]
//@
//@contract: OrgConfig
//@  lang: typescript
//@  realizedBy: [indexer/src/config.ts]
//@  signature: loadOrgConfig(configPath): OrgInputs
//@  intent: >
//@    One declared home for "what makes up this workspace": lynx-sources.json listing
//@    modules (template/manifests/generated/reports dirs) + codeowners. Consumed by the
//@    CLI, the incremental builder, the watcher and propose_change — single source (§20.8-7).
//@  rules:
//@    - All paths in the config are relative to the config file's directory (= workspace root).
//@  post: returns OrgInputs; throws on missing config or missing template dir
//@  assigns: []
//@
//@contract: IncrementalBuild
//@  lang: typescript
//@  realizedBy: [indexer/src/incremental.ts]
//@  signature: class IncrementalOrgBuilder { build(): BuildResult; stats: {extracted, cached} }
//@  intent: >
//@    Spec §4/§6: shard-per-module incremental rebuild. A module's shard is keyed by its
//@    content-hash generation; unchanged shards come from cache (memory + JSON files under
//@    cacheDir), changed ones re-extract. Rebuild cost is O(changed modules), not O(org).
//@  rules:
//@    - The merged output MUST byte-equal a from-scratch full build of the same inputs —
//@      the cache is an optimization, never a semantic.
//@    - Disk cache entries are keyed <module>-<generation>.json; stale entries are pruned.
//@  post: build() reports per-module cache hits in stats; incremental output byte-identical to full rebuild
//@  assigns: [cacheDir, memory cache]
//@
//@contract: WatchMode
//@  lang: typescript
//@  realizedBy: [indexer/src/watch.ts]
//@  signature: startWatch(configPath, outFile, onRebuild): Promise<{close}>
//@  intent: Live index — @parcel/watcher over every source dir in the config, debounced, feeding IncrementalOrgBuilder.
//@  rules:
//@    - Events are debounced (150ms) and coalesced; a rebuild error is reported to stderr, never crashes the watcher.
//@    - close() unsubscribes everything (clean daemon shutdown).
//@  post: onRebuild fires with a BuildResult after any source change
//@  assigns: [subscriptions]
//@
//@contract: LanguageProfiles
//@  lang: typescript
//@  realizedBy: [core/src/languages.ts]
//@  intent: >
//@    Go/Python subsets — a RESTORATION, not an extension: the heritage spec (v0.2) used
//@    #@ (Python) and //@ (Go) markers. Languages are profiles-as-data in @lynx/core, not
//@    runtime plugins: one registry entry per language (extensions, marker, line comment).
//@    Everything else (graph model, ids, topics, shards, hologram) is already
//@    language-neutral — the org mesh is polyglot for free because Kafka topics are.
//@  rules:
//@    - The parser accepts BOTH //@ and #@ markers everywhere (heritage rule: "tools accept
//@      both"); the profile decides which one codegen/snippets EMIT, never which one parses.
//@    - Sanctioned code markers (TEMPLATE-GAP, etalon deviation, waiver, covers) accept both
//@      comment leaders (// and #).
//@    - lang: enum gains go|python; §11 concurrency keys stay one superset (subsets use what
//@      applies; per-language key linting is a v1.4 profile concern — SPEC-FEEDBACK).
//@  post: exports LANGUAGES registry + profileFor(path); adding a language touches the registry + a locator entry, nothing else
//@  assigns: []
//@
//@contract: MethodLocator
//@  lang: typescript
//@  realizedBy: [indexer/src/locator.ts]
//@  signature: regexLocator: MethodLocator; createTreeSitterLocator(): Promise<MethodLocator | undefined>
//@  intent: >
//@    §2 method granularity done right: web-tree-sitter WASM (kotlin + java grammars) as the
//@    robust declaration locator per the research doc; regex stays the zero-dep default.
//@  rules:
//@    - A locator carries an id; the id feeds the generation hash — indexes built with
//@      different locators NEVER claim byte-equality (determinism guarantee holds per-locator).
//@    - createTreeSitterLocator returns undefined when wasm packages are absent — callers
//@      fall back to regex, never crash.
//@    - Tree-sitter finds declarations regex cannot (annotated single-line funs, backtick
//@      names, Java methods); on plain generated Kotlin the two agree.
//@  post: locate() is pure and deterministic; results sorted by line
//@  assigns: []
//@
//@contract: Lynxctl
//@  lang: typescript
//@  realizedBy: [indexer/src/lynxctl.ts]
//@  signature: runLynxctl(argv: string[]): {code: number, lines: string[]}
//@  intent: >
//@    ROADMAP item 1 — the §20.8 checklist as a runnable CI command. Builds (or reuses)
//@    the index from lynx-sources.json and reports violations one per line.
//@  rules:
//@    - Output format: "<invariant>\t<file>:<line>\t<message>" (file:line resolved from the
//@      violating node; "-" when the node has no location). CI-greppable, stable.
//@    - Exit code: 0 clean, 1 violations found, 2 usage error.
//@    - Includes lint_violations + org_lint_violations by default; --no-org restricts to the
//@      §20.8 module invariants; --drift appends the contract_drift fidelity surface.
//@    - Deep dependency cycles (§17, beyond the 2-cycle view): detected over module `depends`
//@      edges in code and reported as invariant `dependency-cycle`.
//@  post: pure over the sources; builds into a temp file, never mutates the workspace
//@  assigns: []
//@
//@contract: Propose
//@  lang: typescript
//@  realizedBy: [mcp-server/src/propose.ts]
//@  signature: class Proposer { propose(file, newText, citation): ProposeResult }
//@  intent: >
//@    Spec §5 propose_change — the ONLY write path, guarded: a contract/manifest edit is
//@    accepted into a staging copy only if lint stays clean and the edit carries a citation;
//@    returns the impact set. Never touches generated code, never touches the real tree.
//@  rules:
//@    - Reject without citation; reject any path under a module's generated root; reject files absent from the sources config.
//@    - "Stays clean" = the staged tree introduces NO violation absent from the baseline (fixture corpora carry deliberate baseline violations).
//@    - Accepted: patched file + staged index written under .lynx-staging/<newGeneration>/; result carries the §6.4 diff classes and the blast radius (affected modules/targets/owners).
//@    - Rejected: result lists exactly the NEW violations; nothing is written.
//@  post: pure over (sources on disk, patch); the real tree is never modified
//@  raises: {}
//@  assigns: [.lynx-staging]
//@
//@contract: McpSurface
//@  lang: typescript
//@  realizedBy: [mcp-server/src/server.ts]
//@  intent: Bind Tools to @modelcontextprotocol/sdk 1.x McpServer over stdio; lynx_ prefix; resource template lynx://node/{id}; stderr-only logging.
//@  calls: [Tools.*, McpServer.registerTool, StdioServerTransport, SnapshotRegistry.writeSnapshot]
//@  rules:
//@    - Snapshot dir: --snapshots arg, else derived from --sources (its directory /
//@      .lynx-snapshots); when known, the served generation is auto-registered at startup
//@      (idempotent) and lynx_snapshots/lynx_diff resolve refs against it.
//@  post: server serves tools lynx_schema, lynx_query, lynx_contract_of, lynx_why, lynx_impact_of, lynx_lint, lynx_realizations_of, lynx_drift, lynx_explain_divergence, lynx_runs, lynx_trace_requirement, lynx_modules, lynx_owners_of, lynx_org_impact_of, lynx_hologram, lynx_snapshots, lynx_diff, lynx_propose_change
//@  assigns: [db, .lynx-snapshots]
```
