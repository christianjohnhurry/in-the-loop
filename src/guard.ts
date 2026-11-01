import type { Verdict } from "./types";

export const HINT_CAP = 300;
export const FALLBACK_HINT =
  "Not there yet. Re-read the diff and PR title, then say what changes and why it is needed.";

/** Does `hint` copy a run of `n` consecutive words from `source`? */
function copiesRun(hint: string, source: string, n = 7): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const h = words(hint);
  const src = ` ${words(source).join(" ")} `;
  for (let i = 0; i + n <= h.length; i++) {
    if (src.includes(` ${h.slice(i, i + n).join(" ")} `)) return true;
  }
  return false;
}

/**
 * The guardrail. Whatever the model returned, only a well-formed verdict and a
 * length-capped hint survive. Anything else is discarded.
 */
export function parseVerdict(raw: unknown, prDescription = ""): Verdict {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    try {
      obj = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
    } catch {
      obj = null;
    }
  }
  const o = obj as { verdict?: unknown; hint?: unknown } | null;
  // Malformed output fails closed: the user does not pass.
  if (!o || (o.verdict !== "pass" && o.verdict !== "retry")) {
    return { verdict: "retry", hint: FALLBACK_HINT };
  }
  let hint = typeof o.hint === "string" ? o.hint.replace(/\s+/g, " ").trim() : "";
  if (hint.length > HINT_CAP) hint = `${hint.slice(0, HINT_CAP - 1)}…`;
  if (o.verdict === "retry" && (!hint || copiesRun(hint, prDescription))) hint = FALLBACK_HINT;
  return { verdict: o.verdict, hint: o.verdict === "pass" ? "" : hint };
}
