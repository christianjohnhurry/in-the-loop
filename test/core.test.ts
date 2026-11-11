import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checklistDone, CHECKLIST} from '../src/checklist';
import {reviewGates} from '../src/gates';
import {
  buildReviewPayload,
  composeReviewBody,
  parseDiff,
  parsePrUrl,
  DEFAULT_REVIEW_EVENT,
  explainPostError,
  isSelfReviewError,
  SELF_REVIEW_MESSAGE,
  quoteBlock,
  REVIEW_CHOICES,
  reviewFooter,
  summarizeComments,
  validateTarget,
} from '../src/github';
import {VERSION} from '../src/version';
import {FALLBACK_HINT, HINT_CAP, parseVerdict} from '../src/guard';
import {judgeIntention, reviewComments} from '../src/llm';
import {
  bodyPath,
  formatInline,
  getSection,
  messagePath,
  parseInline,
  readBodyDraft,
  readMessage,
  setSection,
} from '../src/store';
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
  expect(p.body).toBe('[me + m]\n\noverall');
  expect(p.comments[0]!.body).toBe('[me + m] why?');
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

test('quoteBlock quotes every line, blank lines included', () => {
  expect(quoteBlock('one\n\ntwo\n')).toBe('> one\n>\n> two');
});

test('summarizeComments is two lines: counts, then files', () => {
  const s = summarizeComments([
    {path: 'a.ts', line: 1, body: 'x'},
    {path: 'a.ts', line: 2, body: 'y'},
    {path: 'b.ts', line: 3, body: 'z'},
  ]);
  expect(s.split('\n')).toEqual([
    '- 3 inline comments on 2 files.',
    '- Files: `a.ts` (2), `b.ts` (1).',
  ]);
  expect(
    summarizeComments([{path: 'a.ts', line: 1, body: 'x'}]).split('\n')[0],
  ).toBe('- 1 inline comment on 1 file.');
  expect(summarizeComments([]).split('\n')).toHaveLength(2);
});

test('review body: message, quote, summary, then general, in order', () => {
  const body = composeReviewBody({
    message: 'Thanks for this.\n',
    intention: 'Adds a greeter.\nIt is pure.',
    comments: [{path: 'a.ts', line: 1, body: 'x'}],
    general: 'Please add docs.',
  });
  const message = body.indexOf('### Message from the reviewer\n\nThanks');
  const quote = body.indexOf('> Adds a greeter.\n> It is pure.');
  const summary = body.indexOf(
    '### Summary of inline comments\n\n- 1 inline comment on 1 file.',
  );
  const general = body.indexOf('### General comments\n\nPlease add docs.');
  expect(message).toBe(0);
  expect(quote).toBeGreaterThan(message);
  expect(summary).toBeGreaterThan(quote);
  expect(general).toBeGreaterThan(summary);
});

test('review body leaves out empty parts and adds no filler', () => {
  const body = composeReviewBody({
    message: '',
    intention: ' ',
    comments: [],
    general: '',
  });
  expect(body).not.toContain('>');
  expect(body).not.toContain('General comments');
  expect(body).not.toContain('Message from the reviewer');
  expect(body).not.toContain('understanding');
  expect(body.startsWith('### Summary of inline comments')).toBe(true);
});

test('composed body is the single review body, prefixed once', () => {
  const comments = [{path: 'a.ts', line: 1, body: 'x'}];
  const body = composeReviewBody({
    message: 'Hi',
    intention: 'why',
    comments,
    general: '',
  });
  const p = buildReviewPayload({
    prefix: '[me + m]',
    general: body,
    headSha: 'abc',
    comments,
  });
  expect(p.body.startsWith('[me + m]\n\n### Message from the reviewer')).toBe(
    true,
  );
  expect(p.body.match(/\[me \+ m\]/g)).toHaveLength(1);
  expect(p.body).toContain('\n> why\n');
  expect(p.comments).toHaveLength(1);
});

test('readMessage: empty when absent, else trimmed text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'msg-'));
  expect(await readMessage(dir)).toBe('');
  await Bun.write(messagePath(dir), '  Hello author\n');
  expect(await readMessage(dir)).toBe('Hello author');
  await rm(dir, {recursive: true});
});

test('readBodyDraft: null when absent or blank, else trimmed text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'body-'));
  expect(await readBodyDraft(dir)).toBeNull();
  await Bun.write(bodyPath(dir), '  \n');
  expect(await readBodyDraft(dir)).toBeNull();
  await Bun.write(bodyPath(dir), 'edited body\n');
  expect(await readBodyDraft(dir)).toBe('edited body');
  await rm(dir, {recursive: true});
});

test('review footer links to the repo and names version and model', () => {
  expect(reviewFooter('1.2.3', 'anthropic/x')).toBe(
    "Reviewed with [In The Loop's review-tui]" +
      '(https://github.com/christianjohnhurry/in-the-loop) ' +
      '(v1.2.3) using anthropic/x',
  );
});

test('payload body ends with the footer, after the prefixed body', () => {
  const footer = reviewFooter(VERSION, 'p/m');
  const p = buildReviewPayload({
    prefix: '[me + p/m]',
    general: 'Body',
    headSha: 'abc',
    comments: [],
    footer,
  });
  expect(p.body).toBe(`[me + p/m]\n\nBody\n\n---\n\n${footer}`);
  expect(footer).toContain(`(v${VERSION})`);
});

