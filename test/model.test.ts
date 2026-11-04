import {expect, test} from 'bun:test';
import {modelLabel, parseModel} from '../src/model';

test('parseModel splits provider/model', () => {
  expect(parseModel('anthropic/claude-sonnet-5-5')).toEqual({
    providerID: 'anthropic',
    modelID: 'claude-sonnet-5-5',
  });
});

test('parseModel keeps slashes in the model part', () => {
  expect(parseModel('openrouter/openai/gpt-5')).toEqual({
    providerID: 'openrouter',
    modelID: 'openai/gpt-5',
  });
});

test('parseModel treats unset or blank as the OpenCode default', () => {
  expect(parseModel(undefined)).toBeUndefined();
  expect(parseModel('')).toBeUndefined();
  expect(parseModel('   ')).toBeUndefined();
});

test.each(['sonnet', '/model', 'provider/', 'a b/c', 'a/b c'])(
  'parseModel rejects malformed %p with a clear error',
  (raw) => {
    expect(() => parseModel(raw)).toThrow(/expected provider\/model/);
  },
);

test('modelLabel prefers the configured model', () => {
  const configured = {providerID: 'anthropic', modelID: 'a'};
  const reported = {providerID: 'openai', modelID: 'b'};
  expect(modelLabel(configured, reported)).toBe('anthropic/a');
});

test('modelLabel falls back to the model OpenCode reported', () => {
  expect(modelLabel(undefined, {providerID: 'openai', modelID: 'b'})).toBe(
    'openai/b',
  );
});

test('modelLabel never claims a model when none has run', () => {
  expect(modelLabel(undefined, undefined)).toBe('unknown');
});
