**LynxContract — Unified Contract Annotation Language for Kotlin & Java (v1.3-jvm, 2026-07-23)**

> JVM/codegen-first port of LynxContract (from the Python/Go spec v0.2 core + v0.3 concurrency).
> **Primary purpose here:** give an LLM enough machine- and human-readable context to **assemble a whole module from its contract** — contracts may exist *before* any code (contract-first codegen). The same annotations double as documentation and as input for graph/dependency tooling.

> **v1.3** hardens §20 with the lessons of five full battle runs (grouped defect causes falling
> roughly threefold before flattening into the text-iteration asymptote):
> the closed sanctioned-comment set with the RECONSTRUCTED fixture marker, the three-check
> completion family (target existence · test-case identity · cross-stub consistency), MARKER
> HYGIENE, REMEDIATION RIGOR, the ROSTER DISAGREEMENT rule, wire-true literal precedence (frozen
> quirks beat mechanical substitution), multiplier instance-source unions, independently-frozen
> literal triples, declared-freedom style clauses, manifest verification-status labels, and a
> mandatory output formatter. All additive; §20's v1.2 text is amended in place.

> **v1.2** adds the **Archetype & Template Profile (§20)** — the notation layer proven by the
> adapter-family template across two full isolated instantiation runs ("battle runs") of a
> full adapter module: fill tokens, stub realization modes, multipliers, provenance markers,
> generation ordering and the mechanical lint invariants. It also adds the `drop` error route to
> §13 (previously the callback/event-triggered flow shapes had to hide it in comments). All
> changes are additive; v1.1 blocks are unchanged.

> **v1.1** folds in field-proven patterns from a mature contract-first codebase (the Atlas platform, TypeScript: its hub module + its `enrichers` ETL registry):
> `INTENT`/`BUSINESS LOGIC` doc shape, **realizes/realizedBy** contract↔file mapping (§7–§8), a dedicated **module-composition graph** block `//@graph:` (§12.1), an **observability contract** `//@observability:` (§14.2), a **plugin/registry** block `//@plugin:` (§12.2), inline `mermaid` in contracts (§14), topic/channel **constant helpers** and **freeze / closed-enum** rules for schema evolution (§13, §19.1).

---

## 0 What changed vs the Python/Go spec

| Area | Python/Go original | This JVM edition |
|------|--------------------|------------------|
| Target languages | Python ≥3.9, Go ≥1.22 | **Kotlin ≥1.9 (JDK21), Java ≥17** |
| Markers | `#@` / `//@` | **`//@`** (both langs) + **KDoc/Javadoc** tags form |
| Primary goal | Runtime contract checking | **Codegen context for LLMs** (checking is optional, §16) |
| Concurrency (§11) | goroutines / channels | **coroutines, Flow, Channel, structured concurrency, Java executors/CompletableFuture, Mutiny `Uni`/`Multi`, `@Blocking`** |
| Messaging | — (none) | **new `//@messaging:` block** — Kafka topics, envelope/Avro, groups, ordering, idempotency, error routing (§13) |
| Data-flow nodes | func/module/db | **+ `topic`, `route`, `rest`, `registry`, `schema`** (§14) |
| Contract-first | — | **new standalone module spec** — describe a unit to be generated with no code yet (§8) |
| Project fit | generic | **generic core + Acme profile** (§18) |

The **core** (§1–§10) stays language-agnostic and portable. Everything Acme-specific is isolated in the profile (§18) so the language itself travels to any Kotlin/Java + Kafka codebase.

**New in v1.1** (all additive; v1.0 blocks are unchanged):
| Addition | Where | Origin idea |
|----------|-------|-------------|
| `INTENT` / `BUSINESS LOGIC` doc shape per element | §4.1 | Atlas contracts — every type states *why* + *the rules* codegen must honor |
| `realizes` / `realizedBy` contract↔file map | §7, §8 | Atlas "Realization map" — which file implements which contract, both directions |
| `//@graph:` module-composition graph | §12.1 | `atlas-graph.contracts.ts` — canonical file inventory + dep graph + dataflow, "update in the same change" rule |
| `//@plugin:` registry-module contract | §12.2 | `enrichers` ETL — uniform handler interface + one-line registry; "new module = new folder + one registry entry" |
| `//@observability:` structured-logging contract | §14.2 | Atlas "Observability contract" — mandated log fields + `outcome` enum + `duration_ms` |
| inline ```mermaid``` inside contracts | §14 | Atlas embeds the dataflow diagram directly in the contract |
| topic/channel **constant helpers**; **freeze / closed-enum** | §13, §19.1 | Atlas channel helpers + "enum values freeze once published" |

---

## 1 Purpose & Design Goals
- **One syntax, two JVM languages** — works in *Kotlin ≥1.9* and *Java ≥17* without touching either toolchain.
- **Codegen-first / LLM-friendly** — a plain-text YAML-ish fragment an LLM parses trivially and can *generate code from*. A contract is a buildable brief, not just an assertion.
- **Contract-first allowed** — a contract can exist with **no implementation yet**; §8 makes a block self-describing enough to emit the module.
- **Zero-cost / zero-intrusion** — pure comments. Nothing to compile, no dependency, no runtime unless you opt into §16.
- **Incremental adoption** — whole file, class, function, or a single line.
- **Kafka-native** — messaging and data-flow are first-class (§13, §14), because event-driven modules are defined as much by their topics as by their signatures.

---

## 2 Notation & Placement

Two interchangeable embedding forms. Pick per file; tools accept both.

### 2·1 Line-comment marker `//@` *(primary)*
| Language | Marker | Placement |
|----------|--------|-----------|
| **Kotlin** | `//@` | Immediately before `fun` / `class` / `object` / `interface` / file top |
| **Java**   | `//@` | Immediately before method / `class` / `interface` / package decl |

A block **begins** with `//@contract:` (or `//@module:`, `//@messaging:`, `//@flow:`) and continues while each subsequent line starts with `//@`.

```kotlin
//@contract:
//@  pre: amount > 0 && this.capacity >= amount
//@  post: this.capacity == old(this.capacity) - amount
//@  raises: InsufficientCapacityException if amount > this.capacity
//@end
fun reserve(amount: Long) { ... }
```
The optional `//@end` sentinel is only needed when mixing with other block comments.

### 2·2 KDoc / Javadoc tag form *(alternative)*
For teams that want contracts rendered by Dokka/Javadoc. Same keys, prefixed with `@`.

```kotlin
/**
 * Reserves [amount] units on the device.
 *
 * @contract
 * @pre  amount > 0 && capacity >= amount
 * @post capacity == old(capacity) - amount
 * @raises InsufficientCapacityException if amount > capacity
 */
fun reserve(amount: Long) { ... }
```

Both forms are **semantically identical**. `//@` is recommended as the default because it never collides with existing doc comments and survives contract-first files that have no declaration to attach to yet (§8).

