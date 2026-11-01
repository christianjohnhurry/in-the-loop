import { spawnSync } from "node:child_process";
import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, createCliRenderer } from "@opentui/core";
import { CHECKLIST } from "./checklist";
import { reviewGates } from "./gates";
import { buildReviewPayload, ghLogin, parseDiff, postReview, validateTarget } from "./github";
import { judgeIntention, reviewComments } from "./llm";
import {
  appendInline, commentsPath, getSection, parseInline, readComments, setSection, type Store,
} from "./store";

const PAGES = ["Checklist", "Intention", "Comments", "Review"] as const;

export async function runTui(store: Store, opts: { post: boolean }) {
  const { state } = store;
  const files = parseDiff(store.diff);
  const renderer = await createCliRenderer({ exitOnCtrlC: true });

  const root = new BoxRenderable(renderer, { flexDirection: "column", width: "100%", height: "100%", padding: 1 });
  const header = new TextRenderable(renderer, { content: "" });
  const body = new TextRenderable(renderer, { content: "", flexGrow: 1 });
  const status = new TextRenderable(renderer, { content: "" });
  const input = new InputRenderable(renderer, { width: "100%", placeholder: "" });
  const footer = new TextRenderable(renderer, { content: "" });
  for (const r of [header, body, status, input, footer]) root.add(r);
  renderer.root.add(root);

  let cursor = 0; // checklist cursor
  let message = ""; // transient status line
  let busy = false;
  let typingOff = false; // Esc: leave the input so arrows navigate
  let payloadText = "";
  const inputPage = () => state.page === 1 || state.page === 2;
  const intentionLocked = () => state.intention.status === "passed";

  async function persist() { await store.save(); }

  async function draw() {
    const md = await readComments(store.dir);
    const comments = parseInline(md);
    const gates = reviewGates(state, comments);
    header.content = `◀ ${PAGES.map((p, i) => (i === state.page ? `[ ${p} ]` : p)).join("  ")} ▶   (${state.page + 1}/${PAGES.length})   PR #${state.pr.number}: ${state.pr.title}`;
    let text = "";
    let hint = "←/→ pages · Ctrl+C quit";
    if (state.page === 0) {
      text = CHECKLIST.map((c, i) => `${i === cursor ? ">" : " "} [${state.checklist[c.id] ? "x" : " "}] ${c.label}`).join("\n");
      hint += " · ↑/↓ move · space tick";
    } else if (state.page === 1) {
      text = intentionLocked()
        ? `Intention accepted and saved to comments.md:\n\n${state.intention.text}`
        : `In your own words: what does this PR change, and why?\n(The reviewer states it; the judge only says pass/retry.)\n\n${state.intention.hint ? `Hint: ${state.intention.hint}\n\n` : ""}${state.intention.text ? `Your last attempt: ${state.intention.text}` : ""}`;
      hint += " · type + Enter submit · Esc leave input";
    } else if (state.page === 2) {
      text = `Add: path:line comment   (or: general: text for the review body)\nFiles in diff:\n${[...files.keys()].map((f) => `  ${f}`).join("\n")}\n\nComments (${comments.length}):\n${comments.map((c) => `  ${c.path}:L${c.line} — ${c.body}`).join("\n")}`;
      hint += " · Enter add · Esc leave input";
    } else {
      text = [
        `Gates: ${gates.ok ? "all passed" : gates.missing.join(", ")}`,
        `Mode: ${opts.post ? "POST (live)" : "dry run"}`,
        "",
        state.feedback ? `Feedback on your comments:\n${state.feedback}` : "",
        payloadText ? `\nPayload:\n${payloadText}` : "",
      ].join("\n");
      hint += " · s start review · e edit comments.md · p " + (opts.post ? "post" : "dry-run payload");
    }
    body.content = text;
    status.content = busy ? "working…" : message;
    footer.content = hint;
    input.visible = inputPage() && !(state.page === 1 && intentionLocked());
    if (input.visible && !typingOff) { input.placeholder = state.page === 1 ? "your intention…" : "path:line comment"; input.focus(); }
    else input.blur();
    renderer.requestRender();
  }

  async function go(page: number) {
    state.page = (page + PAGES.length) % PAGES.length;
    typingOff = false;
    message = "";
    await persist();
    await draw();
  }

  async function submit(value: string) {
    if (busy || !value.trim()) return;
    if (state.page === 1 && !intentionLocked()) {
      busy = true; state.intention.text = value.trim(); input.value = ""; await draw();
      const v = await judgeIntention({ diff: store.diff, description: state.pr.body, statement: state.intention.text });
      busy = false;
      if (v.verdict === "pass") {
        state.intention.status = "passed";
        state.intention.hint = "";
        const md = await readComments(store.dir);
        await Bun.write(commentsPath(store.dir), setSection(md, "Intention", state.intention.text));
        message = "Intention passed.";
      } else {
        state.intention.hint = v.hint;
        message = "Not yet.";
      }
    } else if (state.page === 2) {
      const g = value.match(/^general:\s*(.+)$/i);
      if (g) {
        const md = await readComments(store.dir);
        const prev = getSection(md, "General");
        await Bun.write(commentsPath(store.dir), setSection(md, "General", prev ? `${prev}\n${g[1]}` : g[1]!));
        message = "Added to general comment."; input.value = "";
      } else {
        const m = value.match(/^(\S+?):(\d+)\s+(.+)$/);
        const err = m ? validateTarget(files, m[1]!, Number(m[2])) : "Use: path:line comment";
        if (err || !m) message = err ?? "";
        else { await appendInline(store.dir, { path: m[1]!, line: Number(m[2]), body: m[3]! }); message = "Added."; input.value = ""; }
      }
    }
    await persist();
    await draw();
  }
  input.on(InputRenderableEvents.ENTER, (v: string) => void submit(v));

  async function startReview() {
    const md = await readComments(store.dir);
    const gates = reviewGates(state, parseInline(md));
    if (!gates.ok) { message = `Blocked: ${gates.missing.join(", ")}`; return; }
    busy = true; await draw();
    try { state.feedback = await reviewComments(md); message = ""; }
    catch (e) { message = `Review failed: ${(e as Error).message}`; }
    busy = false;
  }

  async function editComments() {
    await renderer.suspend();
    spawnSync(process.env.EDITOR || "vi", [commentsPath(store.dir)], { stdio: "inherit" });
    await renderer.resume();
  }

  async function publish() {
    const md = await readComments(store.dir);
    const comments = parseInline(md);
    const gates = reviewGates(state, comments);
    if (!gates.ok) { message = `Blocked: ${gates.missing.join(", ")}`; return; }
    const bad = comments.map((c) => validateTarget(files, c.path, c.line)).find(Boolean);
    if (bad) { message = `Edited comment invalid: ${bad}`; return; }
    const reviewer = process.env.REVIEWER || (await ghLogin());
    const model = process.env.MODEL || "opencode-default";
    const general = getSection(md, "General") || "Review comments below.";
    const payload = buildReviewPayload({ prefix: `[${reviewer} + ${model}]`, general, comments, headSha: state.pr.headSha });
    payloadText = JSON.stringify(payload, null, 2);
    await Bun.write(`${store.dir}/payload.json`, payloadText);
    message = opts.post ? `Posted: ${await postReview(state.pr, payload)}` : `Dry run: payload saved to ${store.dir}/payload.json`;
  }

  renderer.keyInput.on("keypress", async (key) => {
    const typing = inputPage() && input.visible && !typingOff;
    const inputEmpty = !input.value;
    if (key.name === "escape") { typingOff = true; message = "Input off: use ←/→; Enter or i to type again"; await draw(); return; }
    if (typingOff && (key.name === "return" || key.name === "i")) { typingOff = false; message = ""; await draw(); return; }
    if (typing && !(inputEmpty && (key.name === "left" || key.name === "right"))) return;
    if (key.name === "left") return void (await go(state.page - 1));
    if (key.name === "right") return void (await go(state.page + 1));
    if (state.page === 0) {
      if (key.name === "up") cursor = Math.max(0, cursor - 1);
      else if (key.name === "down") cursor = Math.min(CHECKLIST.length - 1, cursor + 1);
      else if (key.name === "space") { const id = CHECKLIST[cursor]!.id; state.checklist[id] = !state.checklist[id]; await persist(); }
      return void (await draw());
    }
    if (state.page === 3 && !busy) {
      if (key.name === "s") await startReview();
      else if (key.name === "e") await editComments();
      else if (key.name === "p") { try { await publish(); } catch (e) { message = `Failed: ${(e as Error).message}`; } }
      await persist();
      return void (await draw());
    }
  });

  await draw();
}
