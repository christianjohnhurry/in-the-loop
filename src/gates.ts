import {checklistDone} from './checklist';
import type {InlineComment, State} from './types';

/** Result of checking whether a review may start. */
export interface GateResult {
  ok: boolean;
  /** Human-readable reasons the review is blocked; empty when `ok`. */
  missing: string[];
}

/**
 * Decides whether "Start review" is allowed: the checklist must be complete,
 * the intention passed, and at least one comment written.
 *
 * @param state The persisted review state.
 * @param comments Inline comments currently in comments.md.
 * @return Whether the review may start, and what is missing if not.
 */
export function reviewGates(
  state: State,
  comments: InlineComment[],
): GateResult {
  const missing: string[] = [];
  if (!checklistDone(state.checklist)) missing.push('checklist incomplete');
  if (state.intention.status !== 'passed') missing.push('intention not passed');
  if (comments.length === 0) missing.push('no comments yet');
  return {ok: missing.length === 0, missing};
}
