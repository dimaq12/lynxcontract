---
name: module-design
description: >-
  Design a brand-new module from scratch, contract-first (spec §8): carve the
  boundary, write the complete contract skeleton — module law, unit contracts,
  messaging, observability, frozen surfaces — prove it self-sufficient for
  codegen (§7), get it agreed, and only then generate. Invoke when a module
  does not exist yet and no family archetype covers it. Triggers on: "design a
  new module", "new service from scratch", "greenfield module", "spec out this
  module before we build it".
metadata:
  type: workflow
---

# Module Design (greenfield, contract-first)

A new module is **designed in contracts, not in prose or in code**. The
deliverable of this skill is a contract skeleton rich enough that an agent can
generate the implementation *and* the contract-tests from it, inventing
nothing (§7 determinism). Code appears only after the skeleton is agreed.

This is the deep form of `contract-first` Phase 1. Use it when nothing exists
yet; if the new module is a *second same-shaped member of something* — a new
provider adapter, another plugin handler — **stop here and switch to
`family-archetype`**: the second sibling is where a family begins, and copying
a design is how drift begins.

---

## Stage 0 — Boundary before blocks

Answer in one paragraph each, before writing any `//@`:

1. **What does this module own?** One module = one reason to change. Name the
   single responsibility and the data it is authoritative for.
2. **What does it talk to?** Upstream commands/events consumed, events
   produced, REST dependencies, stores. Every edge named here must reappear
   as a declared contract edge below — an edge you cannot name yet is a
   requirements gap, not a detail to discover while coding.
3. **What must never leak?** Packages other modules must not import, data that
   must not appear in logs (`privacy:`, `mustNotLog`).

Then run `contract-first` **Phase 0**: pin the upstream contract sources
(schema catalog, payload schemas) that the design must match, and record the
pin. Designing against unpinned upstream is designing against a guess.

---

## Stage 1 — Module law: `//@module:` + `//@graph:`

Open the skeleton with the module-level facts (spec §12, §12.1):

- `//@module:` — `layer`, `package`, `depends` (the ONLY packages units may
  import from), `restrictions` (the explicit never-import list), `doc`.
- `//@graph:` — the planned **file inventory** (every future file, before any
  exists), `depends` edges between them, and the dataflow sketch (inline
  mermaid). The graph is the design's table of contents; a unit you cannot
  place in it yet is a unit you have not designed yet.

Decompose by flow, not by kind: start from each external trigger (a consumed
command, an API call, a timer), trace it to its outputs, and cut units where
the data changes meaning — entry point, transformation, outbound call,
persistence. Name every unit now; the inventory is closed by design, extended
only by editing the design.

---

## Stage 2 — Unit contracts: one `//@contract:` per unit

For every unit in the inventory (spec §4, §8):

- `signature` — exact, typed, final. The signature is the API design.
- `intent` + `rules` (§4.1) — *why it exists* and the un-checkable business
  rules an implementation must honor. Machine keys carry the checkable part.
- `pre` / `post` / `raises` — the behavioral envelope. Every failure mode gets
  a named exception and, for event-facing units, a declared route.
- `assigns` — state honesty: `[]` means pure, and codegen will hold it to it.
- `calls` — every outbound collaborator. An undeclared collaborator is the #1
  self-sufficiency failure (Stage 4 will catch it — cheaper to declare now).

Event-facing units additionally carry `//@messaging:` (topics via constants,
format, group, ordering, `idempotent`, error routing, DLQ — §13) and `//@flow:`
(from → through → to, `privacy:` — §14). Units with operational surface carry
`//@observability:` (§14.2): `logFields`, closed `outcome` set, `mustNotLog`.

---

## Stage 3 — Compatibility surfaces: freeze what others will see

Anything published — status enums, event-name sets, payload vocabularies —
is compatibility-critical from day one (§19.1): mark it `frozen:`/`closed:`
with a `compat:` note **in the design**, before the first consumer exists.
Freezing at design time costs one line; freezing after a consumer appears
costs a migration.

---

## Stage 4 — The self-sufficiency gate (§7)

Before review, attack your own skeleton with the determinism question: **could
a fresh agent regenerate a functionally-equivalent module from these contracts
alone?** Concretely:

- Every collaborator, topic, config key and side effect used anywhere is
  declared somewhere. If you would have to *invent* one while implementing,
  the contract is incomplete — add the missing key, do not improvise later.
- Every `raises` has a triggering condition stated; every `produces … when:`
  is derivable; every enum the module publishes is enumerated.
- The `//@graph:` inventory, the unit list, and the `depends` edges agree.

What the contracts deliberately leave open, say so explicitly (declared
freedom, §20.7-style) — unstated freedom does not exist.

---

## Stage 5 — Agree, generate, prove

1. **Review gate**: the skeleton is reviewed and agreed *as the design
   document* — before any body is written. Design disagreements are cheap
   here and expensive after generation.
2. Generate the implementation from the skeleton (`contract-first` Phase 1
   step 4) and derive the tests from the same blocks — **Phase 3**: unit level
   plus the contract-test against recorded provider exchanges.
3. Index the module into the graph and hold it at **zero drift** from day one:
   no unrealized signatures, no undeclared methods, no orphan units.

---

## Guardrails

- **No orphan code, from the first commit**: every public unit, handler and
  route carries a `//@` block, or it does not merge.
- **The skeleton is the design doc.** Prose documents may summarize it; they
  never override it.
- **Second sibling → family.** The moment a same-shaped module appears on the
  roadmap, this design becomes archetype input (`family-archetype`), not
  copy-paste source.
- **Requirements gaps are recorded, not absorbed**: an unanswerable design
  question is written down and assigned, never silently resolved by an
  implementation choice.
