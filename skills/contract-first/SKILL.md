---
name: contract-first
description: >-
  MANDATORY workflow for ALL new code and edits in this project. Enforces
  contract-first development using LynxContract (`//@` annotations,
  see lynxcontract-spec-kotlin-java-v1.3.md). Invoke BEFORE writing or editing
  any Kotlin/Java source, adding a Kafka consumer/producer/route, or scaffolding
  a module. Triggers on: "add", "implement", "write", "edit", "refactor", "new
  adapter", "new route", "new handler", "change the contract", any code change.
metadata:
  type: workflow
---

# Contract-First Development

In this project **the contract is the source of truth, not the code**. Every
piece of new code and every edit starts from the LynxContract layer
(`//@contract:` / `//@module:` / `//@messaging:` / `//@flow:` blocks — full
grammar in `spec/lynxcontract-spec-kotlin-java-v1.3.md`). Code is
always brought *into compliance with* the contract, never the reverse.

Follow the four phases below **in order**. Do not skip Phase 0.

---

## Phase 0 — Pre-flight: prove the contract is not stale (MANDATORY)

Before touching anything, verify the local contract tree is current relative to
the upstream source of truth. **Do this every time, even for a one-line change.**

1. **Pull latest contracts via `gh`.** The upstream source of truth is the
   the host project’s pinned contract repos — e.g. `<org>/event-specs`
   (`asyncapi/<domain>/v<N>/<domain>-asyncapi.yml` + `.avsc`) and
   `<org>/payload-schemas`. Fetch the current versions:
   ```bash
   gh repo view <org>/event-specs --json defaultBranchRef
   gh api repos/<org>/event-specs/contents/asyncapi/<domain> --jq '.[].name'
   # or refresh the shallow clone under <kb>/repos/ if present:
   #   git -C <kb>/repos/event-specs pull --ff-only
   ```
2. **Diff upstream contracts against the local `//@` contract tree** for the
   modules you are about to touch. For each affected domain, compare:
   - topic names, envelope/Avro format, schema `fullName`
   - command/event payload fields
   - error routing / DLQ conventions
   against what the local `//@messaging:` / `//@contract:` blocks currently say.
3. **If the local contracts are stale → update the contract tree FIRST** (see
   Phase 2), and only then proceed. If they are current, note that explicitly.
4. **State the result before coding**: e.g. "Contracts synced against
   event-specs@<sha>; devices domain up to date" — or "devices-asyncapi
   added field X → updating local contract tree first."

> Never start implementation on an unverified contract. A stale contract silently
> produces wrong topics, wrong payloads, and broken error routing.

---

## Phase 1 — New module from scratch → write the bare contract skeleton first

When building something that does not exist yet (the full design procedure —
boundary, module law, freezes, self-sufficiency gate — is the `module-design`
skill; this phase is its minimum core):

1. Write a **contract-only skeleton** — *no implementation*. Use the
   contract-first form (spec §8): `//@module:` (layer, package, depends,
   restrictions) + one `//@contract:` per unit with `lang` / `signature` /
   `pre` / `post` / `assigns` / `raises` / `calls`, plus `//@messaging:` and
   `//@flow:` for any Kafka-facing unit.
2. The skeleton must be **self-sufficient for codegen**: the union of `//@`
   blocks should be enough to regenerate a functionally-equivalent
   implementation (spec §7 determinism rule). If you'd have to invent an
   undeclared dependency, topic, or side effect, the contract is incomplete —
   add the missing key rather than improvising in code.
3. Get the contract reviewed/agreed **before** writing any body.
4. Only then generate/write the implementation to satisfy the contract.

---

## Phase 2 — Editing existing code → update the whole contract tree first

*(For a structural refactor of a one-off module — retrofit, freeze, blast
radius, target tree — use the `module-refactor` skill; this phase is the
per-change rule it builds on.)*

When changing anything that already has code:

1. **Update the contracts first, across the entire affected tree** — not just the
   one file. A change usually ripples: a new command field touches the
   `//@messaging:` payload, the `//@contract:` pre/post, the `//@flow:` steps, and
   possibly the upstream AsyncAPI. Walk the tree and update **all** impacted `//@`
   blocks in one pass so the contract layer stays internally consistent.
