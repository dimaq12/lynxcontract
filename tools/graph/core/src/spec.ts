//@realizes: [contracts/graph#CoreSpecModel]  # origin: the LSP grammar model, unified into @lynx/core — the extension now imports this package
// Machine model of lynxcontract-spec-kotlin-java-v1.3.md. The spec wins on conflict.

export interface KeyDoc {
  type: string;
  doc: string;
  section: string;
  /** Closed value set, when the key is enum-valued. */
  values?: string[];
}

export interface BlockSpec {
  doc: string;
  section: string;
  keys: Record<string, KeyDoc>;
}

export const FORMATS = ['envelope-json', 'avro', 'json'];
export const ORDERINGS = ['per-key', 'per-partition', 'none'];
export const ERROR_ROUTES = ['retry-in-process', 'retry-topic', 'failed-event', 'dlq', 'drop'];
export const PRIVACY = ['public', 'internal', 'pii', 'phi'];
export const DISPATCHERS = ['Default', 'IO', 'Main'];
export const LANGS = ['kotlin', 'java', 'typescript', 'json', 'go', 'python', 'rust'];

const CONCURRENCY_KEYS: Record<string, KeyDoc> = {
  spawns: { type: 'list', section: '§11.1', doc: 'Coroutines/tasks launched (`launch`, `async`, `CompletableFuture.supplyAsync`, `executor.submit`).' },
  receives_from: { type: 'list', section: '§11.1', doc: 'Channels/`Flow`s this unit collects from.' },
  sends_to: { type: 'list', section: '§11.1', doc: 'Channels/`Flow`s/sinks this unit emits to.' },
  suspends: { type: 'bool', section: '§11.1', doc: 'Kotlin `suspend` function (non-blocking, cooperative).', values: ['true', 'false'] },
  blocking: { type: 'bool', section: '§11.1', doc: 'Blocks the calling thread; in Quarkus ⇒ `@Blocking`. `false` ⇒ `@NonBlocking`/reactive.', values: ['true', 'false'] },
  dispatcher: { type: 'string', section: '§11.1', doc: '`Default` / `IO` / `Main` / named executor the work must run on.' },
  synchronized: { type: 'bool', section: '§11.1', doc: 'Access to `shared_state` is properly locked/atomic.', values: ['true', 'false'] },
  shared_state: { type: 'list', section: '§11.1', doc: 'Mutable state accessed concurrently (guard with lock/atomic/`Mutex`).' },
  scope: { type: 'string', section: '§11.1', doc: 'Structured-concurrency scope owner (`coroutineScope`, `supervisorScope`, request scope).' },
  emits: { type: 'type', section: '§11.1', doc: 'Element type for `Flow<T>` / `Multi<T>` / `Uni<T>` producers.' },
};

const FREEZE_KEYS: Record<string, KeyDoc> = {
  frozen: { type: 'bool', section: '§19.1', doc: 'Values/shape are published and MUST NOT change or be remapped. Codegen never renames; lint blocks edits.', values: ['true', 'false'] },
  closed: { type: 'bool', section: '§19.1', doc: 'The set is exhaustive. Adding a member is a deliberate contract change — update the list first, then code.', values: ['true', 'false'] },
  compat: { type: 'string', section: '§19.1', doc: 'Why the value is compatibility-critical (downstream consumers, legacy dashboards, dual-encoding).' },
  since: { type: 'string', section: '§19.1', doc: 'Version a member of a closed set appeared in.' },
  deprecated: { type: 'string', section: '§19.1', doc: 'Version a member of a closed set was deprecated in.' },
  values: { type: 'list', section: '§19.1', doc: 'Members of a frozen/closed enum set.' },
  version: { type: 'string', section: '§19', doc: 'Spec version this block complies with, e.g. `"1.3-jvm"`.' },
};

