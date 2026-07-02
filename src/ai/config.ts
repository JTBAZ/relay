/**
 * Configuration resolution for the Relay AI layer.
 *
 * Mirrors the repo convention (cf. platform-revenue-telemetry-service): explicit
 * overrides win, otherwise read env, otherwise safe defaults. AI is OFF by default —
 * features must degrade gracefully to deterministic copy when unset.
 */

export type AiServiceConfig = {
  /** Master switch. Defaults to RELAY_AI_ENABLED. */
  enabled?: boolean;
  /** "anthropic" (default) | "disabled". From RELAY_AI_PROVIDER. */
  provider?: string;
  /** Provider API key. Falls back to RELAY_AI_API_KEY then ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model id for the "cheap" tier. From RELAY_AI_MODEL_CHEAP. */
  cheapModel?: string;
  /** Model id for the "flagship" tier. From RELAY_AI_MODEL_FLAGSHIP. */
  flagshipModel?: string;
  /** Default output token cap. From RELAY_AI_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
};

export type ResolvedAiServiceConfig = {
  enabled: boolean;
  provider: string;
  apiKey: string | null;
  cheapModel: string;
  flagshipModel: string;
  maxOutputTokens: number;
};

const DEFAULT_CHEAP_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_FLAGSHIP_MODEL = "claude-3-5-sonnet-latest";
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_PROVIDER = "anthropic";

function envTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export function resolveAiServiceConfig(overrides: AiServiceConfig = {}): ResolvedAiServiceConfig {
  const enabled =
    typeof overrides.enabled === "boolean"
      ? overrides.enabled
      : envTruthy(process.env.RELAY_AI_ENABLED);

  const provider = (
    firstNonEmpty(overrides.provider, process.env.RELAY_AI_PROVIDER) ?? DEFAULT_PROVIDER
  ).toLowerCase();

  const apiKey = firstNonEmpty(
    overrides.apiKey,
    process.env.RELAY_AI_API_KEY,
    process.env.ANTHROPIC_API_KEY
  );

  const cheapModel =
    firstNonEmpty(overrides.cheapModel, process.env.RELAY_AI_MODEL_CHEAP) ?? DEFAULT_CHEAP_MODEL;

  const flagshipModel =
    firstNonEmpty(overrides.flagshipModel, process.env.RELAY_AI_MODEL_FLAGSHIP) ??
    DEFAULT_FLAGSHIP_MODEL;

  const maxFromEnv = Number.parseInt(process.env.RELAY_AI_MAX_OUTPUT_TOKENS ?? "", 10);
  const maxOutputTokens =
    overrides.maxOutputTokens != null && overrides.maxOutputTokens > 0
      ? overrides.maxOutputTokens
      : Number.isFinite(maxFromEnv) && maxFromEnv > 0
        ? maxFromEnv
        : DEFAULT_MAX_OUTPUT_TOKENS;

  return { enabled, provider, apiKey, cheapModel, flagshipModel, maxOutputTokens };
}
