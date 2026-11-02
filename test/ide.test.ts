import {expect, test} from 'bun:test';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildReviewPayload, parseDiff} from '../src/github';
import {
  AUTH_HEADER,
  IdeClient,
  describeContext,
  discoverIdes,
  resolveTarget,
  type LockFile,
} from '../src/ide';
import {formatInline, parseInline} from '../src/store';

const diff = await Bun.file(`${import.meta.dir}/fixtures/sample.diff`).text();
const files = parseDiff(diff);
const lock = (over: Partial<LockFile> = {}): LockFile => ({
  port: 1,
  pid: process.pid,
  authToken: 't',
  ideName: 'Visual Studio Code',
  workspaceFolders: ['/repo'],
  transport: 'ws',
  ...over,
});

test('range comments round-trip through comments.md and the payload', () => {
  const c = {path: 'src/greet.ts', startLine: 2, line: 4, body: 'why?'};
  expect(formatInline(c)).toBe('- src/greet.ts:L2-4 — why?');
  expect(parseInline(`## Inline\n${formatInline(c)}\n`)).toEqual([c]);
  const one = {path: 'src/greet.ts', line: 3, body: 'x'};
  expect(parseInline(`## Inline\n${formatInline(one)}\n`)).toEqual([one]);
  const p = buildReviewPayload({
    prefix: '[a]',
    general: 'g',
    comments: [c, one],
    headSha: 'sha',
  });
  expect(p.comments[0]).toMatchObject({
    start_line: 2,
    line: 4,
    start_side: 'RIGHT',
    side: 'RIGHT',
  });
  expect(p.comments[1]).not.toHaveProperty('start_line');
});

test('resolveTarget: selection, file-only, outside diff', () => {
  const sel = (a: number, b: number): {path: string; selection: object} => ({
    path: 'src/greet.ts',
    selection: {startLine: a, endLine: b, text: ''},
  });
  const ide = lock();
  expect(resolveTarget(sel(2, 4) as never, ide, '/repo', files)).toEqual({
    path: 'src/greet.ts',
    startLine: 2,
    line: 4,
  });
  expect(resolveTarget(sel(3, 3) as never, ide, '/repo', files)).toEqual({
    path: 'src/greet.ts',
    line: 3,
  });
  const bad = resolveTarget(sel(5, 40) as never, ide, '/repo', files);
  expect(bad).toHaveProperty('error');
  const fileOnly = {path: 'src/greet.ts', selection: null};
  expect(resolveTarget(fileOnly, ide, '/repo', files)).toHaveProperty('error');
  expect(resolveTarget(fileOnly, ide, '/repo', files, '3')).toEqual({
    path: 'src/greet.ts',
    line: 3,
  });
  expect(
    resolveTarget({path: 'nope.ts', selection: null}, ide, '/repo', files, '1'),
  ).toHaveProperty('error');
});

test('resolveTarget maps paths when the workspace is a subfolder', () => {
  const ide = lock({workspaceFolders: ['/repo/src']});
  expect(
    resolveTarget(
      {path: 'greet.ts', selection: null},
      ide,
      '/repo',
      files,
      '2',
    ),
  ).toEqual({path: 'src/greet.ts', line: 2});
});

test('describeContext', () => {
  const s = {startLine: 42, endLine: 48, text: ''};
  expect(describeContext({path: 'a.ts', selection: s})).toBe('a.ts:L42-48');
  expect(describeContext({path: 'a.ts', selection: null})).toBe('a.ts');
  expect(describeContext({path: null, selection: null})).toBe('');
});

test('discoverIdes skips stale pids, corrupt files and other workspaces', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ide-'));
  const w = (n: string, l: unknown): void =>
    writeFileSync(join(dir, n), typeof l === 'string' ? l : JSON.stringify(l));
  w('1.lock', lock({port: 1}));
  w('2.lock', lock({port: 2, pid: 2 ** 22 + 1})); // no such process
  w('3.lock', lock({port: 3, workspaceFolders: ['/elsewhere']}));
  w('4.lock', '{half');
  w('5.lock', lock({port: 5, workspaceFolders: ['/repo/sub']}));
  const found = await discoverIdes('/repo', dir);
  expect(found.map((f) => f.lock.port)).toEqual([1, 5]);
  expect(await discoverIdes('/repo', join(dir, 'missing'))).toEqual([]);
});

test('IdeClient authenticates, tracks context, survives the IDE closing', async () => {
  let seenToken: string | null = null;
  const server = Bun.serve<undefined>({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req, s) {
      seenToken = req.headers.get(AUTH_HEADER);
      if (seenToken !== 'secret') return new Response('no', {status: 401});
      return s.upgrade(req) ? undefined : new Response('?', {status: 400});
    },
    websocket: {
      open(ws) {
        ws.send(JSON.stringify({type: 'active_file', path: 'src/greet.ts'}));
        ws.send(
          JSON.stringify({
            type: 'selection',
            path: 'src/greet.ts',
            selection: {startLine: 2, endLine: 4, text: 'x'},
          }),
        );
      },
      message() {},
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'ide-'));
  const lockPath = join(dir, `${server.port}.lock`);
  const mk = (token: string): {lock: LockFile; lockPath: string} => ({
    lock: lock({port: server.port, authToken: token}),
    lockPath,
  });
  const client = new IdeClient(() => {});
  await expect(client.connect(mk('wrong'))).rejects.toThrow();
  expect(client.status).toBe('disconnected');

  await client.connect(mk('secret'));
  await Bun.sleep(100);
  expect(client.status).toBe('connected');
  expect(describeContext(client.context)).toBe('src/greet.ts:L2-4');

  server.stop(true); // VS Code quits; the lock is gone too
  await Bun.sleep(100);
  expect(client.status).toBe('disconnected');
  expect(client.context).toEqual({path: null, selection: null});
  expect(client.problem).toContain('closed');
  client.disconnect();
});
