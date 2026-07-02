import type {
  AiGenerateTextInput,
  AiGenerateTextResult,
  AiModelTier,
  AiProvider
} from "./types.js";

/**
 * No-op provider used whenever AI is disabled, misconfigured, or the runtime lacks a
 * vendor SDK. Always available; every call returns a `skipped` result so callers fall
 * back to deterministic copy rather than erroring.
 */
export class DisabledAiProvider implements AiProvider {
  readonly name = "disabled";
  private readonly reason: string;

  constructor(reason = "AI is disabled (set RELAY_AI_ENABLED=1 and configure a provider).") {
    this.reason = reason;
  }

  modelForTier(_tier: AiModelTier): string {
    return "none";
  }

  async generateText(_input: AiGenerateTextInput): Promise<AiGenerateTextResult> {
    return { ok: false, skipped: true, reason: this.reason };
  }
}
