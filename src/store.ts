import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fetchHeadRefName, fetchPr} from './github';
import type {InlineComment, State} from './types';

/** An open review: its directory, parsed state and the PR diff. */
export interface Store {
  /** `reviews/<repo>-<pr>/`, holding comments.md and state.json. */
  dir: string;
  state: State;
  diff: string;
  /** Writes `state` to state.json. */
  save(): Promise<void>;
}

/** Current state.json format. 2 inserted the Enquire page at index 2. */
export const STATE_VERSION = 2;

/**
 * Upgrades a parsed state.json in place. Version 1 (no `version` field) had
 * no Enquire page, so saved indices >= 2 move up by one.
 *
 * @param state The parsed state.json.
 * @return The same object, at the current version.
 */
export function migrateState(state: State): State {
  if ((state.version ?? 1) < 2) {
    if (state.page >= 2) state.page += 1;
    state.version = STATE_VERSION;
  }
  return state;
}

const COMMENTS_HEADER =
  '# Review comments\n\n## Intention\n\n## General\n\n## Inline\n';

/** Path of comments.md inside a review directory. */
export const commentsPath = (dir: string): string => join(dir, 'comments.md');

/**
 * Opens a review, resuming from state.json if it exists. Otherwise fetches
 * the PR and creates the review directory.
 *
 * @param root Directory that contains `reviews/`.
 * @param url The PR URL.
 * @return The open review.
 */
export async function openStore(root: string, url: string): Promise<Store> {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`Not a GitHub PR URL: ${url}`);
  const dir = join(root, 'reviews', `${m[2]}-${m[3]}`);
  const statePath = join(dir, 'state.json');
  let state: State;
  let diff: string;
  if (existsSync(statePath)) {
    state = migrateState(await Bun.file(statePath).json());
    diff = await Bun.file(join(dir, 'diff.patch')).text();
    if (!state.pr.headRefName) {
      // Saved before the branch was stored: refetch, but don't fail offline.
      try {
        state.pr.headRefName = await fetchHeadRefName(url);
      } catch {
        // Leave it unset; the start page shows "-".
      }
    }
  } else {
    const fetched = await fetchPr(url);
    diff = fetched.diff;
    state = {
      version: STATE_VERSION,
      pr: fetched.pr,
      page: 0,
      checklist: {},
      intention: {status: 'open', text: '', hint: ''},
      feedback: '',
    };
    await mkdir(dir, {recursive: true});
    await Bun.write(join(dir, 'diff.patch'), diff);
    await Bun.write(commentsPath(dir), COMMENTS_HEADER);
  }
  const store: Store = {
    dir,
    state,
    diff,
    save: async () =>
      void (await Bun.write(statePath, JSON.stringify(state, null, 2))),
  };
  await store.save();
  return store;
}

/**
 * Replaces the body of a `## Section` (up to the next `## ` heading).
 *
 * @param md Contents of comments.md.
 * @param name Section heading text.
 * @param body New section body.
 * @return The updated markdown.
 */
export function setSection(md: string, name: string, body: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return `${md.trimEnd()}\n\n## ${name}\n\n${body}\n`;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return [...lines.slice(0, start + 1), '', body, '', ...lines.slice(end)].join(
    '\n',
  );
}

/**
 * Reads the body of a `## Section`.
 *
 * @param md Contents of comments.md.
 * @param name Section heading text.
 * @return The trimmed body, or empty if the section is missing.
 */
export function getSection(md: string, name: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

/** Formats one inline comment as `- path:L12 — comment` or `path:L12-15`. */
export function formatInline(c: InlineComment): string {
  const at =
    c.startLine === undefined ? `L${c.line}` : `L${c.startLine}-${c.line}`;
  return `- ${c.path}:${at} — ${c.body}`;
}

/**
 * Appends an inline comment to the `## Inline` section (always last).
 *
 * @param dir Review directory.
 * @param c The comment to add.
 */
export async function appendInline(
  dir: string,
  c: InlineComment,
): Promise<void> {
  const p = commentsPath(dir);
  const md = await Bun.file(p).text();
  await Bun.write(p, `${md.trimEnd()}\n${formatInline(c)}\n`);
}

/**
 * Parses `- path:L12 — comment` (or `path:L12-15`) lines, plus indented
 * continuation lines, from the `## Inline` section.
 *
 * @param md Contents of comments.md.
 * @return The inline comments, in file order.
 */
export function parseInline(md: string): InlineComment[] {
  const out: InlineComment[] = [];
  for (const line of getSection(md, 'Inline').split('\n')) {
    const m = line.match(/^- (\S+?):L(\d+)(?:-(\d+))? [—-] (.*)$/);
    if (m) {
      const first = Number(m[2]);
      const last = m[3] === undefined ? first : Number(m[3]);
      out.push({
        path: m[1]!,
        line: last,
        ...(last > first ? {startLine: first} : {}),
        body: m[4]!.trim(),
      });
    } else if (/^\s+\S/.test(line) && out.length)
      out[out.length - 1]!.body += `\n${line.trim()}`;
  }
  return out;
}

/** Reads comments.md from a review directory. */
export async function readComments(dir: string): Promise<string> {
  return Bun.file(commentsPath(dir)).text();
}
