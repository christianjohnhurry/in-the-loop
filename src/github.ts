import type {InlineComment, PrInfo} from './types';

/** Owner, repo and number parsed from a PR URL. */
export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

/**
 * Parses a GitHub PR URL.
 *
 * @param url E.g. https://github.com/owner/repo/pull/12.
 * @return The owner, repo and PR number.
 * @throws {Error} If the URL is not a GitHub PR URL.
 */
export function parsePrUrl(url: string): PrRef {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`Not a GitHub PR URL: ${url}`);
  return {owner: m[1]!, repo: m[2]!, number: Number(m[3])};
}

/** Runs `gh`, optionally piping `stdin`; rejects with stderr on failure. */
async function gh(args: string[], stdin?: string): Promise<string> {
  const proc = Bun.spawn(['gh', ...args], {
    stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`gh ${args.join(' ')} failed: ${err.trim()}`);
  return out;
}

/**
 * Fetches the PR's metadata and diff with `gh pr view` / `gh pr diff`.
 *
 * @param url The PR URL.
 * @return The PR info and its unified diff.
 */
export async function fetchPr(
  url: string,
): Promise<{pr: PrInfo; diff: string}> {
  const {owner, repo, number} = parsePrUrl(url);
  const [view, diff] = await Promise.all([
    gh(['pr', 'view', url, '--json', 'title,body,headRefOid']),
    gh(['pr', 'diff', url]),
  ]);
  const v = JSON.parse(view) as {
    title: string;
    body: string;
    headRefOid: string;
  };
  return {
    pr: {
      url,
      owner,
      repo,
      number,
      title: v.title,
      body: v.body,
      headSha: v.headRefOid,
    },
    diff,
  };
}

/** The login of the authenticated `gh` user, used as the default reviewer. */
export async function ghLogin(): Promise<string> {
  return (await gh(['api', 'user', '--jq', '.login'])).trim();
}

/**
 * Maps each file to the new-side (RIGHT) line numbers visible in the diff.
 *
 * @param diff Unified diff text.
 * @return Path to set of commentable line numbers.
 */
export function parseDiff(diff: string): Map<string, Set<number>> {
  const files = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  let newLine = 0;
  let inHunk = false;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      current = null;
      inHunk = false;
      // `diff --git a/x b/x`; the +++ line below is authoritative
      // except for deletions.
      const m = raw.match(/ b\/(.+)$/);
      if (m) files.set(m[1]!, (current = new Set()));
      continue;
    }
    if (!inHunk) {
      if (raw.startsWith('+++ b/')) {
        const p = raw.slice(6);
        current = files.get(p) ?? files.set(p, new Set()).get(p)!;
      }
    }
    const h = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      newLine = Number(h[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || !current) continue;
    if (raw.startsWith('+')) current.add(newLine++);
    else if (raw.startsWith(' ')) current.add(newLine++);
    else if (raw.startsWith('-') || raw.startsWith('\\')) continue;
  }
  return files;
}

/**
 * Checks that a comment target exists on the diff's new side.
 *
 * @param files Output of {@link parseDiff}.
 * @param path File path from the reviewer.
 * @param line New-side line number from the reviewer.
 * @return An error message, or null when the target is valid.
 */
export function validateTarget(
  files: Map<string, Set<number>>,
  path: string,
  line: number,
): string | null {
  const lines = files.get(path);
  if (!lines) return `${path} is not in the diff`;
  if (!lines.has(line))
    return `${path}:${line} is not on a changed or context line in the diff`;
  return null;
}

/** What goes into a review. */
export interface ReviewInput {
  /** Prepended to every comment, e.g. "[me + model]". */
  prefix: string;
  /** The review body. */
  general: string;
  /** Inline comments. */
  comments: InlineComment[];
  /** Commit the lines refer to. */
  headSha: string;
}

/** The body of `POST /pulls/{n}/reviews` for a single COMMENT review. */
export interface ReviewPayload {
  commit_id: string;
  event: 'COMMENT';
  body: string;
  comments: {path: string; line: number; side: 'RIGHT'; body: string}[];
}

/**
 * Builds one GitHub review: the general comment as the body and each inline
 * comment on its line, all prefixed so AI lineage is visible.
 *
 * @param input Prefix, general comment, inline comments and head commit.
 * @return The payload to send (or print, in a dry run).
 */
export function buildReviewPayload(input: ReviewInput): ReviewPayload {
  const tag = (s: string): string => `${input.prefix} ${s}`;
  return {
    commit_id: input.headSha,
    event: 'COMMENT' as const,
    body: tag(input.general),
    comments: input.comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: 'RIGHT' as const,
      body: tag(c.body),
    })),
  };
}

/**
 * Sends the review to GitHub.
 *
 * @param pr The PR to review.
 * @param payload Output of {@link buildReviewPayload}.
 * @return URL of the created review.
 */
export async function postReview(
  pr: PrInfo,
  payload: ReviewPayload,
): Promise<string> {
  const out = await gh(
    [
      'api',
      `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`,
      '--input',
      '-',
    ],
    JSON.stringify(payload),
  );
  return (JSON.parse(out) as {html_url?: string}).html_url ?? '(posted)';
}
