import {expect, test} from 'bun:test';
import {mkdtemp, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {logoSvg} from '../src/logo-svg';
import {CORNER_LOGO, bigText, startPage, type ModelView} from '../src/start';
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

const closed: ModelView = {
  selected: {providerID: 'anthropic', modelID: 'claude-sonnet-5-5'},
  loading: false,
};

const plain = (pr: PrInfo, model: ModelView = closed): string =>
  startPage(pr, model)
    .map((b) => b.chunks.map((c) => c.text).join(''))
    .join('\n');

test('start page shows logo, subtitle, repo, branch and prompt', () => {
  const t = plain(pr);
  for (const l of [...bigText('IN THE', 'medium'), ...bigText('L∞P')])
    expect(t).toContain(l);
  expect(t).toContain('R E V I E W  -  T U I');
  expect(t).toContain('repo: o/r');
  expect(t).toContain('branch: feat/x');
  expect(t).toContain('model: anthropic/claude-sonnet-5-5');
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

test('docs/logo.svg matches the start page', async () => {
  const svg = await Bun.file(
    new URL('../docs/logo.svg', import.meta.url),
  ).text();
  expect(svg).toBe(logoSvg());
});

test('start page says OpenCode default while no model is selected', () => {
  const none: ModelView = {selected: undefined, loading: false};
  expect(plain(pr, none)).toContain('model: OpenCode default');
  expect(plain(pr, {...none, loading: true})).toContain('model: loading…');
});

test('start page offers m to pick a model only once models are listed', () => {
  expect(plain(pr, closed)).not.toContain('Press m');
  expect(plain(pr, {...closed, pickable: true})).toContain(
    'Press m to select model',
  );
  expect(
    plain(pr, {
      ...closed,
      pickable: true,
      picker: {query: '', options: [], cursor: 0, rows: 5},
    }),
  ).not.toContain('Press m');
});

test('hint lines are centred on each other', () => {
  expect(centred(['ab', 'abcde'])).toEqual([' ab  ', 'abcde']);
  const [a, b] = centred(['Press Enter to start', 'Press m to select model']);
  expect(a!.length).toBe(b!.length);
  expect(a!.indexOf('P')).toBe(1);
});

test('start page shows an error line but still the model and prompt', () => {
  const t = plain(pr, {...closed, error: 'boom'});
  expect(t).toContain('Could not list models: boom');
  expect(t).toContain('model: anthropic/claude-sonnet-5-5');
  expect(t).toContain('Press Enter to start');
});

test('open picker lists models, marks the cursor and offers Enter select', () => {
  const options = ['a', 'b', 'c'].map((m) => ({
    providerID: 'p',
    modelID: m,
    name: `Model ${m}`,
  }));
  const t = plain(pr, {
    ...closed,
    picker: {query: 'x', options, cursor: 1, rows: 10},
  });
  expect(t).toContain('filter: x');
  expect(t).toContain('  p/a Model a');
  expect(t).toContain('> p/b Model b');
  expect(t).toContain('2/3');
  expect(t).toContain('Enter select');
  expect(t).not.toContain('Press Enter to start');
});

test('open picker scrolls long lists and reports an empty filter', () => {
  const options = Array.from({length: 50}, (_, i) => ({
    providerID: 'p',
    modelID: `m${i}`,
    name: 'M',
  }));
  const t = plain(pr, {
    ...closed,
    picker: {query: '', options, cursor: 40, rows: 5},
  });
  expect(t).toContain('> p/m40');
  expect(t).not.toContain('p/m0 ');
  expect(
    plain(pr, {
      ...closed,
      picker: {query: 'z', options: [], cursor: 0, rows: 5},
    }),
  ).toContain('no models match');
});

test('a chosen model survives a resume; older state falls back to default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rtui-'));
  const dir = join(root, 'reviews', 'r-3');
  await mkdir(dir, {recursive: true});
  const state: State = {
    version: 2,
    pr,
    page: 0,
    checklist: {},
    intention: {status: 'open', text: '', hint: ''},
    feedback: '',
  };
  await Bun.write(join(dir, 'diff.patch'), '');
  await Bun.write(join(dir, 'state.json'), JSON.stringify(state));
  expect((await openStore(root, pr.url)).state.model).toBeUndefined();
  const chosen = {providerID: 'openai', modelID: 'gpt-5'};
  await Bun.write(
    join(dir, 'state.json'),
    JSON.stringify({...state, model: chosen}),
  );
  expect((await openStore(root, pr.url)).state.model).toEqual(chosen);
});