2. If the change originates upstream (AsyncAPI/Avro), sync that first (Phase 0),
   then propagate into the local `//@` blocks.
3. **Then bring the code into compliance** with the updated contracts — change
   signatures, guards, mappings, topics, and error routing to match. The diff
   direction is always contract → code.
4. Verify no `//@` block still contradicts the code after the edit (topics,
   formats, exceptions, `assigns`).

---

## Phase 3 — Derive the contract-test from the contract (the last mile)

After the code satisfies the contract (Phase 1 or 2), generate the
**contract-test from the same `//@` blocks**. The contract is not only the
codegen brief — it is the **test oracle**: you do not invent assertions, you
read them off the contract. This is what turns "the code has the right shape"
into "the code provably works," and it is the one gate a hallucinated endpoint
or a quietly-weakened test cannot pass.

**Mechanical mapping — walk the contract keys, emit the test:**

| Contract key | Test element it produces |
|---|---|
| `//@messaging: consumes` (type/format) | the input message the test publishes (a fixture of that type) |
| `//@contract: pre` | how to build a **valid** input (happy path) AND an **invalid** one (negative test) |
| `//@contract: calls` | exactly which provider API to stub/record — nothing else may be touched |
| `//@contract: post` | the assertion on the result |
| `//@messaging: produces` | assert that topic received a message of that declared type |
| `produces … when: raises E` | negative test: trigger `E`, assert the `-failed` event is produced |
| `//@messaging: errors` / `dlq` | assert the message was routed to retry-topic / DLQ exactly as declared |
| `//@contract: assigns: []` | assert purity — no state outside `assigns` was touched |
| `//@messaging: idempotent: false` | assert there is **no** auto-retry (actuator call — double-actuation guard) |

**Always produce both levels:**
1. **Unit** — mock `calls`, verify mapping + error routing. Fast, deterministic.
2. **Contract-test (the real gate)** — replace the mock with a **recorded
   response from the real provider** (a WireMock stub captured once from the
   provider's sandbox), and run the route end-to-end over **Testcontainers Kafka
   (redpanda)**. This is the Acme test stack already on the classpath
   (`acme.test.commons` + `testcontainers.kafka` + `wiremock`).
   Because the stub reflects the *actual* API, a hallucinated endpoint or a wrong
   payload **fails here even though the build was green** — and since the
   assertion comes from the contract, it cannot be silently relaxed.

**Rules:**
- Assertions come from the contract keys, **not** from what the code happens to
  do. If code and test disagree, the contract decides (same direction as always).
- Every `produces … when: raises E` MUST have a matching negative test. A
  `raises` / `when` with no test is a coverage gap, not an optional extra.
- **Never weaken a generated assertion to make it pass** — no `assertTrue(true)`,
  no deleted checks, no `|| true`. If it fails, fix the code or fix the contract
  (contract first) — never the test.
- A new module (Phase 1) is **not done** until its contract-test exists and
  exercises the real/recorded provider call, not just a hand-written mock.

---

## Guardrails (apply in every phase)

- **Contract wins.** If code and contract disagree, the contract is right; fix the
  code (or, if the contract is genuinely wrong, fix the contract *first* and say so).
- **No orphan code.** New public functions / Kafka handlers / routes must carry a
  `//@` block. No silently-added topic, dependency, or side effect that isn't in a
  contract.
- **Keep the module graph honest.** If the module has a `//@graph:` block (spec
  §12.1), adding/removing/renaming ANY file MUST update it in the same change:
  the `files` inventory, `depends` edges, and `realizes`/`realizedBy` map. A file
  missing from the graph, or a dangling realization edge, is a lint failure.
  For plugin/registry modules (`//@plugin:`, §12.2) keep `members`, the registry
  entries, and the on-disk folders in sync.
- **Respect the Acme profile** (spec §18): topic naming
  (`<provider>.<domain>.command.<action>` in, un-prefixed `<domain>.event.<name>`
  out), envelope-json vs Avro, `Permanent`/`Retryable`/`Transient` error routing,
  `idempotent: false` for actuator calls (no auto-retry).
- **Honor `//@module:` boundaries** — never import from a package listed in
  `restrictions`; only from `depends`.
- Reference `lynxcontract-spec-kotlin-java-v1.3.md` for exact keys and grammar.