### 2·3 Optional Kotlin/Java annotation mirror *(opt-in, not required)*
When you want the contract visible to IDE/reflection/KSP, you *may* keep a parallel annotation. It is **advisory** — the `//@`/KDoc text is the source of truth, and after codegen it is usually redundant (the model already holds the contract in context).

```kotlin
@LynxContract // marker only; expressions live in the //@ block above
//@contract:
//@  pre: amount > 0
fun reserve(amount: Long) { ... }
```

---

## 3 Contract Kinds

| Kind | Block | Attaches to | Purpose |
|------|-------|-------------|---------|
| **Behavioral** | `//@contract:` | function / method / class | pre/post/inv/raises/assigns + concurrency |
| **Architectural** | `//@module:` | class / file / package | layer, allowed deps, exposed API, restrictions |
| **Messaging** | `//@messaging:` | consumer/producer/route/class | Kafka topics, envelope/schema, group, ordering, errors |
| **Data-flow** | `//@flow:` | function / route / class | source → steps → sink graph across topics, REST, DB |
| **Graph** *(v1.1)* | `//@graph:` | module root / dedicated `*-graph` file | canonical file inventory + dependency graph + dataflow for a whole module (§12.1) |
| **Observability** *(v1.1)* | `//@observability:` | operation / service / class | mandated structured-log fields, `outcome` enum, `duration_ms` (§14.2) |
| **Plugin** *(v1.1)* | `//@plugin:` | registry root / plugin module | uniform module interface + registration point for pluggable modules (§12.2) |

A single declaration may carry more than one kind (e.g. a Kafka handler has both `//@messaging:` and `//@flow:`).

---

## 4 Core Keys (behavioral)
| Key       | Type       | Meaning |
|-----------|------------|---------|
| `pre`     | list/expr  | Conditions the caller must satisfy. Codegen ⇒ guard/`require(...)`. |
| `post`    | list/expr  | Conditions the callee guarantees on return. Codegen ⇒ target of the impl / `check(...)`. |
| `inv`     | list/expr  | Invariants holding before **and** after each public method (on a class). |
| `raises`  | map        | `ExceptionType: predicate` — allowed exceptions & when they occur. Codegen ⇒ error branches. |
| `assigns` | list       | Fields/state the routine may mutate (empty ⇒ **pure**). Codegen ⇒ nothing else is touched. |
| `returns` | type/expr  | *(new)* Declared result type/shape. Helps codegen when there is no signature yet (§8). |

Any key may be omitted. Single-line shorthand: `//@pre: x != 0`.

**Kotlin/Java mapping used by codegen (§7):**
- `pre` → `require(<expr>) { "..." }` (Kotlin) / `if (!(expr)) throw new IllegalArgumentException(...)` (Java).
- `post` → the property the generated body must establish; optionally `check(<expr>)` in VERIFY mode.
- `inv` → asserted at the end of every public method.
- `assigns: []` ⇒ generate a pure function (no field writes, no I/O).

### 4.1 Documentation shape: `INTENT` + `BUSINESS LOGIC` *(v1.1)*

Field-proven in the Atlas module: **every non-trivial contract element carries two things** — *why it exists* and *the rules an implementation (or codegen) must honor*. Machine keys (`pre/post/...`) express the checkable part; this shape captures the intent and the un-checkable rules an LLM needs to generate correct code.

```kotlin
//@contract:
//@  intent: >
//@    Reserve capacity units on the device. Callers use this for the single-device
//@    reservation path; batch reservation has its own contract.
//@  rules:                              # BUSINESS LOGIC — codegen MUST honor
//@    - Capacity never goes negative; a request exceeding free capacity raises, never clamps.
//@    - Reservations are idempotent per requestId; a redelivery MUST NOT double-reserve.
//@    - Persistence side-effects MUST NOT touch the usage-history table.
//@  pre: amount > 0 && this.capacity >= amount
//@  post: this.capacity == old(this.capacity) - amount
fun reserve(amount: Long) { ... }
```

| Key | Type | Meaning |
|-----|------|---------|
| `intent` | string | *Why* this unit exists and when to use it (one short paragraph). |
| `rules` | list | *BUSINESS LOGIC* — constraints codegen must satisfy that `pre`/`post` cannot express (compat, side-effect boundaries, "do NOT ..."). |

Guidance: keep `rules` imperative and testable-in-spirit ("MUST", "NEVER", "only when"). They are the un-checkable half of the contract and the highest-signal input for an LLM assembling the body.

---

## 5 Expression Language (JVM-flavored)

A tiny, language-agnostic subset. Semantics follow Kotlin where the two languages differ.

```ebnf
expr       = disjunction
old_call   = "old(" ident ")"            ; value at routine entry
result_kw  = "result"                     ; return value (alias: the KDoc @post subject)
ident      = /[A-Za-z_][A-Za-z0-9_]*/
```

Supported operators & built-ins:
- Arithmetic `+ - * / % `, comparisons `== != < <= > >=`, boolean `&& || !` (aliases `and or not` also accepted).
- **Nullability** (JVM-critical): `x != null`, safe-call `x?.field`, elvis `x ?: default`, non-null assert `x!!` **not** allowed in expressions (side-effect/throw).
- Membership `in`, ranges `x in 1..10`, `x in a until b`.
- Collections: `c.size`, `c.isEmpty()`, `c.isNotEmpty()`, `c.contains(x)`, `c.all { ... }`, `c.any { ... }`, indexing `c[i]`, sublists `c.subList(i, j)`.
- Quantifiers: `forall v in iter: expr`, `exists v in iter: expr` (desugar to `all`/`any`).
- `len(x)` accepted as an alias of `.size`/`.length` for portability.
- Receiver: `this` (Kotlin/Java). Kotlin lambda implicit `it` is allowed inside quantifier bodies.
- `old(x)` snapshot (allowed only in `post`/`inv`), `result` keyword.

**Side-effect-free!** Expressions must not mutate state, perform I/O, or throw.

---

## 6 Scoping & Nullables
- Function params & locals are visible in `post`.
- `old()` is allowed only in `post` and `inv`.
- In a method, `this` refers to the current object; `old(this.field)` is allowed.
- **Nullability contracts are load-bearing on the JVM.** Prefer explicit `x != null` in `pre` over relying on a platform type. A `pre: user != null` tells codegen the parameter is non-null and no defensive `?.` is needed downstream.

---

## 7 Codegen Semantics — how an LLM assembles a module

This is the heart of the JVM edition. Given a contract, a generator (or an agent) reads the keys as a **build order**:

