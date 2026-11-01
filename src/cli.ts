#!/usr/bin/env bun
/**
 * Command-line entry point: `review-tui <pr-url> [--post]`.
 *
 * Opens (or resumes) the review directory for the PR, then hands control to
 * the terminal UI. Without `--post` the final step is a dry run.
 */
import {resolve} from 'node:path';
import {closeLlm} from './llm';
import {openStore} from './store';
import {runTui} from './tui';

const args = process.argv.slice(2);
const post = args.includes('--post');
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('usage: review-tui <pr-url> [--post]');
  process.exit(2);
}

// The LLM runs as a child `opencode serve`; make sure it never outlives us,
// including when we are killed by a signal.
process.on('exit', closeLlm);
for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
  process.on(sig, () => process.exit(130));
}

const store = await openStore(
  process.env.REVIEW_ROOT ?? resolve(process.cwd()),
  url,
);
await runTui(store, {post});
