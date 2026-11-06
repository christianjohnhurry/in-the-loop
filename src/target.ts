/**
 * Works out which PR to review: the URL argument if given, otherwise the open
 * PR for the current git branch.
 */

/** Thrown for a user-facing failure; the CLI prints it and exits 2. */
export class TargetError extends Error {}

/** The environment lookups `resolvePrUrl` needs, injectable for tests. */
export interface TargetEnv {
  /** Whether the current directory is inside a git work tree. */
  inGitRepo(): Promise<boolean>;
  /** The checked-out branch name, or undefined on a detached HEAD. */
  currentBranch(): Promise<string | undefined>;
  /** The URL of the open PR for the current branch, or undefined if none. */
  branchPrUrl(): Promise<string | undefined>;
}

/**
 * Picks the PR URL to review.
 *
 * @param urlArg The URL given on the command line, if any. It always wins.
 * @param env Lookups for the current directory's git state.
 * @return The PR URL.
 * @throws {TargetError} If there is no URL and none can be inferred.
 */
export async function resolvePrUrl(
  urlArg: string | undefined,
  env: TargetEnv,
): Promise<string> {
  if (urlArg) return urlArg;
  if (!(await env.inGitRepo())) {
    throw new TargetError(
      'not inside a git repository; run review-tui from a repo or pass a PR URL: review-tui <pr-url>',
    );
  }
  const branch = await env.currentBranch();
  if (!branch) {
    throw new TargetError(
      'HEAD is detached (no current branch); check out a branch or pass a PR URL: review-tui <pr-url>',
    );
  }
  const url = await env.branchPrUrl();
  if (!url) {
    throw new TargetError(
      `no open PR found for branch "${branch}"; push it and open a PR, or pass a PR URL: review-tui <pr-url>`,
    );
  }
  return url;
}

/** Runs a command and returns its exit code and trimmed stdout. */
async function run(cmd: string[]): Promise<{code: number; out: string}> {
  try {
    const proc = Bun.spawn(cmd, {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const [out, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return {code, out: out.trim()};
  } catch {
    // The binary is missing.
    return {code: 127, out: ''};
  }
}

/** The real environment, backed by `git` and `gh` in the current directory. */
export const systemEnv: TargetEnv = {
  async inGitRepo() {
    const {code, out} = await run([
      'git',
      'rev-parse',
      '--is-inside-work-tree',
    ]);
    return code === 0 && out === 'true';
  },
  async currentBranch() {
    const {code, out} = await run([
      'git',
      'symbolic-ref',
      '--short',
      '-q',
      'HEAD',
    ]);
    return code === 0 && out ? out : undefined;
  },
  async branchPrUrl() {
    const {code, out} = await run(['gh', 'pr', 'view', '--json', 'url']);
    if (code !== 0) return undefined;
    try {
      return (JSON.parse(out) as {url?: string}).url || undefined;
    } catch {
      return undefined;
    }
  },
};
