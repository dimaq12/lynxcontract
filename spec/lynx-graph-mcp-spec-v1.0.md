# Lynx Graph — the contract↔code index, served over MCP (spec v1.0, 2026-07-23)

**Purpose.** A LynxContract template declares, rather than implies, the coupling between
contracts and the code generated from them: TARGET paths, realizes maps, fill assignments,
anchors, provenance and gap markers. Lynx Graph materializes those declarations into a queryable
graph and serves it over the Model Context Protocol — so an agent (or a reviewer's tool) *sees*
the coupling instead of grepping text. The design goal in one line: **expose the data model, not
a guess at the features** — a self-describing schema plus arbitrary read-only queries beats any
fixed tool list.

> **v1.0** is the promotion of v0.2 to a shipped contract: every conservative reading the first
> implementation recorded in SPEC-FEEDBACK is either **blessed** here (it becomes normative) or
> deliberately replaced. New normative material vs v0.2: declared micro-grammars (§2.1), stable
> ids for unnamed blocks (§3.1), the snapshot registry that operationalizes the time axis
> (§6.4), CODEOWNERS glob semantics (§6.1), and the drift surface as a named sibling of lint
> (§5.1). Rows changed vs v0.2 are marked *(v1.0)*; minor prose simplifications (e.g. the dropped
> `gradleModule` attribute) are not individually marked.

Status: v1.0 — shipped specification; the reference implementation lives in `tools/graph/`.
Companion to the LynxContract spec (currently v1.3-jvm); section references (§7, §12, §13, §14,
§17, §18.1, §19.1, §20.x) point there.

---

## 1. Inputs

| Input | Role | Required |
|---|---|---|
| Template tree (`**/*.lynx.*`) | contracts, stubs, root maps, rules, markers | yes |
| Instantiation manifest(s) (`instantiations/*.md`) | fill values, instance rosters, quirks, statuses | per instantiation |
| Generated tree(s) | targets, methods, generation-time markers (`// TEMPLATE-GAP:` etc.) | optional |
| Run reports (`BATTLE-REPORT.md`, `GAPS.md`) | historical findings, classifications | optional |
| Upstream pins (from root maps) | pinned revisions, external surfaces | derived |
| Sources config (`lynx-sources.json`) | module roots for org indexing; single declared home of "what makes up this workspace" | monorepo mode |
| `CODEOWNERS` | ownership boundaries → `owner` nodes | optional |
| Git revision | the pin every org snapshot is indexed at | monorepo mode |

The parser is the shared LynxContract core (the same one behind the LSP and `lynxctl`) — one
grammar, three consumers. Both comment markers are accepted everywhere (`//@` and `#@`, the
heritage rule); a language profile decides only what tooling *emits*. Indexing is deterministic:
same inputs ⇒ byte-identical index.

## 2. Graph model

**Node kinds** (table `nodes(id, kind, name, file, line, attrs JSON)`):

| kind | meaning |
|---|---|
| `stub` | one `*.lynx.*` file (attrs: TARGET, REALIZATION, multiplier flag) |
| `contract` | one `//@contract`/`//@messaging`/`//@flow`/`//@graph`/… block |
| `rule` | one oracle bullet / stub rule with a stable anchor (§2.1 grammar) |
| `fill_token` | a registry variation point (attrs: source REQ\|P0\|API, default). A used-but-unregistered token anchors at the pseudo-path `fill_token:unregistered#<T>` *(v1.0)* |
| `fill_value` | one instance assignment of a token in a manifest |
| `instance` | one multiplier instantiation (e.g. a command, a webhook group) |
| `target` | one generated file (attrs: exists, blocked_reason?) |
| `method` | one generated method matched to its contract signature |
| `marker` | a sanctioned in-code marker (kind: template-gap \| deviation \| reconstructed \| waiver) |
| `gap` | one ledger entry of an instantiation run |
| `finding` | one classified divergence from a run report (attrs: run, class, grouped_id; §2.1 grammar) |
| `clause` | one `raises:`/`produces…when:` clause of a contract |
| `test_case` | one generated/contracted test case (declares coverage via `//@covers:`, §2.1) |
| `pin` | an upstream revision or external-surface pin |
| `quirk` | a wire-true literal override (three-literal freezes, casing, prefix exceptions) |
| `module` | one module root (a `//@graph:`/`//@module:` owner or a sources-config entry; attrs: layer, package) |
| `topic` | one Kafka topic, deduplicated org-wide by canonical name (attrs: naming-template match §18.1, formats seen) |
| `owner` | one CODEOWNERS principal (team or person) |
| `enum_surface` | one `frozen:`/`closed:` set (§19.1) — a published compatibility surface (attrs: values, since/deprecated). An entry whose children declare `frozen:`/`closed:` is an enum surface, keyed by a plain identifier *(v1.0 — the ident-key form is the blessed spelling)* |

**Edge kinds** (table `edges(src, dst, kind, attrs JSON)`): `declares` (stub→contract),
`realizes` / `realized_by` (contract↔target), `generates` (stub→target, via instance),
`instantiates` (fill_token→fill_value→instance), `anchors` (any→contract, the `<file>#<name>`
graph), `depends` (root-map edges; also module→module from `//@module: depends`), `produces` /
`consumes` (contract↔`topic` node — both ends resolve to the shared deduplicated topic, so
cross-module flow emerges from declarations alone), `covers` (test_case→clause), `predicts`
(marker:deviation→finding), `explains` (gap→marker \| finding), `cites` (any→reference
file:line; *(v1.0)* **this is the blessed marker→code association**: a marker `cites` the stub
or target it sits in), `blocks` (execution-blocking pin→target), `binds` (rule→contract/stub it
constrains), `member_of` (*(v1.0)* scoped: emitted for `stub`/`contract`/`target` nodes only —
every other node kind carries `attrs.module` instead; emitting the edge for all kinds would
double the edge table for no query the views need), `owns` (owner→module\|path), `restricts`
(module→module, from `//@module: restrictions`), `freezes` (contract→enum_surface).

Granularity floor (by design, mirrors §20): mapping bottoms out at **method + its contract
keys**. Lines inside method bodies are the declared free zone — `why()` on a body line returns
the *method's* obligations, never a per-line claim.

### 2.1 Declared micro-grammars *(v1.0 — blessed from the first implementation's readings)*

The following report/markdown grammars are normative. All are line-oriented bullets, tolerant
of surrounding prose, and both `//`/`#` comment leaders are accepted where they appear in code.

| construct | grammar |
|---|---|
| rule | `- RULE[<kebab-id>]: <text> [-> binds <contract-ref>]` — the optional tail creates the `binds` edge |
| finding | `- FINDING[<id>]: class=<c> run=<r> [at=<file>[:<line>]] [grouped=<id>] [marker=<file>:<line>] — <text>`; a `marker=` resolving to a deviation marker emits the `predicts` edge |
| coverage | `//@covers: [<clause-ref>, …]` on the line(s) immediately above a test case → `covers` edges |
| gap | `- GAP[<id>]: <text> [(marker: <file>:<line>)]` — the marker tail emits the `explains` edge |
| pin / quirk | `- PIN[<name>]: <revision>` / `- QUIRK[<name>]: <text>` |
| manifest | fills table rows `\| {{Token}} \| <value> \| <status> \|` plus bullets `- INSTANCE[{{Token}}]: A, B, C`, `- BLOCKED[<target-path>]: <reason>`, `- SCOPE-REDUCED[<clause-ref>]: <reason>` — the §20.8-8/9 escape hatches' declared home |

## 3. Storage

SQLite, one file per indexed workspace. `nodes`, `edges` as above; `fts` (FTS5) over
contract/rule/gap text; materialized convenience tables (`targets`, `clauses`, `markers`) are
views over `nodes`. Write access is the indexer's alone; the MCP surface is read-only (except
§5's one guarded exception). In monorepo mode ids are namespaced
`module/kind:file#name[@instance]`, and the org index records `(workspace_root, revision)` — a
**snapshot id** every query result can be reproduced against.

### 3.1 Stable ids *(v1.0)*

Ids are `kind:file#name[@instance]`. For **named** blocks the name is the declared one and the
id survives arbitrary edits elsewhere in the file. For **unnamed** blocks (`//@module:`,
markers, and any block whose grammar carries no name) v0.2 used `<kind>@<line>`, which shifted
with every edit above the block. v1.0 replaces this with a **content-hash name**:

- unnamed block → `<kind>@h<hash8>` where `hash8` is the first 8 hex chars of a SHA-256 over
  the block's text (its entry lines, comment leaders stripped);
- marker → `<marker-kind>@h<hash8>` over the marker text;
- two identical unnamed blocks/markers in one file disambiguate deterministically by order of
  appearance: `…@h<hash8>`, `…@h<hash8>-2`, `…@h<hash8>-3`, …

Consequence: an id now survives *any edit that does not touch the block itself* — moving the
block, inserting lines above it, reformatting siblings. An edit to the block's own text changes
the id, which is correct: the cited thing changed. `diff` (§6.4) is therefore quiet under
line-shifts and loud exactly when content moved. Named blocks remain the recommendation; the
hash is the fallback, not an excuse to skip names.

## 4. Indexer behavior

- Full pass: parse template → manifest(s) → generated tree(s) → optional run reports; emit
  nodes/edges; verify §20.8 invariants as it goes (violations become `finding` nodes of class
  `lint`, they never abort indexing).
- Watch mode (native FS watcher): re-parse changed files, patch the graph incrementally.
- Multi-instantiation: one graph may hold several manifests/generated trees; every
  instance-scoped node carries its instantiation id.
- Monorepo mode: module discovery via the sources config. Each module is indexed into a
  **shard** keyed by the content-hash of its inputs (shard caches persisted
  `<module>-<generation>.json`, stale entries pruned); the org index is a deterministic merge
  of shards. An incremental org rebuild re-indexes only modules whose hash changed — watch mode
  scales as O(changed modules), not O(org). The incremental output MUST byte-equal a
  from-scratch build: the cache is an optimization, never a semantic.
- *(v1.0)* Snapshotting: any build may register its output in the **snapshot registry** (§6.4)
  — `--snapshot` on the CLI copies the built index to
  `<workspace>/.lynx-snapshots/<generation>.db` (idempotent: generations are content hashes, an
  existing snapshot is never rewritten).

## 5. MCP surface

Transport: stdio. All tools read-only unless stated. Every tool's result cites node ids and
stamps `index_generation`. Validation failures return `isError` with a corrective hint — the
message names what a valid input looks like, never just what failed.

| tool | contract |
|---|---|
| `schema()` | → the DDL + node/edge kind tables + ≥10 worked example queries. An agent bootstraps from this alone. |
| `query(sql, limit?, offset?)` | read-only SELECT (enforced engine-first: readonly DB handle, single prepared statement, `stmt.reader` check, ATTACH/PRAGMA deny-list; row cap default 50, hard cap 500, truncation flagged `{truncated, next_offset}`). **This is the arbitrary-question surface**; unforeseen features live here. |
| `contract_of(file, line?)` | → governing contract block + fill values in force + the rules that `bind` here. |
| `realizations_of(ref)` | ref = contract \| stub \| fill_token → all targets/methods across instances. |
| `why(file, line)` | → the provenance chain as an edge path: method → contract → rule/example → cite → (manifest row →) requirement. Returns the path, not prose. |
| `impact_of(ref)` | ref = fill_token \| fill_value \| contract \| rule → the closed regeneration set (targets + tests). *(v1.0)* The traversal alphabet is normative: forward over `instantiates\|generates\|declares\|realized_by\|cites`, reverse over `cites\|realizes`. Enables subset regeneration. |
| `drift(scope?)` | *(v1.0)* the contract↔code **fidelity surface** (§5.1): signature-unrealized, undeclared-method, unexplained-marker, contract-without-code — plus the gap ledger and declared deviations. Folds v0.2's `gaps_in`/`deviations_in` (blessed: listings ride the drift report under one scope filter). |
| `lint(scope?)` | the §20.8 invariants (1–10) as precomputed views; returns violations with node ids. `lynxctl` is this tool with a CLI face. `scope` may name a module; org scope adds the §6.3 org invariants. |
| `explain_divergence(file, line, observed)` | classify a diff observation against the graph: `predicted` (cites the deviation marker) \| `catalogued` (cites the gap) \| `candidate_defect` (no coverage found — with the nearest rules that *should* have covered it). Precedence exactly that order. |
| `trace_requirement(ref)` | the audit view: requirement → fills → targets → tests → run findings. |
| `runs(run?, class?, min_runs?)` | historical findings across runs; supports "which contract produced findings in ≥N runs". |
| `modules()` | → module inventory: layer, package, owner, health metrics (§6.3). |
| `owners_of(ref)` | ref = any node id \| path \| topic → the CODEOWNERS principals behind it. |
| `org_impact_of(ref)` | transitive closure over `produces`/`consumes` topic edges + module `depends`: the **org blast radius** of a change — affected modules, targets, tests and their owners. `impact_of` answers "what do I regenerate"; this answers "who do I break". |
| `hologram(scope?, format: json\|mermaid)` | render a hologram view (§6.3) — the event mesh, a module's neighborhood, or the layer map. `mermaid` for humans and PRs, `json` for UIs. |
| `snapshots()` *(v1.0)* | → the snapshot registry: every registered generation with its file, size and which one is live. The discovery half of `diff`. |
| `diff(snapshot_a, snapshot_b)` | contract-level org changelog between two snapshots, **classified** (new topic, new consumer, closed-enum member added, freeze violated, layer edge introduced, contract weakened/strengthened). *(v1.0)* A snapshot ref is a generation id (or unambiguous prefix), a path to an index file, or the literal `live` (the served index). An unresolvable ref is an `isError` naming the accepted forms and the registered generations. |
| `propose_change(file, new_text, citation)` | **the only write path, guarded**: a contract/manifest edit is accepted into a staging copy (`.lynx-staging/<generation>/`) only if `lint()` introduces no violation absent from the baseline and the edit carries a citation; returns the §6.4 diff classes and the org blast radius up front. Never touches generated code or the real tree. |

Resources: `lynx://node/<id>` — stable, linkable from PRs and review UIs.

### 5.1 Lint vs drift — two surfaces, deliberately *(v1.0)*

`lint` and `drift` are **not** the same report. Lint = the §20.8 mechanical invariants:
presence, count, cross-reference — violations of template discipline. Drift = contract↔code
**fidelity signals**: code the contract layer does not know (`undeclared-method`), declarations
the code does not honor (`signature-unrealized`, `contract-without-code`), provenance without
explanation (`unexplained-marker`). Lint failing blocks a build; drift is the standing answer to
"where do contract and code disagree right now" and feeds the adversarial-diff trichotomy. The
§20.8 scope note applies to both: neither measures content fidelity.

## 6. Organization scale — the monorepo hologram

**The premise.** Nothing new is invented at org scale: `//@messaging:` blocks already name the
topics, `//@module:` already names allowed and forbidden dependencies, §19.1 already marks the
frozen surfaces, CODEOWNERS already names the humans. The hologram is those declarations,
deduplicated and joined — the organization's architecture as its contracts state it, at one
pinned revision. **No runtime telemetry, no inferred coupling, no guesses.**

### 6.1 What joins the modules

| Connective tissue | Declared in | Becomes |
|---|---|---|
| Kafka topics | `//@messaging: consumes/produces` (§13) | shared `topic` nodes; producers and consumers of the same name meet at one node |
| Module dependencies | `//@module: depends` (§12) | module→module `depends` edges |
| Inversion rules | `//@module: restrictions` (§12) | `restricts` edges — violations are org lint |
| Cross-module anchors | `<file>#<contract>` refs (§7.1) | `anchors` edges across module boundaries |
| Compat surfaces | `frozen:` / `closed:` (§19.1) | `enum_surface` nodes + `freezes` edges |
| Data sensitivity | `//@flow: privacy` (§14) | taint source for the org privacy view |
| Ownership | CODEOWNERS | `owner` nodes + `owns` edges |

*(v1.0)* CODEOWNERS matching is **gitignore-glob against the module's workspace-relative root
path** (with `*`, `**`, `?`, leading-`/` anchoring and trailing-`/` directory semantics), with
plain module-name equality kept as a convenience. v0.2's name-containment matching is retired.

### 6.2 Namespacing and determinism

Module-local ids gain the module prefix (`devices-adapter/contract:...`); `topic:` ids are
never namespaced — that is the dedup point. Anchors resolve module-locally first, then
org-wide; an anchor that resolves in two modules is a lint finding (ambiguity is never silently
picked). The org snapshot is a pure function of `(workspace_root, revision)` — two machines
indexing the same commit produce byte-identical holograms, and `diff` is therefore meaningful.
(Byte-identity is claimed per method-locator implementation: the locator id feeds the
generation hash, so indexes built by different locators never claim equality.)

### 6.3 The hologram views (SQL views, all derivable, zero inference)

| view | question it answers |
|---|---|
| `org_event_mesh` | topic × producers × consumers × formats — the company's event-flow map |
| `org_orphan_topics` | produced but never consumed, consumed but never produced — dead wiring |
| `org_privacy_taint` | `privacy: pii/phi` flows crossing module boundaries via topics into lower declared sensitivity (§14, §17) |
| `org_layer_violations` | `depends` edges that hit a `restricts` edge, plus direct dependency 2-cycles. *(v1.0)* Deep cycle detection (§17) is `lynxctl`'s (invariant `dependency-cycle`) — a recursive check does not fit a plain view, and the CLI is the CI face anyway. |
| `org_frozen_surface` | every `enum_surface` + who freezes it + who consumes it — the org's published compat contract |
| `org_ownership` | module → owner → the topics/surfaces that owner is on the hook for |
| `org_health` | per module: contract coverage, lint findings, dangling edges, **blind-spot metric** (§6.5) |

Org lint invariants (added to `lint(scope: org)`): orphan topics, ambiguous anchors,
cross-module dangling `realizes`, `restricts` violations, privacy-taint violations, layer
2-cycles (deep cycles: `lynxctl`).

### 6.4 The time axis — snapshots and `diff` *(v1.0 — operationalized)*

Each indexed generation is a potential snapshot; v1.0 gives snapshots a **registry** so the
time axis exists without ceremony:

- **Location**: `<workspace>/.lynx-snapshots/<generation>.db`, beside the sources config. The
  directory is the registry; no manifest file, no extra state.
- **Registration**: `lynx-index … --snapshot` copies the built index in (also under watch
  mode, per rebuild); the MCP server registers its served generation at startup. Registration
  is idempotent and content-addressed — a generation already present is never rewritten.
- **Consumption**: `snapshots()` lists the registry; `diff(a, b)` resolves each ref as
  generation id \| unambiguous prefix \| file path \| `live`.

`diff(a, b)` classifies every delta against the declarations: a new topic, a new consumer on an
existing topic, a member added to a `closed` enum (legal: contract updated first — or a
violation: handler without the contract change, §19.1), a freeze edit (always a finding), a new
cross-layer edge, a contract clause added or removed. This turns the org changelog from "600
files changed" into "3 new event flows, 1 compat surface widened, 1 layer violation introduced
— owned by these two teams". §3.1's content-hash ids keep the diff quiet under pure line-shifts.

### 6.5 Honesty at org scale

The hologram shows the **declared** architecture. A topic produced by code that carries no
`//@messaging:` block is invisible — by design. Rather than guessing, `org_health` makes the
blind spots first-class: coverage says exactly how much of each module is declared, so "the
hologram is 94% of the org" is a queryable fact, not a hope. The §20.8 scope note applies
org-wide: presence, count and cross-reference — never content fidelity, never runtime truth.

## 7. Guarantees and declared limits

1. **Everything answered is declared** — the graph adds no inference beyond the template's own
   declarations; if a mapping is absent, the honest answer is "unmapped", not a guess.
2. **Read-only by default**; the one write path re-runs the lint invariants before accepting.
3. **The §20.8 scope note applies verbatim**: this index verifies presence, count and
   cross-reference. It cannot see content fidelity — a clean `lint()` earns a build, not a
   deployment. `explain_divergence` classifies against declarations, it does not adjudicate
   truth against a live system.
4. Deterministic: index content is a pure function of inputs (per locator, §6.2); `query`
   results are reproducible against a snapshot generation.
5. **The hologram is architecture-as-declared at a revision — not runtime.** No throughput, no
   lag, no traffic: joining the event mesh to live telemetry is a consumer's job (the topic
   names are the join key), never the index's claim.

