#!/usr/bin/env bun
import { resolve } from "node:path";
import { closeLlm, listModels, selectModel } from "./llm";
import { openStore } from "./store";
import { runTui } from "./tui";

process.on("exit", closeLlm);
for (const sig of ["SIGTERM", "SIGHUP", "SIGINT"] as const) process.on(sig, () => process.exit(130));

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--list-models")) {
  console.log((await listModels()).join("\n"));
  process.exit(0);
}

const post = args.includes("--post");
const model = flag("--model") ?? process.env.REVIEW_MODEL;
const url = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--model");
if (!url) {
  console.error("usage: review-tui <pr-url> [--post] [--model provider/model] | --list-models");
  process.exit(2);
}
try {
  if (model) await selectModel(model);
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
const store = await openStore(process.env.REVIEW_ROOT ?? resolve(process.cwd()), url);
await runTui(store, { post });
