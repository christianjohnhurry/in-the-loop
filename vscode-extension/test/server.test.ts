import {afterEach, expect, test} from 'bun:test';
import {existsSync, mkdtempSync, readFileSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pos} from '../src/lines';
import {toSelection} from '../src/lines';
import {removeLock, writeLock} from '../src/lock';
import {AUTH_HEADER} from '../src/protocol';
import {startServer} from '../src/server';
import type {IdeServer} from '../src/server';

let server: IdeServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const open = (
  port: number,
  headers: Record<string, string>,
): Promise<{ws: WebSocket; msgs: unknown[]}> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, {headers});
    const msgs: unknown[] = [];
    ws.onmessage = (e): void => void msgs.push(JSON.parse(String(e.data)));
    ws.onopen = (): void => resolve({ws, msgs});
    ws.onerror = (): void => reject(new Error('refused'));
  });

const until = async (f: () => boolean): Promise<void> => {
  for (let i = 0; i < 50 && !f(); i++) await Bun.sleep(20);
};

test('refuses missing and wrong tokens', async () => {
  server = await startServer();
  await expect(open(server.port, {})).rejects.toThrow('refused');
  await expect(open(server.port, {[AUTH_HEADER]: 'nope'})).rejects.toThrow(
    'refused',
  );
});

test('refuses browser origins even with the right token', async () => {
  server = await startServer();
  await expect(
    open(server.port, {
      [AUTH_HEADER]: server.authToken,
      Origin: 'https://evil.example',
    }),
  ).rejects.toThrow('refused');
});

test('authenticated client gets current state, then updates', async () => {
  server = await startServer();
  server.publish({type: 'active_file', path: 'src/a.ts'});
  const {ws, msgs} = await open(server.port, {
    [AUTH_HEADER]: server.authToken,
  });
  await until(() => msgs.length >= 1);
  expect(msgs).toEqual([{type: 'active_file', path: 'src/a.ts'}]);
  const selection = {startLine: 2, endLine: 4, text: 'x'};
  server.publish({type: 'selection', path: 'src/a.ts', selection});
  await until(() => msgs.length >= 2);
  expect(msgs[1]).toEqual({type: 'selection', path: 'src/a.ts', selection});
  ws.close();
});

test('lock file is private and removable', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ide-')), 'ide');
  const path = writeLock(
    {
      port: 1234,
      pid: 1,
      authToken: 't',
      ideName: 'x',
      workspaceFolders: ['/w'],
      transport: 'ws',
    },
    dir,
  );
  expect(path).toBe(join(dir, '1234.lock'));
  expect(JSON.parse(readFileSync(path, 'utf8')).authToken).toBe('t');
  expect(statSync(path).mode & 0o777).toBe(0o600);
  removeLock(path);
  expect(existsSync(path)).toBe(false);
  removeLock(path);
});

test('toSelection converts to 1-based inclusive lines', () => {
  const p = (line: number, character: number): Pos => ({line, character});
  expect(toSelection(p(4, 2), p(4, 2), '')).toBeNull();
  expect(toSelection(p(41, 0), p(47, 5), 't')).toEqual({
    startLine: 42,
    endLine: 48,
    text: 't',
  });
  // Whole lines 42-48 selected: ends at column 0 of the next line.
  expect(toSelection(p(41, 0), p(48, 0), 't')?.endLine).toBe(48);
});
