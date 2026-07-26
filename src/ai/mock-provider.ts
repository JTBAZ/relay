import type {
  AiGenerateTextInput,
  AiGenerateTextResult,
  AiModelTier,
  AiProvider
} from "./types.js";

/**
 * Deterministic local provider for POC / UI development without an API key.
 *
 * Enable with:
 *   RELAY_AI_ENABLED=1
 *   RELAY_AI_PROVIDER=mock
 *
 * Returns parseable JSON shaped for known `metadata.feature` values so Autopost
 * draft + Posting Assistant paths exercise the real call sites. Fake `usage`
 * is included so a future metering wrapper can be tested without Anthropic.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  modelForTier(tier: AiModelTier): string {
    return tier === "flagship" ? "mock-flagship" : "mock-cheap";
  }

  async generateText(input: AiGenerateTextInput): Promise<AiGenerateTextResult> {
    const tier = input.tier ?? "cheap";
    const feature = input.metadata?.feature ?? "unknown";
    const text = buildMockText(feature, input);
    const approxIn = Math.max(8, Math.ceil(JSON.stringify(input.messages).length / 4));
    const approxOut = Math.max(8, Math.ceil(text.length / 4));

    return {
      ok: true,
      text,
      provider: this.name,
      model: this.modelForTier(tier),
      tier,
      usage: {
        input_tokens: approxIn,
        output_tokens: approxOut
      }
    };
  }
}

function lastUserContent(input: AiGenerateTextInput): string {
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const msg = input.messages[i];
    if (msg?.role === "user" && typeof msg.content === "string") return msg.content;
  }
  return "";
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildMockText(feature: string, input: AiGenerateTextInput): string {
  const user = tryParseJson(lastUserContent(input));

  if (feature === "posting_assistant_propose") {
    const destinations = Array.isArray(user?.destinations)
      ? (user.destinations as unknown[]).filter((d): d is string => typeof d === "string")
      : ["patreon", "x"];
    const currentVariants = Array.isArray(user?.current_variants)
      ? (user.current_variants as Array<Record<string, unknown>>)
      : [];
    const formulaBlock = typeof user?.formula_candidates === "string" ? user.formula_candidates : "";
    const formulaIds = [...formulaBlock.matchAll(/id=([a-z0-9_]+)/g)].map((m) => m[1]!);
    const ids =
      formulaIds.length > 0
        ? formulaIds.slice(0, 3)
        : ["hook_proof_cta", "format_first_line", "question_hook"];

    const by_destination: Record<
      string,
      {
        variants: Array<{
          formula_id: string;
          recommended: boolean;
          label: string;
          fit_reason: string;
          title: string | null;
          body_text: string;
        }>;
      }
    > = {};

    for (const dest of destinations) {
      const current = currentVariants.find((row) => row.destination === dest);
      const baseBody =
        typeof current?.body_text === "string" && current.body_text.trim()
          ? current.body_text.trim()
          : "New work — full piece inside.";
      const baseTitle =
        typeof current?.title === "string" && current.title.trim()
          ? current.title.trim()
          : null;
      const textOnly = dest === "x" || dest === "bluesky";
      by_destination[dest] = {
        variants: ids.map((formulaId, index) => ({
          formula_id: formulaId,
          recommended: index === 0,
          label: formulaId.replace(/_/g, " "),
          fit_reason: `Mock propose: ${formulaId} for ${dest} from Relay findings.`,
          title: textOnly ? null : baseTitle ? `${baseTitle} (${formulaId})` : "Mock title",
          body_text: textOnly
            ? `${baseBody.slice(0, 200)}${baseBody.length > 200 ? "…" : ""}\n\n— ${formulaId}`
            : `${baseBody}\n\n— Mock Coach · ${formulaId}`
        }))
      };
    }

    return JSON.stringify({ by_destination });
  }

  if (feature === "posting_assistant") {
    const destinations = Array.isArray(user?.destinations)
      ? (user.destinations as unknown[]).filter((d): d is string => typeof d === "string")
      : ["patreon", "x"];
    const wantRewrite = user?.want_rewrite === true;
    const currentVariants = Array.isArray(user?.current_variants)
      ? (user.current_variants as Array<Record<string, unknown>>)
      : [];

    const rationale: Record<string, string> = {};
    const variants: Record<string, { title: string | null; body_text: string }> = {};

    for (const dest of destinations) {
      rationale[dest] =
        `Mock Coach: tailor this piece for ${dest} — keep the hook short and lead with the art.`;
      if (wantRewrite) {
        const current = currentVariants.find((row) => row.destination === dest);
        const baseBody =
          typeof current?.body_text === "string" && current.body_text.trim()
            ? current.body_text.trim()
            : "New work — full piece inside.";
        const baseTitle =
          typeof current?.title === "string" && current.title.trim()
            ? current.title.trim()
            : null;
        const textOnly = dest === "x" || dest === "bluesky";
        variants[dest] = {
          title: textOnly ? null : baseTitle ? `${baseTitle} (Coach)` : "Mock Coach title",
          body_text: textOnly
            ? `${baseBody.slice(0, 240)}${baseBody.length > 240 ? "…" : ""}\n\n— Mock Coach`
            : `${baseBody}\n\n— Tuned by Mock Coach`
        };
      }
    }

    return JSON.stringify({
      rationale,
      timing_note: "Mock timing: post near your usual peak hour from Relay history.",
      ...(wantRewrite ? { variants } : {})
    });
  }

  if (feature === "autopost_draft") {
    const titleHint = typeof user?.title_hint === "string" ? user.title_hint.trim() : "";
    const captions = Array.isArray(user?.discord_captions)
      ? (user.discord_captions as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    return JSON.stringify({
      title: titleHint || "Mock draft title",
      body_text:
        captions.length > 0
          ? captions.join("\n\n")
          : "Mock draft body — replace with real AI once RELAY_AI_PROVIDER=anthropic and a key are set."
    });
  }

  // Generic fallback for future features (rewrite JSON, datachat, etc.).
  return JSON.stringify({
    mock: true,
    feature,
    message: "MockAiProvider response — no vendor call was made."
  });
}
