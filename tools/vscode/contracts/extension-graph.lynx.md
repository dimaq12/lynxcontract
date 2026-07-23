# LynxContract VS Code Extension — module composition graph

Contract tree for the `lynxcontract-vscode` extension itself (contract-first,
spec §8 + §12.1). Language of realization is TypeScript; the LynxContract core
(§1–§10) is language-agnostic, so `lang: typescript` is used where §8 says
`kotlin|java` — a declared, deliberate extension of the profile.

```
//@graph: lynxcontract-vscode
//@  version: "1.3-jvm"
//@  files:
//@    - package.json                       realizes: [contracts/client-syntax#ExtensionManifest]
//@    - language-configuration.json        realizes: [contracts/client-syntax#LanguageConfiguration]
//@    - syntaxes/lynxcontract.injection.tmLanguage.json realizes: [contracts/client-syntax#InjectionGrammar]
//@    - syntaxes/lynxcontract.tmLanguage.json realizes: [contracts/client-syntax#StandaloneGrammar]
//@    - snippets/lynxcontract.json         realizes: [contracts/client-syntax#Snippets]
//@    - client/src/extension.ts            realizes: [contracts/client-syntax#activate]
//@    - server/src/server.ts               realizes: [contracts/server#LspWiring]
//@    - ../graph/core/src/spec.ts          realizes: [contracts/server#SpecModel] # shared @lynx/core
//@    - ../graph/core/src/parser.ts        realizes: [contracts/server#Parser] # shared @lynx/core
//@    - server/src/workspaceIndex.ts       realizes: [contracts/server#WorkspaceIndex]
//@    - server/src/diagnostics.ts          realizes: [contracts/server#Diagnostics]
//@    - server/src/features.ts             realizes: [contracts/server#Features]
//@    - server/src/test/parser.test.ts     realizes: [contracts/server#Parser] # contract-test
//@    - server/src/test/diagnostics.test.ts realizes: [contracts/server#Diagnostics] # contract-test
//@    - server/src/test/features.test.ts   realizes: [contracts/server#Features] # contract-test
//@    - README.md
//@    - examples/RegisterDeviceRoute.kt
//@  depends:
//@    client/src/extension.ts: [vscode, vscode-languageclient]
//@    server/src/server.ts: [../graph/core/src/spec.ts, ../graph/core/src/parser.ts, server/src/workspaceIndex.ts, server/src/diagnostics.ts, server/src/features.ts, vscode-languageserver]
//@    ../graph/core/src/parser.ts: [../graph/core/src/spec.ts]
//@    server/src/workspaceIndex.ts: [server/src/parser.ts]
//@    server/src/diagnostics.ts: [server/src/spec.ts, server/src/parser.ts, server/src/workspaceIndex.ts]
//@    server/src/features.ts: [server/src/spec.ts, server/src/parser.ts, server/src/workspaceIndex.ts]
//@    ../graph/core/src/spec.ts: []                # pure data, no deps
//@  dataflow: |
//@    ```mermaid
//@    flowchart LR
//@      ED[VS Code editor] -->|didOpen/didChange| C[client/extension.ts]
//@      C -->|LSP| S[server.ts]
//@      S --> P[parser.ts] --> WI[workspaceIndex.ts]
//@      P --> D[diagnostics.ts] -->|publishDiagnostics| ED
//@      WI --> F[features.ts] -->|completion/hover/def/symbols/folding| ED
//@      TM[injection grammar] -->|TextMate| ED
//@    ```
//@  vanilla: "Remove contracts/ and this is a standard VS Code LSP extension (client + server + syntaxes)."
```

```
//@module:
//@  layer: tooling
//@  package: lynxcontract-vscode
//@  depends: [vscode, vscode-languageserver, vscode-languageserver-textdocument, vscode-languageclient, "@lynx/core", node:fs, node:path, node:url]
//@  exposes: [activate, deactivate]
//@  restrictions: []                       # nothing may depend on extension internals
//@  doc: "IDE tooling for the LynxContract annotation language v1.3 (spec at repo root)."
```
