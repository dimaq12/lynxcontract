# Skills — the method as agent procedure

Five agent skills that operationalize the spec's method (they are to §7/§8/§20 what a checklist
is to a regulation). Two are the **foundation** every other skill leans on; three are **mode
skills**, one per product moment:

**Foundation:**

- **contract-first/** — the mandatory 4-phase workflow: Phase 0 (sync the host project's pinned
  upstream contract sources, reconcile the local `//@` tree), contracts before code, and Phase 3
  (derive the contract-test from the same `//@` blocks — the contract is the test oracle).
- **family-archetype/** — authoring a family template for any set of same-shaped modules
  (adapters, integrations, plugin handlers): extract the invariant from a reference member,
  declare every legal difference as a registered fill, keep the archetype minimal (the smell
  test: "could this line differ between two family members?"), hand off to instantiation-run.

**Mode skills (pick by product moment):**

- **module-design/** — moment 1, *"build me a new module"*, greenfield: carve the boundary,
  write the full contract skeleton (module law, unit contracts, messaging, observability,
  frozen surfaces), prove it self-sufficient for codegen (§7), agree it, then generate.
- **module-refactor/** — moment 2, *"change/refactor this module"*, for a one-off that is NOT
  becoming an archetype: retrofit wire-true contracts onto the code as-is, freeze the published
  surfaces, map blast radius via the graph, refactor the contract tree to the target state,
  bring code into compliance with drift at zero.
- **instantiation-run/** — moment 3, *"re-instantiate the template"*: one full run end to end —
  sync the upstream pins, compile the run plan *before any code* (waves, realization modes,
  declared counts, exclusions, deferrals), generate wave by wave under the honesty protocol,
  self-lint mechanically (§20.8), close with an adversarial diff + run report, feed the lessons
  back into the oracle/template.

**Two-layer model** (same as the spec's core-vs-profile split): these files are the language-level
canon with `<org>`/Acme placeholders. A host project binds them by keeping its own thin copy that
pins the real Phase-0 sources, test stack and paths — product bindings never flow back here.
