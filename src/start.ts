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

/** Smaller letters for IN THE, three rows each. */
const SMALL: Record<string, string[]> = {
  ' ': ['  ', '  ', '  '],
  I: ['▀█▀', ' █ ', '▄█▄'],
  N: ['█▄ █', '█ ▀█', '█  █'],
  T: ['▀█▀', ' █ ', ' █ '],
  H: ['█ █', '█▀█', '█ █'],
  E: ['█▀▀', '█▀▀', '█▄▄'],
};

/**
 * Renders a word in {@link FONT}, or in {@link SMALL} when `small`.
 *
 * @param word Letters present in the font; ∞ is the two O's of LOOP joined.
 * @param small Use the three-row font.
 * @return Lines of block art.
 */
export function bigText(word: string, small = false): string[] {
  const font = small ? SMALL : FONT;
  const rows = small ? [0, 1, 2] : [0, 1, 2, 3, 4];
  return rows.map((r) =>
    [...word].map((ch) => font[ch]![r]!).join(small ? ' ' : '  '),
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
    lines(bigText('IN THE', true).map((l) => row(l, 'muted'))),
    blank,
    lines(bigText('L∞P').map((l) => row(l, 'accent', {bold: true}))),
    blank,
    lines([row('review-tui', 'muted')]),
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