export const BLOCKS: Record<string, BlockSpec> = {
  contract: {
    doc: 'Behavioral contract: pre/post/inv/raises/assigns + concurrency. Attaches to function / method / class.',
    section: '§3, §4',
    keys: {
      intent: { type: 'string', section: '§4.1', doc: '*Why* this unit exists and when to use it (one short paragraph).' },
      rules: { type: 'list', section: '§4.1', doc: 'BUSINESS LOGIC — constraints codegen must satisfy that `pre`/`post` cannot express (compat, side-effect boundaries, "do NOT ...").' },
      pre: { type: 'list/expr', section: '§4', doc: 'Conditions the caller must satisfy. Codegen ⇒ guard/`require(...)`.' },
      post: { type: 'list/expr', section: '§4', doc: 'Conditions the callee guarantees on return. Codegen ⇒ target of the impl / `check(...)`.' },
      inv: { type: 'list/expr', section: '§4', doc: 'Invariants holding before **and** after each public method (on a class).' },
      raises: { type: 'map', section: '§4', doc: '`ExceptionType: predicate` — allowed exceptions & when they occur. Codegen ⇒ error branches.' },
      assigns: { type: 'list', section: '§4', doc: 'Fields/state the routine may mutate (empty ⇒ **pure**). Codegen ⇒ nothing else is touched.' },
      returns: { type: 'type/expr', section: '§4', doc: 'Declared result type/shape. Helps codegen when there is no signature yet (§8).' },
      lang: { type: 'enum', section: '§8', doc: 'Target language for generation (contract-first only).', values: LANGS },
      signature: { type: 'string', section: '§8', doc: 'Exact declaration to emit (name, params, return). Contract-first only.' },
      package: { type: 'string', section: '§8', doc: 'Destination package (from the enclosing `//@module:`). Contract-first only.' },
      calls: { type: 'list', section: '§8', doc: 'Collaborators/APIs the body is allowed to invoke (bounds hallucination). Contract-first only.' },
      realizes: { type: 'list', section: '§7.1', doc: 'On an implementation unit: the contract(s) it fulfills. MUST point at an existing contract.' },
      realizedBy: { type: 'list', section: '§7.1', doc: 'On a contract unit: the file(s) expected to implement it. Dangling edge = graph-lint error.' },
      abstract: { type: 'bool', section: '§20.3', doc: 'Contract slot that cannot be filled at template time — never a placeholder realization.', values: ['true', 'false'] },
      ...CONCURRENCY_KEYS,
      ...FREEZE_KEYS,
    },
  },
  module: {
    doc: 'Architectural contract: layer, allowed deps, exposed API, restrictions. Attaches to class / file / package.',
    section: '§3, §12',
    keys: {
      layer: { type: 'string', section: '§12', doc: 'Architectural layer (e.g. `infra`, `contracts`, `libs`, `adapter`, `core`).' },
      package: { type: 'string', section: '§12', doc: 'Base package this module owns.' },
      depends: { type: 'list', section: '§12', doc: '**Outgoing** deps allowed (import/use). `*` wildcards OK. Verifier: `imports(actual) − allowed(depends) == ∅`.' },
      exposes: { type: 'list', section: '§12', doc: 'Public API kept stable.' },
      restrictions: { type: 'list', section: '§12', doc: 'Modules forbidden to depend on this one (inversion rule).' },
      gradleModule: { type: 'string', section: '§12', doc: 'Gradle project path, for build-graph checks.' },
      doc: { type: 'string', section: '§12', doc: 'Rationale / ADR link.' },
      version: FREEZE_KEYS.version,
    },
  },
  messaging: {
    doc: 'Kafka contract: topics, envelope/schema, group, ordering, error routing. Attaches to consumer/producer/route/class.',
    section: '§3, §13',
    keys: {
      consumes: { type: 'object', section: '§13.1', doc: 'Inbound topic + payload type + format + consumer `group` + partition `key`.' },
      produces: { type: 'list', section: '§13.1', doc: 'Outbound topics; each with `as` (type), `format`, optional `when` (condition/exception).' },
      topic: { type: 'string', section: '§13.1', doc: 'Topic name. SHOULD resolve to a named constant/config key, not a repeated bare literal (§13.4).' },
      as: { type: 'type', section: '§13.1', doc: 'Payload type.' },
      format: { type: 'enum', section: '§13.1', doc: '`envelope-json` (JSON `{metadata, payload}`, payload stringified), `avro` (via registry), `json` (raw).', values: FORMATS },
      group: { type: 'string', section: '§13.1', doc: 'Kafka consumer group.' },
      key: { type: 'expr', section: '§13.1', doc: 'Field used as the partition key (drives `ordering`).' },
      when: { type: 'expr', section: '§13.1', doc: 'Condition/exception under which this topic is produced, e.g. `raises PermanentException`.' },
      ordering: { type: 'enum', section: '§13.1', doc: 'The guarantee the impl must preserve.', values: ORDERINGS },
      idempotent: { type: 'bool', section: '§13.1', doc: 'Whether re-delivery is safe. `false` ⇒ irreversible side-effecting call, **do not auto-retry**.', values: ['true', 'false'] },
      errors: { type: 'map', section: '§13.1', doc: '`ExceptionType → route`: retry-in-process / retry-topic / failed-event / dlq / drop. `drop` needs an inline rationale.' },
      dlq: { type: 'topic', section: '§13.1', doc: 'Dead-letter topic.' },
      schemaRegistry: { type: 'string', section: '§13.1', doc: 'Registry for Avro (`apicurio`, `confluent`, …).' },
      headers: { type: 'list', section: '§13.1', doc: 'Required message headers (correlation-id, signature, core-identifier, …).' },
      version: FREEZE_KEYS.version,
    },
  },
  flow: {
    doc: 'Data-flow contract: source → steps → sink graph across topics, REST, DB.',
    section: '§3, §14',
    keys: {
      from: { type: 'node', section: '§14', doc: 'Source (topic / endpoint / file). Node grammar: `topic x`, `route y`, `rest POST api /path`, `db.table t` …' },
      through: { type: 'list', section: '§14', doc: 'Ordered processing steps (each a codegen stage).' },
      to: { type: 'node', section: '§14', doc: 'Final sink.' },
      privacy: { type: 'enum', section: '§14', doc: 'Data sensitivity of the flow. A `pii` flow reaching a `public` sink is a lint error (§17).', values: PRIVACY },
      rate: { type: 'string', section: '§14', doc: 'Expected throughput, e.g. `50 msg/s`.' },
      diagram: { type: 'mermaid', section: '§14.1', doc: 'Inline fenced ```mermaid``` diagram. Keep consistent with `through` — the text list stays the machine-checkable source.' },
      ...CONCURRENCY_KEYS,
      version: FREEZE_KEYS.version,
    },
  },
  graph: {
    doc: 'Module composition graph: canonical file inventory + dependency edges + dataflow for a whole module. Adding/removing/renaming any file MUST update it in the same change.',
    section: '§12.1',
    keys: {
      files: { type: 'list', section: '§12.1', doc: 'Every file in the module + the contract(s) it `realizes`. Adding a file without a line here is a lint error.' },
      depends: { type: 'map', section: '§12.1', doc: '`file → [direct deps]`. Outbound edges only; contracts are implicit deps of every file.' },
      dataflow: { type: 'mermaid', section: '§12.1', doc: 'Runtime data path through the module (inline diagram, §14.1).' },
      vanilla: { type: 'string', section: '§12.1', doc: 'What the module looks like if `contracts/` were deleted — proves the overlay is additive.' },
      generationOrder: { type: 'list', section: '§20.5', doc: 'Waves from leaf to root; every dependency generated (or copied) in an earlier wave.' },
      version: FREEZE_KEYS.version,
    },
  },
  observability: {
    doc: 'Structured-logging contract: mandated log fields, outcome enum, duration_ms.',
    section: '§14.2',
    keys: {
      operations: { type: 'list', section: '§14.2', doc: 'Named operations covered by this contract (`<domain>.<verb>`).' },
      logFields: { type: 'list', section: '§14.2', doc: 'Structured fields that MUST be present on every operation record (`?` = when known).' },
      outcome: { type: 'closed enum', section: '§14.2', doc: 'Terminal-status vocabulary; codegen maps each code path to exactly one.' },
      emit: { type: 'list', section: '§14.2', doc: 'Side-channel emissions (SSE/domain events) that must be logged, with their field shape.' },
      mustNotLog: { type: 'list', section: '§14.2', doc: 'Fields forbidden from logs (secrets/PII) or facts the runtime cannot actually know.' },
      version: FREEZE_KEYS.version,
    },
  },
  plugin: {
    doc: 'Plugin/registry contract: many small modules behind one uniform interface, dispatched through a registry map.',
    section: '§12.2',
    keys: {
      interface: { type: 'signature', section: '§12.2', doc: 'The single method/shape every plugin module implements.' },
      registry: { type: 'file', section: '§12.2', doc: 'The one place mapping `key → module`; string-keyed dispatch.' },
      key: { type: 'expr', section: '§12.2', doc: 'Runtime selector (e.g. a provider id, a domain name).' },
      members: { type: 'list', section: '§12.2', doc: 'Currently registered modules — canonical list; must match the registry and the folders on disk.' },
      onMissing: { type: 'expr', section: '§12.2', doc: 'Behavior when `key` has no registered module (fail-closed by default).' },
      addModule: { type: 'steps', section: '§12.2', doc: 'The exact recipe codegen follows to add a new plugin — folder + interface impl + registry line.' },
      version: FREEZE_KEYS.version,
    },
  },
};

