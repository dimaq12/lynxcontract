# Skills — the method as agent procedure

Two agent skills that operationalize the spec's method (they are to §7/§8/§20 what a checklist
is to a regulation). Between them they cover the three product moments: **a new module**
(contract-first Phase 1), **a change to an existing one** (contract-first Phase 2–3), and
**re-instantiating a template under new requirements** (family-archetype → contract-first):

- **contract-first/** — the mandatory 4-phase workflow: Phase 0 (sync the host project's pinned
  upstream contract sources, reconcile the local `//@` tree), contracts before code, and Phase 3
  (derive the contract-test from the same `//@` blocks — the contract is the test oracle).
- **family-archetype/** — authoring a family template for any set of same-shaped modules
  (adapters, integrations, plugin handlers): extract the invariant from a reference member,
  declare every legal difference as a registered fill, keep the archetype minimal (the smell
  test: "could this line differ between two family members?"), hand off to contract-first.

**Two-layer model** (same as the spec's core-vs-profile split): these files are the language-level
canon with `<org>`/Acme placeholders. A host project binds them by keeping its own thin copy that
pins the real Phase-0 sources, test stack and paths — product bindings never flow back here.
