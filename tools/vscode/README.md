# LynxContract for VS Code

Language support for **LynxContract v1.3** — the contract annotation language for
Kotlin & Java (`//@` blocks) defined in `lynxcontract-spec-kotlin-java-v1.3.md`.

## Features

**Syntax highlighting** — injection grammar colors `//@contract:`, `//@module:`,
`//@messaging:`, `//@flow:`, `//@graph:`, `//@observability:`, `//@plugin:` blocks
inside Kotlin, Java and Markdown (`*.lynx.md`), plus a standalone `.lynx` language.
Both embedding forms are supported: `//@` line markers (§2.1) and KDoc/Javadoc
tags (§2.2). `{{Fill}}` tokens, `<property:X>` refs, `# etalon:` provenance
comments, `TARGET:`/`REALIZATION:` archetype headers (§20) are highlighted.

**Snippets** — `lynx-contract`, `lynx-module`, `lynx-messaging`, `lynx-flow`,
`lynx-graph`, `lynx-observability`, `lynx-plugin`, `lynx-contract-first`,
`lynx-stub-header`.

**Language server**
- *Semantic highlighting*: role-based tokens over the standard LSP legend —
  block kinds (keyword), block names (function), keys (property), topics/DLQ
  (namespace), payload types (type), exception classes (class), error routes and
  closed-enum values (enumMember), `{{Fill}}` (macro), `intent`/`doc` prose
  (comment), expression keywords/numbers. Works in any semantic-aware theme.
- *Completion*: block starters after `//@`, the block kind's closed key set,
  enum values (`format`, `ordering`, error routes, …).
- *Hover*: per-key documentation with the spec § reference.
- *Go to definition*: `realizes` / `realizedBy` edges and `path#contract` anchors (§7.1).
- *Outline & folding*: one symbol per block; blocks fold.
- *Diagnostics* (each carries its spec §):

| Code | Rule |
|------|------|
| `lynx.unknown-block` | block kind not in the v1.3 grammar (§3) |
| `lynx.unknown-key` | key outside the block's grammar — ignored per §19 |
| `lynx.bad-enum` | value outside a closed set (`format`, `ordering`, …) (§13.1) |
| `lynx.old-scope` | `old()` outside `post`/`inv` (§6) |
| `lynx.bang-bang` | `!!` in a contract expression (§5) |
| `lynx.bad-error-route` | route outside the closed §13.1 vocabulary |
| `lynx.unmatched-when` | `when: raises E` with no `errors` route for `E` (§13.3) |
| `lynx.nonidempotent-retry` | `idempotent: false` + `retry-topic` — double-actuation risk (§13.3) |
| `lynx.drop-rationale` | `drop` without an inline rationale comment (§13.3, v1.2) |
| `lynx.drop-vs-failed` | `drop` + failed event for the same exception (§13.3, v1.2) |
| `lynx.topic-naming` | topic outside the §18.1 Acme templates |
| `lynx.event-prefix` | produced event carries a provider prefix (§18.1 asymmetry) |
| `lynx.failed-suffix` | failure event not ending `-failed` (§18.1) |
| `lynx.dangling-realizes` | `realizes` target resolves to no contract (§7.1) |
| `lynx.missing-realization` | `realizedBy` file absent — not yet generated? (§7.1) |
| `lynx.graph-missing-file` | `//@graph: files` entry missing on disk (§12.1) |
| `lynx.unregistered-fill` | `{{Token}}` with no Fill Registry row (§20.2, §20.8) |

## Settings

- `lynxcontract.acmeProfile` (default `false`) — the example §18 topic-naming lints. Off by default: the core grammar knows no product; enable per workspace or ship your own profile.
- `lynxcontract.unknownKeySeverity` (`warning` | `information` | `off`).

## Build & run

```bash
npm install && (cd client && npm install) && (cd server && npm install)
npm run compile
npm test          # 46 contract-tests (node:test)
```

Press **F5** in VS Code (Run Extension) or package a VSIX:

```bash
npm run package   # npx @vscode/vsce package
code --install-extension lynxcontract-vscode-0.3.1.vsix
```

Smoke-test fixture: `examples/RegisterDeviceRoute.kt` (the §18.5 worked example;
its `idempotent: false` + `retry-topic` combination deliberately trips
`lynx.nonidempotent-retry` — the spec's own example violates its own §13.3 check).

## Contract tree

This extension is itself contract-first: `contracts/` holds its LynxContract
blocks (`extension-graph.lynx.md`, `server.lynx.md`, `client-syntax.lynx.md`);
every source file carries `//@realizes:` back-edges, and the tests are derived
from the contracts' `post`/`rules` clauses.