| Signal | Generator action |
|--------|------------------|
| `pre` | Emit input guards first; assume they hold in the body. |
| `post` | The body must be written so every `post` clause is true on the happy path. |
| `raises: {E: p}` | Emit a branch that throws `E` exactly when predicate `p` holds. |
| `assigns` | Only these fields/resources may be written; everything else is read-only/pure. |
| `returns` | The function signature/result type when no code exists yet. |
| `//@module: depends` | Only import from these; never from `restrictions`. |
| `//@messaging:` | Wire the consumer/producer, (de)serialize the declared envelope/schema, route errors per §13. |
| `//@flow:` | Order the internal steps; each `through` node becomes a call/route stage. |
| `spawns/receives_from/sends_to` (§11) | Launch the declared coroutines/channels; respect `synchronized`. |

**Determinism rule for codegen:** the union of all `//@` blocks on a unit should be *sufficient* to regenerate a functionally-equivalent implementation. If a generator would have to invent an un-declared dependency, topic, or side effect, the contract is under-specified — add the missing key.

### 7.1 Realization map — `realizes` / `realizedBy` *(v1.1)*

The Atlas module keeps an explicit, two-directional map between contracts and the files that implement them ("`atlas.controller.ts` **realizes** `atlas-http.contracts.ts`"). This is the single most useful signal for an agent: it says *which file to open/generate for which contract*, and lets the graph checker verify nothing is orphaned.

- On an **implementation** unit, `realizes:` names the contract(s) it fulfills.
- On a **contract** unit, `realizedBy:` names the file(s) expected to implement it.

```kotlin
//@contract: RegisterDeviceRoute.handle
//@  realizedBy: [internal/RegisterDeviceRoute.kt]
//@  post: result.status == "OPEN"
```
```kotlin
// internal/RegisterDeviceRoute.kt
//@realizes: [contracts/register-device.lynx.kt#RegisterDeviceRoute.handle]
class RegisterDeviceRoute { ... }
```

**Rule:** every contract SHOULD resolve to exactly one `realizedBy` file (or be explicitly `abstract`/`interface`), and every `realizes` MUST point at an existing contract. A dangling edge in either direction is a graph-lint error (§12.1, §17).

---

## 8 Contract-first Module Spec (no code yet)

When there is **no implementation**, a contract block stands alone in a `*.lynx.kt` / `*.lynx.md` stub (or a plain `//@`-only file). It carries enough to generate the declaration *and* body.

```kotlin
//@module:
//@  layer: integration
//@  package: com.acme.devices.internal
//@  depends: [com.acme.devices.external.messages.*, com.acme.core.rest.*]
//@
//@contract: RegisterDeviceService.handle
//@  lang: kotlin
//@  signature: fun handle(command: RegisterDevice): DeviceRegistered
//@  pre: command.id != null && command.region in SUPPORTED_REGIONS
//@  post: result.deviceId != null && result.status == "OPEN"
//@  assigns: []                       # pure orchestration, no local state
//@  raises:
//@    PermanentException: command.region !in SUPPORTED_REGIONS
//@    RetryableException: coreApi unavailable
//@  calls: [coreApi.createDevice]    # outbound collaborators the impl needs
//@  returns: DeviceRegistered
```

Contract-first-only keys (ignored once code exists):
| Key | Meaning |
|-----|---------|
| `lang` | `kotlin` or `java` — target language for generation. |
| `signature` | Exact declaration to emit (name, params, return). |
| `package` | Destination package (from the enclosing `//@module:`). |
| `calls` | Collaborators/APIs the body is allowed to invoke (bounds hallucination). |
| `returns` | Result type/shape when `signature` is omitted. |
| `realizedBy` *(v1.1)* | Target file the generator should emit/populate for this contract (§7.1). |

An agent turns the above into: the file, the class, imports limited to `depends`, a `handle` function whose body calls `coreApi.createDevice`, maps the response to `DeviceRegistered`, and routes the two declared exceptions.

---

## 9 Examples

### 9·1 Kotlin (behavioral)
```kotlin
//@contract:
//@  pre: amount > 0 && this.capacity >= amount
//@  post:
//@    - this.capacity == old(this.capacity) - amount
//@    - result == Unit
//@  raises: InsufficientCapacityException if amount > this.capacity
//@  assigns: [capacity]
class Device(var capacity: Long) {
    fun reserve(amount: Long) {
        if (amount > capacity) throw InsufficientCapacityException()
        capacity -= amount
    }
}
```

### 9·2 Java (behavioral)
```java
//@contract:
//@  pre: name != null && !name.isEmpty() && age >= 0
//@  post: result != null && result.id() > 0
//@  raises: ValidationException if name == null || name.isEmpty()
public User createUser(String name, int age) { ... }
```

---

## 10 Class / Type Invariants
- **Kotlin**: place a `//@contract:` block with only `inv:` immediately above `class`/`object`. Auto-wraps every public member.
- **Java**: attach above the `class`; applies to every public method.

```kotlin
//@contract:
//@  inv: this.capacity >= 0
class Device(var capacity: Long)
```

---

## 11 Concurrency Contracts (JVM)

Replaces the Go goroutine/channel section. Documents async & shared-state semantics so tools and codegen reason about threading correctly. Keys may appear in any `//@contract:` or `//@flow:` block.

### 11·1 Keys
| Key | Type | Description |
|-----|------|-------------|
| `spawns` | list | Coroutines/tasks launched (`launch`, `async`, `CompletableFuture.supplyAsync`, `executor.submit`). |
| `receives_from` | list | Channels/`Flow`s this unit collects from. |
| `sends_to` | list | Channels/`Flow`s/sinks this unit emits to. |
| `suspends` | bool | Kotlin `suspend` function (non-blocking, cooperative). |
| `blocking` | bool | Blocks the calling thread; in Quarkus ⇒ `@Blocking`. `false` ⇒ `@NonBlocking`/reactive. |
| `dispatcher` | string | `Default` / `IO` / `Main` / named executor the work must run on. |
| `synchronized` | bool | Access to `shared_state` is properly locked/atomic. |
| `shared_state` | list | Mutable state accessed concurrently (guard with lock/atomic/`Mutex`). |
| `scope` | string | Structured-concurrency scope owner (`coroutineScope`, `supervisorScope`, request scope). |
| `emits` | type | Element type for `Flow<T>` / `Multi<T>` / `Uni<T>` producers. |

### 11·2 Examples

**Kotlin coroutines / Flow**
```kotlin
//@contract:
//@  pre: ids.isNotEmpty()
//@  post: result.size == ids.size
//@  suspends: true
//@  dispatcher: IO
//@  spawns: [fetchOne]
//@  scope: coroutineScope
suspend fun fetchAll(ids: List<String>): List<Device> = coroutineScope {
    ids.map { async { fetchOne(it) } }.awaitAll()
}
```

**Quarkus / Mutiny (reactive, non-blocking)**
```kotlin
//@contract:
//@  blocking: false
//@  emits: Device
//@  sends_to: [devicesStream]
fun stream(): Multi<Device> { ... }
```

