import {expect, test} from 'bun:test';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  ANSWER_CAP,
  QUESTION_CAP,
  SELECTION_CAP,
  enquire,
  enquirePrompt,
  type EnquireInput,
} from '../src/enquire';
import {STATE_VERSION, migrateState, openStore} from '../src/store';
import type {State} from '../src/types';

const input: EnquireInput = {
  question: 'What does greet() do?',
  subject: {path: 'src/greet.ts', startLine: 2, endLine: 4, text: 'SELECTED'},
  diff: 'DIFFTEXT',
  repo: {search: true, root: '/work/repo'},
};

test('prompt carries question, selection with its range, and diff', () => {
  const p = enquirePrompt(input);
  expect(p).toContain('<question>\nWhat does greet() do?\n</question>');
  expect(p).toContain('<selection path="src/greet.ts" lines="2-4">');
  expect(p).toContain('SELECTED');
  expect(p).toContain('<diff>\nDIFFTEXT\n</diff>');
});

test('prompt says so when nothing is selected', () => {
  const p = enquirePrompt({...input, subject: null});
  expect(p).toContain('(nothing selected)');
  expect(p).not.toContain('SELECTED');
});

test('a long selection is truncated with a visible marker', () => {
  const text = 'x\n'.repeat(SELECTION_CAP);
  const p = enquirePrompt({
    ...input,
    subject: {...input.subject!, text},
  });
  expect(p).toContain('[... truncated');
});

test('enquire returns the trimmed answer and sends the prompt', async () => {
  let sent = '';
  const r = await enquire(input, async (prompt) => {
    sent = prompt;
    return '  It greets.  ';
  });
  expect(r).toEqual({ok: true, answer: 'It greets.'});
  expect(sent).toBe(enquirePrompt(input));
});

test('long answers are capped', async () => {
  const r = await enquire(input, async () => 'a'.repeat(ANSWER_CAP + 50));
  expect(r.ok && r.answer.length).toBe(ANSWER_CAP);
});

test('empty or oversized questions never reach the model', async () => {
  const never = async (): Promise<unknown> => {
    throw new Error('called');
  };
  expect((await enquire({...input, question: '  '}, never)).ok).toBe(false);
  const big = await enquire(
    {...input, question: 'q'.repeat(QUESTION_CAP + 1)},
    never,
  );
  expect(big.ok).toBe(false);
});

test('failures show our own text, never raw error detail', async () => {
  let logged: unknown;
  const r = await enquire(
    input,
    async () => {
      throw new Error('secret transport detail');
    },
    (e) => (logged = e),
  );
  expect(r).toEqual({
    ok: false,
    message: 'Enquire unavailable (Error). Try again.',
  });
  expect((logged as Error).message).toContain('secret');
});

test('non-text or empty replies are failures', async () => {
  expect((await enquire(input, async () => ({a: 1}))).ok).toBe(false);
  expect((await enquire(input, async () => '  ')).ok).toBe(false);
});

test('the Enquire agent denies edit, bash, web, task and question', async () => {
  const md = await Bun.file(
    `${import.meta.dir}/../.opencode/agents/review-enquire.md`,
  ).text();
  const front = md.split('---')[1]!;
  for (const tool of [
    'edit',
    'bash',
    'webfetch',
    'websearch',
    'task',
    'question',
  ])
    expect(front).toMatch(new RegExp(`^\\s+${tool}: deny$`, 'm'));
  // Repo tools are allowed (the agent runs in the repo under review) ...
  for (const tool of ['grep', 'glob', 'list'])
    expect(front).toMatch(new RegExp(`^\\s+${tool}: allow$`, 'm'));
  // ... but secrets are not, and nothing outside the repo is.
  expect(front).toMatch(/^\s+external_directory: deny$/m);
  expect(front).toMatch(/"\*\.env": deny/);
  for (const g of Array.from({length: 11}, (_, i) => `G${i + 1}.`))
    expect(md).toContain(g);
});

function state(page: number, version?: number): State {
  return {
    ...(version === undefined ? {} : {version}),
    pr: {
      url: '',
      owner: '',
      repo: '',
      number: 1,
      title: '',
      body: '',
      headSha: '',
    },
    page,
    checklist: {},
    feedback: '',
    intention: {status: 'open', text: '', hint: ''},
  };
}

test('migration shifts saved pages at or after Comments', () => {
  expect(migrateState(state(0)).page).toBe(0);
  expect(migrateState(state(1)).page).toBe(1);
  expect(migrateState(state(2)).page).toBe(3); // Comments
  expect(migrateState(state(3)).page).toBe(4); // Review
  expect(migrateState(state(3)).version).toBe(STATE_VERSION);
});

test('migration runs once', () => {
  const s = migrateState(state(2));
  expect(migrateState(s).page).toBe(3);
  expect(migrateState(state(2, STATE_VERSION)).page).toBe(2);
});

test('an old state.json resumes on the same page after reopening', async () => {
  const root = await mkdtemp(join(tmpdir(), 'enquire-'));
  const dir = join(root, 'reviews', 'r-1');
  await Bun.$`mkdir -p ${dir}`.quiet();
  await writeFile(join(dir, 'state.json'), JSON.stringify(state(3)));
  await writeFile(join(dir, 'diff.patch'), '');
  const store = await openStore(root, 'https://github.com/o/r/pull/1');
  expect(store.state.page).toBe(4);
  const saved = await Bun.file(join(dir, 'state.json')).json();
  expect(saved.version).toBe(STATE_VERSION);
});

test('the prompt tells the agent whether it may search the repo', () => {
  expect(enquirePrompt(input)).toContain('You may use read, grep, glob');
  const p = enquirePrompt({
    ...input,
    repo: {search: false, root: '/x', reason: 'checkout is at abc1234'},
  });
  expect(p).toContain('Repo search is unavailable (checkout is at abc1234)');
  expect(p).not.toContain('You may use read');
});
