#!/usr/bin/env bun
import { resolve } from "node:path";
import { openStore } from "./store";
import { runTui } from "./tui";

const args = process.argv.slice(2);
const post = args.includes("--post");
const url = args.find((a) => !a.startsWith("--"));
if (!url) {
  console.error("usage: review-tui <pr-url> [--post]");
  process.exit(2);
}
import { closeLlm } from "./llm";
process.on("exit", closeLlm);
for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"] as const) process.on(sig, () => process.exit(130));
const store = await openStore(process.env.REVIEW_ROOT ?? resolve(process.cwd()), url);
await runTui(store, { post });
