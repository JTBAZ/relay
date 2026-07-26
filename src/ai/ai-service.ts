/**
 * Public entry point for the Relay AI layer.
 *
 * Feature code should import from here only:
 *
 *   import { generateText } from "../ai/ai-service.js";
 *   const result = await generateText({
 *     tier: "cheap",
 *     system: "You narrate pre-computed metrics. Never invent numbers.",
 *     messages: [{ role: "user", content: factsJson }],
 *     metadata: { feature: "posting_assistant", creatorId: "…" }
 *   });
 *   if (!result.ok) {  // skipped or error -> fall back to deterministic copy
 *     ...
 *   }
 *
 * Providers (RELAY_AI_PROVIDER): anthropic | mock | disabled.
 * Local POC without a key: RELAY_AI_ENABLED=1 and RELAY_AI_PROVIDER=mock.
 *
 * METERING (WI-12 / MB-3): after a successful provider call, emit usage_events
 * from token counts on the result + metadata.feature / creatorId.
 * Keep that logic in this facade — never in feature modules or vendor SDKs.
 */
import { scheduleUsageEvent, getRegisteredUsagePrisma } from "../usage/usage-events.js";
import { AnthropicAiProvider } from "./anthropic-provider.js";
import {
  resolveAiServiceConfig,
  type AiServiceConfig,
  type ResolvedAiServiceConfig
} from "./config.js";
import { DisabledAiProvider } from "./disabled-provider.js";
import { MockAiProvider } from "./mock-provider.js";
import type { AiGenerateTextInput, AiGenerateTextResult, AiProvider } from "./types.js";

export function createAiProvider(overrides: AiServiceConfig = {}): AiProvider {
  const cfg = resolveAiServiceConfig(overrides);
  if (!cfg.enabled) {
    return new DisabledAiProvider();
  }
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicAiProvider(cfg);
    case "mock":
      return new MockAiProvider();
    case "disabled":
      return new DisabledAiProvider();
    default:
      return new DisabledAiProvider(`Unknown RELAY_AI_PROVIDER "${cfg.provider}".`);
  }
}

function emitAiTokenUsage(input: AiGenerateTextInput, result: Extract<AiGenerateTextResult, { ok: true }>): void {
  const prisma = getRegisteredUsagePrisma();
  if (!prisma) return;
  const feature = input.metadata?.feature ?? "unknown";
  const creatorId = input.metadata?.creatorId?.trim() || null;
  const tier = result.tier ?? input.tier ?? "cheap";
  const inputTokens = result.usage?.input_tokens ?? 0;
  const outputTokens = result.usage?.output_tokens ?? 0;
  const meta = { feature, model_tier: tier, model: result.model, provider: result.provider };
  scheduleUsageEvent(prisma, {
    relayCreatorId: creatorId,
    metric: "ai.tokens.input",
    quantity: inputTokens,
    meta
  });
  scheduleUsageEvent(prisma, {
    relayCreatorId: creatorId,
    metric: "ai.tokens.output",
    quantity: outputTokens,
    meta
  });
}

export async function generateText(
  input: AiGenerateTextInput,
  overrides?: AiServiceConfig
): Promise<AiGenerateTextResult> {
  const result = await createAiProvider(overrides).generateText(input);
  if (result.ok) {
    emitAiTokenUsage(input, result);
  }
  return result;
}

export { resolveAiServiceConfig };
export type { AiServiceConfig, ResolvedAiServiceConfig };
export type {
  AiGenerateTextInput,
  AiGenerateTextResult,
  AiModelTier,
  AiPromptMessage,
  AiProvider,
  AiUsage
} from "./types.js";
