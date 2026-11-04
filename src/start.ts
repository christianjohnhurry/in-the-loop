import type {StyledText, TextChunk} from '@opentui/core';
import {lines, span, styled, type Tone} from './theme';
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

/**
 * Builds the start page: block-letter logo, subtitle, the PR's repo and head
 * branch, and the Enter prompt.
 *
 * @param pr The PR the TUI was loaded with.
 * @return Blocks to stack top to bottom, each centred as a unit by the layout.
 */
export function startPage(pr: PrInfo): StyledText[] {
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
  return [
    ...logo,
    lines([[span('repo: ', 'muted'), span(`${pr.owner}/${pr.repo}`)]]),
    lines([[span('branch: ', 'muted'), span(pr.headRefName || '-')]]),
    blank,
    lines([row('Press Enter to start', 'accent', {bold: true})]),
  ];
}

/** The corner logo as styled text. */
export function cornerLogo(): StyledText {
  return styled(span(CORNER_LOGO, 'accent', {bold: true}));
}
