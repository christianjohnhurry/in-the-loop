/**
 * Regenerates docs/logo.svg, the README's logo, from the start page.
 *
 * `bun scripts/logo.ts` writes the file; `--check` exits 1 if it is out of
 * date (the unit tests run the same check).
 */
import {logoSvg} from '../src/logo-svg';

const path = new URL('../docs/logo.svg', import.meta.url);
const next = logoSvg();
const current = (await Bun.file(path).exists())
  ? await Bun.file(path).text()
  : '';
if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('docs/logo.svg is out of date: run bun scripts/logo.ts');
    process.exit(1);
  }
} else if (next !== current) {
  await Bun.write(path, next);
  console.log('docs/logo.svg updated');
}
