import {expect, test} from 'bun:test';
import {missingTools} from '../src/preflight';

const found =
  (names: string[]) =>
  (n: string): string | null =>
    names.includes(n) ? `/usr/bin/${n}` : null;

test('nothing is reported when gh and opencode are found', () => {
  expect(missingTools({}, found(['gh', 'opencode']))).toEqual([]);
});

test('each missing program gets its own message with an install hint', () => {
  const both = missingTools({}, found([]));
  expect(both).toHaveLength(2);
  expect(both[0]).toContain('`gh`');
  expect(both[0]).toContain('gh auth login');
  expect(both[1]).toContain('`opencode`');
  expect(both[1]).toContain('opencode.ai');
  expect(missingTools({}, found(['gh']))).toHaveLength(1);
  expect(missingTools({}, found(['opencode']))[0]).toContain('`gh`');
});

test('opencode is not required when OPENCODE_URL is set', () => {
  const env = {OPENCODE_URL: 'http://localhost:4096'};
  expect(missingTools(env, found(['gh']))).toEqual([]);
  expect(missingTools(env, found([]))).toHaveLength(1);
});
