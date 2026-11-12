#!/usr/bin/env bun
/**
 * Command-line entry point: `review-tui [pr-url]` (or `--version`).
 *
 * Without a URL, reviews the open PR for the current git branch.
 *
 * Opens (or resumes) the review directory for the PR, then hands control to
 * the terminal UI. Posting happens only from the Review page, after the
 * reviewer confirms.
 */
import {resolve} from 'node:path';
import {closeLlm, fetchProviders, setModel} from './llm';
import {parseModel} from './model';
import {missingTools} from './preflight';
import {openStore} from './store';
import {resolvePrUrl, systemEnv, TargetError} from './target';
import {runTui} from './tui';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  const pkg: {version: string} = await Bun.file(
    new URL('../package.json', import.meta.url),
  ).json();
  console.log(pkg.version);
  process.exit(0);
}
const unknown = args.find((a) => a.startsWith('--'));
if (unknown) {
  console.error(
    unknown === '--post'
      ? 'review-tui: --post was removed; press p on the Review page to post (you will be asked to confirm).'
      : `review-tui: unknown option ${unknown}`,
  );
  console.error('usage: review-tui [pr-url]');
  process.exit(2);
}
const missing = missingTools();
if (missing.length) {
  for (const m of missing) console.error(`review-tui: ${m}`);
  process.exit(2);
}
const urlArg = args[0];
let url: string;
try {
  url = await resolvePrUrl(urlArg, systemEnv);
} catch (e) {
  if (!(e instanceof TargetError)) throw e;
  console.error(`review-tui: ${e.message}`);
  console.error('usage: review-tui [pr-url]');
  process.exit(2);
}

try {
  setModel(parseModel(process.env.MODEL));
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}

// The LLM runs as a child `opencode serve`; make sure it never outlives us,
// including when we are killed by a signal.
process.on('exit', closeLlm);
for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
  process.on(sig, () => process.exit(130));
}

// Start OpenCode now, in parallel with the PR fetch, so the start page's
// model list is ready sooner. The TUI reports any failure.
fetchProviders().catch(() => {});

const store = await openStore(
  process.env.REVIEW_ROOT ?? resolve(process.cwd()),
  url,
);
await runTui(store);
