import type { MediaAsset } from "@prisma/client";
import { generateText } from "../ai/ai-service.js";
import type { MountedCoachReportSnippet } from "../creator/studio-mounted-context.js";
import type { PostingAssistantContext } from "../distribution/posting-assistant-service.js";
import type { CreatorStyleProfileWire } from "./style-profile-service.js";
import type { StyleTonePresetId } from "./style-tone-presets.js";

export type AutopostDraftAiInput = {
  styleProfile: CreatorStyleProfileWire;
  mediaCaptions: string[];
  titleHint?: string | null;
  /** Nudged / Insights frame intent — already stored on the draft. */
  draft_intent?: string | null;
  /** Durable Insights studio brief (no live metrics search). */
  studio_brief?: PostingAssistantContext | null;
  /** Mounted coach_review findings snippet only — never rebuild fact_pack here. */
  mounted_report?: MountedCoachReportSnippet | null;
  /** For AI usage metering (MB-3). */
  creatorId?: string;
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

/** Prompt facts bag — exported for unit tests. */
export function buildAutopostDraftAiFacts(input: AutopostDraftAiInput): Record<string, unknown> {
  const brief = input.studio_brief ?? null;
  const report = input.mounted_report ?? null;
  return {
    voice_script: input.styleProfile.voice_script,
    discord_captions: input.mediaCaptions,
    title_hint: input.titleHint?.trim() || null,
    media_count: input.mediaCaptions.length,
    draft_intent: input.draft_intent?.trim() || null,
    studio_brief: brief
      ? {
          goals: brief.goals ?? [],
          user_notes: brief.user_notes ?? null,
          locale: brief.locale ?? null,
          trend_note: brief.trend_note ?? null
        }
      : null,
    mounted_findings: report
      ? {
          post_id: report.post_id,
          path_id: report.path_id,
          finding_labels: report.finding_labels,
          reason_codes: report.reason_codes
        }
      : null
  };
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

  const facts = buildAutopostDraftAiFacts(input);

  const result = await generateText({
    tier: "cheap",
    system: [
      "You draft social post copy for an artist publishing work-in-progress art.",
      "Use ONLY the facts in the user message. Do not invent metrics, links, or dates.",
      "If studio_brief or mounted_findings are present, align tone and angle with them — do not invent new analytics.",
      "draft_intent is a framing hint from Insights; honor it when present.",
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
    metadata: {
      feature: "autopost_draft",
      ...(input.creatorId ? { creatorId: input.creatorId } : {})
    }
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
