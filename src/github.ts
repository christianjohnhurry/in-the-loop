import type { InlineComment, PrInfo } from "./types";

export function parsePrUrl(url: string) {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`Not a GitHub PR URL: ${url}`);
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) };
}

async function gh(args: string[], stdin?: string): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`gh ${args.join(" ")} failed: ${err.trim()}`);
  return out;
}

export async function fetchPr(url: string): Promise<{ pr: PrInfo; diff: string }> {
  const { owner, repo, number } = parsePrUrl(url);
  const [view, diff] = await Promise.all([
    gh(["pr", "view", url, "--json", "title,body,headRefOid"]),
    gh(["pr", "diff", url]),
  ]);
  const v = JSON.parse(view) as { title: string; body: string; headRefOid: string };
  return {
    pr: { url, owner, repo, number, title: v.title, body: v.body, headSha: v.headRefOid },
    diff,
  };
}

export async function ghLogin(): Promise<string> {
  return (await gh(["api", "user", "--jq", ".login"])).trim();
}

/** Map of path -> set of new-side (RIGHT) line numbers visible in the diff. */
export function parseDiff(diff: string): Map<string, Set<number>> {
  const files = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  let newLine = 0;
  let inHunk = false;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      current = null;
      inHunk = false;
      // `diff --git a/x b/x`; the +++ line below is authoritative except for deletions.
      const m = raw.match(/ b\/(.+)$/);
      if (m) files.set(m[1]!, (current = new Set()));
      continue;
    }
    if (!inHunk) {
      if (raw.startsWith("+++ b/")) {
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
    if (raw.startsWith("+")) current.add(newLine++);
    else if (raw.startsWith(" ")) current.add(newLine++);
    else if (raw.startsWith("-") || raw.startsWith("\\")) continue;
  }
  return files;
}

export function validateTarget(
  files: Map<string, Set<number>>,
  path: string,
  line: number,
): string | null {
  const lines = files.get(path);
  if (!lines) return `${path} is not in the diff`;
  if (!lines.has(line)) return `${path}:${line} is not on a changed or context line in the diff`;
  return null;
}

export function buildReviewPayload(opts: {
  prefix: string;
  general: string;
  comments: InlineComment[];
  headSha: string;
}) {
  const tag = (s: string) => `${opts.prefix} ${s}`;
  return {
    commit_id: opts.headSha,
    event: "COMMENT" as const,
    body: tag(opts.general),
    comments: opts.comments.map((c) => ({
      path: c.path,
      line: c.line,
      side: "RIGHT" as const,
      body: tag(c.body),
    })),
  };
}

export async function postReview(pr: PrInfo, payload: unknown): Promise<string> {
  const out = await gh(
    ["api", `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/reviews`, "--input", "-"],
    JSON.stringify(payload),
  );
  return (JSON.parse(out) as { html_url?: string }).html_url ?? "(posted)";
}
