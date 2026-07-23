---
name: module-refactor
description: >-
  Refactor a single existing module contract-first — a one-off module that is
  NOT becoming a family archetype: retrofit wire-true contracts onto the code
  as-is, freeze the published surfaces, map the blast radius, refactor the
  contract tree to the target state, then bring code into compliance with
  drift held at zero. Invoke for restructuring, de-tangling, or bringing a
  legacy module under contracts. Triggers on: "refactor this module", "bring
  this legacy module under contracts", "restructure without breaking
  consumers", "untangle this module".
metadata:
  type: workflow
---

# Module Refactor (one-off module, contract-first)

Refactoring contract-first means the **contract tree moves first and the code
follows** — never the reverse (`contract-first` Phase 2). For a module that
predates its contracts, that requires an extra retrofit step: you cannot
refactor safely what is not yet described truthfully.

Scope check before starting: this skill is for a module that stays a
**one-off**. If the refactor's real goal is "make this the template for its
siblings", stop and use `family-archetype` — extraction to an archetype and
in-place restructuring are different moves with different safety rules.

---

## Stage 0 — Say why, and what must not change

One paragraph each, written down before touching anything:

1. **Why refactor** — the concrete pain (tangled layers, untestable units,
   drifted naming), stated so "done" is checkable.
2. **The invariant surface** — everything external parties can observe and
   must keep observing unchanged: topics and payload shapes, published enums,
   REST paths, config keys, log fields dashboards read. This list becomes the
   frozen set in Stage 1.
3. **Behavior policy** — a refactor changes structure, not behavior. Any
   intended behavior change is a *separate* contract edit with its own
   review, never smuggled inside the restructuring.

---

## Stage 1 — Retrofit: annotate the code AS-IS (wire-true)

If the module lacks contracts (or they are stale), write them **describing
current reality, quirks included** — not the ideal you wish were there:

- One `//@contract:` per public unit: real signature, real `raises`, real
  `calls`, honest `assigns` (if it touches three tables, it says three
  tables). `//@messaging:`/`//@flow:` for every event-facing unit, from the
  real topics and real error routing.
- **Wire-true precedence**: published literals are recorded exactly, typos
  and all — the wire does not care what the literal should have been.
- Behavior you cannot determine from code + tests + recorded traffic gets a
  marker at the spot and a gap-ledger entry (§20.4) — an unknown corner is
  recorded, never guessed into the contracts.
- **Freeze the invariant surface now** (§19.1): everything listed in Stage 0-2
  becomes `frozen:`/`closed:` with a `compat:` note, *before* any
  restructuring. The freeze is the refactor's safety rail.

Derive **characterization tests** from the as-is contracts (Phase 3 form:
contract-derived assertions, recorded provider exchanges where the module
faces one). These pin today's behavior so tomorrow's restructuring is checked
against it.

---

## Stage 2 — Map the blast radius

Query the graph before deciding the target shape: what realizes each
contract, who consumes each produced topic, which modules import what
(`impact_of` / `org_impact_of`, cookbook 15), and where code already
disagrees with contracts (`drift`, cookbook 17–19). Pre-existing drift is
triaged **first** — refactoring on top of undocumented divergence moves an
unknown, and every finding here is either fixed or ledgered before Stage 3.

---

## Stage 3 — Refactor the contract tree to the target state

Design the end state purely at the contract level:

- Move, split, merge and rename **units in the contract tree**: new
  `//@module:` layering (`depends`/`restrictions` that enforce the untangled
  boundaries), new `//@graph:` inventory and dataflow, re-homed
  `//@contract:` blocks with tightened `assigns`/`calls`.
- The frozen surface does not move: outward-facing keys stay byte-identical;
  everything internal is fair game.
- **The diff between as-is and target contract trees IS the refactor plan** —
  reviewable, and mechanically checkable file by file. Get it agreed before
  changing code (same review gate as a greenfield design).

---

## Stage 4 — Bring the code into compliance

Execute in small steps, each ending green:

1. Restructure code to satisfy the target tree one contract cluster at a
   time — characterization tests stay green throughout (structure moved,
   behavior did not).
2. After each step, re-check drift for the touched scope: unrealized
   signatures and undeclared methods go to zero as the step's exit
   criterion, not at some final cleanup.
3. Where compliance work reveals the contracts were wrong about reality, the
   contract is corrected *first*, visibly, then the code follows — same
   direction as always, even mid-refactor.

---

## Stage 5 — Close

- **Drift zero** over the whole module: every contract realized, no
  undeclared public unit, no unexplained marker.
- **Frozen surfaces verified**: contract-tests prove topics, payloads, enums
  and config keys are byte-compatible with the pre-refactor recordings.
- The gap ledger of dark corners found en route ships with the change; each
  entry is resolved or explicitly carried forward with an owner.
- The Stage 0 "why" is re-read and answered: the stated pain is gone, or the
  residual is written down.

---

## Guardrails

- **Never refactor unannotated code.** Retrofit first; the as-is contracts
  are the safety net that makes the rest mechanical.
- **Structure and behavior never change in the same step.** A behavior change
  is its own contract edit with its own tests and review.
- **The freeze is non-negotiable**: an outward-visible delta during a
  refactor is an incident, not a nuance.
- **Contract wins, both directions**: found code the contract missed →
  contract catches up first; found contract the code violates → triage as
  drift, fix deliberately.
- **One-off stays one-off.** If a sibling appears mid-refactor, finish the
  in-place refactor, then extract the family deliberately
  (`family-archetype`) — never both moves at once.
