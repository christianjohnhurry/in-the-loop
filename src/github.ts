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
    gh(['pr', 'view', url, '--json', 'title,body,headRefOid,headRefName']),
    gh(['pr', 'diff', url]),
  ]);
  const v = JSON.parse(view) as {
    title: string;
    body: string;
    headRefOid: string;
    headRefName: string;
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
      headRefName: v.headRefName,
    },
    diff,
  };
}

/**
 * Fetches just the PR head branch name.
 *
 * @param url The PR URL.
 * @return The head branch name.
 */
export async function fetchHeadRefName(url: string): Promise<string> {
  const v = JSON.parse(await gh(['pr', 'view', url, '--json', 'headRefName']));
  return (v as {headRefName: string}).headRefName;
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

/**
 * Checks that every line of a comment's range is on the diff's new side.
 *
 * @param files Output of {@link parseDiff}.
 * @param path File path.
 * @param startLine First line of the range, or undefined for one line.
 * @param line Last line of the range.
 * @return An error message, or null when the whole range is valid.
 */
export function validateRange(
  files: Map<string, Set<number>>,
  path: string,
  startLine: number | undefined,
  line: number,
): string | null {
  const first = startLine ?? line;
  if (first > line) return `${path}:${first}-${line} is a backwards range`;
  for (let n = first; n <= line; n++) {
    const err = validateTarget(files, path, n);
    if (err)
      return startLine === undefined ? err : `${path}:${first}-${line}: ${err}`;
  }
  return null;
}

/**
 * Renders text as a Markdown quote block, one `> ` per line.
 *
 * @param text The text to quote.
 * @return The quoted text; blank lines become a bare `>`.
 */
export function quoteBlock(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((l) => (l.trim() === '' ? '>' : `> ${l}`))
    .join('\n');
}

/**
 * Summarises inline comments in exactly two lines: how many comments on how
 * many files, then which files.
 *
 * @param comments The inline comments.
 * @return Two Markdown list lines, joined by a newline.
 */
export function summarizeComments(comments: InlineComment[]): string {
  const perFile = new Map<string, number>();
  for (const c of comments) perFile.set(c.path, (perFile.get(c.path) ?? 0) + 1);
  const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`;
  if (comments.length === 0) return '- No inline comments.\n- No files.';
  const files = [...perFile].map(([p, k]) => `\`${p}\` (${k})`).join(', ');
  return (
    `- ${plural(comments.length, 'inline comment')} on ` +
    `${plural(perFile.size, 'file')}.\n- Files: ${files}.`
  );
}

/** The parts of the review body, before the reviewer prefix is added. */
export interface BodyParts {
  /** The reviewer's message to the author; empty for none. */
  message: string;
  /** The intention the reviewer stated during the review; may be empty. */
  intention: string;
  /** Inline comments, summarised in two lines. */
  comments: InlineComment[];
  /** General comments that apply across the whole review; may be empty. */
  general: string;
}

/**
 * Markdown heading marker of each review body section. `###` is modest: `#`
 * and `##` render large (with a rule under them) in a GitHub review comment.
 */
const HEADING_MARKER = '###';

/** Heading of the section holding the reviewer's stated intention. */
const INTENTION_HEADING =
  'Reviewer’s understanding of the PR contents and intention ' +
  '(please correct reviewer if wrong)';

/** A section heading line. */
function heading(text: string): string {
  return `${HEADING_MARKER} ${text}`;
}

/**
 * Builds the review body: one headed section each for the reviewer's message
 * to the author (if any), their intention as a quote block (so GitHub shows it
 * was written as part of the review process, not to the author), a two-line
 * summary of the inline comments, then the general comments that apply across
 * the review (if any).
 *
 * @param parts Message, intention, inline comments and general comments.
 * @return The Markdown body, without the reviewer prefix.
 */
