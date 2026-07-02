/**
 * Relay AI model-abstraction layer — provider-agnostic text generation.
 *
 * This is the single seam between Relay feature code and any LLM provider. Feature
 * modules (Autopost draft, gap/trend narration, translation) depend ONLY on these
 * types, never on a vendor SDK, so the provider can be swapped (or self-hosted later)
 * by touching one folder.
 *
 * GUARDRAIL: callers MUST pass already-computed facts/numbers in the prompt. The model
 * narrates, drafts, or translates — it never calculates metrics. Deterministic analysis
 * stays in SQL; this layer is the last mile only. See docs/AUTOPOST_BUILD_PLAN.md.
 */

/** Routing hint. "cheap" for narration/drafts/translation; "flagship" reserved for Tier 2 (Datachat). */
export type AiModelTier = "cheap" | "flagship";

export type AiPromptRole = "system" | "user" | "assistant";

export type AiPromptMessage = {
  role: AiPromptRole;
  content: string;
};

export type AiUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export type AiGenerateTextInput = {
  /** Routing hint. Defaults to "cheap". */
  tier?: AiModelTier;
  /** System instruction. Optional; merged with any `system`-role messages. */
  system?: string;
  /** Conversation messages; at least one must have role "user". */
  messages: AiPromptMessage[];
  /** Hard cap on output tokens for this call. */
  maxOutputTokens?: number;
  /** 0..1 — lower is more deterministic. Provider default when omitted. */
  temperature?: number;
  /** Free-form labels for tracing/metering. Never put secrets here. */
  metadata?: Record<string, string>;
};

/**
 * Result is a discriminated union mirroring the repo's telemetry-writer pattern:
 * - `ok: true`          — generation succeeded.
 * - `skipped: true`     — AI intentionally unavailable (disabled, no key, SDK absent).
 *                         Callers should fall back to deterministic copy, not error.
 * - `skipped: false`    — a real provider/validation error worth surfacing/logging.
 */
export type AiGenerateTextResult =
  | {
      ok: true;
      text: string;
      provider: string;
      model: string;
      tier: AiModelTier;
      usage?: AiUsage;
    }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export interface AiProvider {
  readonly name: string;
  /** Resolve the concrete model id used for a given tier. */
  modelForTier(tier: AiModelTier): string;
  generateText(input: AiGenerateTextInput): Promise<AiGenerateTextResult>;
}
