/**
 * @file Startup check that the external programs review-tui shells out to are
 * installed, so a missing one gives a clear message instead of a stack trace.
 */

/** A program review-tui needs, and what to tell the user if it is missing. */
interface Tool {
  name: string;
  why: string;
  hint: string;
}

const GH: Tool = {
  name: 'gh',
  why: 'reads the PR and posts the review',
  hint: 'Install the GitHub CLI (https://cli.github.com), then run: gh auth login',
};

const OPENCODE: Tool = {
  name: 'opencode',
  why: 'runs the model for the judge and Enquire',
  hint: 'Install OpenCode (https://opencode.ai), then log in to a provider: opencode auth login',
};

/**
 * Lists the problems with the environment, one message per missing program.
 *
 * `opencode` is not needed when `OPENCODE_URL` points at a server.
 *
 * @param env Environment variables.
 * @param which Finds a program on PATH; defaults to Bun's lookup.
 * @return One human-readable message per missing program; empty if all found.
 */
export function missingTools(
  env: Record<string, string | undefined> = process.env,
  which: (name: string) => string | null = (n) => Bun.which(n),
): string[] {
  const needed = env.OPENCODE_URL ? [GH] : [GH, OPENCODE];
  return needed
    .filter((t) => !which(t.name))
    .map((t) => `\`${t.name}\` is not on your PATH (it ${t.why}). ${t.hint}`);
}
