import type {StyledText, TextChunk} from '@opentui/core';
import {lines, span, styled, type Tone} from './theme';
import type {PrInfo} from './types';

/** Compact one-line logo kept in the top-right corner of every page. */
export const CORNER_LOGO = '✻ In The Loop';

/** Block letters for the start page logo, five rows each. */
const FONT: Record<string, string[]> = {
  ' ': ['   ', '   ', '   ', '   ', '   '],
  I: ['███', ' █ ', ' █ ', ' █ ', '███'],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  E: ['████', '█   ', '███ ', '█   ', '████'],
  L: ['█   ', '█   ', '█   ', '█   ', '████'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  P: ['████ ', '█   █', '████ ', '█    ', '█    '],
};

/**
 * Renders a word in {@link FONT}.
 *
 * @param word Upper-case letters present in the font.
 * @return Five lines of block art.
 */
export function bigText(word: string): string[] {
  return [0, 1, 2, 3, 4].map((r) =>
    [...word].map((ch) => FONT[ch]![r]!).join('  '),
  );
}

/**
 * Builds the start page: block-letter logo, subtitle, the PR's repo and head
 * branch, and the Enter prompt.
 *
 * @param pr The PR the TUI was loaded with.
 * @return Content for a `TextRenderable`.
 */
export function startPage(pr: PrInfo): StyledText {
  const row = (
    text: string,
    tone?: Tone,
    o?: {bold?: boolean},
  ): TextChunk[] => [span(text, tone, o)];
  return lines([
    ...bigText('IN THE').map((l) => row(l, 'muted')),
    [],
    ...bigText('LOOP').map((l) => row(l, 'accent', {bold: true})),
    [],
    row('review-tui', 'muted'),
    [],
    [span('repo: ', 'muted'), span(`${pr.owner}/${pr.repo}`)],
    [span('branch: ', 'muted'), span(pr.headRefName || '-')],
    [],
    row('Press Enter to start', 'accent', {bold: true}),
  ]);
}

/** The corner logo as styled text. */
export function cornerLogo(): StyledText {
  return styled(span(CORNER_LOGO, 'accent', {bold: true}));
}