test('payload has no footer when none is given', () => {
  const p = buildReviewPayload({
    prefix: '[me + m]',
    general: 'Body',
    headSha: 'abc',
    comments: [],
  });
  expect(p.body).toBe('[me + m]\n\nBody');
});

test('intention section uses the understanding-and-intention heading', () => {
  const body = composeReviewBody({
    message: '',
    intention: 'why',
    comments: [],
    general: '',
  });
  expect(body).toContain(
    '### Reviewer’s understanding of the PR contents and intention ' +
      '(please correct reviewer if wrong)\n\n> why',
  );
  expect(body).not.toContain('written during the review');
});

test('every heading and the footer rule start their own line', () => {
  const comments = [{path: 'a.ts', line: 1, body: 'x'}];
  const general = composeReviewBody({
    message: 'Hi',
    intention: 'why',
    comments,
    general: 'More',
  });
  const p = buildReviewPayload({
    prefix: '[me + m]',
    general,
    headSha: 'abc',
    comments,
    footer: reviewFooter(VERSION, 'p/m'),
  });
  const lines = p.body.split('\n');
  const headings = lines.filter((l) => l.startsWith('### '));
  expect(headings).toHaveLength(4);
  expect(lines[0]).toBe('[me + m]');
  expect(lines[1]).toBe('');
  expect(lines[2]).toBe('### Message from the reviewer');
  // A rule directly under text would make that text a setext heading.
  const rule = lines.indexOf('---');
  expect(lines[rule - 1]).toBe('');
  expect(lines[rule + 1]).toBe('');
  expect(lines.slice(rule + 2)).toEqual([reviewFooter(VERSION, 'p/m')]);
});

test('an edited draft still gets prefix, trimmed body and footer', () => {
  const p = buildReviewPayload({
    prefix: '[me + m]',
    general: '\n### My own heading\n\ntext\n\n',
    headSha: 'abc',
    comments: [],
    footer: 'F',
  });
  expect(p.body).toBe('[me + m]\n\n### My own heading\n\ntext\n\n---\n\nF');
});

test('review choices map to GitHub events, Comment first and default', () => {
  expect(REVIEW_CHOICES.map((c) => [c.label, c.event])).toEqual([
    ['Comment', 'COMMENT'],
    ['Request changes', 'REQUEST_CHANGES'],
    ['Approve', 'APPROVE'],
  ]);
  expect(DEFAULT_REVIEW_EVENT).toBe('COMMENT');
  expect(REVIEW_CHOICES[0]!.event).toBe(DEFAULT_REVIEW_EVENT);
  expect(new Set(REVIEW_CHOICES.map((c) => c.key)).size).toBe(3);
});

test('payload event is Comment by default and the chosen one otherwise', () => {
  const base = {prefix: '[me + m]', general: 'B', headSha: 'abc'};
  const comments = [{path: 'a.ts', line: 1, body: 'x'}];
  expect(buildReviewPayload({...base, comments}).event).toBe('COMMENT');
  for (const {event} of REVIEW_CHOICES) {
    const p = buildReviewPayload({...base, comments, event});
    expect(p.event).toBe(event);
    expect(p.comments).toHaveLength(1);
    expect(p.body).toBe('[me + m]\n\nB');
  }
});

test('explainPostError names the type and says the review is kept', () => {
  const own = explainPostError(
    'APPROVE',
    'gh api failed: Unprocessable Entity: Can not approve your own pull request (HTTP 422)',
  );
  expect(own).toContain('Approve');
  expect(own).toContain(SELF_REVIEW_MESSAGE);
  expect(own).not.toContain('HTTP 422');
  expect(own).toContain('your review is kept');
  const other = explainPostError('COMMENT', 'HTTP 500');
  expect(other).toContain('HTTP 500');
  expect(other).not.toContain('own PR');
});

test('isSelfReviewError matches GitHub wordings for approve and request changes', () => {
  const messages = [
    'gh api failed: Unprocessable Entity: Can not approve your own pull request (HTTP 422)',
    'Unprocessable Entity: Can not request changes on your own pull request',
    'Review Can not approve your own pull request',
    'Cannot approve your own pull request',
    "You can't request changes on your own pull request",
    'CAN NOT APPROVE YOUR OWN PULL REQUEST',
  ];
  for (const m of messages) expect(isSelfReviewError(m)).toBe(true);
});

test('isSelfReviewError ignores unrelated errors', () => {
  const messages = [
    'HTTP 500',
    'Unprocessable Entity: Pull request review thread line must be part of the diff',
    'Can not approve: pull request is not mergeable',
    'Could not resolve host: api.github.com',
    'Not Found (HTTP 404): your own pull request list',
    '',
  ];
  for (const m of messages) expect(isSelfReviewError(m)).toBe(false);
});

test('self-review refusal message is plain for both refused types', () => {
  const raw = 'Can not request changes on your own pull request (HTTP 422)';
  const msg = explainPostError('REQUEST_CHANGES', raw);
  expect(msg).toContain(
    'Cannot approve or request changes on a PR you opened yourself.',
  );
  expect(msg).toContain('Post as a Comment instead.');
  expect(msg).not.toContain('HTTP 422');
});
