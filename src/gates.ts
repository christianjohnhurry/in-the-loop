import { checklistDone } from "./checklist";
import type { InlineComment, State } from "./types";

export function reviewGates(state: State, comments: InlineComment[]) {
  const missing: string[] = [];
  if (!checklistDone(state.checklist)) missing.push("checklist incomplete");
  if (state.intention.status !== "passed") missing.push("intention not passed");
  if (comments.length === 0) missing.push("no comments yet");
  return { ok: missing.length === 0, missing };
}
