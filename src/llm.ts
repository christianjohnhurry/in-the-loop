import { resolve } from "node:path";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk/v2";
import { parseVerdict } from "./guard";
import type { Verdict } from "./types";

const AGENT = "review-judge";
const REPO_ROOT = resolve(import.meta.dir, "..");

export interface JudgeInput {
  diff: string;
  description: string;
  statement: string;
}

type Client = Awaited<ReturnType<typeof createOpencode>>["client"];
let cached: { client: Client; close?: () => void } | undefined;

async function getClient() {
  if (cached) return cached;
  const url = process.env.OPENCODE_URL;
  const made = url
    ? { client: createOpencodeClient({ baseUrl: url }) as Client }
    : await createOpencode({ config: {}, port: 0, timeout: 30_000 }).then((r) => ({ client: r.client, close: r.server.close }));
  return (cached = made);
}

export function closeLlm() {
  cached?.close?.();
  cached = undefined;
}

let selected: { providerID: string; modelID: string } | undefined;
let lastUsed: string | undefined;

/** "provider/model" for every model of every provider the local OpenCode has configured. */
export async function listModels(): Promise<string[]> {
  const { client } = await getClient();
  const res = await client.config.providers({ directory: REPO_ROOT }, { throwOnError: true });
  return res.data.providers.flatMap((p) => Object.keys(p.models).map((m) => `${p.id}/${m}`)).sort();
}

/** Select a model (`provider/model`), validated against what OpenCode has available. */
export async function selectModel(spec: string) {
  const i = spec.indexOf("/");
  const available = await listModels();
  if (i < 1 || !available.includes(spec)) {
    throw new Error(`Unknown model "${spec}". Available:\n  ${available.join("\n  ")}`);
  }
  selected = { providerID: spec.slice(0, i), modelID: spec.slice(i + 1) };
}

/** The model that actually answered the last call (the explicit choice, or OpenCode's default). */
export const modelUsed = () => lastUsed;

async function ask(prompt: string, schema?: Record<string, unknown>): Promise<unknown> {
  const { client } = await getClient();
  const session = await client.session.create({ title: "review-tui", directory: REPO_ROOT }, { throwOnError: true });
  const res = await client.session.prompt(
    {
      sessionID: session.data.id,
      directory: REPO_ROOT,
      agent: AGENT,
      ...(selected ? { model: selected } : {}),
      parts: [{ type: "text", text: prompt }],
      ...(schema ? { format: { type: "json_schema" as const, schema: schema as never } } : {}),
    },
    { throwOnError: true },
  );
  const data = res.data as {
    info?: { structured?: unknown; providerID?: string; modelID?: string };
    parts?: { type: string; text?: string }[];
  };
  if (data.info?.providerID && data.info.modelID) lastUsed = `${data.info.providerID}/${data.info.modelID}`;
  if (data.info?.structured !== undefined) return data.info.structured;
  return (data.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: { verdict: { enum: ["pass", "retry"] }, hint: { type: "string" } },
  required: ["verdict", "hint"],
  additionalProperties: false,
};

export function judgePrompt({ diff, description, statement }: JudgeInput): string {
  return [
    "TASK: judge the reviewer's statement of this PR's intention. Reply with ONLY JSON:",
    '{ "verdict": "pass" | "retry", "hint": "..." }',
    "",
    "<pr_description>",
    description,
    "</pr_description>",
    "",
    "<diff>",
    diff,
    "</diff>",
    "",
    "<reviewer_statement>",
    statement,
    "</reviewer_statement>",
  ].join("\n");
}

export type Ask = (prompt: string, schema?: Record<string, unknown>) => Promise<unknown>;

export async function judgeIntention(
  input: JudgeInput,
  run: Ask = ask,
  onError: (e: unknown) => void = () => {},
): Promise<Verdict> {
  // Empty input needs no model: it can never pass.
  if (!input.statement.trim()) {
    return { verdict: "retry", hint: "Write what you think this change does and why, in your own words." };
  }
  try {
    return parseVerdict(await run(judgePrompt(input), VERDICT_SCHEMA), input.description);
  } catch (e) {
    onError(e);
    // Fail closed, and surface only our own text — never raw model/transport output.
    return { verdict: "retry", hint: `Judge unavailable (${(e as Error).name}). Try again.` };
  }
}

export async function reviewComments(md: string, run: Ask = ask): Promise<string> {
  const prompt = [
    "TASK: review the reviewer's comments below for accuracy and fairness toward the author.",
    "Flag comments that look wrong, unclear, harsh or unconstructive, and say why in a few bullets.",
    "Do not rewrite them for the reviewer and do not add new comments. If they look fine, say so briefly.",
    "Reply in plain text, under 200 words.",
    "",
    "<comments_md>",
    md,
    "</comments_md>",
  ].join("\n");
  const out = await run(prompt);
  return (typeof out === "string" ? out : JSON.stringify(out)).trim();
}
