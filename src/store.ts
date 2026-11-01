import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fetchPr } from "./github";
import type { InlineComment, State } from "./types";

export interface Store {
  dir: string;
  state: State;
  diff: string;
  save(): Promise<void>;
}

const COMMENTS_HEADER = "# Review comments\n\n## Intention\n\n## General\n\n## Inline\n";

export const commentsPath = (dir: string) => join(dir, "comments.md");

/** Open (resume) or create the review dir for a PR. */
export async function openStore(root: string, url: string): Promise<Store> {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`Not a GitHub PR URL: ${url}`);
  const dir = join(root, "reviews", `${m[2]}-${m[3]}`);
  const statePath = join(dir, "state.json");
  let state: State;
  let diff: string;
  if (existsSync(statePath)) {
    state = await Bun.file(statePath).json();
    diff = await Bun.file(join(dir, "diff.patch")).text();
  } else {
    const fetched = await fetchPr(url);
    diff = fetched.diff;
    state = {
      pr: fetched.pr,
      page: 0,
      checklist: {},
      intention: { status: "open", text: "", hint: "" },
      feedback: "",
    };
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, "diff.patch"), diff);
    await Bun.write(commentsPath(dir), COMMENTS_HEADER);
  }
  const store: Store = {
    dir,
    state,
    diff,
    save: async () => void (await Bun.write(statePath, JSON.stringify(state, null, 2))),
  };
  await store.save();
  return store;
}

/** Replace the body of a `## Section` (up to the next `## ` heading). */
export function setSection(md: string, name: string, body: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return `${md.trimEnd()}\n\n## ${name}\n\n${body}\n`;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return [...lines.slice(0, start + 1), "", body, "", ...lines.slice(end)].join("\n");
}

export function getSection(md: string, name: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return "";
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim();
}

export function formatInline(c: InlineComment): string {
  return `- ${c.path}:L${c.line} — ${c.body}`;
}

export async function appendInline(dir: string, c: InlineComment) {
  const p = commentsPath(dir);
  const md = await Bun.file(p).text();
  await Bun.write(p, `${md.trimEnd()}\n${formatInline(c)}\n`);
}

/** Parse `- path:L12 — comment` lines (with indented continuation lines) from ## Inline. */
export function parseInline(md: string): InlineComment[] {
  const out: InlineComment[] = [];
  for (const line of getSection(md, "Inline").split("\n")) {
    const m = line.match(/^- (\S+?):L(\d+) [—-] (.*)$/);
    if (m) out.push({ path: m[1]!, line: Number(m[2]), body: m[3]!.trim() });
    else if (/^\s+\S/.test(line) && out.length) out[out.length - 1]!.body += `\n${line.trim()}`;
  }
  return out;
}

export async function readComments(dir: string) {
  return Bun.file(commentsPath(dir)).text();
}
