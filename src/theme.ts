import {StyledText, bold, dim, fg, type TextChunk} from '@opentui/core';

/**
 * The single colour palette for the TUI. Every colour in `tui.ts` comes from
 * here.
 *
 * No backgrounds are set and body text keeps the terminal's own foreground, so
 * the UI follows the user's dark or light scheme. The hues are mid-tone so they
 * stay readable on either.
 */
export const PALETTE = {
  /** Warm terracotta: current page, cursor, headings. */
  accent: '#D97757',
  /** Secondary text, hints, placeholders. */
  muted: '#8B8680',
  /** Ticked items, passed verdicts, open gates. */
  ok: '#4E9F6B',
  /** Retry verdicts, hints, blocked gates, busy. */
  warn: '#C98A1B',
  /** Errors and failures. */
  error: '#D6453D',
  /** The reviewer's own inline comments. */
  comment: '#5B9BD5',
  /** LLM feedback, set apart from the reviewer's words. */
  llm: '#A07CC5',
} as const;

/** Name of a colour in {@link PALETTE}. */
export type Tone = keyof typeof PALETTE;

/**
 * Builds one styled chunk.
 *
 * @param text The text to show.
 * @param tone Palette colour; omit for the terminal default.
 * @param opts Extra emphasis.
 * @param opts.bold Bold weight.
 * @param opts.dim Dimmed.
 * @return A chunk for {@link styled}.
 */
export function span(
  text: string,
  tone?: Tone,
  opts: {bold?: boolean; dim?: boolean} = {},
): TextChunk {
  let c: TextChunk = tone ? fg(PALETTE[tone])(text) : {__isChunk: true, text};
  if (opts.bold) c = bold(c);
  if (opts.dim) c = dim(c);
  return c;
}

/**
 * Joins chunks (strings are unstyled) into one styled text.
 *
 * @param parts Chunks or plain strings, in order.
 * @return Content for a `TextRenderable`.
 */
export function styled(...parts: (TextChunk | string)[]): StyledText {
  return new StyledText(
    parts.map((p) => (typeof p === 'string' ? span(p) : p)),
  );
}

/**
 * Joins styled lines with newlines.
 *
 * @param lines Each line is a list of chunks or plain strings.
 * @return Content for a `TextRenderable`.
 */
export function lines(lines: (TextChunk | string)[][]): StyledText {
  const out: (TextChunk | string)[] = [];
  lines.forEach((l, i) => {
    if (i) out.push('\n');
    out.push(...l);
  });
  return styled(...out);
}

/** Accent shades the "thinking…" status pulses through. */
const GLOW = ['#8E4F39', '#B5644A', '#D97757', '#E8957A', '#D97757', '#B5644A'];

/**
 * Builds a chunk whose colour depends on `step`, so redrawing with a rising
 * step makes the text glow.
 *
 * @param text The text to show.
 * @param step Animation step; any integer.
 * @return A chunk for {@link styled}.
 */
export function glow(text: string, step: number): TextChunk {
  return bold(
    fg(GLOW[((step % GLOW.length) + GLOW.length) % GLOW.length]!)(text),
  );
}
