# The LynxContract Cookbook

The spec is the law; this is the kitchen. Every recipe is a real move you make in a real
repository, with the exact syntax the tooling parses. All examples are fictional
(Acme/CoreLab). Section references (§) point to `spec/lynxcontract-spec-kotlin-java-v1.3.md`;
graph references point to `spec/lynx-graph-mcp-spec-v1.0.md`.

**Pick your job:**

- **Building a new module?** → recipes 1–5 (contract → Kafka wiring → tests read off the
  contract), then 12–13 to put it on the graph.
- **Changing or refactoring an existing one?** → recipe 2's discipline in reverse order
  (contract tree first), then 15 (blast radius), 17 (drift triage), 18 (classify divergences),
  19 (what changed, contract-level).
- **Re-instantiating a template under new requirements?** → recipes 6–11 (archetype, fills,
  manifest, honesty protocol); new requirements land as fill values — or as a
  template-evolution request when no variation point fits.

---

## Part I — Contracts on code

### 1. Annotate one function you already have

The smallest useful contract: signature, one precondition, one postcondition, declared errors.

```kotlin
//@contract: CaptureMapper.toEvent
//@  lang: kotlin
//@  signature: fun toEvent(response: RawCapture): CaptureStarted
//@  pre: response.id.isNotBlank()
//@  post: result.captureId == response.id
//@  raises:
//@    MappingException: response.status not in CaptureStatus
//@  assigns: []
fun toEvent(response: RawCapture): CaptureStarted { ... }
```

`assigns: []` is a purity claim — the function touches nothing outside its return value.
A reviewer (or a lint) can now hold the body to the header.

**Gotcha:** name the block (`CaptureMapper.toEvent`, not just `toEvent`). Named blocks get
stable graph ids; unnamed ones fall back to content-hash names (graph spec §3.1) — fine, but
names are citable by humans.

### 2. Contract-first: the module exists before any code (§8)

When building from scratch, write a skeleton that is *sufficient for generation* — the §7
determinism rule: if an agent would have to invent a dependency, topic, or side effect, the
contract is incomplete. Add the missing key instead of improvising in code later.

```kotlin
// TARGET: internal/StartCaptureRoute.kt
// REALIZATION: generate

//@module:
//@  layer: integration
//@  package: com.acme.corelab.telemetry
//@  depends: [com.acme.telemetry.rest.*, com.acme.messaging.commons.*]
//@  restrictions: [com.acme.notify.*]
//@
//@contract: StartCaptureRoute.handle
//@  lang: kotlin
//@  signature: fun handle(command: StartCapture): CaptureStarted
//@  pre: command.amount > 0
//@  post: result.captureId.isNotBlank()
//@  calls: [telemetryApi.create]
//@  raises:
//@    PermanentException: provider rejects the capture
//@  assigns: []
```

The two header lines are the §20.1 stub model: where the file will land (`TARGET`) and how it
comes to exist (`REALIZATION: generate` | `copy-verbatim <etalon-path>` | `n/a` for root maps).
Get this skeleton reviewed *before* anybody writes a body.

### 3. Wire a Kafka unit (§13)

The messaging block makes an event-driven unit generatable: what it consumes, what it produces,
how failures route.

```kotlin
//@messaging: StartCaptureRoute
//@  consumes:
//@    topic: corelab.telemetry.command.open-capture
//@    as: StartCapture
//@    format: envelope-json
//@    group: telemetry-adapter
//@    key: captureId
//@  produces:
//@    - topic: telemetry.event.capture-started
//@      as: CaptureStarted
//@      format: avro
//@    - topic: telemetry.event.capture-start-failed
//@      as: CaptureStartFailed
//@      when: raises PermanentException
//@  ordering: per-key
//@  idempotent: false                 # actuator dispatch — no auto-retry
//@  errors:
//@    PermanentException: failed-event
//@    RetryableException: retry-topic
//@  dlq: corelab.telemetry.dlq
```

Every `raises` and every `produces … when:` becomes a **clause** node in the graph, and §20.8-9
demands a test that covers each one. `idempotent: false` is not documentation — it is an
assertable claim (recipe 4).

