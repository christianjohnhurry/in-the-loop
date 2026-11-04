import type {TextChunk} from '@opentui/core';
import {lines, span, styled, type Tone} from './theme';
import type {PrInfo} from './types';
import type {StyledText} from '@opentui/core';

/** Compact one-line logo kept in the top-right corner of every page. */
export const CORNER_LOGO = '✻ In The Loop';

/**
 * Builds the start page: logo, subtitle, the PR's repo and head branch, and
 * the Enter prompt.
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
  const art: TextChunk[][] = [
    row('        ✻', 'accent', {bold: true}),
    row('     ╲  │  ╱', 'accent'),
    row('   ── ✻ ● ✻ ──', 'accent'),
    row('     ╱  │  ╲', 'accent'),
    row('        ✻', 'accent', {bold: true}),
  ];
  return lines([
    ...art,
    [],
    row('  I n   T h e   L o o p', 'accent', {bold: true}),
    row('        review-tui', 'muted'),
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
