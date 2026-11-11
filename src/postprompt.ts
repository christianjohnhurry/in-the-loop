import {DEFAULT_REVIEW_EVENT, REVIEW_CHOICES, type ReviewEvent} from './github';
import type {PrInfo} from './types';

/**
 * The prompt opened by `p` on the Review page. Posting is two steps: choose
 * the review type, then confirm. Nothing is sent until the confirm step gets
 * an explicit `y`.
 */
export interface PostPrompt {
  /** `choose`: pick the review type. `confirm`: last check before posting. */
  step: 'choose' | 'confirm';
  /** The highlighted (and, at `confirm`, the chosen) review type. */
  event: ReviewEvent;
  /** Number of inline comments in the review, shown at `confirm`. */
  inline: number;
}

/** What the caller should do after a key press. */
export type PostAction = 'none' | 'cancel' | 'post';

/**
 * Opens the prompt on the type-choosing step with the default type.
 *
 * @param inline Number of inline comments in the review.
 * @return The new prompt.
 */
export function openPostPrompt(inline: number): PostPrompt {
  return {step: 'choose', event: DEFAULT_REVIEW_EVENT, inline};
}

/**
 * Applies a key to the prompt. At `choose`, arrows and `c`/`r`/`a` pick a
 * type and Enter moves on to `confirm`; at `confirm`, only `y` posts, so a
 * stray Enter or a repeated key cannot. Esc (and `n` at `confirm`) cancels.
 *
 * @param prompt The current prompt.
 * @param key The key name, as reported by the terminal library.
 * @return The prompt after the key, and what to do about it.
 */
export function pressPostKey(
  prompt: PostPrompt,
  key: string,
): {prompt: PostPrompt; action: PostAction} {
  if (key === 'escape' || (prompt.step === 'confirm' && key === 'n'))
    return {prompt, action: 'cancel'};
  if (prompt.step === 'confirm')
    return {prompt, action: key === 'y' ? 'post' : 'none'};
  const n = REVIEW_CHOICES.length;
  const i = REVIEW_CHOICES.findIndex((c) => c.event === prompt.event);
  const byKey = REVIEW_CHOICES.find((c) => c.key === key);
  if (key === 'left')
    return {
      prompt: {...prompt, event: REVIEW_CHOICES[(i + n - 1) % n]!.event},
      action: 'none',
    };
  if (key === 'right')
    return {
      prompt: {...prompt, event: REVIEW_CHOICES[(i + 1) % n]!.event},
      action: 'none',
    };
  if (byKey) return {prompt: {...prompt, event: byKey.event}, action: 'none'};
  if (key === 'return')
    return {prompt: {...prompt, step: 'confirm'}, action: 'none'};
  return {prompt, action: 'none'};
}

/**
 * The prompt after GitHub refused the review: back to choosing a type, with
 * the same type highlighted, so the reviewer can pick another or cancel.
 *
 * @param prompt The prompt that was confirmed.
 * @return The prompt to show with the error.
 */
export function afterRefusal(prompt: PostPrompt): PostPrompt {
  return {...prompt, step: 'choose'};
}

/**
 * The plain-language summary shown at the confirm step.
 *
 * @param pr The PR being reviewed.
 * @param prompt The prompt at the confirm step.
 * @return One string per line.
 */
export function confirmationLines(pr: PrInfo, prompt: PostPrompt): string[] {
  const label =
    REVIEW_CHOICES.find((c) => c.event === prompt.event)?.label ?? prompt.event;
  const n = prompt.inline;
  return [
    `Post to:  ${pr.owner}/${pr.repo}#${pr.number}`,
    `Type:     ${label}`,
    `Inline:   ${n} inline comment${n === 1 ? '' : 's'}`,
    'This will be posted publicly to GitHub.',
  ];
}
