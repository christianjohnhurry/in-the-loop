/**
 * @file Writes and removes the lock file clients use to find the server.
 * See docs/ide-protocol.md for its contents.
 */
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {LockFile} from './protocol';

/**
 * Discovery directory. Override with `REVIEW_TUI_IDE_DIR` (used by tests).
 *
 * @return The directory holding `<port>.lock` files.
 */
export function lockDir(): string {
  return (
    process.env.REVIEW_TUI_IDE_DIR ?? join(homedir(), '.review-tui', 'ide')
  );
}

/**
 * Writes the lock file, readable by the current user only.
 *
 * @param lock Contents.
 * @param dir Discovery directory.
 * @return The path written.
 */
export function writeLock(lock: LockFile, dir = lockDir()): string {
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const path = join(dir, `${lock.port}.lock`);
  writeFileSync(path, JSON.stringify(lock, null, 2), {mode: 0o600});
  return path;
}

/**
 * Removes a lock file; a missing file is not an error.
 *
 * @param path Path returned by {@link writeLock}.
 */
export function removeLock(path: string): void {
  rmSync(path, {force: true});
}
