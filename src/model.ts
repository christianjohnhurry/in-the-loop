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
