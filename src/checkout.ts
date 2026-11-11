/**
 * @file Decides whether the local checkout is the code under review, so
 * Enquire only searches the repo when its answers will be about the PR.
 */
import {spawnSync} from 'node:child_process';
import type {PrInfo} from './types';

/** Where Enquire may look, and whether it may search there. */
export type RepoAccess =
  {search: true; root: string} | {search: false; root: string; reason: string};

/**
 * Runs git in `cwd`.
 *
 * @param cwd Directory to run in.
 * @param args Git arguments.
 * @return Trimmed stdout, or undefined if git failed.
 */
function git(cwd: string, args: string[]): string | undefined {
  const r = spawnSync('git', args, {cwd, encoding: 'utf8'});
  return r.status === 0 ? r.stdout.trim() : undefined;
}

/**
 * The repo checkout: the git top level of `cwd`.
 *
 * @param cwd Directory to start from.
 * @return The top level, or `cwd` when it is not in a git checkout.
 */
export function gitRoot(cwd: string = process.cwd()): string {
  return git(cwd, ['rev-parse', '--show-toplevel']) ?? cwd;
}

/**
 * Checks that the checkout is the PR's repo at the PR's head commit.
 *
 * Anything else would let Enquire search code that is not what is being
 * reviewed (another repo, or an older or newer commit) and answer
 * confidently about it, so it falls back to the selection and diff only.
 *
 * @param cwd Directory review-tui was launched from.
 * @param pr The PR under review.
 * @return Whether repo search is allowed, and if not, why.
 */
export function checkReviewCheckout(cwd: string, pr: PrInfo): RepoAccess {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (top === undefined)
    return {search: false, root: cwd, reason: 'not inside a git checkout'};
  const slug = `${pr.owner}/${pr.repo}`;
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const remotes = git(top, ['remote', '-v']) ?? '';
  if (!new RegExp(`[/:]${escaped}(\\.git)?\\s`, 'i').test(remotes))
    return {
      search: false,
      root: top,
      reason: `this checkout is not ${slug} (no matching git remote)`,
    };
  const head = git(top, ['rev-parse', 'HEAD']);
  if (!head || head.toLowerCase() !== pr.headSha.toLowerCase())
    return {
      search: false,
      root: top,
      reason: `checkout is at ${head?.slice(0, 7) ?? 'no commit'}, the PR head is ${pr.headSha.slice(0, 7)} (try: gh pr checkout ${pr.number})`,
    };
  return {search: true, root: top};
}
