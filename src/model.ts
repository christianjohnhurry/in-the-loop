/** An OpenCode model reference, as `provider/model`. */
export interface ModelRef {
  providerID: string;
  modelID: string;
}

/**
 * Parses a `provider/model` string such as `anthropic/claude-sonnet-5-5`.
 * The model part may itself contain slashes (e.g. `openrouter/openai/gpt-5`).
 *
 * @param raw The `$MODEL` value; unset or empty means "use OpenCode's default".
 * @return The model reference, or undefined when `raw` is unset or empty.
 * @throws {Error} if `raw` is not of the form `provider/model`.
 */
export function parseModel(raw: string | undefined): ModelRef | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.trim();
  const i = value.indexOf('/');
  const providerID = value.slice(0, i);
  const modelID = value.slice(i + 1);
  if (i < 0 || !providerID || !modelID || /\s/.test(value)) {
    throw new Error(
      `Invalid MODEL "${value}": expected provider/model, e.g. anthropic/claude-sonnet-5-5`,
    );
  }
  return {providerID, modelID};
}

/**
 * Names the model for the `[$REVIEWER + $MODEL]` prefix. A configured model is
 * the one that was requested, so it always matches what ran; otherwise use the
 * model OpenCode reported in its last response.
 *
 * @param configured The model passed to OpenCode, if any.
 * @param reported The model OpenCode reported running, if any call completed.
 * @return `provider/model`, or `unknown` if no model has run yet.
 */
export function modelLabel(
  configured: ModelRef | undefined,
  reported: ModelRef | undefined,
): string {
  const m = configured ?? reported;
  return m ? `${m.providerID}/${m.modelID}` : 'unknown';
}

/** A model OpenCode can run for the reviewer, with names for display. */
export interface ModelOption extends ModelRef {
  /** The model's display name, e.g. `Claude Sonnet 5.5`. */
  name: string;
}

/** The slice of OpenCode's provider listing that the picker needs. */
export interface ProviderListing {
  providers: {id: string; models: Record<string, {id: string; name: string}>}[];
  /** Provider ID to that provider's default model ID. */
  default: Record<string, string>;
  /** The `model` from OpenCode's config (`provider/model`), if set. */
  configured?: string;
}

/**
 * Formats a model as `provider/model`.
 *
 * @param m The model.
 * @return The string form, as accepted by `$MODEL`.
 */
export function formatModel(m: ModelRef): string {
  return `${m.providerID}/${m.modelID}`;
}

/**
 * Flattens OpenCode's providers into one sorted list of models.
 *
 * @param listing OpenCode's providers (configured and authenticated only).
 * @return Every model, sorted by `provider/model`.
 */
export function listModels(listing: ProviderListing): ModelOption[] {
  return listing.providers
    .flatMap((p) =>
      Object.values(p.models).map((m) => ({
        providerID: p.id,
        modelID: m.id,
        name: m.name,
      })),
    )
    .sort((a, b) => formatModel(a).localeCompare(formatModel(b)));
}

/**
 * Finds OpenCode's own default model: the `model` in its config if that is
 * well formed, else the default of the first listed provider that has one.
 *
 * @param listing OpenCode's providers, defaults and config.
 * @return The default model, or undefined if OpenCode names none.
 */
export function openCodeDefault(
  listing: ProviderListing,
): ModelRef | undefined {
  try {
    const configured = parseModel(listing.configured);
    if (configured) return configured;
  } catch {
    // A malformed config value is OpenCode's problem; fall through.
  }
  for (const p of listing.providers) {
    const modelID = listing.default[p.id];
    if (modelID) return {providerID: p.id, modelID};
  }
  return undefined;
}

/**
 * Picks the model a review starts with. A model chosen in a previous run wins
 * (a resumed review keeps it), then `$MODEL`, then OpenCode's default.
 *
 * @param saved The model stored in state.json, if any.
 * @param env The parsed `$MODEL`, if set.
 * @param fallback OpenCode's default, if it could be listed.
 * @return The model to use, or undefined to leave it to OpenCode.
 */
export function initialModel(
  saved: ModelRef | undefined,
  env: ModelRef | undefined,
  fallback: ModelRef | undefined,
): ModelRef | undefined {
  return saved ?? env ?? fallback;
}

/**
 * Narrows the picker list: every whitespace-separated word of `query` must
 * appear (case-insensitively) in the model's `provider/model` or name.
 *
 * @param options The full list.
 * @param query What the reviewer typed; blank keeps everything.
 * @return The matching models, in their original order.
 */
export function filterModels(
  options: ModelOption[],
  query: string,
): ModelOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((o) => {
    const hay = `${formatModel(o)} ${o.name}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Chooses which slice of a long list to show so the cursor stays in view.
 *
 * @param total Number of items.
 * @param cursor Index of the highlighted item.
 * @param size How many rows fit.
 * @return The index of the first row to show.
 */
export function windowStart(
  total: number,
  cursor: number,
  size: number,
): number {
  if (total <= size) return 0;
  const start = cursor - Math.floor(size / 2);
  return Math.max(0, Math.min(start, total - size));
}
