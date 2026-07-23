# Lynx Graph — the contract↔code index, served over MCP (spec v0.2, 2026-07-23)

**Purpose.** A LynxContract template declares, rather than implies, the coupling between
contracts and the code generated from them: TARGET paths, realizes maps, fill assignments,
anchors, provenance and gap markers. Lynx Graph materializes those declarations into a queryable
graph and serves it over the Model Context Protocol — so an agent (or a reviewer's tool) *sees*
the coupling instead of grepping text. The design goal in one line: **expose the data model, not
a guess at the features** — a self-describing schema plus arbitrary read-only queries beats any
fixed tool list.

> **v0.2** adds §6 — **organization scale: the monorepo hologram**. In a monorepo the modules
> already declare their coupling *to each other* (Kafka topics, `//@module: depends` /
> `restrictions`, cross-module anchors, frozen enums). One org-level index deduplicates those
> declarations into a single navigable picture: every event flow, layer rule, ownership boundary
> and compatibility surface of the organization, at a pinned revision, with zero inference.
> All v0.1 sections are unchanged except where a row is marked *(v0.2)*; old §6–§8 became §7–§9.

Status: v0.2 — design specification. Companion to the LynxContract spec (currently v1.3-jvm);
section references (§7, §12, §13, §14, §17, §18.1, §19.1, §20.x) point there.

---

## 1. Inputs

| Input | Role | Required |
|---|---|---|
| Template tree (`**/*.lynx.*`) | contracts, stubs, root maps, rules, markers | yes |
| Instantiation manifest(s) (`instantiations/*.md`) | fill values, instance rosters, quirks, statuses | per instantiation |
| Generated tree(s) | targets, methods, generation-time markers (`// TEMPLATE-GAP:` etc.) | optional |
| Run reports (`BATTLE-REPORT.md`, `GAPS.md`) | historical findings, classifications | optional |
| Upstream pins (from root maps) | pinned revisions, external surfaces | derived |
| Workspace manifest (`lynx-workspace.json`) *(v0.2)* | module roots (globs) for org indexing; optional — auto-discovery otherwise | monorepo mode |
| `CODEOWNERS` *(v0.2)* | ownership boundaries → `owner` nodes | optional |
| Git revision *(v0.2)* | the pin every org snapshot is indexed at | monorepo mode |

The parser is the shared LynxContract core (the same one behind the LSP and `lynxctl`) — one
grammar, three consumers. Indexing is deterministic: same inputs ⇒ byte-identical index.

## 2. Graph model

**Node kinds** (table `nodes(id, kind, name, file, line, attrs JSON)`):

| kind | meaning |
|---|---|
| `stub` | one `*.lynx.*` file (attrs: TARGET, REALIZATION, multiplier flag) |
| `contract` | one `//@contract`/`//@messaging`/`//@flow`/`//@graph`/… block |
| `rule` | one oracle bullet / stub rule with a stable anchor |
| `fill_token` | a registry variation point (attrs: source REQ\|P0\|API, default) |
| `fill_value` | one instance assignment of a token in a manifest |
| `instance` | one multiplier instantiation (e.g. a command, a webhook group) |
| `target` | one generated file (attrs: exists, blocked_reason?) |
| `method` | one generated method matched to its contract signature |
| `marker` | a sanctioned in-code marker (kind: template-gap \| deviation \| reconstructed \| waiver) |
| `gap` | one ledger entry of an instantiation run |
| `finding` | one classified divergence from a run report (attrs: run, class, grouped_id) |
| `clause` | one `raises:`/`produces…when:` clause of a contract |
| `test_case` | one generated/contracted test case |
| `pin` | an upstream revision or external-surface pin |
| `quirk` | a wire-true literal override (three-literal freezes, casing, prefix exceptions) |
| `module` *(v0.2)* | one module root (a `//@graph:`/`//@module:` owner or a workspace-manifest entry; attrs: layer, package, gradleModule) |
| `topic` *(v0.2)* | one Kafka topic, deduplicated org-wide by canonical name (attrs: naming-template match §18.1, formats seen) |
| `owner` *(v0.2)* | one CODEOWNERS principal (team or person) |
| `enum_surface` *(v0.2)* | one `frozen:`/`closed:` set (§19.1) — a published compatibility surface (attrs: values, since/deprecated) |

**Edge kinds** (table `edges(src, dst, kind, attrs JSON)`): `declares` (stub→contract),
`realizes` / `realized_by` (contract↔target), `generates` (stub→target, via instance),
`instantiates` (fill_token→fill_value→instance), `anchors` (any→contract, the `<file>#<name>`
graph), `depends` (root-map edges; *(v0.2)* also module→module from `//@module: depends` +
`gradleModule`), `produces` / `consumes` (contract↔`topic` node — *(v0.2)* both ends resolve to
the shared deduplicated topic, so cross-module flow emerges from declarations alone), `covers`
(test_case→clause), `predicts` (marker:deviation→finding), `explains` (gap→marker \| finding),
`cites` (any→reference file:line), `blocks` (execution-blocking pin→target), `binds`
(rule→contract/stub it constrains), `member_of` *(v0.2)* (any node→module), `owns` *(v0.2)*
(owner→module\|path), `restricts` *(v0.2)* (module→module, from `//@module: restrictions`),
`freezes` *(v0.2)* (contract→enum_surface).

Granularity floor (by design, mirrors §20): mapping bottoms out at **method + its contract
keys**. Lines inside method bodies are the declared free zone — `why()` on a body line returns
the *method's* obligations, never a per-line claim.

## 3. Storage

SQLite, one file per indexed workspace. `nodes`, `edges` as above; `fts` (FTS5) over
contract/rule/gap text; materialized convenience tables (`targets`, `clauses`, `markers`) are
views over `nodes`. Stable ids: `kind:file#name[@instance]` — survive re-indexing, usable in
citations. *(v0.2)* In monorepo mode ids are namespaced `module/kind:file#name[@instance]`, and
the org index records `(workspace_root, revision)` — a **snapshot id** every query result can be
reproduced against. Write access is the indexer's alone; the MCP surface is read-only (except
§5's one guarded exception).

## 4. Indexer behavior

- Full pass: parse template → manifest(s) → generated tree(s) → optional run reports; emit
  nodes/edges; verify §20.8 invariants as it goes (violations become `finding` nodes of class
  `lint`, they never abort indexing).
- Watch mode (native FS watcher): re-parse changed files, patch the graph incrementally.
- Multi-instantiation: one graph may hold several manifests/generated trees; every
  instance-scoped node carries its instantiation id.
- *(v0.2)* Monorepo mode: module discovery via the workspace manifest, else auto-discovery
  (any directory owning a `//@graph:`/`//@module:` block or a `contracts/` dir). Each module is
  indexed into a **shard** keyed by the content-hash of its inputs; the org index is a
  deterministic merge of shards. An incremental org rebuild re-indexes only modules whose hash
  changed — watch mode scales as O(changed modules), not O(org).

## 5. MCP surface

Transport: stdio. All tools read-only unless stated. Every tool's result cites node ids.

| tool | contract |
|---|---|
| `schema()` | → the DDL + node/edge kind tables + 10 worked example queries. An agent bootstraps from this alone. |
| `query(sql, limit?)` | read-only SELECT (enforced: single statement, no PRAGMA/ATTACH, row cap default 200). **This is the arbitrary-question surface**; unforeseen features live here. |
| `contract_of(file, line?)` | → governing contract block + fill values in force + the rules that `bind` here. |
| `realizations_of(ref)` | ref = contract \| stub \| fill_token → all targets/methods across instances. |
| `why(file, line)` | → the provenance chain as an edge path: method → contract → rule/example → cite → (manifest row →) requirement. Returns the path, not prose. |
| `impact_of(ref)` | ref = fill_token \| fill_value \| contract \| rule → the closed regeneration set (targets + tests), via multiplier ranges and `depends`. Enables subset regeneration. |
| `gaps_in(path)` / `deviations_in(path)` | markers ↔ ledger entries for a subtree, joined. |
| `lint(scope?)` | the §20.8 invariants (1–10) as precomputed views; returns violations with node ids. `lynxctl` is this tool with a CLI face. *(v0.2)* `scope` may name a module; org scope adds the §6.3 org invariants. |
| `explain_divergence(file, line, observed)` | classify a diff observation against the graph: `predicted` (cites the deviation marker) \| `catalogued` (cites the gap) \| `candidate_defect` (no coverage found — with the nearest rules that *should* have covered it). |
| `trace_requirement(question_id \| fill_value)` | the audit view: requirement → fills → targets → tests → run findings. |
| `runs(filter?)` | historical findings across runs; supports "which contract produced findings in ≥N runs". |
| `modules(filter?)` *(v0.2)* | → module inventory: layer, package, owner, health metrics (§6.3). |
| `owners_of(ref)` *(v0.2)* | ref = any node id \| path \| topic → the CODEOWNERS principals behind it. |
| `org_impact_of(ref)` *(v0.2)* | transitive closure over `produces`/`consumes` topic edges + module `depends`: the **org blast radius** of a change — affected modules, targets, tests and their owners. `impact_of` answers "what do I regenerate"; this answers "who do I break". |
| `hologram(scope?, format: json\|mermaid)` *(v0.2)* | render a hologram view (§6.3) — the event mesh, a module's neighborhood, or the layer map. `mermaid` for humans and PRs, `json` for UIs. |
| `diff(snapshot_a, snapshot_b)` *(v0.2)* | contract-level org changelog between two pinned revisions: added/removed/changed nodes and edges, **classified** (new topic, new consumer, closed-enum member added, freeze violated, layer edge introduced, contract weakened/strengthened). The "what happened in the org this week" surface. |
| `propose_change(patch)` | **the only write path, guarded**: a contract/manifest edit is accepted into a staging copy only if `lint()` stays clean and the edit carries a citation; returns the impact set — *(v0.2)* including `org_impact_of` so a proposal shows its blast radius up front. Never touches generated code. |

Resources: `lynx://contract/<id>`, `lynx://rule/<id>`, `lynx://gap/<id>` — stable, linkable from
PRs and review UIs. *(v0.2)* plus `lynx://topic/<name>`, `lynx://module/<id>`,
`lynx://hologram/<view>@<revision>` — an org diagram you can pin in a design doc.

## 6. Organization scale — the monorepo hologram *(v0.2)*

**The premise.** Nothing new is invented at org scale: `//@messaging:` blocks already name the
topics, `//@module:` already names allowed and forbidden dependencies, §19.1 already marks the
frozen surfaces, CODEOWNERS already names the humans. The hologram is those declarations,
deduplicated and joined — the organization's architecture as its contracts state it, at one
pinned revision. **No runtime telemetry, no inferred coupling, no guesses.**

### 6.1 What joins the modules

| Connective tissue | Declared in | Becomes |
|---|---|---|
| Kafka topics | `//@messaging: consumes/produces` (§13) | shared `topic` nodes; producers and consumers of the same name meet at one node |
| Module dependencies | `//@module: depends` / `gradleModule` (§12) | module→module `depends` edges |
| Inversion rules | `//@module: restrictions` (§12) | `restricts` edges — violations are org lint |
| Cross-module anchors | `<file>#<contract>` refs (§7.1) | `anchors` edges across module boundaries |
| Compat surfaces | `frozen:` / `closed:` (§19.1) | `enum_surface` nodes + `freezes` edges |
| Data sensitivity | `//@flow: privacy` (§14) | taint source for the org privacy view |
| Ownership | CODEOWNERS | `owner` nodes + `owns` edges |

### 6.2 Namespacing and determinism

Module-local ids gain the module prefix (`devices-adapter/contract:...`). Anchors resolve
module-locally first, then org-wide; an anchor that resolves in two modules is a lint finding
(ambiguity is never silently picked). The org snapshot is a pure function of
`(workspace_root, revision)` — two machines indexing the same commit produce byte-identical
holograms, and `diff` is therefore meaningful.

### 6.3 The hologram views (SQL views, all derivable, zero inference)

| view | question it answers |
|---|---|
| `org_event_mesh` | topic × producers × consumers × formats — the company's event-flow map |
| `org_orphan_topics` | produced but never consumed, consumed but never produced — dead wiring |
| `org_privacy_taint` | recursive CTE: `privacy: pii/phi` flows crossing module boundaries via topics; a pii flow reaching a flow/sink of lower declared sensitivity is a violation (§14, §17) |
| `org_layer_violations` | `depends` edges that break layer ordering or hit a `restricts` edge; plus dependency cycles (§17) |
| `org_frozen_surface` | every `enum_surface` + who freezes it + who consumes it — the org's published compat contract |
| `org_ownership` | module → owner → the topics/surfaces that owner is on the hook for |
| `org_health` | per module: contract coverage (files carrying `//@` vs total), lint findings, dangling edges, **blind-spot metric** (§6.5) |

Org lint invariants (added to `lint(scope: org)`): orphan topics, ambiguous anchors,
cross-module dangling `realizes`, layer cycles, `restricts` violations, privacy-taint
violations, closed-enum consumers missing a member added by the producer.

### 6.4 The time axis — `diff`

Each indexed revision is a snapshot. `diff(a, b)` compares two snapshots and classifies every
delta against the declarations: a new topic, a new consumer on an existing topic, a member added
to a `closed` enum (legal: contract updated first — or a violation: handler without the contract
change, §19.1), a freeze edit (always a finding), a new cross-layer edge, a contract clause
added or removed. This turns the org changelog from "600 files changed" into "3 new event
flows, 1 compat surface widened, 1 layer violation introduced — owned by these two teams".

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
4. Deterministic: index content is a pure function of inputs; `query` results are reproducible
   against an index snapshot id.
5. *(v0.2)* **The hologram is architecture-as-declared at a revision — not runtime.** No
   throughput, no lag, no traffic: joining the event mesh to live telemetry is a consumer's job
   (the topic names are the join key), never the index's claim.

## 8. Non-goals (v0.2)

Embedding/semantic search (FTS5 first; revisit with evidence), remote/multi-user serving (local
stdio only), code generation itself (the graph informs generators, it is not one), IDE UI (the
VS Code webview consumes the same index but is specified with the extension, not here).
*(v0.2)* Also: runtime-telemetry overlay (see §7.5), multi-repo federation across separate git
repositories (v0.3 candidate — the shard model extends naturally, but pinning and identity need
their own design), authorization/visibility scoping (a monorepo hologram assumes monorepo-wide
read access, as the repo itself does).

## 9. Versioning

The index schema carries `(graph_schema_version, lynxcontract_spec_version)`. Graph schema is
additive within a major; a LynxContract spec bump that changes grammar requires a parser bump and
full re-index. v0.2 is additive over v0.1 (new node/edge kinds, new views, new tools; no v0.1
surface changed). This spec: v0.2 → implementation feedback → v1.0 together with the first
shipped indexer.
