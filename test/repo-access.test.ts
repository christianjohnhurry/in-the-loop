import {afterAll, beforeAll, expect, test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  ENQUIRE_AGENT,
  ENQUIRE_NO_REPO_AGENT,
  loadAgents,
  parseAgent,
} from '../src/agents';
import {checkReviewCheckout, gitRoot} from '../src/checkout';
import type {PrInfo} from '../src/types';

let tmp: string;
let repo: string;
let head: string;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, {cwd, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

function pr(headSha: string, owner = 'acme', name = 'widgets'): PrInfo {
  return {
    url: `https://github.com/${owner}/${name}/pull/7`,
    owner,
    repo: name,
    number: 7,
    title: '',
    body: '',
    headSha,
  };
}

beforeAll(async () => {
  tmp = await realpath(await mkdtemp(join(tmpdir(), 'repo-access-')));
  repo = join(tmp, 'widgets');
  await mkdir(join(repo, 'src'), {recursive: true});
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'remote', 'add', 'origin', 'git@github.com:Acme/widgets.git');
  await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'one');
  head = git(repo, 'rev-parse', 'HEAD');
});

afterAll(async () => {
  await rm(tmp, {recursive: true, force: true});
});

test('a checkout of the PR repo at the PR head allows repo search', () => {
  expect(checkReviewCheckout(repo, pr(head))).toEqual({
    search: true,
    root: repo,
  });
});

test('the root is the git top level even from a subdirectory', () => {
  const r = checkReviewCheckout(join(repo, 'src'), pr(head));
  expect(r).toEqual({search: true, root: repo});
  expect(gitRoot(join(repo, 'src'))).toBe(repo);
});

test('https remotes and a .git suffix both match, case-insensitively', () => {
  git(repo, 'remote', 'set-url', 'origin', 'https://github.com/acme/WIDGETS');
  expect(checkReviewCheckout(repo, pr(head)).search).toBe(true);
  git(repo, 'remote', 'set-url', 'origin', 'git@github.com:Acme/widgets.git');
});

test('a different commit than the PR head degrades, naming both', async () => {
  await writeFile(join(repo, 'src', 'b.ts'), 'export const b = 2;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'two');
  const r = checkReviewCheckout(repo, pr(head));
  git(repo, 'reset', '-q', '--hard', head);
  expect(r.search).toBe(false);
  if (r.search) return;
  expect(r.root).toBe(repo);
  expect(r.reason).toContain(`the PR head is ${head.slice(0, 7)}`);
  expect(r.reason).toContain('gh pr checkout 7');
});

test('a checkout of a different repo degrades', () => {
  const r = checkReviewCheckout(repo, pr(head, 'acme', 'gadgets'));
  expect(r.search).toBe(false);
  if (!r.search) expect(r.reason).toContain('acme/gadgets');
});

test('a repo with no remote degrades', async () => {
  const bare = join(tmp, 'noremote');
  await mkdir(bare);
  git(bare, 'init', '-q');
  expect(checkReviewCheckout(bare, pr(head)).search).toBe(false);
});

test('a directory outside any git checkout degrades and keeps its path', async () => {
  const plain = join(tmp, 'plain');
  await mkdir(plain);
  const r = checkReviewCheckout(plain, pr(head));
  expect(r).toEqual({
    search: false,
    root: plain,
    reason: 'not inside a git checkout',
  });
  expect(gitRoot(plain)).toBe(plain);
});

test('agents load from the files, with a no-repo Enquire variant', async () => {
  const agents = await loadAgents();
  expect(Object.keys(agents).sort()).toEqual([
    'review-enquire',
    'review-enquire-norepo',
    'review-judge',
  ]);
  const on = agents[ENQUIRE_AGENT]!;
  const off = agents[ENQUIRE_NO_REPO_AGENT]!;
  expect(on.prompt).toContain('G1.');
  expect(on.permission).toMatchObject({
    edit: 'deny',
    bash: 'deny',
    grep: 'allow',
    external_directory: 'deny',
  });
  // Degraded mode: same agent, but it cannot look at the repo at all.
  for (const t of ['grep', 'glob', 'list'])
    expect(off.permission?.[t]).toBe('deny');
  // `read` is never fully denied (that hangs OpenCode): it allows one path
  // that cannot exist, and everything else is refused.
  expect(off.permission?.read).toEqual({
    '*': 'deny',
    '.review-tui-no-such-file': 'allow',
  });
  expect(off.permission).toMatchObject({edit: 'deny', bash: 'deny'});
  expect(off.prompt).toBe(on.prompt);
});

test('no review agent can write or run anything, in either mode', async () => {
  for (const a of Object.values(await loadAgents()))
    for (const t of ['edit', 'bash', 'webfetch', 'websearch', 'task'])
      expect(a.permission?.[t]).toBe('deny');
});

test('parseAgent rejects a file without frontmatter', () => {
  expect(() => parseAgent('no frontmatter')).toThrow();
});
