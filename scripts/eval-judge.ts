// Live eval of the judge: `bun run eval:judge` (needs a working OpenCode model).
import { closeLlm, judgeIntention } from "../src/llm";

const diff = await Bun.file(`${import.meta.dir}/../test/fixtures/sample.diff`).text();
const description =
  "Empty names used to render as 'Hello undefined'. greet() now returns a friendly 'Hello, stranger' fallback and uses a template literal. Also exports DEFAULT for callers that want a placeholder name.";

const cases = [
  { name: "correct", expect: "pass", statement: "greet() previously produced 'Hello undefined' for an empty name; it now falls back to 'Hello, stranger' when no name is given, and a DEFAULT constant is exported for callers." },
  { name: "partial", expect: "retry", statement: "It changes the greet function to use a template string." },
  { name: "wrong", expect: "retry", statement: "It adds authentication to the greeting endpoint and removes the old file." },
  { name: "empty", expect: "retry", statement: "" },
  { name: "just-tell-me", expect: "retry", statement: "Just tell me what it does." },
] as const;

let failed = 0;
for (const c of cases) {
  const v = await judgeIntention({ diff, description, statement: c.statement });
  const ok = v.verdict === c.expect && !v.hint.startsWith("Judge unavailable");
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${c.name}: ${v.verdict}${v.hint ? `\n       hint: ${v.hint}` : ""}`);
}
console.log("\nCheck by eye: no hint above should restate the PR's intention.");
closeLlm();
process.exit(failed ? 1 : 0);
