/**
 * Keeps the logo block at the top of README.md in step with the start page.
 *
 * `bun scripts/readme-logo.ts` rewrites the block; `--check` exits 1 if the
 * README is out of date (the unit tests run the same check).
 */
import {syncLogo} from '../src/readme';

const path = new URL('../README.md', import.meta.url);
const current = await Bun.file(path).text();
const next = syncLogo(current);
if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error(
      'README.md logo is out of date: run bun scripts/readme-logo.ts',
    );
    process.exit(1);
  }
} else if (next !== current) {
  await Bun.write(path, next);
  console.log('README.md logo updated');
}
