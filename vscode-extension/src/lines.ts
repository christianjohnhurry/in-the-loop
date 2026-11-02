import type {Selection} from './protocol';

/** A zero-based position, as VS Code reports it. */
export interface Pos {
  line: number;
  character: number;
}

/**
 * Converts a VS Code range to a 1-based inclusive line range. A selection
 * that ends at column 0 of a later line (what selecting whole lines gives)
 * does not include that last line.
 *
 * @param start Range start.
 * @param end Range end.
 * @param text The selected text.
 * @return The selection, or null if the range is empty.
 */
export function toSelection(
  start: Pos,
  end: Pos,
  text: string,
): Selection | null {
  if (start.line === end.line && start.character === end.character) {
    return null;
  }
  const lastLine =
    end.character === 0 && end.line > start.line ? end.line - 1 : end.line;
  return {startLine: start.line + 1, endLine: lastLine + 1, text};
}
