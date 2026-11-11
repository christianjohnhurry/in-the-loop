/**
 * @file The Enquire page's model call: the reviewer asks about the code they
 * selected and gets a plain-text explanation. Guardrails are in
 * `.opencode/agents/review-enquire.md`.
 */
import {ENQUIRE_AGENT, ENQUIRE_NO_REPO_AGENT} from './agents';
import type {RepoAccess} from './checkout';
import {ask, type Ask} from './llm';

/** Longest question sent, in characters. */
export const QUESTION_CAP = 2_000;
/** Longest selection sent, in characters. */
export const SELECTION_CAP = 8_000;
/** Longest PR diff sent, in characters. */
export const DIFF_CAP = 60_000;
/** Longest answer shown, in characters. */
export const ANSWER_CAP = 1_500;

/** The code a question is about, as selected in VS Code. */
export interface Subject {
  /** Repo-relative path. */
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

/** Everything the Enquire agent sees. */
export interface EnquireInput {
  question: string;
  /** Null when nothing is selected. */
  subject: Subject | null;
  diff: string;
  /** The checkout the agent runs in, and whether it may search it. */
  repo: RepoAccess;
}

/** What the page shows for one question. */
export type EnquireResult =
  {ok: true; answer: string} | {ok: false; message: string};

/**
 * Caps text, leaving a marker the model and the reviewer can both see.
 *
 * @param text The text to cap.
 * @param cap Maximum characters kept.
 * @return The text, or its start followed by a truncation marker.
 */
function capText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const dropped = text.slice(cap).split('\n').length;
  return `${text.slice(0, cap)}\n[... truncated ${dropped} lines]`;
}

/**
 * Formats a subject as `path:L10-20`, `path:L10`.
 *
 * @param s The subject.
 * @return The label.
 */
export function subjectLabel(s: Subject): string {
  return s.endLine > s.startLine
    ? `${s.path}:L${s.startLine}-${s.endLine}`
    : `${s.path}:L${s.startLine}`;
}

/**
 * Builds the Enquire prompt. Question, selection and diff are fenced in tags
 * so they read as data.
 *
 * @param input The question, subject and diff.
 * @return The prompt text.
 */
export function enquirePrompt(input: EnquireInput): string {
  const {question, subject, diff, repo} = input;
  return [
    "TASK: answer the reviewer's question about the code below, following your rules.",
    'The selection is the SUBJECT of the question, not something to examine for problems.',
    '',
    '<question>',
    capText(question, QUESTION_CAP),
    '</question>',
    '',
    subject
      ? `<selection path="${subject.path}" lines="${subject.startLine}-${subject.endLine}">`
      : '<selection>(nothing selected)',
    ...(subject ? [capText(subject.text, SELECTION_CAP)] : []),
    '</selection>',
    '',
    '<diff>',
    capText(diff, DIFF_CAP),
    '</diff>',
    '',
    '<repo_access>',
    repo.search
      ? 'You may use read, grep, glob and list on the repo under review (your working directory). It is at the PR head commit.'
      : `Repo search is unavailable (${repo.reason}). You can only see the selection and diff above; if the answer needs other code, say you cannot see it.`,
    '</repo_access>',
  ].join('\n');
}

/**
 * Asks the Enquire agent a question about the selected code.
 *
 * Any failure becomes our own text, never raw model or transport output.
 *
 * @param input The question, subject and diff.
 * @param run Model call; defaults to the Enquire agent on OpenCode, run in
 *   the checkout under review (with repo tools only if `input.repo.search`).
 * @param onError Called with the underlying error, for logging.
 * @return The answer, or a message to show instead.
 */
export async function enquire(
  input: EnquireInput,
  run: Ask = (prompt) =>
    ask(
      prompt,
      undefined,
      input.repo.search ? ENQUIRE_AGENT : ENQUIRE_NO_REPO_AGENT,
      input.repo.root,
    ),
  onError: (e: unknown) => void = (): void => {},
): Promise<EnquireResult> {
  const question = input.question.trim();
  if (!question) return {ok: false, message: 'Type a question first.'};
  if (question.length > QUESTION_CAP)
    return {
      ok: false,
      message: `Question too long (${question.length} of ${QUESTION_CAP} characters).`,
    };
  try {
    const out = await run(enquirePrompt({...input, question}));
    const text = (typeof out === 'string' ? out : '').trim();
    if (!text)
      return {ok: false, message: 'No answer (empty reply). Try again.'};
    return {
      ok: true,
      answer:
        text.length > ANSWER_CAP ? `${text.slice(0, ANSWER_CAP - 1)}…` : text,
    };
  } catch (e) {
    onError(e);
    return {
      ok: false,
      message: `Enquire unavailable (${(e as Error).name}). Try again.`,
    };
  }
}
