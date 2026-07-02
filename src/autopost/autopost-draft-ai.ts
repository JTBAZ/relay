import type { MediaAsset } from "@prisma/client";
import { generateText } from "../ai/ai-service.js";
import type { CreatorStyleProfileWire } from "./style-profile-service.js";
import type { StyleTonePresetId } from "./style-tone-presets.js";

export type AutopostDraftAiInput = {
  styleProfile: CreatorStyleProfileWire;
  mediaCaptions: string[];
  titleHint?: string | null;
};

export type AutopostDraftAiResult =
  | { ok: true; title: string; body_text: string; ai_skipped: false }
  | { ok: true; title: string; body_text: string; ai_skipped: true; reason: string }
  | { ok: false; error: string };

function extractDiscordCaption(media: Pick<MediaAsset, "discordCaptureJson">): string | null {
  const raw = media.discordCaptureJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const content = (raw as { message_content?: unknown }).message_content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export function collectMediaCaptions(
  mediaRows: Array<Pick<MediaAsset, "discordCaptureJson">>
): string[] {
  const out: string[] = [];
  for (const row of mediaRows) {
    const caption = extractDiscordCaption(row);
    if (caption) out.push(caption);
  }
  return out;
}

export async function generateAutopostDraftCopy(
  input: AutopostDraftAiInput
): Promise<AutopostDraftAiResult> {
  const tone = input.styleProfile.tone_preset;
  if (tone === "none") {
    return {
      ok: true,
      title: input.titleHint?.trim() ?? "",
      body_text: "",
      ai_skipped: true,
      reason: "Tone preset is none — artist writes manually."
    };
  }

  const facts = {
    voice_script: input.styleProfile.voice_script,
    discord_captions: input.mediaCaptions,
    title_hint: input.titleHint?.trim() || null,
    media_count: input.mediaCaptions.length
  };

  const result = await generateText({
    tier: "cheap",
    system: [
      "You draft social post copy for an artist publishing work-in-progress art.",
      "Use ONLY the facts in the user message. Do not invent metrics, links, or dates.",
      "Return JSON with keys title and body_text only.",
      "body_text may use plain text or simple HTML paragraphs.",
      "Keep it concise (under 120 words unless the artist notes ask for more)."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: JSON.stringify(facts)
      }
    ],
    maxOutputTokens: 800,
    temperature: 0.6,
    metadata: { feature: "autopost_draft" }
  });

  if (!result.ok) {
    if (result.skipped) {
      return {
        ok: true,
        title: input.titleHint?.trim() ?? "",
        body_text: input.mediaCaptions.join("\n\n"),
        ai_skipped: true,
        reason: result.reason
      };
    }
    return { ok: false, error: result.error };
  }

  try {
    const parsed = JSON.parse(result.text) as { title?: unknown; body_text?: unknown };
    return {
      ok: true,
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      body_text: typeof parsed.body_text === "string" ? parsed.body_text.trim() : result.text.trim(),
      ai_skipped: false
    };
  } catch {
    return {
      ok: true,
      title: input.titleHint?.trim() ?? "",
      body_text: result.text.trim(),
      ai_skipped: false
    };
  }
}

export type { StyleTonePresetId };
