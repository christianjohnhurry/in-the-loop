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

/** Smallest letters for the review-tui subtitle, two rows each. */
const SMALL: Record<string, string[]> = {
  ' ': ['  ', '  '],
  '-': ['▄▄▄', '   '],
  r: ['█▀▀', '█  '],
  e: ['█▀▀', '█▄▄'],
  v: ['█ █', '▀▄▀'],
  i: ['▀', '█'],
  w: ['█ █ █', '▀▄▀▄▀'],
  t: ['▀█▀', ' █ '],
  u: ['█ █', '█▄█'],
};

/** Logo sizes: the letters and the gap between them. */
const FONTS = {
  large: {glyphs: FONT, gap: '  '},
  medium: {glyphs: MEDIUM, gap: ' '},
  small: {glyphs: SMALL, gap: ' '},
};

/** Name of a size in {@link FONTS}. */
export type LogoSize = keyof typeof FONTS;

/**
 * Renders a word in block letters.
 *
 * @param word Letters present in the font; ∞ is the two O's of LOOP joined.
 * @param size Which font: large (5 rows), medium (3) or small (2).
 * @return Lines of block art.
 */
export function bigText(word: string, size: LogoSize = 'large'): string[] {
  const {glyphs, gap} = FONTS[size];
  return glyphs[' ']!.map((_, r) =>
    [...word].map((ch) => glyphs[ch]![r]!).join(gap),
  );
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
  return [
    lines(bigText('IN THE', 'medium').map((l) => row(l, 'muted'))),
    blank,
    lines(bigText('L∞P').map((l) => row(l, 'accent', {bold: true}))),
    blank,
    lines(bigText('review-tui', 'small').map((l) => row(l, 'muted'))),
    blank,
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
