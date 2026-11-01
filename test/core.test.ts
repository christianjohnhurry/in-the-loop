import {expect, test} from 'bun:test';
import {checklistDone, CHECKLIST} from '../src/checklist';
import {reviewGates} from '../src/gates';
import {
  buildReviewPayload,
  parseDiff,
  parsePrUrl,
  validateTarget,
} from '../src/github';
import {FALLBACK_HINT, HINT_CAP, parseVerdict} from '../src/guard';
import {judgeIntention, reviewComments} from '../src/llm';
import {formatInline, getSection, parseInline, setSection} from '../src/store';
import type {State} from '../src/types';

const diff = await Bun.file(`${import.meta.dir}/fixtures/sample.diff`).text();

test('parsePrUrl', () => {
  expect(parsePrUrl('https://github.com/a/b/pull/12')).toEqual({
    owner: 'a',
    repo: 'b',
    number: 12,
  });
  expect(() => parsePrUrl('nope')).toThrow();
});

test('parseDiff maps new-side lines; deleted files have none', () => {
  const f = parseDiff(diff);
  expect([...f.get('src/greet.ts')!]).toEqual([1, 2, 3, 4, 5, 6]);
  expect(f.get('old.ts')!.size).toBe(0);
  expect(validateTarget(f, 'src/greet.ts', 3)).toBeNull();
  expect(validateTarget(f, 'src/greet.ts', 99)).toContain('not on');
  expect(validateTarget(f, 'nope.ts', 1)).toContain('not in the diff');
  expect(validateTarget(f, 'old.ts', 1)).toContain('not on');
});

test('payload prefixes body and every inline comment', () => {
  const p = buildReviewPayload({
    prefix: '[me + m]',
    general: 'overall',
    headSha: 'abc',
    comments: [{path: 'src/greet.ts', line: 3, body: 'why?'}],
  });
  expect(p.body).toBe('[me + m] overall');
  expect(p.comments).toEqual([
    {path: 'src/greet.ts', line: 3, side: 'RIGHT', body: '[me + m] why?'},
  ]);
  expect(p.commit_id).toBe('abc');
});

test('comments.md round trip', () => {
  let md = '# Review comments\n\n## Intention\n\n## General\n\n## Inline\n';
  md = setSection(md, 'Intention', 'it greets');
  md = `${md.trimEnd()}\n${formatInline({path: 'a/b.ts', line: 12, body: 'nit'})}\n  second line\n`;
  expect(getSection(md, 'Intention')).toBe('it greets');
  expect(parseInline(md)).toEqual([
    {path: 'a/b.ts', line: 12, body: 'nit\nsecond line'},
  ]);
  expect(md).toContain('- a/b.ts:L12 — nit');
});

test('guard: only verdict + capped hint survive', () => {
  const long = 'x'.repeat(1000);
  const v = parseVerdict(
    `sure! {"verdict":"retry","hint":"${long}","secret":"leak"}`,
  );
  expect(v.hint.length).toBeLessThanOrEqual(HINT_CAP);
  expect(Object.keys(v).sort()).toEqual(['hint', 'verdict']);
  expect(parseVerdict('I think it passes').verdict).toBe('retry'); // fails closed
  expect(parseVerdict({verdict: 'yes', hint: ''}).verdict).toBe('retry');
  expect(parseVerdict({verdict: 'pass', hint: 'ignored'})).toEqual({
    verdict: 'pass',
    hint: '',
  });
});

test('guard: hint copying the PR description is replaced', () => {
  const desc =
    'This change adds a stranger fallback greeting so empty names no longer print Hello undefined';
  const v = parseVerdict(
    {
      verdict: 'retry',
      hint: 'It adds a stranger fallback greeting so empty names no longer print',
    },
    desc,
  );
  expect(v.hint).toBe(FALLBACK_HINT);
});

test('judgeIntention: empty never calls the model; errors fail closed', async () => {
  let calls = 0;
  const run = async (): Promise<unknown> => {
    calls++;
    return {verdict: 'pass', hint: ''};
  };
  expect(
    (await judgeIntention({diff, description: '', statement: '  '}, run))
      .verdict,
  ).toBe('retry');
  expect(calls).toBe(0);
  const boom = async (): Promise<unknown> => {
    throw new Error('secret transport detail');
  };
  const v = await judgeIntention({diff, description: '', statement: 'x'}, boom);
  expect(v.verdict).toBe('retry');
  expect(v.hint).not.toContain('secret');
});

test("reviewComments returns the model's text", async () => {
  expect(await reviewComments('md', async () => ' fine ')).toBe('fine');
});

test('gates', () => {
  const state: State = {
    pr: {
      url: '',
      owner: '',
      repo: '',
      number: 1,
      title: '',
      body: '',
      headSha: '',
    },
    page: 0,
    checklist: {},
    feedback: '',
    intention: {status: 'open', text: '', hint: ''},
  };
  expect(reviewGates(state, []).missing).toHaveLength(3);
  for (const c of CHECKLIST) state.checklist[c.id] = true;
  expect(checklistDone(state.checklist)).toBe(true);
  state.intention.status = 'passed';
  expect(reviewGates(state, []).missing).toEqual(['no comments yet']);
  expect(reviewGates(state, [{path: 'a', line: 1, body: 'b'}]).ok).toBe(true);
});
