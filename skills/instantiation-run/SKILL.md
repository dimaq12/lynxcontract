---
name: instantiation-run
description: >-
  Execute one full instantiation run of a family archetype (spec §20): sync the
  upstream pins, compile the run plan BEFORE any code, generate wave by wave
  under the honesty protocol, self-lint mechanically, and close with an
  adversarial diff and a run report. Invoke when building a concrete family
  member from its template. Triggers on: "instantiate the template", "new
  member of the family", "run the template", "battle run", "re-instantiate
  under new requirements".
metadata:
  type: workflow
---

# Instantiation Run (template → member, end to end)

One run = one concrete family member built from its archetype. The archetype
says *what* every file must be (`family-archetype` skill, spec §20); this skill
is the *how* of a single run — the stages, the artifacts each stage owes, and
the honesty rules that make the closing diff meaningful. A run may be one
agent or several (planner / generators / differ); the artifacts are the same
either way, and every hand-off happens through an artifact, never through
memory.

**Inputs:** the archetype tree (stubs + `00-family`/graph with
`generationOrder`), the instantiation manifest (§20.6 — fills, instance
rosters; `BLOCKED`/`SCOPE-REDUCED` declarations per §20.8-8/9), the template oracle (rules,
pins, quirks), and the upstream contract sources (Phase 0 of
`contract-first`).

**Deliverables (ship with the run):** the generated tree, the gap ledger, the
run report. **Scratchpad (never committed, never cited from generated code):**
the run plan, wave logs, lint notes.

---

## Stage 0 — Sync the upstream (contract-first Phase 0)

Run `contract-first` Phase 0 against the host project's pinned contract
sources and **record the result as the plan's first line**: source repo @
revision, which domains were verified, and *at what depth* (existence at the
pin vs field-by-field reconciliation — say which, honestly). A run that starts
on an unverified contract tree inherits every stale topic and payload it
contains.

---

## Stage 1 — The run plan (before any code)

Compile the archetype's `generationOrder` (§20.5) and the manifest's instance
rosters into a **run plan** in the scratchpad. The plan states:

1. **Wave tables, leaf → root**: every target file, its source stub, and its
   realization mode (`generate` | `copy-verbatim`). Multiplier stubs (§20.3)
   expand here — one row per instance, from the union of every producing
   contract's declared rows.
2. **Expected totals, with uncertainty declared**: "N generated + M
   copy-verbatim = T files". If two documents disagree about a roster, the
   count carries the disagreement explicitly ("±1 — see ledger entry") — never
   a silently rounded number.
3. **Exclusions, each with its reason** — the manifest's `BLOCKED` rows,
   restated so the completion check (§20.8-8) can match every planned-but-
   absent file to a logged reason.
4. **Execution-blocking deferrals** — work this run *cannot* do (no provider
   access, unpinned upstream schema): declared **now**, before any code, so
   the closing diff classifies it as *predicted*, not as a defect. An
   undeclared deferral discovered at diff time is a defect by definition.

Planning is already contract work, so the honesty protocol applies from here:

- An ambiguity met while planning is a **gap-ledger entry at planning time**
  (§20.4) — planning gaps are first-class citizens of the ledger.
- A stub↔manifest **roster disagreement** found here triggers the
  roster-disagreement rule (§20): physical evidence (the stub tree, the cited
  reference) is re-checked and wins; neither document wins by seniority; the
  resolution is ledgered. Never a silent guess.
- The plan itself is bookkeeping: wave labels, gap ids, and scratch-file names
  never leak into generated code (marker hygiene, §20.7).

---

## Stage 2 — Generation waves (leaf → root)

Execute the plan wave by wave. Per target:

- **`generate`**: realize the stub's contract — signature, pre/post, raises,
  calls, messaging, flow — inventing nothing. If the contracts cannot answer
  something: **STOP on that item**, take the cited conservative reading, place
  the sanctioned marker at the exact spot, record the gap in the ledger
  (§20.4). Then continue with the next item — an honest gap is cheap, a silent
  guess is not.
- **`copy-verbatim`**: byte-identical to the pinned source. Any intended
  difference exists only as a declared `etalon deviation` line — an undeclared
  delta in a copy-verbatim target is always a defect.
- Generated files carry **no provenance or bookkeeping comments**; the
  sanctioned generation-time comment set is closed and lives in the oracle
  (§20.7).
- In-tree authority: imports, helper signatures and constants used by
  generated files are cross-checked against the copy-verbatim files of the
  **same generated tree**, not against memory of the reference.

After the last wave, run the family's **formatter** over the whole tree
(§20.7) — formatting leaves the defect surface before anything is linted or
diffed.

---

## Stage 3 — Mechanical self-lint (§20.8)

Run the full §20.8 checklist; the run-critical checks:

- **1 — inventory bijection**: stub tree == inventory list == plan entries.
  Three lists, one bijection; any orphan in any direction is a finding.
- **8 — output-target completion**: every planned target exists on disk OR
  carries a logged blocking reason. Missing-with-neither is a defect.
- **9 — test-case completion**: per generated test file, declared
  `raises`/`produces-when` clauses == generated negative cases + per-clause
  logged scope reductions. An aggregate "scope reduced" note does not satisfy
  the identity.
- **10 — cross-stub consistency**: for every generated file, grep the
  citations *other* stubs make into it (config keys, schema components,
  constructor params, topic keys) and verify each present. Presence-in-plan
  does not imply internal completeness.

**Remediation rigor** (§20.7): a lint-driven fix is generation activity — it
carries the same citation duty as first-pass generation, and copy-verbatim
targets are re-verified byte-identical after ANY fix. An uncited remediation
is a defect even when its diagnosis was correct.

---

## Stage 4 — Close: adversarial diff and run report

- Diff the generated tree against the **reference member** where one exists;
  where none does, the gate is the `contract-first` **Phase 3 contract-test**
  (recorded provider exchanges + the real messaging stack in containers).
- Classify **every** divergence with the trichotomy: **predicted** (a declared
  deviation or declared freedom) / **catalogued** (a ledgered gap) /
  **candidate defect**. Undeclared and unledgered means defect-candidate — the
  classifier never invents excuses post-hoc.
- State the **counting rules once**, in the report, and apply them uniformly:
  what a grouped finding is, what is excluded (formatting — already removed by
  the Stage 2 formatter), and what counts toward the defect score.
  Declared-but-correct guesses are process credit, never defects — but they
  stay in the report as real divergence surface.
- **Feed the lessons back**: recurring gap classes become oracle
  clarifications or template evolution (deliberate, versioned — the
  `family-archetype` guardrails); insufficiencies of the *spec* go to the
  spec-feedback file, never silently patched into the spec.

The scope note of §20.8 applies to the whole run: checks and diffs measure
presence, count and cross-reference — content fidelity is closed only by
execution (compile, run the generated tests, verify against recorded
exchanges). A run whose checks all pass has earned a build, not a deployment.

---

## Guardrails

- **Plan before code — always.** A run with no plan artifact has no honest way
  to declare deferrals, and every deferral it needed becomes a defect at diff
  time.
- **The ledger is append-only during a run**: entries are resolved by later
  entries, never edited away.
- **No roster is resolved by seniority** — physical evidence wins, and the
  resolution is written down.
- **Counts carry their uncertainty.** "53 (±1, see GAP-…)" is honest; "54" that
  quietly absorbed a disagreement is not.
- **Scratchpad and deliverables never mix**: the plan and wave logs stay out
  of the repo; the ledger and run report ship with the code.
