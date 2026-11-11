import {expect, test} from 'bun:test';
import {
  afterRefusal,
  confirmationLines,
  openPostPrompt,
  pressPostKey,
  type PostPrompt,
} from '../src/postprompt';
import type {PrInfo} from '../src/types';

const pr: PrInfo = {
  url: 'https://github.com/acme/widgets/pull/7',
  owner: 'acme',
  repo: 'widgets',
  number: 7,
  title: 'Add widgets',
  body: '',
  headSha: 'abc',
};

/** Presses `keys` in order, returning the prompt and every action seen. */
function press(
  prompt: PostPrompt,
  ...keys: string[]
): {prompt: PostPrompt; actions: string[]} {
  const actions: string[] = [];
  for (const k of keys) {
    const r = pressPostKey(prompt, k);
    prompt = r.prompt;
    actions.push(r.action);
  }
  return {prompt, actions};
}

test('opens at the choose step with Comment highlighted', () => {
  expect(openPostPrompt(3)).toEqual({
    step: 'choose',
    event: 'COMMENT',
    inline: 3,
  });
});

test('choosing a type never posts, even on Enter', () => {
  const r = press(openPostPrompt(1), 'right', 'a', 'left', 'return');
  expect(r.actions).not.toContain('post');
  expect(r.prompt.step).toBe('confirm');
  expect(r.prompt.event).toBe('REQUEST_CHANGES');
});

test('y at the choose step does nothing', () => {
  const r = press(openPostPrompt(1), 'y');
  expect(r.actions).toEqual(['none']);
  expect(r.prompt.step).toBe('choose');
});

test('confirm: only y posts', () => {
  const confirm = press(openPostPrompt(2), 'a', 'return').prompt;
  expect(confirm).toEqual({step: 'confirm', event: 'APPROVE', inline: 2});
  for (const k of ['return', 'space', 'p', 'a', 'right', 'x'])
    expect(pressPostKey(confirm, k)).toEqual({prompt: confirm, action: 'none'});
  expect(pressPostKey(confirm, 'y').action).toBe('post');
  expect(pressPostKey(confirm, 'y').prompt.event).toBe('APPROVE');
});

test('cancel: Esc at either step, n at confirm', () => {
  const choose = openPostPrompt(1);
  const confirm = press(choose, 'return').prompt;
  expect(pressPostKey(choose, 'escape').action).toBe('cancel');
  expect(pressPostKey(confirm, 'escape').action).toBe('cancel');
  expect(pressPostKey(confirm, 'n').action).toBe('cancel');
  expect(pressPostKey(choose, 'n').action).toBe('none');
});

test('refusal returns to choose, keeping the type, so another can be picked', () => {
  const confirm = press(openPostPrompt(4), 'a', 'return').prompt;
  const back = afterRefusal(confirm);
  expect(back).toEqual({step: 'choose', event: 'APPROVE', inline: 4});
  const r = press(back, 'c', 'return', 'y');
  expect(r.actions).toEqual(['none', 'none', 'post']);
  expect(r.prompt.event).toBe('COMMENT');
});

test('confirmation names the PR, type, comment count and public posting', () => {
  const lines = confirmationLines(pr, {
    step: 'confirm',
    event: 'REQUEST_CHANGES',
    inline: 2,
  });
  const text = lines.join('\n');
  expect(text).toContain('acme/widgets#7');
  expect(text).toContain('Request changes');
  expect(text).toContain('2 inline comments');
  expect(text).toContain('publicly to GitHub');
});

test('confirmation uses the singular for one comment', () => {
  const text = confirmationLines(pr, openPostPrompt(1)).join('\n');
  expect(text).toContain('1 inline comment\n');
});