**Java executor**
```java
//@contract:
//@  spawns: [processChunk]
//@  sends_to: [results]
//@  synchronized: false
//@  shared_state: [counter]   // must be AtomicInteger
public void parallelMap(List<Integer> data, BlockingQueue<Integer> results) { ... }
```

### 11·3 Static-analysis / codegen possibilities
- Coroutine/task lifecycle & structured-concurrency scope tracking.
- Fan-out/fan-in identification (`spawns` + `awaitAll`).
- Blocking-call-on-event-loop detection (`blocking: true` inside a `//@messaging:` reactive consumer ⇒ warn / generate `@Blocking`).
- Race-prone `shared_state` flagged when `synchronized: false` and state isn't atomic/`Mutex`-guarded.
- Correct `Dispatchers`/executor selection during generation.

---

## 12 Architecture / Module Contracts

```kotlin
//@module:
//@  layer: integration
//@  package: com.acme.devices
//@  depends: [com.acme.devices.external.messages.*, com.acme.core.rest.*, com.acme.commons.*]
//@  exposes: [RegisterDeviceRoute, UnregisterDeviceRoute]
//@  restrictions: [com.acme.core.internal.*]
//@  gradleModule: :integration-acme
//@  doc: "adapter is an anti-corruption layer; no direct core internals."
class DevicesModule
```

| Key | Type | Description |
|-----|------|-------------|
| `layer` | string | Architectural layer (e.g. `infra`, `contracts`, `libs`, `adapter`, `core`). |
| `package` | string | Base package this module owns. |
| `depends` | list | **Outgoing** deps allowed (import/use). `*` wildcards OK. |
| `exposes` | list | Public API kept stable. |
| `restrictions` | list | Modules forbidden to depend on this one (inversion rule). |
| `gradleModule` | string | *(new)* Gradle project path, for build-graph checks. |
| `doc` | string | Rationale / ADR link. |

> **Rule** — the verifier ensures `imports(actual) − allowed(depends) == ∅` and `reverseImports(actual) ∩ restrictions == ∅`. Layer ordering also forbids cycles (§17).

### 12.1 Module Composition Graph — `//@graph:` *(v1.1)*

Ported from `atlas-graph.contracts.ts`: a **single canonical block that is the source of truth for a whole module** — its file inventory, per-file dependency edges, the contract each file realizes, and the runtime dataflow. It lives at the module root (or a dedicated `*-graph.lynx.kt` / `<module>-graph.contracts.kt` file).

> **The rule that makes it work:** *adding, removing, or renaming any file in the module MUST update this graph in the same change.* This is exactly what the `contract-first` skill's Phase 2 (whole-tree update) and the pre-edit hook enforce — the graph is the artifact they keep honest.

```kotlin
//@graph: adapter-corelab.devices
//@  files:                                  # inventory + what each realizes
//@    - internal/RegisterDeviceRoute.kt   realizes: [contracts/register-device#handle]
//@    - internal/mappers/DeviceMapper.kt realizes: [contracts/register-device#mapping]
//@    - external/messages/commands/RegisterDevice.kt realizes: [contracts/messages#RegisterDevice]
//@  depends:                                # file -> direct deps (outbound edges)
//@    RegisterDeviceRoute.kt: [DeviceMapper.kt, devicesApi, SharedEnvelopeRoute]
//@    DeviceMapper.kt: []                   # pure, no deps
//@  dataflow: |
//@    ```mermaid
//@    flowchart LR
//@      IN[(topic: corelab.devices.command.register-device)] --> R[RegisterDeviceRoute]
//@      R --> M[DeviceMapper] --> REST[(devices-api /internal/v1)]
//@      REST --> EV[(topic: devices.event.device-registered)]
//@    ```
//@  vanilla: "Remove contracts/ and this is a standard Quarkus+Camel module under internal/ + external/."
```

| Key | Type | Description |
|-----|------|-------------|
| `files` | list | Every file in the module + the contract(s) it `realizes`. Adding a file without a line here is a lint error. |
| `depends` | map | `file → [direct deps]`. Outbound edges only; contracts are implicit deps of every file. |
| `dataflow` | mermaid/text | Runtime data path through the module (inline diagram, §14). |
| `vanilla` | string | What the module looks like if `contracts/` were deleted — proves the overlay is additive, not load-bearing at runtime. |

**Static checks (§17):** every `realizes`/`realizedBy` edge resolves both ways; no file is missing from `files`; `depends` edges stay within the module's `//@module: depends`; the graph is acyclic.

### 12.2 Plugin / Registry Modules — `//@plugin:` *(v1.1)*

Ported from the `enrichers` ETL: many small modules behind **one uniform interface**, dispatched through a **registry map**. Adding capability = new folder implementing the interface + one line in the registry. This is the "drop-in module" pattern and it is highly codegen-friendly — the generator scaffolds the folder *and* wires the registry entry.

```kotlin
//@plugin: enrichers.providers
//@  interface: fun handler(ctx: EnrichCtx): EnrichResult   # uniform contract every module implements
//@  registry: providers/Registry.kt                              # the single dispatch map: key -> module
//@  key: providerSlug                                            # what selects a module at runtime
//@  members: [heliowatt, nordgrid, aquasense, pulsecore, ...]              # registered modules (source of truth)
//@  onMissing: raise IllegalStateException("provider <key> not found")
//@  addModule: |
//@    1. create providers/<key>/Enrich.kt implementing `interface`
//@    2. add one entry `<key> -> <Key>Enrich` to registry
//@    3. add <key> to `members` here
```

| Key | Type | Description |
|-----|------|-------------|
| `interface` | signature | The single method/shape every plugin module implements. |
| `registry` | file | The one place mapping `key → module`; string-keyed dispatch. |
| `key` | expr | Runtime selector (e.g. a provider id, a domain name). |
| `members` | list | Currently registered modules — the canonical list; must match the registry. |
| `onMissing` | expr | Behavior when `key` has no registered module (fail-closed by default). |
| `addModule` | steps | The exact recipe codegen follows to add a new plugin — folder + interface impl + registry line. |

**Rule:** `members` here, the entries in `registry`, and the folders on disk MUST stay in sync — a member without a registry line (or vice-versa) is a lint error. Documenting per-module special-casing (regions, flags, quirks) in one table — as Atlas does with `PROVIDER_OVERRIDES` — keeps DRY and tells codegen where the branches are.

---

## 13 Messaging / Kafka Contracts *(new)*

The block that makes event-driven modules generatable. Describes what a unit **consumes** and **produces** on Kafka, the wire format, and how failures are routed. Attach to a consumer method, a producer, a Camel route, or a handler class.