export function composeReviewBody(parts: BodyParts): string {
  const sections: string[] = [];
  if (parts.message.trim())
    sections.push(
      `${heading('Message from the reviewer')}\n\n${parts.message.trim()}`,
    );
  if (parts.intention.trim())
    sections.push(
      `${heading(INTENTION_HEADING)}\n\n${quoteBlock(parts.intention)}`,
    );
  sections.push(
    `${heading('Summary of inline comments')}\n\n` +
      summarizeComments(parts.comments),
  );
  if (parts.general.trim())
    sections.push(`${heading('General comments')}\n\n${parts.general.trim()}`);
  return sections.join('\n\n');
}

/** The repo that review-tui's footer links to. */
export const REPO_URL = 'https://github.com/christianjohnhurry/in-the-loop';

/**
 * The footer that ends every posted review body.
 *
 * @param version The app's version, e.g. "0.10.0".
 * @param model The model used for the review, e.g. "anthropic/claude-x".
 * @return One Markdown line linking to the repo.
 */
export function reviewFooter(version: string, model: string): string {
  return (
    `Reviewed with [In The Loop's review-tui](${REPO_URL}) ` +
    `(v${version}) using ${model}`
  );
}

/** The review types GitHub allows, as the `event` of a review. */
export type ReviewEvent = 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE';

/** A review type as offered when posting. */
export interface ReviewChoice {
  event: ReviewEvent;
  /** Shown to the reviewer. */
  label: string;
  /** Key that picks it in the posting prompt. */
  key: string;
}

/** The review types offered when posting; the first is the default. */
export const REVIEW_CHOICES: readonly ReviewChoice[] = [
  {event: 'COMMENT', label: 'Comment', key: 'c'},
  {event: 'REQUEST_CHANGES', label: 'Request changes', key: 'r'},
  {event: 'APPROVE', label: 'Approve', key: 'a'},
];

/** The review type used unless the reviewer picks another. */
export const DEFAULT_REVIEW_EVENT: ReviewEvent = 'COMMENT';

/**
 * Turns a failed post into a message that says what to do next. GitHub
 * refuses to approve or request changes on your own PR.
 *
 * @param event The review type that was refused.
 * @param message The error text from `gh`.
 * @return A one-line message for the reviewer.
 */
export function explainPostError(event: ReviewEvent, message: string): string {
  const label = REVIEW_CHOICES.find((c) => c.event === event)?.label ?? event;
  const own = /own pull request/i.test(message);
  const reason = own
    ? `GitHub does not let you ${label.toLowerCase()} on your own PR`
    : message;
  return `Post failed (${label}): ${reason}. Nothing was posted and your review is kept: pick again or Esc.`;
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
  /** Ends the review body, after a `---` rule; omitted when empty. */
  footer?: string;
  /** The review type; defaults to {@link DEFAULT_REVIEW_EVENT}. */
  event?: ReviewEvent;
}

/** The body of `POST /pulls/{n}/reviews` for a single review. */
export interface ReviewPayload {
  commit_id: string;
  event: ReviewEvent;
  body: string;
  comments: {
    path: string;
    line: number;
    side: 'RIGHT';
    /** Only for multi-line comments; the range is start_line..line. */
    start_line?: number;
    start_side?: 'RIGHT';
    body: string;
  }[];
}

/**
 * Builds one GitHub review: the general comment as the body (followed by a
 * rule and the footer, if any) and each inline comment on its line, all
 * prefixed so AI lineage is visible. The body's prefix sits on its own line, so
 * a heading at the start of the body still starts a line and renders.
 *
 * @param input Prefix, general comment, inline comments and head commit.
 * @return The payload to send (or print, in a dry run).
 */
export function buildReviewPayload(input: ReviewInput): ReviewPayload {
  const tag = (s: string): string => `${input.prefix} ${s}`;
  return {
    commit_id: input.headSha,
    event: input.event ?? DEFAULT_REVIEW_EVENT,
    body: [
      input.prefix,
      input.general.trim(),
      input.footer ? `---\n\n${input.footer}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    comments: input.comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: 'RIGHT' as const,
      ...(c.startLine === undefined
        ? {}
        : {start_line: c.startLine, start_side: 'RIGHT' as const}),
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
