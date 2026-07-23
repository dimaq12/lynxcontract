# Client + declarative-artifact contracts

```
//@contract: activate
//@  lang: typescript
//@  realizedBy: [client/src/extension.ts]
//@  signature: activate(context: vscode.ExtensionContext): void
//@  intent: >
//@    Thin LSP client: start the language server (node IPC), scope it to the
//@    documents LynxContract lives in, forward file-watch events, and expose
//@    the lynxcontract.* configuration section.
//@  rules:
//@    - documentSelector: kotlin, java, lynxcontract, and markdown ONLY via **/*.lynx.md pattern (plain markdown stays untouched).
//@    - fileEvents watcher covers **/*.{kt,java,md} so cross-file lints stay fresh.
//@  calls: [vscode-languageclient.LanguageClient]
//@  post: client started; deactivate() stops it
//@  assigns: [client]
//@
//@contract: ExtensionManifest
//@  lang: json
//@  realizedBy: [package.json]
//@  intent: VS Code manifest wiring every contribution point.
//@  rules:
//@    - contributes.languages registers id `lynxcontract` (.lynx files) — .lynx.kt stays language kotlin, highlight arrives via injection.
//@    - contributes.grammars: injection grammar into source.kotlin, source.java, text.html.markdown; standalone grammar for lynxcontract.
//@    - contributes.snippets target kotlin, java, markdown, lynxcontract.
//@    - contributes.configuration exposes lynxcontract.acmeProfile (bool, default true) and lynxcontract.unknownKeySeverity.
//@    - activationEvents: onLanguage for the four languages + workspaceContains **/*.lynx.*
//@
//@contract: InjectionGrammar
//@  lang: json
//@  realizedBy: [syntaxes/lynxcontract.injection.tmLanguage.json]
//@  intent: >
//@    TextMate injection that colors //@ blocks inside Kotlin/Java/markdown
//@    without replacing the host grammar. Left-precedence injection so //@ wins
//@    over the host's // comment rule.
//@  rules:
//@    - Scopes: block starters keyword.control; keys support.type.property-name; enum/bool constant.language; {{Fill}} constant.other.placeholder; # etalon/# comments comment.line; strings string.quoted; old()/result/forall/exists keyword.other.
//@    - MUST highlight: single-line shorthand, //@end, quoted values, expression operators.
//@
//@contract: StandaloneGrammar
//@  lang: json
//@  realizedBy: [syntaxes/lynxcontract.tmLanguage.json]
//@  intent: same token rules for pure .lynx files (§8 "plain //@-only file").
//@
//@contract: Snippets
//@  lang: json
//@  realizedBy: [snippets/lynxcontract.json]
//@  intent: one snippet per block kind (7) + contract-first module spec (§8) + archetype stub header (§20.1) + messaging full example (§13).
//@  rules:
//@    - Snippet bodies must be spec-valid LynxContract that passes this extension's own structural lint.
//@
//@contract: LanguageConfiguration
//@  lang: json
//@  realizedBy: [language-configuration.json]
//@  intent: comments/brackets/folding markers for the lynxcontract language id.
```
