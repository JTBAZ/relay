import type { PrismaClient } from "@prisma/client";
import {
  buildVoiceScript,
  isStyleTonePresetId,
  STYLE_TONE_PRESETS,
  type StyleTonePreset,
  type StyleTonePresetId
} from "./style-tone-presets.js";

export type CreatorStyleProfileWire = {
  creator_id: string;
  profile_id: string;
  label: string;
  tone_preset: StyleTonePresetId;
  user_prompt: string | null;
  voice_script: string;
  updated_at: string;
};

export type StyleProfilePutInput = {
  tone_preset: string;
  user_prompt?: string | null;
  label?: string;
};

export class StyleProfileValidationError extends Error {
  public override readonly name = "StyleProfileValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

function mapRow(row: {
  id: string;
  creatorId: string;
  label: string;
  tonePreset: string;
  userPrompt: string | null;
  voiceScript: string;
  updatedAt: Date;
}): CreatorStyleProfileWire {
  return {
    creator_id: row.creatorId,
    profile_id: row.id,
    label: row.label,
    tone_preset: row.tonePreset as StyleTonePresetId,
    user_prompt: row.userPrompt,
    voice_script: row.voiceScript,
    updated_at: row.updatedAt.toISOString()
  };
}

export function listStyleTonePresets(): StyleTonePreset[] {
  return STYLE_TONE_PRESETS;
}

export async function getCreatorStyleProfile(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreatorStyleProfileWire | null> {
  const row = await prisma.creatorStyleProfile.findFirst({
    where: { creatorId, isDefault: true },
    orderBy: { updatedAt: "desc" }
  });
  return row ? mapRow(row) : null;
}

export async function requireCreatorStyleProfile(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreatorStyleProfileWire> {
  const profile = await getCreatorStyleProfile(prisma, creatorId);
  if (!profile) {
    throw new StyleProfileValidationError(
      "Save a Style Profile before creating an Autopost draft.",
      [{ field: "style_profile", issue: "required_before_autopost" }]
    );
  }
  return profile;
}

export async function putCreatorStyleProfile(
  prisma: PrismaClient,
  creatorId: string,
  input: StyleProfilePutInput
): Promise<CreatorStyleProfileWire> {
  const toneRaw = input.tone_preset?.trim() ?? "";
  if (!isStyleTonePresetId(toneRaw)) {
    throw new StyleProfileValidationError("Invalid tone_preset.", [
      { field: "tone_preset", issue: "invalid_enum" }
    ]);
  }
  const label = (input.label?.trim() || "Default").slice(0, 80);
  const userPrompt =
    input.user_prompt === null || input.user_prompt === undefined
      ? null
      : String(input.user_prompt).trim() || null;
  const voiceScript = buildVoiceScript({ tonePreset: toneRaw, userPrompt });

  const row = await prisma.creatorStyleProfile.upsert({
    where: { creatorId_label: { creatorId, label } },
    create: {
      creatorId,
      label,
      isDefault: true,
      tonePreset: toneRaw,
      userPrompt,
      voiceScript
    },
    update: {
      tonePreset: toneRaw,
      userPrompt,
      voiceScript,
      isDefault: true
    }
  });

  // Keep a single default profile per creator.
  await prisma.creatorStyleProfile.updateMany({
    where: { creatorId, id: { not: row.id } },
    data: { isDefault: false }
  });

  return mapRow(row);
}