```kotlin
//@messaging:
//@  consumes:
//@    topic: corelab.devices.command.register-device
//@    as: RegisterDevice              # payload type (extends Command)
//@    format: envelope-json        # envelope-json | avro | json
//@    group: corelab-devices-adapter
//@    key: deviceId
//@  produces:
//@    - topic: devices.event.device-registered
//@      as: DeviceRegistered
//@      format: envelope-json
//@    - topic: devices.event.device-open-failed
//@      as: DeviceOpenFailed
//@      when: raises PermanentException
//@  ordering: per-key             # per-key | per-partition | none
//@  idempotent: true              # exactly-once intent; false ⇒ no-retry actuator-call
//@  errors:
//@    TransientException: retry-in-process
//@    RetryableException: retry-topic     # retry.corelab.devices.command.register-device
//@    PermanentException: failed-event + dlq
//@  dlq: corelab.devices.dlq
//@  schemaRegistry: apicurio      # for format: avro
fun onRegisterDevice(command: RegisterDevice): DeviceRegistered { ... }
```

### 13·1 Keys
| Key | Type | Description |
|-----|------|-------------|
| `consumes` | object | Inbound topic + payload type + format + consumer `group` + partition `key`. |
| `produces` | list | Outbound topics; each with `as` (type), `format`, optional `when` (condition/exception). |
| `format` | enum | `envelope-json` (JSON `{metadata, payload}`, payload is the typed event/command JSON), `avro` (via registry), `json` (raw). |
| `group` | string | Kafka consumer group. |
| `key` | expr | Field used as the partition key (drives `ordering`). |
| `ordering` | enum | `per-key`, `per-partition`, `none` — the guarantee the impl must preserve. |
| `idempotent` | bool | Whether re-delivery is safe. `false` ⇒ irreversible side-effecting call, **do not auto-retry**. |
| `errors` | map | `ExceptionType → route`: `retry-in-process` / `retry-topic` / `failed-event` / `dlq` / `drop` *(v1.2)*. `drop` = log at a declared level and stop — no failed event, no DLQ; legal ONLY with an inline rationale (e.g. "a callback answers no command", "fire-and-forget refresh"). |
| `dlq` | topic | Dead-letter topic. |
| `schemaRegistry` | string | Registry for Avro (`apicurio`, `confluent`, …). |
| `headers` | list | Required message headers (correlation-id, signature, device-identifier, …). |

### 13·2 Codegen from a messaging block
An agent generates: the consumer wiring (Camel `from("kafka:...")` or SmallRye `@Incoming`), envelope unwrap/typed-payload read, the handler call, response mapping to each `produces` type, and an error handler that maps each exception class to its declared route (retry-in-process / retry-topic / failed-event + DLQ). `key` becomes the produced record key; `ordering` constrains parallelism.

### 13·3 Static checks
- Every `produces.when: raises E` must have a matching `errors` route and a real `-failed`/DLQ topic.
- `idempotent: false` + `errors: {...: retry-topic}` ⇒ **error** (retrying a non-idempotent actuator call risks double-actuation).
- *(v1.2)* an `errors` route of `drop` without an inline rationale comment ⇒ **error**; `drop` on a flow that `produces` a failed event ⇒ **error** (the two are mutually exclusive per exception class).
- Topic-name lint against the project profile's naming convention (§18).

### 13·4 Topic & channel constants, not string literals *(v1.1)*
The Atlas module never concatenates channel names inline (`atlasChannelFor(type)` helpers); "a typo becomes a compile error." Apply the same to Kafka:

- A topic referenced in `//@messaging:` SHOULD resolve to a **named constant / config key**, not a bare literal repeated across files. Codegen emits `object Topics { const val REGISTER_DEVICE = "..." }` (or the `application.yml` `kafka.topic.name.*` map for Camel integrations) and references that everywhere.
- Where a topic is built from parts (`<provider>.<domain>.command.<action>`), generate a **builder helper** (`commandTopic(provider, domain, action)`) rather than interpolating strings at each call site. One helper = one place a naming-convention change (or typo) is caught.
- The `//@messaging:` block is the declaration; the generated constant/helper is its single realization (§7.1).

### 13·5 Schema evolution — see Freeze / Closed-enum rules (§19.1)
Payload types, status enums, and event-name sets on Kafka contracts are **compatibility-critical**: once published they freeze, and adding a value is a deliberate, tracked change. Mark them `frozen:` / `closed:` per §19.1 so codegen and lint refuse silent remaps.

---

## 14 Data-flow Contracts (extended)

Documents how data travels end-to-end — for security, privacy, and to order codegen steps.

```kotlin
//@flow:
//@  from: topic corelab.devices.command.register-device
//@  through:
//@    - UnwrapEnvelopeProcessor
//@    - ValidateRegisterDevice
//@    - mapToCoreRequest
//@    - rest POST devices-api /internal/v1/devices
//@    - mapToEvent
//@  to: topic devices.event.device-registered
//@  privacy: pii
//@  rate: 50 msg/s
fun openDeviceRoute() { ... }
```

| Key | Type | Description |
|-----|------|-------------|
| `from` | node | Source (topic / endpoint / file). |
| `through` | list | Ordered processing steps (each a codegen stage). |
| `to` | node | Final sink. |
| `privacy` | string | `public` / `internal` / `pii` / `phi` / … |
| `rate` | string | Expected throughput. |

**Node grammar (JVM/Kafka-aware):**
```
node        ::= kind IDENT | IDENT ('.' IDENT)* | resource '->' target
kind        ::= 'topic' | 'route' | 'rest' | 'registry' | 'schema' | 'db' | 'cache' | 'file' | 'queue'
resource    ::= kind | IDENT
```
Examples: `topic devices.event.device-registered`, `route direct:wrapEnvelope`, `rest POST devices-api /internal/v1`, `registry apicurio`, `schema com.acme.devices.events.DeviceRegistered`, `db.table devices`.

### 14·1 Inline `mermaid` diagrams *(v1.1)*
Besides the linear `through` list, a `//@flow:` or `//@graph:` block MAY embed a fenced ```mermaid``` diagram directly (as the Atlas contracts do). It renders in Markdown/IDE preview, is read natively by LLMs, and needs no external `lynxctl` step. Keep the diagram and the `through`/`files` lists consistent — the text lists stay the machine-checkable source; the diagram is the human/LLM-facing view.

```kotlin
//@flow:
//@  from: topic corelab.devices.command.register-device
//@  to: topic devices.event.device-registered
//@  diagram: |
//@    ```mermaid
//@    flowchart LR
//@      IN[(command topic)] --> R[RegisterDeviceRoute] --> M[DeviceMapper]
//@      M --> REST[(devices-api)] --> OUT[(event topic)]
//@    ```
```

---

### 14·2 Observability Contract — `//@observability:` *(v1.1)*

Ported from the Atlas "Observability contract": the module doesn't just *do* work, it **declares what every operation must log**. This is first-class in an event-driven system (correlation-id propagation, DLQ error segregation) and is directly generatable.