### 4. Read the tests off the contract — never invent assertions

The contract is the test oracle. Walk the keys, emit the test:

| Contract key | Test it produces |
|---|---|
| `consumes` (type/format) | the input fixture the test publishes |
| `pre` | one valid input (happy path) + one invalid (negative) |
| `calls` | exactly which provider API to stub — nothing else may be touched |
| `post` | the assertion on the result |
| `produces` | assert that topic received that declared type |
| `produces … when: raises E` | trigger `E`, assert the failed-event is produced |
| `errors` / `dlq` | assert routing to retry-topic / DLQ exactly as declared |
| `assigns: []` | assert purity — no state outside `assigns` was touched |
| `idempotent: false` | assert there is **no** auto-retry |

Link each test to the clause it covers, so lint can verify completeness:

```kotlin
//@covers: [StartCaptureRoute.handle.raises.PermanentException]
fun `rejects when provider says no`() { ... }
```

**Rule:** if the code and the test disagree, the contract decides. Never weaken a generated
assertion to make it pass — fix the code, or fix the contract *first* and say so.

### 5. Freeze a published vocabulary (§19.1)

A status enum consumed by other teams is a compatibility surface. Say so:

```kotlin
//@contract: telemetry.status
//@  intent: published capture outcome vocabulary — compat surface (§19.1)
//@  CaptureStatus:
//@    frozen: true
//@    closed: true
//@    values: [OPEN, COMPLETE, ABORTED]
```

The graph materializes this as an `enum_surface` node. From then on, `lynx_diff` classifies a
member *added* as `enum-member-added` (tracked, legal if the contract moved first) and a member
*removed* as `freeze-violated` — always a finding.

---

## Part II — The archetype: one template, many family members (§20)

### 6. Extract the family template

You have three similar adapters and are about to write a fourth. Stop copying. Write the
family **once** as a template of contract stubs; every concrete adapter becomes an
instantiation of a subset, never a fork. The smell test for every line you put in the template:
*"could this line differ between two family members?"* If yes, it is not template — it is a fill.

### 7. Declare every legal difference as a fill (§20.2)

Fills are `{{Token}}` holes, and every one must be registered:

```markdown
# Fill Registry — acme-telemetry adapter family

| Token | Source | Format | Default | Example |
|---|---|---|---|---|
| {{Provider}} | REQ | lowercase vendor id | — | corelab |
| {{Domain}} | REQ | lowercase domain | telemetry | telemetry |
| {{Command}} | REQ | PascalCase command name; multiplier | — | StartCapture |
```

`Source` says where the answer comes from (requirements questionnaire, Phase-0 sync, provider API).
A `{{Token}}` used in a stub but absent from the registry is a lint violation (§20.8-2, token
closure) — the closed-surface principle: everything askable is enumerable, so the generating
agent has no room to hallucinate.

### 8. Multiply: one stub, N files (§20.3)

```kotlin
// TARGET: external/messages/commands/{{Command}}.kt
// REALIZATION: generate
// MULTIPLIER: one class per declared {{Command}} instance

//@contract: commands.{{Command}}
//@  lang: kotlin
//@  signature: data class {{Command}}(val id: String, val deviceId: String, val amount: Long)
//@  post: instances are immutable value carriers; no behavior
//@  assigns: []
```

One stub; the manifest's instance roster decides how many files exist.

### 9. The instantiation manifest (§20.6)

One member of the family = one manifest: the fills in force, the instance rosters, and the
*declared* escape hatches.

```markdown
# Instantiation manifest — acme-telemetry @ corelab

## Fills

| Token | Value | Status |
|---|---|---|
| {{Provider}} | corelab | confirmed |
| {{Domain}} | telemetry | confirmed |

## Instances

- INSTANCE[{{Command}}]: StartCapture, StopCapture, ResetCapture

## Blocked targets

- BLOCKED[external/messages/commands/ResetCapture.kt]: upstream reset schema unpinned

## Scope reductions

- SCOPE-REDUCED[StartCaptureRoute.produces-when.PermanentException]: covered by shared envelope contract-tests
```

