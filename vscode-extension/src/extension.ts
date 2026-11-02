/**
 * @file VS Code entry point: watches the active editor and selection and hands
 * them to the local server (`server.ts`), advertising it via a lock file.
 */
import {relative, sep} from 'node:path';
import * as vscode from 'vscode';
import {toSelection} from './lines';
import {removeLock, writeLock} from './lock';
import type {ServerMessage} from './protocol';
import {startServer} from './server';
import type {IdeServer} from './server';

/**
 * How long to wait after the last editor event before sending, so dragging a
 * selection sends one message when it settles, not one per mouse move.
 */
const DEBOUNCE_MS = 100;

/**
 * Gives a document's path relative to its workspace folder, with `/`
 * separators on every platform.
 *
 * @param doc The document.
 * @return The path, or null if it isn't a file inside a workspace folder
 *     (e.g. an untitled buffer or a settings page).
 */
function repoRelativePath(doc: vscode.TextDocument): string | null {
  if (doc.uri.scheme !== 'file') return null;
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const rel = relative(folder?.uri.fsPath ?? '', doc.uri.fsPath);
  return folder ? rel.split(sep).join('/') : null;
}

/**
 * Builds the messages describing the editor's current file and selection.
 *
 * @param editor The active editor, if any.
 * @return An `active_file` message followed by a `selection` message.
 */
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

/** The running server, kept so `deactivate` can close it. */
let server: IdeServer | undefined;
/** Path of our lock file, kept so `deactivate` can delete it. */
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

  // Last file path sent, so `active_file` is only sent when it changes.
  let lastFile: string | null | undefined;
  let timer: NodeJS.Timeout | undefined;
  // Waits for editor events to settle, then sends the current state.
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
