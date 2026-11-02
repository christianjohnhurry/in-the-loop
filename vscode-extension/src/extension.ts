import {relative, sep} from 'node:path';
import * as vscode from 'vscode';
import {toSelection} from './lines';
import {removeLock, writeLock} from './lock';
import type {ServerMessage} from './protocol';
import {startServer} from './server';
import type {IdeServer} from './server';

const DEBOUNCE_MS = 100;

function repoRelativePath(doc: vscode.TextDocument): string | null {
  if (doc.uri.scheme !== 'file') return null;
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const rel = relative(folder?.uri.fsPath ?? '', doc.uri.fsPath);
  return folder ? rel.split(sep).join('/') : null;
}

function describe(editor: vscode.TextEditor | undefined): ServerMessage[] {
  const path = editor ? repoRelativePath(editor.document) : null;
  const sel = path && editor ? editor.selection : undefined;
  const selection = sel
    ? toSelection(sel.start, sel.end, editor!.document.getText(sel))
    : null;
  return [
    {type: 'active_file', path},
    {type: 'selection', path, selection},
  ];
}

let server: IdeServer | undefined;
let lockPath: string | undefined;

/**
 * Starts the server, writes the lock file and wires up editor events.
 *
 * @param context Extension context.
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const srv = await startServer();
  server = srv;
  lockPath = writeLock({
    port: srv.port,
    pid: process.pid,
    authToken: srv.authToken,
    ideName: vscode.env.appName,
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(
      (f) => f.uri.fsPath,
    ),
    transport: 'ws',
  });
  // Backstop for hosts that exit without calling deactivate().
  process.on('exit', () => lockPath && removeLock(lockPath));

  let lastFile: string | null | undefined;
  let timer: NodeJS.Timeout | undefined;
  const push = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const [file, selection] = describe(vscode.window.activeTextEditor);
      if (file && file.type === 'active_file' && file.path !== lastFile) {
        lastFile = file.path;
        srv.publish(file);
      }
      if (selection) srv.publish(selection);
    }, DEBOUNCE_MS);
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(push),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) push();
    }),
    {dispose: () => clearTimeout(timer)},
  );
  push();
}

/** Closes the server and removes the lock file. */
export async function deactivate(): Promise<void> {
  if (lockPath) removeLock(lockPath);
  await server?.close();
}
