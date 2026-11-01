import {resolve} from 'node:path';
import {createOpencode, createOpencodeClient} from '@opencode-ai/sdk/v2';
import {parseVerdict} from './guard';
import type {Verdict} from './types';

const AGENT = 'review-judge';
const REPO_ROOT = resolve(import.meta.dir, '..');

/** Everything the judge sees. */
export interface JudgeInput {
  diff: string;
  description: string;
  statement: string;
}

type Client = Awaited<ReturnType<typeof createOpencode>>['client'];
interface Connection {
  client: Client;
  close?: () => void;
}
let cached: Connection | undefined;

/**
 * Connects to the OpenCode server named by `OPENCODE_URL`, or spawns a local
 * one on a random port (a fixed port collides with orphaned servers).
 */
async function getClient(): Promise<Connection> {
  if (cached) return cached;
  const url = process.env.OPENCODE_URL;
  const made: Connection = url
    ? {client: createOpencodeClient({baseUrl: url}) as Client}
    : await createOpencode({config: {}, port: 0, timeout: 30_000}).then(
        (r) => ({client: r.client, close: r.server.close}),
      );
  return (cached = made);
}

/** Stops the OpenCode server we spawned, if any. */
export function closeLlm(): void {
  cached?.close?.();
  cached = undefined;
}

/**
 * Sends one prompt to the read-only review agent in a fresh session.
 *
 * @param prompt The full prompt text.
 * @param schema Optional JSON schema to request structured output.
 * @return Structured output if the model produced it, else its text.
 */
async function ask(
  prompt: string,
  schema?: Record<string, unknown>,
): Promise<unknown> {
  const {client} = await getClient();
  const session = await client.session.create(
    {title: 'review-tui', directory: REPO_ROOT},
    {throwOnError: true},
  );
  const res = await client.session.prompt(
    {
      sessionID: session.data.id,
      directory: REPO_ROOT,
      agent: AGENT,
      parts: [{type: 'text', text: prompt}],
      ...(schema
        ? {format: {type: 'json_schema' as const, schema: schema as never}}
        : {}),
    },
    {throwOnError: true},
  );
  const data = res.data as {
    info?: {structured?: unknown};
    parts?: {type: string; text?: string}[];
  };
  if (data.info?.structured !== undefined) return data.info.structured;
  return (data.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n');
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {verdict: {enum: ['pass', 'retry']}, hint: {type: 'string'}},
  required: ['verdict', 'hint'],
  additionalProperties: false,
};

/**
 * Builds the judge prompt. Reviewer text is fenced in tags so it reads as data.
 *
 * @param input The diff, PR description and reviewer statement.
 * @return The prompt text.
 */
export function judgePrompt(input: JudgeInput): string {
  const {diff, description, statement} = input;
  return [
    "TASK: judge the reviewer's statement of this PR's intention. Reply with ONLY JSON:",
    '{ "verdict": "pass" | "retry", "hint": "..." }',
    '',
    '<pr_description>',
    description,
    '</pr_description>',
    '',
    '<diff>',
    diff,
    '</diff>',
    '',
    '<reviewer_statement>',
    statement,
    '</reviewer_statement>',
  ].join('\n');
}

/** Function that sends a prompt to a model; injectable for tests. */
export type Ask = (
  prompt: string,
  schema?: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Asks the judge whether the reviewer's statement captures the PR's intention.
 *
 * The guardrail is in code: only a parsed verdict and a capped hint come
 * back, empty input never reaches the model, and any failure is a `retry`.
 *
 * @param input The diff, PR description and reviewer statement.
 * @param run Model call; defaults to OpenCode.
 * @param onError Called with the underlying error, for logging.
 * @return A pass/retry verdict with a hint.
 */
export async function judgeIntention(
  input: JudgeInput,
  run: Ask = ask,
  onError: (e: unknown) => void = (): void => {},
): Promise<Verdict> {
  // Empty input needs no model: it can never pass.
  if (!input.statement.trim()) {
    return {
      verdict: 'retry',
      hint: 'Write what you think this change does and why, in your own words.',
    };
  }
  try {
    return parseVerdict(
      await run(judgePrompt(input), VERDICT_SCHEMA),
      input.description,
    );
  } catch (e) {
    onError(e);
    // Fail closed, and surface only our own text, never raw model or
    // transport output.
    return {
      verdict: 'retry',
      hint: `Judge unavailable (${(e as Error).name}). Try again.`,
    };
  }
}

/**
 * One-shot model feedback on the reviewer's comments (accuracy, fairness).
 *
 * @param md Contents of comments.md.
 * @param run Model call; defaults to OpenCode.
 * @return The model's feedback as plain text.
 */
export async function reviewComments(
  md: string,
  run: Ask = ask,
): Promise<string> {
  const prompt = [
    "TASK: review the reviewer's comments below for accuracy and fairness toward the author.",
    'Flag comments that look wrong, unclear, harsh or unconstructive, and say why in a few bullets.',
    'Do not rewrite them for the reviewer and do not add new comments. If they look fine, say so briefly.',
    'Reply in plain text, under 200 words.',
    '',
    '<comments_md>',
    md,
    '</comments_md>',
  ].join('\n');
  const out = await run(prompt);
  return (typeof out === 'string' ? out : JSON.stringify(out)).trim();
}
