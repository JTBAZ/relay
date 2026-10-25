import { describe, expect, it, vi } from "vitest";
const respond = vi.hoisted(() => vi.fn());
const fromEnv = vi.hoisted(() => vi.fn(() => ({ respond })));
vi.mock("../src/gallery-editor/provider.js", () => ({ responsesProviderFromEnv: fromEnv }));
import { OpenAiProvider } from "../src/ai/openai-provider.js";
describe("OpenAI draft provider", () => {
  it("uses the priced editor provider, respects the token cap, and exposes only model text", async () => {
    respond.mockResolvedValueOnce({ output: [{ type: "message", content: [{ type: "output_text", text: '{"title":"Study","body_text":"New copy"}' }] }], usage: { inputTokens: 10, outputTokens: 20 } });
    const result = await new OpenAiProvider().generateText({ messages: [{ role: "user", content: "Prepare copy" }], maxOutputTokens: 800 });
    expect(fromEnv.mock.calls.at(-1)?.at(-1)).toBe(800);
    expect(respond.mock.calls.at(-1)?.[0]).toMatchObject({ tools: [], responseSchema: null });
    expect(result).toMatchObject({ ok: true, provider: "openai", text: '{"title":"Study","body_text":"New copy"}', usage: { input_tokens: 10, output_tokens: 20 } });
    respond.mockRejectedValueOnce(new Error("Budget exhausted"));
    expect(await new OpenAiProvider().generateText({ messages: [{ role: "user", content: "Again" }] })).toMatchObject({ ok: false, skipped: false, error: "Budget exhausted" });
  });
});
