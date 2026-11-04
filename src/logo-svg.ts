import {PALETTE} from './theme';
import {logoBlocks} from './start';

const CELL_W = 8;
const CELL_H = 16;
const PAD = 8;
const BLANK_ROW = 1;

/**
 * Renders the start-page logo as an SVG in the TUI's colours, for the README
 * (GitHub code blocks cannot be coloured). Block characters are drawn as
 * rectangles so they join up whatever font the viewer has.
 *
 * @return The SVG document, ending in a newline.
 */
export function logoSvg(): string {
  const blocks = logoBlocks();
  const cols = Math.max(...blocks.flatMap((b) => b.lines.map((l) => l.length)));
  const rows =
    blocks.reduce((n, b) => n + b.lines.length, 0) +
    BLANK_ROW * (blocks.length - 1);
  const out: string[] = [];
  let row = 0;
  for (const b of blocks) {
    const color = PALETTE[b.tone];
    const shift = Math.floor(
      (cols - Math.max(...b.lines.map((l) => l.length))) / 2,
    );
    const rects: string[] = [];
    const text: string[] = [];
    for (const line of b.lines) {
      const y = (PAD + row * CELL_H) / 1;
      if (/[█▀▄]/.test(line)) {
        [...line].forEach((ch, i) => {
          const top = ch === '█' || ch === '▀';
          const bottom = ch === '█' || ch === '▄';
          if (!top && !bottom) return;
          const x = PAD + (shift + i) * CELL_W;
          const half = CELL_H / 2;
          const h = top && bottom ? CELL_H : half;
          rects.push(
            `<rect x="${x}" y="${top ? y : y + half}" width="${CELL_W}" height="${h}"/>`,
          );
        });
      } else {
        const x = PAD + (cols * CELL_W) / 2;
        text.push(
          `<text x="${x}" y="${y + CELL_H * 0.75}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="13" ${b.bold ? 'font-weight="bold" ' : ''}xml:space="preserve">${line.replace(/ /g, '&#160;')}</text>`,
        );
      }
      row++;
    }
    row += BLANK_ROW;
    out.push(`<g fill="${color}">${[...rects, ...text].join('')}</g>`);
  }
  const w = cols * CELL_W + PAD * 2;
  const h = rows * CELL_H + PAD * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="In The Loop: review-tui">\n${out.join('\n')}\n</svg>\n`;
}