```kotlin
//@observability:
//@  operations: [devices.openDevice, devices.refresh]   # named operations this unit owns
//@  logFields:                                             # MUST appear on every operation record
//@    - operation
//@    - siteName
//@    - correlationId          # acme-correlation-id
//@    - streamId?              # when known
//@    - providerId?
//@    - outcome                # closed enum below
//@    - duration_ms
//@  outcome: [ok, validation_failed, adapter_failed, db_failed]   # closed set (§19.1)
//@  emit:                                                  # events that MUST be logged when emitted
//@    - "pushUpdate: { operation:'pushUpdate', channel, event, streamId, siteName }"
//@  mustNotLog: [rawSecrets, keys.*, per-client delivery counts]  # forbidden / unknown-as-known
fun openDevice(...) { ... }
```

| Key | Type | Description |
|-----|------|-------------|
| `operations` | list | Named operations covered by this contract (`<domain>.<verb>`). |
| `logFields` | list | Structured fields that MUST be present on every operation record (`?` = when known). |
| `outcome` | closed enum | Terminal-status vocabulary; codegen maps each code path to exactly one. |
| `emit` | list | Side-channel emissions (SSE/domain events) that must be logged, with their field shape. |
| `mustNotLog` | list | Fields forbidden from logs (secrets/PII) or facts the runtime can't actually know (don't log them as if known). |

**Codegen:** wrap each operation so entry/exit produce one structured record with the declared fields; set `outcome` per branch; thread `correlationId` from the envelope headers (Acme `acme-correlation-id`). **Lint:** an operation path that returns without an `outcome`, or logs a `mustNotLog` field, is an error.

---

## 15 Edge Cases & Escapes
| Need | Solution |
|------|----------|
| Multi-line expression | Indent >2 spaces under a list item. |
| Disable a single check | Prefix with `~`, e.g. `~ amount > 0`. |
| Language-specific literal | Fenced verbatim: `{{kt: ... }}` or `{{java: ... }}` inside an expr. |
| Reference a generated symbol | Backtick it: `` `DeviceRegistered` `` — tells codegen it's a type to create/import. |

---

## 16 Tooling & Modes *(optional — contracts are docs by default)*

By default a contract is **documentation + codegen input + graph source**; nothing runs. If you opt into enforcement, the original modes apply:

| Mode | Behavior |
|------|----------|
| `DOC` *(default)* | No code generated/injected. Consumed by humans, LLMs, and `lynxctl` graphs. |
| `GENERATE` | Feed contracts to a codegen driver / agent to emit or scaffold implementations (§7, §8). |
| `VERIFY` *(opt-in dev)* | Inject runtime checks (via KSP/kapt or AOP/AspectJ, or Quarkus build-time); fatal on violation. |
| `ASSUME` *(staging)* | Evaluate `pre` once; skip heavy quantifiers in `post`. |
| `OFF` *(prod)* | Blocks stripped at build time. |

Enable via `LYNXCONTRACT=DOC|GENERATE|VERIFY|ASSUME|OFF` or a Gradle property `-Plynxcontract=verify`.

---

## 17 Visualization & Static Checks
- **Diagram export:** `lynxctl graph --format=svg` renders module layers, Kafka topic wiring, and data-flows.
- **Cycle detection:** forbidden circular deps across `layer`/`gradleModule`.
- **Privacy lint:** a `privacy: pii` flow reaching a `public` sink ⇒ error.
- **Messaging lint:** unmatched `produces.when`, non-idempotent retry, topic-naming violations (§13.3).

---

## 18 Acme Profile *(project-specific conventions & full example)*

The generic core above ports anywhere. This profile pins the conventions of the Acme adapter platform (Quarkus + Camel + Kotlin, JDK21) so codegen matches reality.

### 18·1 Topic naming (enforced by messaging lint)
| Type | Template | Example |
|------|----------|---------|
| command in | `<provider>.<domain>.command.<action>` | `corelab.devices.command.register-device` |
| event out | `<domain>.event.<name>` | `devices.event.device-registered` |
| failure event | `<domain>.event.<name>-failed` | `devices.event.device-open-failed` |
| DLQ (code) | `<provider>.<domain>.dlq` | `corelab.devices.dlq` |
| DLQ | `<domain>.integration.dlq.<provider>` | `devices.integration.dlq.corelab` |
| retry (reactive) | `retry.<provider>.<domain>.command.<action>` | `retry.corelab.devices.command.register-device` |

> Asymmetry rule: **commands carry the provider prefix, events do not** (core subscribes independent of provider). Codegen must not prefix produced events.

### 18·2 Formats
- `envelope-json` = the `acme-messaging` library's `Envelope { metadata, payload }` wrapper; `payload` is the typed event/command JSON. Requires a CDI `ObjectMapper` bean.
- `avro` = via Apicurio; `artifactId = schema.fullName` (`com.acme.<domain>.{events,commands}.<Name>`), group `default`. `.avsc` documents **payload only**, not the Envelope.

### 18·3 Error routing
| Exception | `errors` route | Meaning |
|-----------|----------------|---------|
| `TransientException` | `retry-in-process` | MicroProfile `@Retry`. |
| `RetryableException` | `retry-topic` | Retry topic until `max-period`. |
| `PermanentException` | `failed-event + dlq` | `-failed` event + DLQ. |
| actuator call | `idempotent: false` | no retry — missing idempotency ⇒ double-actuation risk. |

### 18·4 Required headers
`acme-correlation-id` (in `metadata.properties`), `acme-device-identifier`, `acme-event-source-timestamp`, `acme-event-received-timestamp`, signature set `x-sig`/`x-sig-alg`(Ed25519)/`x-sig-key`/`x-sig-ts`/`x-sig-nonce`.

