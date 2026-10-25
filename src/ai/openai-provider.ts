import { join } from "node:path";
import { FileProviderBudget } from "../gallery-editor/budget.js";
import { responsesProviderFromEnv } from "../gallery-editor/provider.js";
import type { AiGenerateTextInput, AiGenerateTextResult, AiModelTier, AiProvider } from "./types.js";

/** Shares the editor's explicitly priced model and durable budget. Opt in with RELAY_AI_PROVIDER=openai. */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  modelForTier(_tier: AiModelTier): string { return process.env.LIBRARY_EDITOR_MODEL?.trim() || "gpt-6-astra"; }
  async generateText(input: AiGenerateTextInput): Promise<AiGenerateTextResult> {
    const budget = new FileProviderBudget(join(process.env.RELAY_GALLERY_EDITOR_DATA_DIR ?? ".relay-data", "gallery-editor-budget.json"));
    try {
      const result = await responsesProviderFromEnv(budget, process.env, undefined, input.maxOutputTokens).respond({
        input: [...(input.system ? [{ role: "system", content: input.system }] : []), ...input.messages],
        tools: [], signal: AbortSignal.timeout(90_000), responseSchema: null
      });
      const text = result.output.flatMap((item) => Array.isArray(item.content) ? item.content : []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("").trim();
      if (!text) return { ok: false, skipped: false, error: "The model returned no draft. Your saved copy is unchanged." };
      return { ok: true, text, provider: this.name, model: this.modelForTier(input.tier ?? "cheap"), tier: input.tier ?? "cheap", usage: { input_tokens: result.usage?.inputTokens, output_tokens: result.usage?.outputTokens } };
    } catch (error) {
      return { ok: false, skipped: false, error: error instanceof Error ? error.message : "Draft generation failed. Try again." };
    }
  }
}
