# Server-side contracts (language server)

```
//@contract: SpecModel
//@  lang: typescript
//@  realizedBy: [../graph/core/src/spec.ts]   # unified: the LSP consumes @lynx/core
//@  intent: >
//@    Single machine-readable model of the LynxContract v1.3 grammar: the 7 block
//@    kinds, their closed key sets, per-key docs (with spec § references), enum
//@    value sets, and the Acme §18.1 topic-name templates. Every other server
//@    module reads the grammar from here — never re-encodes it.
//@  rules:
//@    - Key sets and enums MUST mirror lynxcontract-spec-kotlin-java-v1.3.md exactly; the spec wins on conflict.
//@    - Unknown keys are a WARNING, not an error (spec §19 forward-compat).
//@    - The error-route vocabulary is closed: retry-in-process, retry-topic, failed-event, dlq, drop (§13.1).
//@  post: exports BLOCKS (7 kinds), ERROR_ROUTES, FORMATS, ORDERINGS, PROFILE_TOPIC templates, SHORTHAND_KEYS
//@  assigns: []                            # pure constant data
//@
//@contract: Parser
//@  lang: typescript
//@  realizedBy: [../graph/core/src/parser.ts] # unified: the LSP consumes @lynx/core
//@  signature: parseDocument(text: string, uri: string): ParsedFile
//@  intent: >
//@    Turn one file's text into structured LynxContract blocks: //@-form (§2.1),
//@    KDoc/Javadoc tag form (§2.2), single-line shorthand (//@pre: ...), the
//@    optional //@end sentinel, YAML-ish nested entries, list items, raw
//@    multi-line values (| and >) including inline mermaid, trailing # comments,
//@    {{Fill}} tokens (§20.2) and file#contract anchors (§7.1).
//@  pre: text is the full document content; uri is absolute
//@  post:
//@    - result.blocks preserves source order; every block has kind, optional name (+ nameRange), startLine, endLine, entries tree
//@    - every entry carries exact line + column ranges for key and value (diagnostics need precise ranges)
//@    - raw-block children (value `|`/`>`) are NEVER parsed as keys      # mermaid fences must survive
//@    - result.fills lists every {{Token}} with its range; result.anchors lists every `path#contract` reference
//@  raises: {}                             # a parser never throws on malformed input; it degrades to fewer blocks
//@  assigns: []
//@
//@contract: WorkspaceIndex
//@  lang: typescript
//@  realizedBy: [server/src/workspaceIndex.ts]
//@  intent: >
//@    Cross-file view: scan workspace folders for .kt/.kts/.java/.ts/.lynx*/.md
//@    files containing //@ blocks, cache ParsedFile per uri (mtime-invalidated), and
//@    answer the graph questions: which contracts exist (by anchor), which file
//@    realizes what, where a fill registry lives.
//@  rules:
//@    - Skip node_modules, .git, build, out, target, dist directories.
//@    - Anchor resolution is suffix-based both on path (extension-insensitive, .lynx-insensitive) and contract name (§7.1 examples resolve).
//@    - The index MUST be refreshable per-file (didChangeWatchedFiles) without a full rescan.
//@  post: exports scan(folders), refreshPath(path), refreshContent(uri, text), remove(uri), get(uri), files(), contracts(), resolveAnchor(ref, fromUri), resolveFile(ref), fillRegistry()
//@  assigns: [cache]                       # the only mutable state, private to the module
//@
//@contract: Diagnostics
//@  lang: typescript
//@  realizedBy: [server/src/diagnostics.ts]
//@  signature: validate(file: ParsedFile, index: Index, settings: Settings): Diagnostic[]
//@  intent: >
//@    All lints, layered: structural (per file), messaging §13.3, Acme topic
//@    naming §18.1 (toggleable), realization edges §7.1, graph inventory §12.1,
//@    token closure §20.8-2. Each diagnostic carries the spec § in its code.
//@  rules:                                 # the lint catalogue — closed, from the spec
//@    - unknown block kind → Error; unknown key in a known block → Warning (§19)
//@    - enum-valued keys (format, ordering, error routes) reject values outside the closed set → Error (§13.1)
//@    - old() outside post/inv → Error (§6); `!!` inside any contract expression → Error (§5)
//@    - produces.when raises E without a matching errors route for E → Error (§13.3)
//@    - idempotent false + any errors route retry-topic → Error "double-actuation risk" (§13.3)
//@    - errors route drop without an inline rationale comment → Error; drop combined with failed-event for the same exception → Error (§13.3, v1.2)
//@    - Acme profile ON: consumed topic must match <provider>.<domain>.command.<action>; produced event must NOT carry a provider prefix; `when: raises` event SHOULD end -failed; dlq must match a §18.1 DLQ template (§18.1)
//@    - realizes → anchor that does not resolve → Error; contract realizedBy file missing on disk → Warning (§7.1)
//@    - graph files entry whose path is missing on disk → Error (§12.1)
//@    - {{Fill}} used but absent from the workspace fill registry (when a registry exists) → Warning (§20.2, §20.8-2)
//@  post: every Diagnostic has range, severity, code "lynx.<rule>", message citing the spec §
//@  assigns: []
//@
//@contract: Features
//@  lang: typescript
//@  realizedBy: [server/src/features.ts]
//@  intent: >
//@    The interactive half: completion (block starters after //@, keys per block
//@    kind, enum values per key), hover (per-key docs from SpecModel with spec §),
//@    go-to-definition (realizes / realizedBy / anchors), document symbols
//@    (one symbol per block, named), folding ranges (block extents), and
//@    semantic tokens — role-based coloring that works in any theme.
//@  rules:
//@    - Completion inside a block offers ONLY that kind's keys (closed set from SpecModel).
//@    - Hover text comes from SpecModel docs — never hard-coded twice (single-source rule §20.8-7).
//@    - Definition on a realizes value jumps to the contract block line, not just the file.
//@    - Semantic token types are the STANDARD LSP set only (themes must color them without configuration).
//@    - Token roles: block kind → keyword(declaration); block name → function(declaration); known key → property;
//@      topic/dlq values → namespace; payload types (as/emits/returns/signature/interface) → type;
//@      exception names (raises/errors keys) → class; error routes + closed-enum values → enumMember;
//@      {{Fill}} → macro; intent/doc/rules prose → comment(documentation); expression keywords (old/result/forall/exists/raises/in) → keyword; numbers → number;
//@      realizes/realizedBy anchors → namespace.
//@    - Tokens NEVER overlap: fills win, then narrower role tokens; raw mermaid children are left to TextMate.
//@    - Output is the LSP delta-encoded uint array over exported TOKEN_TYPES/TOKEN_MODIFIERS legend.
//@  post: exports completion(...), hover(...), definition(...), documentSymbols(...), foldingRanges(...), semanticTokens(...), TOKEN_TYPES, TOKEN_MODIFIERS
//@  assigns: []
//@
//@contract: LspWiring
//@  lang: typescript
//@  realizedBy: [server/src/server.ts]
//@  intent: >
//@    Bind everything to vscode-languageserver: capabilities, document sync,
//@    validation on open/change (debounced), index refresh on watched-file
//@    changes, settings pull (lynxcontract.* section).
//@  calls: [Parser.parseDocument, WorkspaceIndex.scan, WorkspaceIndex.refresh, Diagnostics.validate, Features.*]
//@  post: server answers initialize with completion/hover/definition/documentSymbol/foldingRange/semanticTokens(full)/textDocumentSync capabilities
//@  assigns: [documents, settingsCache]
```
