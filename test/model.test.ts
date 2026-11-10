import {expect, test} from 'bun:test';
import {
  filterModels,
  formatModel,
  initialModel,
  listModels,
  modelLabel,
  openCodeDefault,
  parseModel,
  windowStart,
  type ProviderListing,
} from '../src/model';

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

const listing: ProviderListing = {
  providers: [
    {
      id: 'openai',
      models: {'gpt-5': {id: 'gpt-5', name: 'GPT-5'}},
    },
    {
      id: 'anthropic',
      models: {
        'claude-sonnet-5-5': {
          id: 'claude-sonnet-5-5',
          name: 'Claude Sonnet 5.5',
        },
        'claude-haiku-5-5': {id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5'},
      },
    },
  ],
  default: {openai: 'gpt-5', anthropic: 'claude-sonnet-5-5'},
};

test('listModels includes every model of every provider, sorted', () => {
  expect(listModels(listing).map(formatModel)).toEqual([
    'anthropic/claude-haiku-5-5',
    'anthropic/claude-sonnet-5-5',
    'openai/gpt-5',
  ]);
});

test('listModels is empty when no provider is available', () => {
  expect(listModels({providers: [], default: {}})).toEqual([]);
});

test('openCodeDefault prefers the configured model', () => {
  expect(
    openCodeDefault({...listing, configured: 'anthropic/claude-haiku-5-5'}),
  ).toEqual({providerID: 'anthropic', modelID: 'claude-haiku-5-5'});
});

test('openCodeDefault falls back to the first provider default', () => {
  expect(openCodeDefault(listing)).toEqual({
    providerID: 'openai',
    modelID: 'gpt-5',
  });
});

test('openCodeDefault ignores a malformed configured model', () => {
  expect(openCodeDefault({...listing, configured: 'nonsense'})).toEqual({
    providerID: 'openai',
    modelID: 'gpt-5',
  });
});

test('openCodeDefault is undefined when OpenCode names none', () => {
  expect(openCodeDefault({providers: [], default: {}})).toBeUndefined();
});

const saved = {providerID: 'a', modelID: 'saved'};
const env = {providerID: 'b', modelID: 'env'};
const dflt = {providerID: 'c', modelID: 'default'};

test('initialModel: a saved choice beats $MODEL and the default', () => {
  expect(initialModel(saved, env, dflt)).toBe(saved);
});

test('initialModel: $MODEL pre-selects when nothing is saved', () => {
  expect(initialModel(undefined, env, dflt)).toBe(env);
});

test('initialModel: OpenCode default with no saved model or $MODEL', () => {
  expect(initialModel(undefined, undefined, dflt)).toBe(dflt);
  expect(initialModel(undefined, undefined, undefined)).toBeUndefined();
});

test('filterModels matches every word against id or name, ignoring case', () => {
  const all = listModels(listing);
  expect(filterModels(all, '').length).toBe(3);
  expect(filterModels(all, 'ANTHROPIC haiku').map(formatModel)).toEqual([
    'anthropic/claude-haiku-5-5',
  ]);
  expect(filterModels(all, 'gpt-5').map(formatModel)).toEqual(['openai/gpt-5']);
  expect(filterModels(all, 'sonnet 5.5').length).toBe(1);
  expect(filterModels(all, 'nope')).toEqual([]);
});

test('windowStart keeps the cursor in view and stays in range', () => {
  expect(windowStart(5, 4, 10)).toBe(0);
  expect(windowStart(100, 0, 10)).toBe(0);
  expect(windowStart(100, 50, 10)).toBe(45);
  expect(windowStart(100, 99, 10)).toBe(90);
});