### 18·5 Full worked example — RegisterDevice adapter unit (contract-first, generatable)
```kotlin
//@module:
//@  layer: integration
//@  package: com.acme.corelab.devices
//@  depends: [com.acme.corelab.devices.external.messages.*, com.acme.devices.rest.*, com.acme.messaging.commons.*]
//@  restrictions: [com.acme.core.internal.*]
//@  gradleModule: :integration-corelab
//@  doc: "Anti-corruption layer for corelab devices (error-segregation ADR)."
//@
//@messaging: RegisterDeviceRoute
//@  consumes:
//@    topic: corelab.devices.command.register-device
//@    as: RegisterDevice
//@    format: envelope-json
//@    group: corelab-devices-adapter
//@    key: deviceId
//@  produces:
//@    - topic: devices.event.device-registered
//@      as: DeviceRegistered
//@      format: envelope-json
//@    - topic: devices.event.device-open-failed
//@      as: DeviceOpenFailed
//@      when: raises PermanentException
//@  ordering: per-key
//@  idempotent: false                     # device creation is an actuation-adjacent side effect
//@  errors:
//@    TransientException: retry-in-process
//@    RetryableException: failed-event    # idempotent: false forbids retry-topic (§13.3 static
//@                                        # check — non-idempotent retry risks double-actuation);
//@                                        # also the Camel-family §18.3 default (no retry topics)
//@    PermanentException: failed-event + dlq
//@  dlq: corelab.devices.dlq
//@  headers: [acme-correlation-id, acme-device-identifier]
//@
//@flow:
//@  from: topic corelab.devices.command.register-device
//@  through:
//@    - UnwrapEnvelopeProcessor
//@    - mapToCoreRequest
//@    - rest POST devices-api /internal/v1/devices
//@    - mapToDeviceRegistered
//@  to: topic devices.event.device-registered
//@  privacy: pii
//@
//@contract: RegisterDeviceRoute.handle
//@  lang: kotlin
//@  signature: fun handle(command: RegisterDevice): DeviceRegistered
//@  pre: command.id != null && command.deviceId != null
//@  post: result.deviceId != null && result.status == "OPEN"
//@  assigns: []
//@  calls: [devicesApi.createDevice]
//@  raises:
//@    PermanentException: command.region !in SUPPORTED_REGIONS
//@    RetryableException: devicesApi unavailable
class RegisterDeviceRoute
```
From this block alone an agent can scaffold: the Camel route consuming the command topic, envelope unwrap → typed `RegisterDevice`, the REST call to `devices-api`, mapping to `DeviceRegistered`, publishing to the (un-prefixed) event topic, and the three-way error routing with DLQ — matching the adapter template exactly.

---

## 19 Compatibility & Versioning
- Forward-compatible: unknown keys are ignored with a warning.
- Declare compliance with `version: "1.3-jvm"` at the top of any block.
- Roadmap: KSP-based runtime verifier, SMT export for static proofs of `pre`/`post`, AsyncAPI ↔ `//@messaging:` round-trip generation, `let` bindings in quantifiers.

### 19·1 Freeze, Compat & Closed Enums *(v1.1)*

Event-driven contracts evolve under wire-compatibility constraints. The Atlas module encodes this with "values freeze once published" and "closed enum: adding a value MUST update the constant first." LynxContract makes both explicit so codegen and lint refuse silent drift:

| Marker | On | Meaning |
|--------|----|---------|
| `frozen: true` | enum / field / type | Values/shape are published and MUST NOT change or be remapped. Codegen never renames; lint blocks edits. |
| `closed: true` | enum / event-name set | The set is exhaustive. **Adding a member is a deliberate contract change** — update this list first, then code; handlers must be exhaustive over it. |
| `compat: "<note>"` | any | Why the value is compatibility-critical (downstream consumers, legacy dashboards, dual-encoding). |
| `since: "<ver>"` / `deprecated: "<ver>"` | member | Lifecycle of a value within a closed set. |

```kotlin
//@contract:
//@  enum FeedStatus:
//@    frozen: true
//@    closed: true
//@    compat: "exact published status strings; downstream dashboards depend on them"
//@    values: [ok, syncing, error, "not ready"]   # 'not ready' keeps the literal space
```

**Rules:** (1) a value in a `frozen` set may never be renamed or dropped by codegen; (2) `raises`, `produces`, and event unions built on a `closed` set MUST be handled exhaustively (a missing branch is a lint error); (3) any new member of a `closed` set requires updating the contract in the same change that adds the handler — the same "contract before code" discipline the `contract-first` skill and pre-edit hook enforce.

---

## 20 Archetype & Template Profile *(v1.2 — normative for template authoring)*

A **template (archetype)** is a set of contract stubs that generates a whole module family:
the fixed shape lives in contracts, every legitimate difference between family members is an
explicit **variation point**. This section standardizes the notation layer proven in
template authoring (two full isolated instantiation runs of the adapter-family template). A template is
valid iff it satisfies the core grammar (§1–§17) **plus** this profile. The profile is
host-language-neutral: everything here lives in comments/markers around `//@` blocks.

### 20·1 Stub file model
- One stub = one future file, same relative path: `X.lynx.kt` generates `X.kt` (strip `.lynx`);
  `X.<ext>.lynx.md` generates the same-named non-Kotlin file. No monoliths.
- Every stub carries a header with:
  - `TARGET: <generated path with fill tokens>` — the output path, declared, never inferred;
  - `REALIZATION: generate` (assemble from the contracts) **or**
    `REALIZATION: copy-verbatim <source path>` (family mechanics copied byte-exact from the
    pinned reference; any expected deltas MUST be listed in the same header).
- Root maps (inventory graph, module map, messaging map, upstream map, repo manifest) are stubs
  with `REALIZATION: n/a` — they generate no file and are exempt from the one-stub-one-file rule.

### 20·2 Fill tokens and the Fill Registry
- A **fill** `{{Token}}` marks a variation point. Every fill used anywhere in the template MUST
  have a row in the template's **Fill Registry** (kept in the template's oracle document), with:
  token, **source** (`REQ` — human requirements | `P0` — pinned upstream schema | `API` —
  provider surface, verified by contract-tests), answer format, default, and a worked example.
  **Token closure is a lint invariant**: used ⊆ registered.
- `<property:X>` references a runtime config property canonically (host frameworks may render it
  differently, e.g. Camel `{{X}}`); the canonical form appears in contracts, the host form only
  in generated code.
- Derived forms (case transforms of a fill: SCREAMING, kebab, plural) must be declared as
  derivations in the registry row — a derivation the registry does not state is an invention.
- A requirement not expressible as a registered fill is **not input**: it is an
  archetype-evolution request (new variation point/shape, template revision) or an outlier
  verdict (different family). Silently absorbing it into generated output is a defect.

### 20·3 Multipliers and instance declarations
- A stub marked `MULTIPLIER` instantiates once per declared instance of its governing fill
  (one command-DTO stub → N command classes). Non-marked stubs instantiate exactly once.
- Instance sets are **closed and declared** (in the instantiation manifest, §20·6) — never
  derived by analogy. Per-instance structure (extra deps, branch flows, aliases) is declared via
  per-instance keys, with ALL reference-family instances recorded in the stub's `example:` block.
- When a contract slot cannot be filled at template time (e.g. a provider response shape),
  mark the contract `abstract: true` (§7.1) — never a placeholder realization.
- **Instance-source unions** *(v1.3)*: a multiplier whose instances originate from MORE than one
  producing contract (e.g. an event DTO produced by commands, by dispatched actions, and by
  event-triggered flows) must enumerate ALL its sources in its own header, and every producing
  contract must declare its target rows explicitly. A build plan counts targets from the union;
  an instance named by any producing contract but absent from the plan is a plan defect. (Five
  runs of evidence: every implicitly-ranged multiplier eventually lost instances.)
- **Per-instance declared policies** *(v1.3)*: a behavior that varies across instances of one
  multiplier (an error-routing tail, a guard sequence) is NEVER stated as an invariant with
  deviations — it is a declared per-instance key with the counted ground-truth values recorded.
  Generalizing from the worked example is the single most recurrent template-authoring error.

