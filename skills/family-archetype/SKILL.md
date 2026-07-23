---
name: family-archetype
description: >-
  Author or update a reusable LynxContract ARCHETYPE for a FAMILY of same-shaped
  modules (the fixed shape + explicit variation points) so a new family member is
  an instantiation of a subset — never a copy of code. Invoke when starting a new
  member of an existing family (a provider adapter, a plugin handler), when
  you would otherwise copy/fork an existing module, or when defining/refining a
  family template. Triggers on: "new adapter", "new integration", "family template",
  "archetype", "scaffold from an existing module", "copy this module",
  "generalize this module".
metadata:
  type: workflow
---

# Family Archetype (contract-first, family-level)

**Do not copy code between family members.** Copying drags one member's specific
choices (its domain, topics, format, provider) into the next one, then forces a
surgical strip — that is the "sibling modules describe different things" drift.
Instead: **author ONE reusable LynxContract archetype per module *family***
(the invariant shape with explicit variation points), and build each concrete
member as an **instantiation of a subset** of it, generated on the template.

This is product-line engineering: one template, bounded variation points, each
member selects a configuration. Grammar: `lynxcontract-spec-kotlin-java-v1.3.md`
(§20 is the normative template layer). This skill *produces the archetype*; the
`contract-first` skill then *instantiates, generates, and tests* it.

Integration adapters are the worked example throughout (they are where the method was
battle-proven), but nothing here is adapter-specific: any set of same-shaped
modules — provider adapters, ETL handlers, webhook processors — is a family.

The product moment this serves: **"here is the template, here are the new
requirements — re-instantiate."** New requirements land as fill values in
declared variation points; a requirement no variation point can absorb is a
template-evolution request (evolve the archetype deliberately, then
re-instantiate) — never an improvised patch on one member.

---

## Families: one archetype each — NOT one for all

Survey the landscape first. A fictional example split:

| Family | Members | Mechanism |
|---|---|---|
| **REST + Avro events** | corelab, nordcore | HTTP client + Avro/registry |
| **REST + JSON events** | cloudcrm | HTTP client + JSON envelope |
| **Reactive streams** | othergrid | annotated in/out channels, multi-module |
| **SOAP** (outlier) | legacygrid | generated WSDL client + XML mapping |

A subset model only holds while the target is genuinely a subset. Outliers are
**not** subsets of the majority archetype — they get their own archetype. Never
stretch one archetype across families.

---

## Phase A — Identify the family and its invariant

1. Name the target member's family (your landscape table). If it fits none, it
   is a new family → author a fresh archetype, do not bend an existing one.
2. From the family's **reference member**, extract *only what is identical
   across the whole family*: the module layers, the shared entry/exit flow shape
   (e.g. `command → unwrap → map → provider call → map → event | failed-event | DLQ`),
   the error-routing classes, build plugins, naming rules (the §18-style profile
   constants of your project).
3. Write down what **varies** per member (these become variation points, not
   archetype content): domain, provider, command/event types, topic names,
   wire format, provider endpoints + mapping, DLQ names, schema versions.

---

## Phase B — Write the archetype contract

Produce a LynxContract skeleton (`*.archetype.lynx.*` or a `contracts/`
archetype file) that is **self-sufficient for codegen** (spec §7–§8):

1. **Fixed blocks (the invariant):** `//@module:` (layers, depends,
   restrictions), the `//@flow:` shape, a `//@messaging:` skeleton with the
   profile's error routing, the `//@graph:` module shape (§12.1), and
   `//@plugin:` if the family is registry-dispatched (§12.2).
2. **Variation points, marked explicitly** so instantiation knows exactly what
   to fill — e.g. `{{Domain}}`, `{{Provider}}`, `{{Command}}`, `{{Event}}`,
   `format: {{avro|json}}`, and a clearly-labelled **provider API slot** for
   endpoints/mapping. Register every fill (§20.2) with a one-line note on where
   its answer comes from (requirements questionnaire / Phase-0 schema sync /
   provider API docs).
3. Encode the profile constants once (§18 pattern): topic templates, format
   conventions, `idempotent: false` for actuation-adjacent calls.

---

## Phase C — Keep it minimal (carry nothing extra)

**The archetype carries ONLY the invariant + variation points. Nothing else.**

- If something is true for just one member, it is a **fill**, not archetype —
  push it out to a variation point.
- Anything the family's union does **not** share does not belong in the
  archetype.
- No baked-in domain field, no provider-specific endpoint, no member-specific
  quirk. A quirk table (regions, flags, special-casing — e.g. a
  `PROVIDER_QUIRK_TABLE` map) is allowed **only** as a declared, per-member
  variation point, never as hardcoded archetype body.
- Smell test: **could this line differ between two members of the same family?**
  If yes → it is a fill. Move it out.

A lean archetype is what makes instantiation mechanical: the fewer fixed
assumptions, the fewer wrong ones to inherit.

---

## Phase D — Hand off to instantiation (do not generate code here)

This skill stops at the archetype. To build a concrete member:

1. Select the family archetype.
2. Fill the variation points from: the **requirements questionnaire** (which
   domain / provider — the selector), **Phase 0** of `contract-first` (pulls the
   current upstream schema), and the **provider API** (OpenAPI / human
   knowledge) for the API slot.
3. Then follow the **`contract-first`** skill: Phase 0 sync → Phase 1/2 generate
   code from the template → **Phase 3 contract-test** against the real/recorded
   provider call. The provider fill is the one irreducible per-member variable,
   and Phase 3 is what proves it right (a hallucinated endpoint fails the
   recorded stub even on a green build).

---

## Guardrails

- **One archetype per family.** Outliers get their own; never stretch one
  across families.
- **Version-agnostic only for compatible evolution.** A schema version bump is a
  free fill (Phase 0 pulls current); a breaking change (new required field,
  changed topic) is a deliberate contract edit (`frozen`/`closed`, spec §19.1),
  not a subset selection.
- **The provider API is always an explicit fill**, never assumed — and always
  validated by the `contract-first` Phase 3 contract-test.
- **The archetype stays minimal.** Re-run Phase C's smell test on every edit:
  anything a sibling could differ on is a variation point, not body.
- Keep the archetype's `//@graph:` honest as the family evolves (spec §12.1).
