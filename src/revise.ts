import {ask, reviewComments, type Ask} from './llm';
import {parseInline, readComments, type Store} from './store';
import {reviewGates} from './gates';

/** Outcome of one review run from the Review page. */
export type ReviseResult =
  | {ok: true; run: number}
  | {ok: false; missing: string[]};

/**
 * Runs one LLM review of the reviewer's comments and stores the feedback.
 *
 * comments.md is read from disk on every call, so a run always sees the
 * comments as they are now, including edits made since the last run. The
 * run can be repeated any number of times. If the model call throws, the
 * previous feedback and run count are left as they were.
 *
 * @param store The open review (state, directory, save).
 * @param run Model call; defaults to OpenCode.
 * @return The run number, or why the review is blocked.
 */
export async function reviseRun(
  store: Pick<Store, 'dir' | 'state' | 'save'>,
  run: Ask = ask,
): Promise<ReviseResult> {
  const md = await readComments(store.dir);
  const gates = reviewGates(store.state, parseInline(md));
  if (!gates.ok) return {ok: false, missing: gates.missing};
  const feedback = await reviewComments(md, run);
  const count = (store.state.reviewRuns ?? 0) + 1;
  store.state.feedback = feedback;
  store.state.reviewRuns = count;
  await store.save();
  return {ok: true, run: count};
}
