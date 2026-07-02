/**
 * Public entry point for the Relay AI layer.
 *
 * Feature code should import from here only:
 *
 *   import { generateText } from "../ai/ai-service.js";
 *   const result = await generateText({
 *     tier: "cheap",
 *     system: "You narrate pre-computed metrics. Never invent numbers.",
 *     messages: [{ role: "user", content: factsJson }]
 *   });
 *   if (!result.ok) {  // skipped or error -> fall back to deterministic copy
 *     ...
 *   }
 */
import { AnthropicAiProvider } from "./anthropic-provider.js";
import {
  resolveAiServiceConfig,
  type AiServiceConfig,
  type ResolvedAiServiceConfig
} from "./config.js";
import { DisabledAiProvider } from "./disabled-provider.js";
import type { AiGenerateTextInput, AiGenerateTextResult, AiProvider } from "./types.js";

export function createAiProvider(overrides: AiServiceConfig = {}): AiProvider {
  const cfg = resolveAiServiceConfig(overrides);
  if (!cfg.enabled) {
    return new DisabledAiProvider();
  }
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicAiProvider(cfg);
    case "disabled":
      return new DisabledAiProvider();
    default:
      return new DisabledAiProvider(`Unknown RELAY_AI_PROVIDER "${cfg.provider}".`);
  }
}

export async function generateText(
  input: AiGenerateTextInput,
  overrides?: AiServiceConfig
): Promise<AiGenerateTextResult> {
  return createAiProvider(overrides).generateText(input);
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
