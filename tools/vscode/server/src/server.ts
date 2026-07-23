//@realizes: [contracts/server#LspWiring]
import {
  createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind,
  InitializeParams, DidChangeWatchedFilesParams, FileChangeType,
  CompletionItem, Hover, Location, DocumentSymbol, FoldingRange, Diagnostic,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'node:url';
import { parseDocument, ParsedFile } from '@lynx/core';
import { WorkspaceIndex } from './workspaceIndex';
import { validate, DEFAULT_SETTINGS, Settings } from './diagnostics';
import { completion, hover, definition, documentSymbols, foldingRanges, semanticTokens, TOKEN_TYPES, TOKEN_MODIFIERS } from './features';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const index = new WorkspaceIndex();

let settings: Settings = DEFAULT_SETTINGS;
let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  hasConfigurationCapability = !!params.capabilities.workspace?.configuration;
  const folders = params.workspaceFolders?.map((f) => f.uri) ?? (params.rootUri ? [params.rootUri] : []);
  index.scan(folders);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['@', ':', ' '] },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      foldingRangeProvider: true,
      semanticTokensProvider: {
        legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: TOKEN_MODIFIERS },
        full: true,
      },
    },
  };
});

connection.languages.semanticTokens.on((params) => {
  const file = parsed(params.textDocument.uri);
  return { data: file ? semanticTokens(file) : [] };
});

connection.onInitialized(async () => {
  await pullSettings();
  for (const doc of documents.all()) validateDocument(doc);
});

async function pullSettings(): Promise<void> {
  if (!hasConfigurationCapability) return;
  try {
    const cfg = await connection.workspace.getConfiguration('lynxcontract');
    settings = {
      acmeProfile: cfg?.acmeProfile ?? DEFAULT_SETTINGS.acmeProfile,
      unknownKeySeverity: cfg?.unknownKeySeverity ?? DEFAULT_SETTINGS.unknownKeySeverity,
    };
  } catch {
    settings = DEFAULT_SETTINGS;
  }
}

connection.onDidChangeConfiguration(async () => {
  await pullSettings();
  for (const doc of documents.all()) validateDocument(doc);
});

connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
  for (const change of params.changes) {
    if (change.type === FileChangeType.Deleted) index.remove(change.uri);
    else if (change.uri.startsWith('file://')) index.refreshPath(fileURLToPath(change.uri));
  }
  for (const doc of documents.all()) validateDocument(doc);
});

const pending = new Map<string, NodeJS.Timeout>();

documents.onDidChangeContent((e) => {
  const uri = e.document.uri;
  clearTimeout(pending.get(uri));
  pending.set(uri, setTimeout(() => validateDocument(e.document), 300));
});

documents.onDidClose((e) => {
  clearTimeout(pending.get(e.document.uri));
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

function parsed(uri: string): ParsedFile | undefined {
  const doc = documents.get(uri);
  if (doc) return index.refreshContent(uri, doc.getText());
  return index.get(uri);
}

function validateDocument(doc: TextDocument): void {
  const file = index.refreshContent(doc.uri, doc.getText());
  const diagnostics = validate(file, index, settings) as unknown as Diagnostic[];
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

function lineAt(uri: string, line: number): string {
  const doc = documents.get(uri);
  if (!doc) return '';
  return doc.getText({ start: { line, character: 0 }, end: { line, character: 10_000 } });
}

connection.onCompletion((params): CompletionItem[] => {
  const file = parsed(params.textDocument.uri);
  if (!file) return [];
  return completion(file, lineAt(params.textDocument.uri, params.position.line), params.position) as CompletionItem[];
});

connection.onHover((params): Hover | null => {
  const file = parsed(params.textDocument.uri);
  if (!file) return null;
  return hover(file, lineAt(params.textDocument.uri, params.position.line), params.position) as Hover | null;
});

connection.onDefinition((params): Location | null => {
  return definition(index, lineAt(params.textDocument.uri, params.position.line), params.position) as Location | null;
});

connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const file = parsed(params.textDocument.uri);
  if (!file) return [];
  return documentSymbols(file) as DocumentSymbol[];
});

connection.onFoldingRanges((params): FoldingRange[] => {
  const file = parsed(params.textDocument.uri);
  if (!file) return [];
  return foldingRanges(file) as FoldingRange[];
});

documents.listen(connection);
connection.listen();