export const BLOCK_KINDS = Object.keys(BLOCKS);

/** Keys usable as single-line shorthand `//@pre: x != 0` — they open an implicit contract block (§4). */
export const SHORTHAND_KEYS = ['pre', 'post', 'inv', 'raises', 'assigns', 'returns', 'realizes', 'realizedBy'];

/** Keys whose values are contract expressions (checked for old()/!! rules, §5–§6). */
export const EXPR_KEYS = new Set(['pre', 'post', 'inv', 'key', 'when', 'onMissing']);

/** Acme profile §18.1 topic templates. */
export const PROFILE_TOPICS = {
  commandIn: /^[a-z0-9-]+\.[a-z0-9-]+\.command\.[a-z0-9-]+$/,
  eventOut: /^[a-z0-9-]+\.event\.[a-z0-9-]+$/,
  failedEvent: /^[a-z0-9-]+\.event\.[a-z0-9-]+-failed$/,
  dlqCode: /^[a-z0-9-]+\.[a-z0-9-]+\.dlq$/,
  dlqScoped: /^[a-z0-9-]+\.integration\.dlq\.[a-z0-9-]+$/,
  retry: /^retry\.[a-z0-9-]+\.[a-z0-9-]+\.command\.[a-z0-9-]+$/,
};

/** True when a produced topic looks like a provider-prefixed event (§18.1 asymmetry rule violation). */
export function isProviderPrefixedEvent(topic: string): boolean {
  const parts = topic.split('.');
  return parts.length >= 4 && parts[1] !== 'event' && parts.includes('event') && parts.indexOf('event') === 2;
}

export const FILL_TOKEN_RE = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g;
export const ANCHOR_RE = /([\w./-]+\.[\w-]+|[\w./-]+)#([\w.]+)/;
