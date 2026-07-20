import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiProvider, generateText } from "../src/ai/ai-service.js";
import { resolveAiServiceConfig } from "../src/ai/config.js";
import { registerUsageMeteringPrisma } from "../src/usage/usage-events.js";

describe("ai-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    registerUsageMeteringPrisma(() => null);
  });

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

  it("mock provider returns ok JSON for posting_assistant without an API key", async () => {
    const res = await generateText(
      {
        messages: [
          {
            role: "user",
            content: JSON.stringify({ destinations: ["patreon", "x"], goals: [] })
          }
        ],
        metadata: { feature: "posting_assistant" }
      },
      { enabled: true, provider: "mock" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.provider).toBe("mock");
    expect(res.usage?.input_tokens).toBeGreaterThan(0);
    const parsed = JSON.parse(res.text) as {
      rationale: Record<string, string>;
      timing_note: string | null;
    };
    expect(parsed.rationale.patreon).toMatch(/Mock Coach/);
    expect(parsed.rationale.x).toMatch(/Mock Coach/);
    expect(parsed.timing_note).toBeTruthy();
  });

  it("mock provider returns variants when want_rewrite is true", async () => {
    const res = await generateText(
      {
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              destinations: ["patreon", "x"],
              want_rewrite: true,
              current_variants: [
                { destination: "patreon", title: "Art", body_text: "Full piece" },
                { destination: "x", title: null, body_text: "Teaser" }
              ]
            })
          }
        ],
        metadata: { feature: "posting_assistant" }
      },
      { enabled: true, provider: "mock" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const parsed = JSON.parse(res.text) as {
      variants: Record<string, { title: string | null; body_text: string }>;
    };
    expect(parsed.variants.patreon.body_text).toMatch(/Mock Coach/);
    expect(parsed.variants.x.title).toBeNull();
    expect(parsed.variants.x.body_text).toMatch(/Mock Coach/);
  });

  it("mock provider returns propose variants for posting_assistant_propose", async () => {
    const res = await generateText(
      {
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              destinations: ["x", "patreon"],
              formula_candidates:
                "1. id=hook_proof_cta | Hook\n2. id=format_first_line | Format",
              current_variants: [
                { destination: "x", title: null, body_text: "Teaser" },
                { destination: "patreon", title: "Art", body_text: "Full piece" }
              ]
            })
          }
        ],
        metadata: { feature: "posting_assistant_propose" }
      },
      { enabled: true, provider: "mock" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const parsed = JSON.parse(res.text) as {
      by_destination: Record<
        string,
        { variants: Array<{ formula_id: string; recommended: boolean }> }
      >;
    };
    expect(parsed.by_destination.x.variants.length).toBeGreaterThanOrEqual(2);
    expect(parsed.by_destination.x.variants.filter((v) => v.recommended)).toHaveLength(1);
    expect(parsed.by_destination.x.variants[0]?.formula_id).toBe("hook_proof_cta");
  });

  it("mock provider returns ok JSON for autopost_draft", async () => {
    const res = await generateText(
      {
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              title_hint: "Study",
              discord_captions: ["line one"]
            })
          }
        ],
        metadata: { feature: "autopost_draft" }
      },
      { enabled: true, provider: "mock" }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const parsed = JSON.parse(res.text) as { title: string; body_text: string };
    expect(parsed.title).toBe("Study");
    expect(parsed.body_text).toBe("line one");
  });

  it("ok result emits ai.tokens.input and ai.tokens.output usage events", async () => {
    const usageMod = await import("../src/usage/usage-events.js");
    const spy = vi.spyOn(usageMod, "scheduleUsageEvent");
    registerUsageMeteringPrisma(() => ({}) as never);

    const res = await generateText(
      {
        messages: [{ role: "user", content: "meter me" }],
        metadata: { feature: "autopost_draft", creatorId: "cr_meter" },
        tier: "cheap"
      },
      { enabled: true, provider: "mock" }
    );
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        relayCreatorId: "cr_meter",
        metric: "ai.tokens.input",
        quantity: expect.any(Number),
        meta: expect.objectContaining({ feature: "autopost_draft", model_tier: "cheap" })
      })
    );
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        relayCreatorId: "cr_meter",
        metric: "ai.tokens.output"
      })
    );
  });

  it("skipped result emits no usage events", async () => {
    const usageMod = await import("../src/usage/usage-events.js");
    const spy = vi.spyOn(usageMod, "scheduleUsageEvent");
    registerUsageMeteringPrisma(() => ({}) as never);

    const res = await generateText(
      { messages: [{ role: "user", content: "skip" }], metadata: { feature: "autopost_draft" } },
      { enabled: false }
    );
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
