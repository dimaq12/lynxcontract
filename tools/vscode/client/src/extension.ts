//@realizes: [contracts/client-syntax#activate]
import * as path from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: 'kotlin' },
      { language: 'java' },
      { language: 'go' },
      { language: 'python' },
      { language: 'rust' },
      { language: 'lynxcontract' },
      { language: 'markdown', pattern: '**/*.lynx.md' },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{kt,kts,java,go,py,rs,md,lynx}'),
      configurationSection: 'lynxcontract',
    },
  };
  client = new LanguageClient('lynxcontract', 'LynxContract', serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
