/**
 * @file Message and lock file types, shared by the server and documented in
 * docs/ide-protocol.md.
 */

/** A highlighted range. Lines are 1-based and inclusive. */
export interface Selection {
  startLine: number;
  endLine: number;
  text: string;
}

/** Sent whenever the active editor changes (and once on connect). */
export interface ActiveFileMessage {
  type: 'active_file';
  /** Path relative to its workspace folder, `/` separated; null if none. */
  path: string | null;
}

/** Sent whenever the selection changes (and once on connect). */
export interface SelectionMessage {
  type: 'selection';
  path: string | null;
  /** Null when nothing is highlighted (an empty cursor). */
  selection: Selection | null;
}

/** Any message the server sends. */
export type ServerMessage = ActiveFileMessage | SelectionMessage;

/** Contents of `<port>.lock`. */
export interface LockFile {
  port: number;
  pid: number;
  authToken: string;
  ideName: string;
  workspaceFolders: string[];
  transport: 'ws';
}

/** Name of the header carrying the lock file's auth token. */
export const AUTH_HEADER = 'x-review-tui-auth';