`BLOCKED` is the honest way for a planned file not to exist (§20.8-8); `SCOPE-REDUCED` is the
honest way for a clause to go untested (§20.8-9). Both carry a reason; neither is silent.

### 10. The honesty protocol: STOP, record, mark (§20.4, §20.7)

When the generating agent hits something the contracts cannot answer, it does **not** guess. It
stops on that item, takes a cited conservative reading, marks the spot in code, and records the
gap in the ledger:

```kotlin
// TEMPLATE-GAP: envelope unwrap helper missing from the template; inlined at the route
```

```markdown
# Gap ledger — acme-corelab run 1

- GAP[G-001]: envelope unwrap helper missing from the template; inlined at the route (marker: internal/StartCaptureRoute.kt:5)
```

The marker cites its file; the ledger entry `explains` the marker (a marker with no ledger
entry is drift — recipe 18). Later, an adversarial diff classifies every divergence as
**predicted** (a declared deviation), **catalogued** (a ledgered gap), or a **candidate
defect** — the trichotomy. Sanctioned marker kinds: `TEMPLATE-GAP`, `etalon deviation`,
`RECONSTRUCTED`, waivers.

For copy-verbatim stubs, deviations from the reference are declared up front:

```kotlin
// REALIZATION: copy-verbatim etalon/CaptureMapper.kt
# etalon deviation: etalon/CaptureMapper.kt:12 — reference logs the raw payload — canon drops the log line
```

### 11. Rules, pins, quirks — the oracle file

Family-wide truths that are not per-unit contracts live in the template oracle:

```markdown
- RULE[no-provider-prefix]: produced events never carry the provider prefix (§18.1 asymmetry) -> binds StartCaptureRoute.lynx.kt#StartCaptureRoute
- RULE[no-retry-actuation]: capture creation is actuation-adjacent; never auto-retry a non-idempotent call
- PIN[corelab-openapi]: corelab-api-docs@9f3c2e1
- QUIRK[captur-startd-key]: produced record key literal `captur-startd` keeps the (invented) CoreLab reference misspelling — wire-true, independently frozen
```

`RULE[...] -> binds <ref>` attaches the rule to the stub it constrains. `PIN` freezes an
upstream revision. `QUIRK` is the wire-true precedence rule made concrete: what is on the wire
wins over what looks correct — even a misspelling, frozen deliberately.

---

## Part III — The graph: Lynx Graph v1.0

### 12. Index a workspace

Declare the sources once:

```json
{
  "modules": [
    { "name": "telemetry",
      "template": "telemetry/template",
      "manifests": ["telemetry/instantiations/corelab.md"],
      "generated": "telemetry/generated",
      "reports": "telemetry/reports" }
  ],
  "codeowners": "CODEOWNERS"
}
```

Build (deterministic — building twice yields byte-identical files), watch, snapshot:

```bash
node indexer/out/cli.js --config lynx-sources.json --out /tmp/acme.db            # one-shot
node indexer/out/cli.js --config lynx-sources.json --out /tmp/acme.db --watch    # live, O(changed modules)
node indexer/out/cli.js --config lynx-sources.json --out /tmp/acme.db --snapshot # + register in .lynx-snapshots/
```

### 13. Serve it over MCP

```json
{ "mcpServers": { "lynx-graph": {
    "command": "node",
    "args": ["/path/to/tools/graph/mcp-server/out/server.js",
             "--db", "/tmp/acme.db",
             "--sources", "/path/to/lynx-sources.json"] } } }
```

`--sources` unlocks the guarded write path (`lynx_propose_change`) and the snapshot registry.
An agent bootstraps from `lynx_schema` alone — DDL, node/edge kinds, worked queries.

### 14. Ask anything: `lynx_query`

The graph is SQL. A few questions that keep earning their keep:

```sql
-- what's broken right now
SELECT * FROM lint_violations;
-- who produces / consumes each topic
SELECT n.name topic, e.kind, e.src FROM nodes n JOIN edges e ON e.dst=n.id WHERE n.kind='topic';
-- planned files that don't exist, and why
SELECT id, blocked_reason FROM targets WHERE exists_on_disk=0;
-- full-text search across contract text
SELECT node_id FROM fts WHERE fts MATCH 'idempotent';
-- every raises-clause with no covering test
SELECT * FROM lint_uncovered_clauses;
```

