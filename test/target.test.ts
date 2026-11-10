import {expect, test} from 'bun:test';
import {resolvePrUrl, TargetError, type TargetEnv} from '../src/target';

const URL = 'https://github.com/o/r/pull/7';

/** An env that is in a repo on branch `feat` with a PR, with overrides. */
function env(over: Partial<TargetEnv> = {}): TargetEnv {
  return {
    inGitRepo: async () => true,
    currentBranch: async () => 'feat',
    branchPrUrl: async () => URL,
    ...over,
  };
}

/** Collects the error message from a rejected resolvePrUrl. */
async function failure(e: TargetEnv): Promise<string> {
  try {
    await resolvePrUrl(undefined, e);
  } catch (err) {
    expect(err).toBeInstanceOf(TargetError);
    return (err as Error).message;
  }
  throw new Error('expected resolvePrUrl to throw');
}

test('an explicit URL wins and skips all lookups', async () => {
  const boom = async (): Promise<never> => {
    throw new Error('should not be called');
  };
  const e = env({inGitRepo: boom, currentBranch: boom, branchPrUrl: boom});
  expect(await resolvePrUrl('https://github.com/a/b/pull/1', e)).toBe(
    'https://github.com/a/b/pull/1',
  );
});

test('without a URL, uses the current branch PR', async () => {
  expect(await resolvePrUrl(undefined, env())).toBe(URL);
});

test('not in a git repo', async () => {
  const msg = await failure(env({inGitRepo: async () => false}));
  expect(msg).toContain('not inside a git repository');
  expect(msg).toContain('review-tui <pr-url>');
});

test('detached HEAD', async () => {
  const msg = await failure(env({currentBranch: async () => undefined}));
  expect(msg).toContain('HEAD is detached');
  expect(msg).toContain('review-tui <pr-url>');
});

test('no PR for the branch', async () => {
  const msg = await failure(env({branchPrUrl: async () => undefined}));
  expect(msg).toContain('no open PR found for branch "feat"');
  expect(msg).toContain('review-tui <pr-url>');
});
