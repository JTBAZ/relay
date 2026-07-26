import type { ResolvedAiServiceConfig } from "./config.js";
import type {
  AiGenerateTextInput,
  AiGenerateTextResult,
  AiModelTier,
  AiProvider
} from "./types.js";

/**
 * Anthropic-backed text provider.
 *
 * The SDK is loaded with a lazy dynamic import so this module is import-safe even when
 * `@anthropic-ai/sdk` is absent at runtime (it is currently a devDependency). If the SDK
 * or API key is missing, calls return a graceful `skipped` result.
 *
 * BEFORE ENABLING IN PRODUCTION: promote `@anthropic-ai/sdk` to a runtime dependency.
 * See docs/AUTOPOST_BUILD_PLAN.md (WI-1).
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";
  private readonly cfg: ResolvedAiServiceConfig;

  constructor(cfg: ResolvedAiServiceConfig) {
    this.cfg = cfg;
  }

  modelForTier(tier: AiModelTier): string {
    return tier === "flagship" ? this.cfg.flagshipModel : this.cfg.cheapModel;
  }

  async generateText(input: AiGenerateTextInput): Promise<AiGenerateTextResult> {
    if (!this.cfg.apiKey) {
      return {
        ok: false,
        skipped: true,
        reason: "Missing Anthropic API key (RELAY_AI_API_KEY / ANTHROPIC_API_KEY)."
      };
    }

    const userMessages = input.messages.filter((m) => m.role !== "system");
    if (!userMessages.some((m) => m.role === "user")) {
      return { ok: false, skipped: false, error: "At least one user message is required." };
    }

    // Lazy import keeps this file safe to import without the SDK installed.
    let AnthropicCtor: new (opts: { apiKey: string }) => unknown;
    try {
      const mod: { default: new (opts: { apiKey: string }) => unknown } = await import(
        "@anthropic-ai/sdk"
      );
      AnthropicCtor = mod.default;
    } catch {
      return {
        ok: false,
        skipped: true,
        reason: "@anthropic-ai/sdk is not installed in this runtime."
      };
    }

    const tier = input.tier ?? "cheap";
    const model = this.modelForTier(tier);

    try {
      // Typed loosely on purpose: avoid coupling to a specific SDK version's shapes.
      const client = new AnthropicCtor({ apiKey: this.cfg.apiKey }) as {
        messages: {
          create: (args: Record<string, unknown>) => Promise<{
            content?: Array<{ type?: string; text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          }>;
        };
      };

      const systemParts = [
        ...(input.system ? [input.system] : []),
        ...input.messages.filter((m) => m.role === "system").map((m) => m.content)
      ];
      const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

      const resp = await client.messages.create({
        model,
        max_tokens: input.maxOutputTokens ?? this.cfg.maxOutputTokens,
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
        ...(system ? { system } : {}),
        messages: userMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content
        }))
      });

      const text = (resp.content ?? [])
        .map((block) => (block && block.type === "text" ? (block.text ?? "") : ""))
        .join("")
        .trim();

      return {
        ok: true,
        text,
        provider: this.name,
        model,
        tier,
        usage: {
          input_tokens: resp.usage?.input_tokens,
          output_tokens: resp.usage?.output_tokens
        }
      };
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