### 15. Provenance and blast radius

- `lynx_why(file, line)` — why does this generated line exist? Returns the edge path
  (method → contract → rules/clauses), not prose.
- `lynx_impact_of(ref)` — *what do I regenerate* if this fill/contract changes: the closed
  regeneration set of targets + tests.
- `lynx_org_impact_of(ref)` — *who do I break*: the closure also crosses topics
  (produces → topic → consumers) and returns affected modules and their CODEOWNERS.

### 16. Keep CI honest: `lynxctl`

The §20.8 checklist as a command: one tab-separated violation per line
(`invariant<TAB>file:line<TAB>message`), exit 0/1/2, `--drift` to append the fidelity surface,
deep dependency-cycle detection included. Wire it as a required check; the graph and the CLI
share the same SQL views, so they can never disagree.

### 17. Lint vs drift — two different alarms

**Lint** (= §20.8) is template discipline: presence, count, cross-reference. It blocks builds.
**Drift** (`lynx_drift`) is contract↔code fidelity: methods no contract knows, declared
signatures nothing realizes, markers no gap explains, contracts whose realizedBy file is gone.
Drift is the standing answer to "where do contract and code disagree right now" — triage it,
either by adding the missing contract or by ledgering the gap.

### 18. Classify a divergence in one call

Reviewer sees generated code differing from the reference:

```
lynx_explain_divergence(file: "internal/CaptureMapper.kt", line: 12,
                        observed: "log line absent vs reference")
→ { classification: "predicted", citations: ["marker:...#deviation@h..."] }
```

`predicted` cites the declared deviation, `catalogued` cites the gap ledger,
`candidate_defect` cites the contracts that *should* have covered it. The trichotomy, mechanized.

### 19. Time travel: snapshots and diff

Every build can register itself (`--snapshot`; the MCP server auto-registers its served
generation at startup). Then:

```
lynx_snapshots()          → registered generations, which one is live
lynx_diff("6d5ab886", "live")
```

Refs are a generation id, an unambiguous prefix, a file path, or `live`. The diff is
contract-level and classified: `new-topic`, `new-consumer`, `enum-member-added`,
`freeze-violated`, `layer-edge-introduced` — "what happened in the org this week", not
"600 files changed". Content-hash ids (graph spec §3.1) keep it quiet under pure line-shifts.

### 20. Change a contract through the guarded gate

`lynx_propose_change(file, new_text, citation)` is the only write path: the edit lands in a
staging copy (`.lynx-staging/<generation>/`) **iff** lint introduces no violation absent from
the baseline and the edit carries a citation. The result shows the diff classes and the blast
radius up front. It never touches generated code or the real tree — promotion stays a human
`git` action.

### 21. Polyglot

The heritage rule: parsers accept `//@` and `#@` everywhere; a language profile only decides
what tooling *emits*. So the same archetype method runs in Kotlin/Java (`//@`), Go (`//@`),
Rust (`//@`), and Python (`#@`):

```python
#@contract: SensorFeed.replay
#@  lang: python
#@  signature: def replay(since: int) -> list[Entry]
#@  post: result is sorted by entry.ts
```

Kafka topics are language-neutral, so the org hologram is polyglot for free:
kotlin → topic → go → topic → python is one graph.

---

## The one-page mental model

1. **Contract before code** — rich enough to regenerate the implementation (§7).
2. **Archetype, not copy-paste** — the invariant shape is template; every legal difference is a
   registered fill; a new member is an instantiation, never a fork.
3. **Closed surface** — a requirement that fits no declared variation point is a
   template-evolution request, not an excuse to improvise.
4. **Honesty over completeness** — when contracts run out, STOP: ledger the gap, mark the spot,
   take the cited conservative reading. Every later divergence classifies as predicted /
   catalogued / defect.
5. **Checks measure presence, count, cross-reference — never content fidelity.** That last mile
   is closed only by execution: compile, run the contract-tests, verify against recorded real
   exchanges. A green lint earns a build, not a deployment.