### 20·4 Provenance markers
- `# etalon: <path>:<line>` — cites the reference implementation a contract fact was extracted
  from. Provenance only: generation must NOT read the cited file (except copy-verbatim).
- `# etalon realization:` — names the reference file that realizes an abstract slot.
- `# etalon deviation: <path>:<line> — <what the reference does> — <why the template keeps canon>`
  — declares an EXPECTED difference between generated output and the reference (reference dirt
  the template deliberately does not reproduce). At diff time, every divergence must be either
  predicted by a deviation marker, catalogued as a recorded gap, or it is a defect.
- `example:` annotations carry worked instance values (the reference family's answers). They are
  normative FOR THAT instantiation and illustrative for any other.
- **Wire-true literal precedence** *(v1.3)*: where a stub quotes a literal from the reference wire
  surface (a topic key, an enum member, brand casing — including the reference's own typos and
  misspellings), the QUOTED LITERAL is authoritative over any mechanical fill substitution or
  spelling normalization at the quoted spots. Frozen quirks are wire truths; "fixing" them breaks
  compatibility. Related literals that look derivable from one another (a map key, its env var,
  its topic string) are declared as INDEPENDENTLY FROZEN unless a derivation is explicitly stated.

### 20·5 Generation ordering
- The template's inventory graph declares `generationOrder`: waves from leaf to root, such that
  every contract a stub depends on is generated (or copied) in an earlier wave. Copy-verbatim
  files come first where the order allows.
- The inventory list, the on-disk stub tree, and the generation plan are one bijection
  (lint invariant §20·8).

### 20·6 The instantiation manifest
One adapter/module instantiation = one **manifest** document recording the complete fill
assignment (every registry row answered: value, or explicit `default`), each section carrying a
verification status (confirmed / corrected / still-unverified). The manifest — not the stubs —
is the single REQ+instance source of truth for that instantiation; stubs' `example:` blocks are
its provenance mirror for the reference family. Requirements changes ⇒ new manifest revision +
regeneration, never hand-edits to generated code.
*(v1.3)* Every manifest section carries a verification-status label (confirmed / corrected /
still-unverified), and the labels themselves are audited: a confirmed-but-wrong row is a worse
defect than an unverified one. **Roster disagreement rule**: when a stub enumeration and a
manifest row disagree about an instance roster, neither document wins by seniority — physical
reality (a directory listing of the reference, a count of the real file) adjudicates, and both
documents are corrected to the verified list in the same change.

### 20·7 Generated-output discipline
- Generated files carry **no provenance/banner comments**. The sanctioned generation-time
  comment set is CLOSED and declared in the template oracle; the reference set *(v1.3)* is three
  kinds: `// TEMPLATE-GAP: <what was insufficient>`, an assertion-waiver marker where the oracle
  defines one, and a fixture-status marker (`RECONSTRUCTED until a recording pass replaces
  them`) that generation MUST propagate into generated fixture files. Anything else is a defect
  even when informative.
- **Marker hygiene** *(v1.3)*: sanctioned markers carry ONLY their declared payload. Run
  bookkeeping — gap ids, scratch-file names, wave labels — is forbidden in ANY comment,
  including piggybacked inside an otherwise-sanctioned marker. (Empirically the leak vector:
  dozens of bookkeeping tokens rode legitimate comments past a naive lint grep.)
- **Formatter** *(v1.3)*: the generated tree is run through the project formatter before any
  lint or diff; formatting is thereby removed from the defect surface entirely.
- Imports, helper signatures and constants used by generated files MUST be cross-checked
  against the copy-verbatim files in the SAME generated tree — they are the in-tree authority.
- **Remediation rigor** *(v1.3)*: a lint-driven fix is generation activity — it carries the same
  citation duty as first-pass generation, and copy-verbatim targets are re-verified byte-identical
  after ANY fix. An uncited remediation is a defect even when its diagnosis was correct.
- **Declared freedom** *(v1.3)*: where a contract deliberately leaves implementation style
  unconstrained (helper decomposition, internal organization), it says so in an explicit
  IMPLEMENTATION-STYLE clause — so a diff classifies style-only deltas as predicted freedom
  rather than unexplained divergence. Unstated freedom does not exist.

### 20·8 Mechanical lint invariants (the `lynxctl` checklist)
A template and its instantiation are mechanically checkable; these MUST hold at all times:
1. inventory bijection: stub files on disk == inventory list == generation plan entries;
2. token closure: every `{{Token}}` used has a registry row; no orphan registry rows unless
   marked optional;
3. anchor resolution: every `<file>#<contract>` reference resolves to an existing contract;
4. count consistency: every stub-count literal quoted in oracle prose equals the real count;
5. realization completeness: every stub has TARGET + REALIZATION; every copy-verbatim source
   exists at the pinned revision (content-hash pinning recommended);
6. output-comment lint: generated trees contain no comment lines outside the sanctioned set;
7. single-source rule: one semantic fact has ONE authoritative home (rule text, registry row,
   or map entry) — other mentions are anchors to it, not restatements. Duplicated semantics is
   where templates rot.
8. *(v1.3)* **output-target completion**: at instantiation, every planned target (all multiplier
   instances, from the §20·3 source unions) exists on disk or carries a logged blocking reason;
   missing-with-neither is a defect.
9. *(v1.3)* **test-case completion**: per generated test file,
   `|declared raises/produces-when clauses| == |generated negative cases| + |per-clause logged
   scope reductions|`; an aggregate "scope reduced" note does not satisfy the identity.
10. *(v1.3)* **cross-stub consistency**: for every generated file, the citations OTHER stubs make
    into it (config keys, schema components, constructor params, topic keys) are verified present.
    Presence-in-plan does not imply internal completeness — the two known build-breaking escapes
    of this class both had their correct citation one file away.
*(v1.3, scope note)* Checks 1–10 verify presence, count and cross-reference — NOT content
fidelity against the external system. Content correctness is closed only by execution: compile,
run the generated tests, and verify against recorded provider exchanges. A template whose checks
all pass has earned a build, not a deployment.

### 20·9 Relationship to the core grammar
Nothing in this profile changes §1–§19 semantics. The profile constrains how contracts are
*packaged into a template*: the core grammar makes one module derivable from its contracts;
this profile makes a *family* of modules derivable from one contract set plus declared fills —
and keeps the derivation honest under adversarial diffing.

---

© 2025–2026 LynxContract Authors. MIT License. JVM edition (v1.3) derived from the Python/Go spec v0.2 (core) + v0.3 (concurrency), extended with patterns from the Atlas platform (its hub module and `enrichers` ETL registry), and (v1.2) with the archetype/template layer proven by six isolated battle runs of the adapter-family template.
