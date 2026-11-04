import {expect, test} from 'bun:test';
import {mkdtemp, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {syncLogo} from '../src/readme';
import {CORNER_LOGO, bigText, logoText, startPage} from '../src/start';
import {openStore} from '../src/store';
import type {PrInfo, State} from '../src/types';

const pr: PrInfo = {
  url: 'https://github.com/o/r/pull/3',
  owner: 'o',
  repo: 'r',
  number: 3,
  title: 't',
  body: '',
  headSha: 'abc',
  headRefName: 'feat/x',
};

const plain = (pr: PrInfo): string =>
  startPage(pr)
    .map((b) => b.chunks.map((c) => c.text).join(''))
    .join('\n');

test('start page shows logo, subtitle, repo, branch and prompt', () => {
  const t = plain(pr);
  for (const l of [...bigText('IN THE', 'medium'), ...bigText('L∞P')])
    expect(t).toContain(l);
  expect(t).toContain('R E V I E W  -  T U I');
  expect(t).toContain('repo: o/r');
  expect(t).toContain('branch: feat/x');
  expect(t).toContain('Press Enter to start');
});

test('start page shows "-" when the branch is unknown', () => {
  expect(plain({...pr, headRefName: undefined})).toContain('branch: -');
});

test('corner logo fits on one line', () => {
  expect(CORNER_LOGO).toContain('In The Loop');
  expect(CORNER_LOGO).not.toContain('\n');
});

test('a state.json without a branch still opens, keeping its page (migrated)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rtui-'));
  const dir = join(root, 'reviews', 'r-3');
  await mkdir(dir, {recursive: true});
  const old: PrInfo = {...pr};
  delete old.headRefName;
  const state: State = {
    pr: old,
    page: 2,
    checklist: {},
    intention: {status: 'open', text: '', hint: ''},
    feedback: '',
  };
  await Bun.write(join(dir, 'state.json'), JSON.stringify(state));
  await Bun.write(join(dir, 'diff.patch'), '');
  const store = await openStore(root, pr.url);
  expect(store.state.page).toBe(3);
});

test('README logo matches the start page', async () => {
  const readme = await Bun.file(
    new URL('../README.md', import.meta.url),
  ).text();
  expect(syncLogo(readme)).toBe(readme);
  expect(readme).toContain(logoText().join('\n'));
});
