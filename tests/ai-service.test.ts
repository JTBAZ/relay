import { describe, expect, it } from "vitest";
import { createAiProvider, generateText } from "../src/ai/ai-service.js";
import { resolveAiServiceConfig } from "../src/ai/config.js";

describe("ai-service", () => {
  it("is disabled by default and returns a graceful skipped result", async () => {
    const res = await generateText(
      { messages: [{ role: "user", content: "hello" }] },
      { enabled: false }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.skipped).toBe(true);
    }
  });

  it("resolves sane config defaults when enabled", () => {
    const cfg = resolveAiServiceConfig({ enabled: true });
    expect(cfg.enabled).toBe(true);
    expect(cfg.provider.length).toBeGreaterThan(0);
    expect(cfg.cheapModel.length).toBeGreaterThan(0);
    expect(cfg.flagshipModel.length).toBeGreaterThan(0);
    expect(cfg.maxOutputTokens).toBeGreaterThan(0);
  });

  it("routes the two tiers to distinct models", () => {
    const provider = createAiProvider({
      enabled: true,
      provider: "anthropic",
      cheapModel: "cheap-x",
      flagshipModel: "flagship-y"
    });
    expect(provider.modelForTier("cheap")).toBe("cheap-x");
    expect(provider.modelForTier("flagship")).toBe("flagship-y");
  });

  it("skips (does not throw) when enabled but no API key is configured", async () => {
    const prevRelay = process.env.RELAY_AI_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.RELAY_AI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await generateText(
        { messages: [{ role: "user", content: "hello" }] },
        { enabled: true, provider: "anthropic", apiKey: "" }
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.skipped).toBe(true);
      }
    } finally {
      if (prevRelay !== undefined) process.env.RELAY_AI_API_KEY = prevRelay;
      if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    }
  });

  it("falls back to a disabled provider for an unknown provider name", async () => {
    const provider = createAiProvider({ enabled: true, provider: "made-up" });
    expect(provider.name).toBe("disabled");
    const res = await provider.generateText({ messages: [{ role: "user", content: "x" }] });
    expect(res.ok).toBe(false);
  });
});
