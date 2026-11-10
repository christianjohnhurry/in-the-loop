import {expect, test} from 'bun:test';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CHECKLIST} from '../src/checklist';
import {reviseRun} from '../src/revise';
import {commentsPath} from '../src/store';
import type {State} from '../src/types';

/** A state that passes every gate except having comments. */
function readyState(): State {
  const checklist: Record<string, boolean> = {};
  for (const c of CHECKLIST) checklist[c.id] = true;
  return {
    pr: {
      url: '',
      owner: '',
      repo: '',
      number: 1,
      title: '',
      body: '',
      headSha: '',
    },
    page: 4,
    checklist,
    feedback: '',
    intention: {status: 'passed', text: 'x', hint: ''},
  };
}

const inline = (body: string): string =>
  `# Review comments\n\n## Intention\n\n## General\n\n## Inline\n- a.ts:L1 — ${body}\n`;

test('revise three times, editing comments between runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'revise-'));
  const state = readyState();
  let saves = 0;
  const store = {
    dir,
    state,
    save: async (): Promise<void> => void (saves += 1),
  };
  const seen: string[] = [];
  const model = async (prompt: string): Promise<unknown> => {
    seen.push(prompt);
    return `feedback ${seen.length}`;
  };

  const bodies = ['first draft', 'second draft', 'third draft'];
  for (const [i, body] of bodies.entries()) {
    await writeFile(commentsPath(dir), inline(body));
    const result = await reviseRun(store, model);
    expect(result).toEqual({ok: true, run: i + 1});
    expect(seen).toHaveLength(i + 1);
    // The run sees the comments as edited now, not the earlier ones.
    expect(seen[i]).toContain(body);
    for (const old of bodies.slice(0, i)) expect(seen[i]).not.toContain(old);
    expect(state.feedback).toBe(`feedback ${i + 1}`);
    expect(state.reviewRuns).toBe(i + 1);
  }
  expect(saves).toBe(3);
});

test('a blocked revise does not call the model or change state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'revise-'));
  await writeFile(commentsPath(dir), '# Review comments\n\n## Inline\n');
  const state = readyState();
  const store = {dir, state, save: async (): Promise<void> => {}};
  let calls = 0;
  const result = await reviseRun(store, async () => void (calls += 1));
  expect(result).toEqual({ok: false, missing: ['no comments yet']});
  expect(calls).toBe(0);
  expect(state.reviewRuns).toBeUndefined();
});

test('a failed run keeps earlier feedback and the run count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'revise-'));
  await writeFile(commentsPath(dir), inline('draft'));
  const state = readyState();
  const store = {dir, state, save: async (): Promise<void> => {}};
  await reviseRun(store, async () => 'good');
  const boom = async (): Promise<unknown> => {
    throw new Error('down');
  };
  await expect(reviseRun(store, boom)).rejects.toThrow('down');
  expect(state.feedback).toBe('good');
  expect(state.reviewRuns).toBe(1);
  // And the next run still works.
  expect(await reviseRun(store, async () => 'again')).toEqual({
    ok: true,
    run: 2,
  });
});
