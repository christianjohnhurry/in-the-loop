import type {StyledText, TextChunk} from '@opentui/core';
import {lines, span, styled, type Tone} from './theme';
import {
  formatModel,
  windowStart,
  type ModelOption,
  type ModelRef,
} from './model';
import type {PrInfo} from './types';

/** Compact one-line logo kept in the top-right corner of every page. */
export const CORNER_LOGO = '✻ In The Loop';

/** Block letters for LOOP, five rows each. */
const FONT: Record<string, string[]> = {
  ' ': ['   ', '   ', '   ', '   ', '   '],
  I: ['███', ' █ ', ' █ ', ' █ ', '███'],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  E: ['████', '█   ', '███ ', '█   ', '████'],
  L: ['█   ', '█   ', '█   ', '█   ', '████'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  '∞': [
    '  ███   ███  ',
    ' █   █ █   █ ',
    '█     █     █',
    ' █   █ █   █ ',
    '  ███   ███  ',
  ],
  P: ['████ ', '█   █', '████ ', '█    ', '█    '],
};

/** Medium letters for IN THE, three rows each. */
const MEDIUM: Record<string, string[]> = {
  ' ': ['  ', '  ', '  '],
  I: ['▀█▀', ' █ ', '▄█▄'],
  N: ['█▄ █', '█ ▀█', '█  █'],
  T: ['▀█▀', ' █ ', ' █ '],
  H: ['█ █', '█▀█', '█ █'],
  E: ['█▀▀', '█▀▀', '█▄▄'],
};

/** Logo sizes: the letters and the gap between them. */
const FONTS = {
  large: {glyphs: FONT, gap: '  '},
  medium: {glyphs: MEDIUM, gap: ' '},
};

/** Name of a size in {@link FONTS}. */
export type LogoSize = keyof typeof FONTS;

/**
 * Renders a word in block letters.
 *
 * @param word Letters present in the font; ∞ is the two O's of LOOP joined.
 * @param size Which font: large (5 rows) or medium (3).
 * @return Lines of block art.
 */
export function bigText(word: string, size: LogoSize = 'large'): string[] {
  const {glyphs, gap} = FONTS[size];
  return glyphs[' ']!.map((_, r) =>
    [...word].map((ch) => glyphs[ch]![r]!).join(gap),
  );
}

/** A run of logo lines and how the start page colours them. */
export interface LogoBlock {
  lines: string[];
  tone: Tone;
  bold: boolean;
}

/**
 * The start-page logo, top to bottom: IN THE, LOOP, then the subtitle. Shared
 * by the start page and the README's logo image so they cannot drift.
 *
 * @return The logo blocks, uncentred.
 */
export function logoBlocks(): LogoBlock[] {
  return [
    {lines: bigText('IN THE', 'medium'), tone: 'muted', bold: false},
    {lines: bigText('L∞P'), tone: 'accent', bold: true},
    {lines: ['R E V I E W  -  T U I'], tone: 'muted', bold: true},
  ];
}

/** What the start page's `model:` line and picker show. */
export interface ModelView {
  /** The selected model; undefined means OpenCode picks its own default. */
  selected: ModelRef | undefined;
  /** Why the models could not be listed; shown instead of blocking. */
  error?: string;
  /** True until the model list has loaded or failed. */
  loading: boolean;
  /** True once models are listed, so `m` opens the picker. */
  pickable?: boolean;
  /** The open picker, or undefined when it is closed. */
  picker?: {
    /** What the reviewer has typed to filter the list. */
    query: string;
    /** The models that match `query`. */
    options: ModelOption[];
    /** Index into `options` of the highlighted model. */
    cursor: number;
    /** How many rows of the list fit on screen. */
    rows: number;
  };
}

/**
 * Builds the start page: block-letter logo, subtitle, the PR's repo and head
 * branch, the selected model (with the picker when open) and the Enter prompt.
 * The number of blocks never changes, so the TUI can update them in place.
 *
 * @param pr The PR the TUI was loaded with.
 * @param model The model selection and picker state.
 * @return Blocks to stack top to bottom, each centred as a unit by the layout.
 */
export function startPage(pr: PrInfo, model: ModelView): StyledText[] {
  const row = (
    text: string,
    tone?: Tone,
    o?: {bold?: boolean},
  ): TextChunk[] => [span(text, tone, o)];
  const blank = lines([row(' ')]);
  const logo = logoBlocks().flatMap((b) => [
    lines(b.lines.map((l) => row(l, b.tone, {bold: b.bold}))),
    blank,
  ]);
  const shown = model.selected
    ? span(formatModel(model.selected))
    : span(model.loading ? 'loading…' : 'OpenCode default', 'muted');
  return [
    ...logo,
    lines([[span('repo: ', 'muted'), span(`${pr.owner}/${pr.repo}`)]]),
    lines([[span('branch: ', 'muted'), span(pr.headRefName || '-')]]),
    lines([
      [span('model: ', 'muted'), shown],
      ...(model.error
        ? [row(`Could not list models: ${model.error}`, 'error')]
        : []),
    ]),
    pickerBlock(model),
    lines([
      row(model.picker ? 'Enter select' : 'Press Enter to start', 'accent', {
        bold: true,
      }),
      row(
        !model.picker && model.pickable ? 'Press m to select model' : ' ',
        'accent',
      ),
    ]),
  ];
}

/** The model list, or an empty line while the picker is closed. */
function pickerBlock(model: ModelView): StyledText {
  const p = model.picker;
  if (!p) return lines([[span(' ')]]);
  const first = windowStart(p.options.length, p.cursor, p.rows);
  const shown = p.options.slice(first, first + p.rows);
  return lines([
    [span('filter: ', 'muted'), span(`${p.query}▏`)],
    ...(shown.length
      ? shown.map((o, i): TextChunk[] => {
          const here = first + i === p.cursor;
          return [
            span(here ? '> ' : '  ', 'accent', {bold: true}),
            span(formatModel(o), here ? 'accent' : undefined, {bold: here}),
            span(` ${o.name}`, 'muted'),
          ];
        })
      : [[span('  no models match', 'muted')]]),
    [
      span(
        `${p.options.length ? p.cursor + 1 : 0}/${p.options.length}`,
        'muted',
      ),
    ],
  ]);
}

/** The corner logo as styled text. */
export function cornerLogo(): StyledText {
  return styled(span(CORNER_LOGO, 'accent', {bold: true}));
}
