# History

The public git history of this repository is deliberately a single commit: the language was
extracted from private working trees, and the extraction rule ("this repository knows only
fictional material") applies to history as much as to files. This document is the evolution
record that a fuller history would have carried. The one externally verifiable anchor is the
origin spec: **v0.2, dated 2025-07-05, first published in
[`dimaq12/lambda`](https://github.com/dimaq12/lambda/blob/main/docs/spec.lynx.md)** — carried
verbatim in `heritage/`.

## Spec lineage

| Version | Date | What it added |
|---|---|---|
| **v0.2** (Python/Go) | 2025-07-05 | The core: `#@`/`//@` markers, `pre`/`post`/`inv`/`raises`/`assigns`, the side-effect-free expression language, VERIFY/ASSUME/OFF modes, module & dataflow blocks. Published in `dimaq12/lambda`; mirrored here in `heritage/`. |
| v0.3 (concurrency) | 2025 | Concurrency contract keys (goroutines/channels lineage) later absorbed into the JVM §11. |
| **v1.0-jvm** | 2026 | The JVM port: Kotlin/Java placement rules, KDoc/Javadoc tag form, codegen-first reframing (a contract is a buildable brief), `//@messaging:` for Kafka, contract-first module spec (§8). |
| v1.1 | 2026 | Field-proven patterns from the Atlas TypeScript platform: `INTENT`/`BUSINESS LOGIC` doc shape, `realizes`/`realizedBy` realization map, `//@graph:`, `//@plugin:` registries, `//@observability:`, inline mermaid, topic-constant helpers, freeze/closed-enum rules (§19.1). |
| v1.2 | 2026 | The **Archetype & Template Profile (§20)**: fill tokens, stub realization modes, multipliers, provenance markers, generation ordering, mechanical lint invariants. Proven by battle runs 1–2. |
| **v1.3-jvm** | 2026-07-23 | §20 hardened with the lessons of runs 1–5: the completion-check family (8–10), marker hygiene, remediation rigor, roster-disagreement rule, wire-true literal precedence, instance-source unions, mandatory output formatting. |

## Lynx Graph lineage

| Version | Date | What it added |
|---|---|---|
| v0.1 | 2026-07 | Design spec: graph model, SQLite storage, MCP tool contracts (`schema`/`query`/`why`/`impact_of`/…). |
| v0.2 | 2026-07-23 | The monorepo hologram (§6): org-wide topic dedup, layers, ownership, compat surfaces, the time axis (`diff`). |
| **v1.0** | 2026-07-23 | Shipped with the reference implementation (`tools/graph/`): every v0.2 reading blessed or replaced, content-hash ids (§3.1), the snapshot registry (§6.4), CODEOWNERS globs, 18 tools, 85 contract-derived tests, determinism proven by build-twice byte-compare. Patch bumps within v1.0 (index/view tuning) are recorded in `SPEC-FEEDBACK.md`. |

## The battle runs

Six isolated instantiation runs of the adapter-family template: each run was a fresh agent
session rebuilding a multi-hundred-file module family from contracts alone under the honesty
protocol, followed by an adversarial diff classifying every divergence (predicted / catalogued /
defect). Module specifics are out of scope here; what shaped the spec was the *classes*
of failure:

| Run | Purpose | Dominant defect classes found → rule they produced |
|---|---|---|
| 1 | First full instantiation of the v1.2 template | Missing completion discipline: silently absent planned files, untested `raises` clauses → completion checks §20.8-8/9 |
| 2 | Template fixes re-proven | Marker abuse: bookkeeping tokens smuggled inside sanctioned comments → marker hygiene (§20.7) |
| 3 | First v1.3-candidate run | Over-eager "remediation" rewriting neighbors of a defect → remediation rigor |
| 4 | Hardened-template run | Roster/manifest disagreement resolved by silent invention → roster-disagreement rule; wire-true literal precedence (frozen quirks beat mechanical substitution) |
| 5 | Near-frozen template | Instance-source unions; residual formatting noise → mandatory output formatter |
| 6 | Verification on the frozen template | No new rule classes — measured inter-session variance (the text-iteration asymptote); grouped defect causes ≈ flat vs run 5 |

Grouped defect root causes fell roughly threefold from run 1 to the asymptote.

## Tags

Releases are tagged on the single public commit: `spec-v1.3-jvm`, `lynx-graph-v1.0`.