## 8. Non-goals (v1.0)

Embedding/semantic search (FTS5 first; revisit with evidence), remote/multi-user serving (local
stdio only), code generation itself (the graph informs generators, it is not one), IDE UI (the
VS Code webview consumes the same index but is specified with the extension, not here),
runtime-telemetry overlay (guarantee 5 in §7), multi-repo federation across separate git repositories (the
shard model extends naturally, but pinning and identity need their own design),
authorization/visibility scoping (a monorepo hologram assumes monorepo-wide read access, as the
repo itself does), snapshot garbage collection (the registry is content-addressed files; pruning
is the operator's `rm`).

## 9. Versioning

The index schema carries `(graph_schema_version, lynxcontract_spec_version)`; v1.0 stamps
`graph_schema_version = 1.0.x` (1.0.0 at first ship; additive index/view tuning bumps the
patch). Graph schema is additive within a major; a LynxContract spec
bump that changes grammar requires a parser bump and full re-index. **Breaking change vs
v0.2**: unnamed-block and marker ids switched from `@<line>` to `@h<hash8>` names (§3.1) — a
full re-index is required, and diffs across the v0.2/v1.0 boundary will report the rename as
added+removed pairs once. Everything else is additive over v0.2.

Deferred to the LynxContract core spec (v1.4 candidates recorded in SPEC-FEEDBACK): absorbing
the §2.1 micro-grammars into the core grammar (`//@rule:`, `//@covers:` as first-class keys),
absorbing the heritage `#@` marker rule into the JVM core spec's §2 (this graph's parser already accepts both markers), per-language §11 key linting, the Python docstring tag
form.
