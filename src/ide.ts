/**
 * @file Client for the VS Code extension's selection protocol
 * (docs/ide-protocol.md): finds running IDEs, connects, and tracks the active
 * file and selection.
 */
import {existsSync, realpathSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {validateRange} from './github';

/** Contents of a `<port>.lock` file. */
export interface LockFile {
  port: number;
  pid: number;
  authToken: string;
  ideName: string;
  workspaceFolders: string[];
  transport: 'ws';
}

/** A lock file plus where it was found. */
export interface FoundIde {
  lock: LockFile;
  /** Path of the lock file, so a vanished lock means the IDE has gone. */
  lockPath: string;
}

/** A highlighted range. Lines are 1-based and inclusive. */
export interface IdeSelection {
  startLine: number;
  endLine: number;
  text: string;
}

/** What the reviewer is looking at right now. */
export interface IdeContext {
  /** Path relative to its workspace folder; null when no file is active. */
  path: string | null;
  /** Null for a bare cursor. */
  selection: IdeSelection | null;
}

/** Name of the header carrying the lock file's auth token. */
export const AUTH_HEADER = 'x-review-tui-auth';

/** The lock-file directory (`REVIEW_TUI_IDE_DIR` overrides the default). */
export function lockDir(): string {
  return (
    process.env.REVIEW_TUI_IDE_DIR ?? join(homedir(), '.review-tui', 'ide')
  );
}

/** Resolves symlinks where the path exists, so comparisons are fair. */
function canon(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

/** True if `child` is `parent` or inside it. */
function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Whether a workspace belongs to the repo checkout: the workspace contains
 * the repo or equals it, or sits inside it (a monorepo subfolder).
 *
 * @param lock The IDE's lock file.
 * @param repoRoot Absolute path of the repo checkout.
 * @return True if any workspace folder matches.
 */
export function matchesRepo(lock: LockFile, repoRoot: string): boolean {
  const root = canon(repoRoot);
  return lock.workspaceFolders.some((f) => {
    const wf = canon(f);
    return within(wf, root) || within(root, wf);
  });
}

/** True if a process with this pid exists (even if we can't signal it). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Parses a lock file; null if it is not a usable lock. */
function parseLock(text: string): LockFile | null {
  try {
    const l = JSON.parse(text) as Partial<LockFile>;
    if (
      typeof l.port === 'number' &&
      typeof l.pid === 'number' &&
      typeof l.authToken === 'string' &&
      Array.isArray(l.workspaceFolders)
    )
      return {
        port: l.port,
        pid: l.pid,
        authToken: l.authToken,
        ideName: l.ideName ?? 'IDE',
        workspaceFolders: l.workspaceFolders.map(String),
        transport: 'ws',
      };
  } catch {
    // fall through: corrupt or half-written lock
  }
  return null;
}

/**
 * Scans the lock directory for running IDEs whose workspace matches the repo.
 * Unreadable locks and locks whose process is gone (left by a crash) are
 * skipped; a port that refuses connections is caught later, on connect.
 *
 * @param repoRoot Absolute path of the repo checkout.
 * @param dir Lock directory; defaults to {@link lockDir}.
 * @return Matching IDEs, in port order.
 */
export async function discoverIdes(
  repoRoot: string,
  dir: string = lockDir(),
): Promise<FoundIde[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return []; // no IDE has ever run the extension
  }
  const found: FoundIde[] = [];
  for (const name of names.filter((n) => n.endsWith('.lock')).sort()) {
    const lockPath = join(dir, name);
    const lock = parseLock(
      await Bun.file(lockPath)
        .text()
        .catch(() => ''),
    );
    if (lock && alive(lock.pid) && matchesRepo(lock, repoRoot))
      found.push({lock, lockPath});
  }
  return found;
}

/** Connection state shown to the reviewer. */
export type IdeStatus = 'disconnected' | 'connecting' | 'connected';

const RETRY_MS = 2000;
const CONNECT_TIMEOUT_MS = 3000;

/**
 * A connection to one IDE. Keeps the latest {@link IdeContext}, tells
 * `onChange` whenever anything shown to the reviewer changes, and quietly
 * reconnects if the IDE drops while its lock file still exists (e.g. a
 * window reload).
 */
export class IdeClient {
  status: IdeStatus = 'disconnected';
  ide: FoundIde | null = null;
  context: IdeContext = {path: null, selection: null};
  /** Why the last connection attempt failed or the link dropped. */
  problem = '';
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  /** @param onChange Called after any change to status or context. */
  constructor(private readonly onChange: () => void) {}

  /**
   * Connects to an IDE, replacing any existing connection.
   *
   * @param ide The IDE to connect to.
   * @throws {Error} If it cannot be reached (the state is then disconnected).
   */
  async connect(ide: FoundIde): Promise<void> {
    this.disconnect();
    this.ide = ide;
    this.status = 'connecting';
    this.problem = '';
    this.onChange();
    try {
      await this.open(ide);
    } catch (e) {
      this.ide = null;
      this.status = 'disconnected';
      this.problem = (e as Error).message;
      this.onChange();
      throw e;
    }
  }

  /** Drops the connection and forgets the context. */
  disconnect(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.ws = null; // detach first so close handlers know it was deliberate
    ws?.close();
    this.ide = null;
    this.status = 'disconnected';
    this.context = {path: null, selection: null};
    this.onChange();
  }

  private open(ide: FoundIde): Promise<void> {
    return new Promise((done, fail) => {
      const ws = new WebSocket(`ws://127.0.0.1:${ide.lock.port}`, {
        headers: {[AUTH_HEADER]: ide.lock.authToken},
      } as unknown as string[]);
      let opened = false;
      const timer = setTimeout(() => {
        ws.close();
        fail(new Error('timed out connecting to the IDE'));
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = (): void => {
        clearTimeout(timer);
        opened = true;
        this.ws = ws;
        this.status = 'connected';
        this.problem = '';
        this.onChange();
        done();
      };
      ws.onmessage = (ev): void => {
        if (this.ws === ws && typeof ev.data === 'string')
          this.receive(ev.data);
      };
      ws.onerror = (): void => {
        // A close always follows; it reports the failure.
      };
      ws.onclose = (): void => {
        clearTimeout(timer);
        if (!opened)
          return fail(new Error(`${ide.lock.ideName} refused the connection`));
        if (this.ws !== ws) return; // deliberate disconnect
        this.ws = null;
        this.status = 'disconnected';
        this.context = {path: null, selection: null};
        this.problem = `${ide.lock.ideName} closed`;
        this.onChange();
        this.scheduleRetry(ide);
      };
    });
  }

  /** Retries while the IDE's lock file survives; gives up once it is gone. */
  private scheduleRetry(ide: FoundIde): void {
    this.retry = setTimeout(async () => {
      this.retry = null;
      if (!existsSync(ide.lockPath) || !alive(ide.lock.pid)) {
        this.ide = null;
        this.onChange();
        return;
      }
      try {
        await this.open(ide);
      } catch {
        this.scheduleRetry(ide);
      }
    }, RETRY_MS);
  }

  private receive(data: string): void {
    let m: {
      type?: string;
      path?: string | null;
      selection?: IdeSelection | null;
    };
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    const path = typeof m.path === 'string' ? m.path : null;
    if (m.type === 'active_file') {
      // A different file means the old selection no longer applies.
      this.context = {
        path,
        selection: path === this.context.path ? this.context.selection : null,
      };
    } else if (m.type === 'selection') {
      this.context = {path, selection: m.selection ?? null};
    } else return;
    this.onChange();
  }
}

/** A comment target in repo-relative terms. */
export interface Target {
  path: string;
  /** First line of a range; absent for one line. */
  startLine?: number;
  line: number;
}

/**
 * Turns a workspace-relative IDE path into the repo-relative path used by the
 * diff. The workspace folder may be the repo root, a parent or a subfolder, so
 * every workspace folder is tried and one whose result is in the diff wins.
 *
 * @param ide The connected IDE.
 * @param repoRoot Absolute path of the repo checkout.
 * @param path Path from the IDE message.
 * @param files Output of `parseDiff`, to prefer a path that is in the PR.
 * @return The repo-relative path, or null if the file is outside the repo.
 */
export function toRepoPath(
  ide: LockFile,
  repoRoot: string,
  path: string,
  files: Map<string, Set<number>>,
): string | null {
  const root = canon(repoRoot);
  const candidates = ide.workspaceFolders
    .map((wf) => relative(root, join(canon(wf), path)))
    .filter((p) => !p.startsWith('..') && !isAbsolute(p))
    .map((p) => p.split(sep).join('/'));
  return candidates.find((p) => files.has(p)) ?? candidates[0] ?? null;
}

/**
 * Works out what a new comment should target.
 *
 * With a selection, that is the selected range. With only a file open, the
 * reviewer supplies the line (`lineSpec`, e.g. `42` or `42-48`).
 *
 * @param ctx What the IDE currently shows.
 * @param ide The connected IDE's lock.
 * @param repoRoot Absolute path of the repo checkout.
 * @param files Output of `parseDiff`.
 * @param lineSpec Lines typed by the reviewer when nothing is selected.
 * @return The target, or an error to show the reviewer.
 */
export function resolveTarget(
  ctx: IdeContext,
  ide: LockFile,
  repoRoot: string,
  files: Map<string, Set<number>>,
  lineSpec?: string,
): Target | {error: string} {
  if (!ctx.path) return {error: 'No file is open in the IDE'};
  const path = toRepoPath(ide, repoRoot, ctx.path, files);
  if (!path) return {error: `${ctx.path} is outside this repo`};
  let first: number;
  let last: number;
  if (ctx.selection) {
    first = ctx.selection.startLine;
    last = ctx.selection.endLine;
  } else {
    const m = lineSpec?.match(/^(\d+)(?:-(\d+))?$/);
    if (!m)
      return {
        error: `${path} is open: start with a line number, e.g. "42 comment"`,
      };
    first = Number(m[1]);
    last = m[2] === undefined ? first : Number(m[2]);
  }
  const startLine = last > first ? first : undefined;
  const err = validateRange(files, path, startLine, last);
  if (err) {
    const from = ctx.selection ? 'the IDE selection' : 'that range';
    return {
      error: `${err} (${from} is not in the PR diff; is the IDE on a different branch?)`,
    };
  }
  return {path, ...(startLine === undefined ? {} : {startLine}), line: last};
}

/** Always-visible Comments page hint for a comment not tied to code. */
export const GENERAL_COMMENT_HINT =
  'no code selected? type "general: your note" and press Enter';

/** Input placeholder on the Comments page; mentions both comment kinds. */
export const COMMENT_PLACEHOLDER = 'path:line comment, or general: your note';

/**
 * Formats a context for display, e.g. `src/llm.ts:L42-48`.
 *
 * @param ctx What the IDE currently shows.
 * @return The selection as `path:L..`, the bare path, or an empty string.
 */
export function describeContext(ctx: IdeContext): string {
  if (!ctx.path) return '';
  const s = ctx.selection;
  if (!s) return ctx.path;
  return s.endLine > s.startLine
    ? `${ctx.path}:L${s.startLine}-${s.endLine}`
    : `${ctx.path}:L${s.startLine}`;
}
