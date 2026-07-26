/**
 * Autopost WI-3 — tone preset catalog for Style Profile selection UI.
 */

export type StyleTonePresetId =
  | "none"
  | "friendly"
  | "professional"
  | "warm"
  | "playful"
  | "formal";

export type StyleTonePreset = {
  id: StyleTonePresetId;
  label: string;
  /** Sample paragraph showing how this voice reads on a typical WIP post. */
  sample: string;
  /** System-facing voice instruction merged into draft prompts. */
  voice_instruction: string;
};

export const STYLE_TONE_PRESETS: StyleTonePreset[] = [
  {
    id: "none",
    label: "None — I write my own",
    sample: "",
    voice_instruction: ""
  },
  {
    id: "friendly",
    label: "Friendly",
    sample:
      "Hey everyone! Here's a little progress shot from this week's session — still noodling on the lighting, but I'm happy with where the mood is landing. More soon!",
    voice_instruction:
      "Write in a casual, approachable tone. Use contractions. Sound like you're talking to supporters you know."
  },
  {
    id: "professional",
    label: "Professional",
    sample:
      "Sharing a work-in-progress update from this week's studio session. The composition is nearing final; next steps include refining edge detail and preparing the high-resolution export.",
    voice_instruction:
      "Write in a clear, professional tone. Avoid slang and excessive exclamation marks."
  },
  {
    id: "warm",
    label: "Warm",
    sample:
      "Thank you for being here while this piece comes together. I wanted to share a gentle peek at today's progress — your support keeps me showing up at the easel.",
    voice_instruction:
      "Write with warmth and gratitude. Acknowledge the audience without being saccharine."
  },
  {
    id: "playful",
    label: "Playful",
    sample:
      "Plot twist: the sketch survived Monday. Here's where the chaos landed — colors are arguing with each other and I'm refereeing.",
    voice_instruction:
      "Write with light humor and personality. Keep it fun but still about the art."
  },
  {
    id: "formal",
    label: "Formal",
    sample:
      "I am pleased to present a preliminary study from the current series. This stage documents structural decisions prior to the final rendering pass.",
    voice_instruction:
      "Write in a formal, restrained tone suitable for a portfolio announcement."
  }
];

const PRESET_BY_ID = new Map(STYLE_TONE_PRESETS.map((p) => [p.id, p]));

export function isStyleTonePresetId(value: string): value is StyleTonePresetId {
  return PRESET_BY_ID.has(value as StyleTonePresetId);
}

export function getStyleTonePreset(id: StyleTonePresetId): StyleTonePreset {
  return PRESET_BY_ID.get(id)!;
}

export function buildVoiceScript(args: {
  tonePreset: StyleTonePresetId;
  userPrompt?: string | null;
}): string {
  const preset = getStyleTonePreset(args.tonePreset);
  const parts: string[] = [];
  if (preset.voice_instruction) {
    parts.push(`Voice: ${preset.voice_instruction}`);
  }
  if (preset.sample) {
    parts.push(`Example:\n${preset.sample}`);
  }
  const user = args.userPrompt?.trim();
  if (user) {
    parts.push(`Artist notes to convey:\n${user}`);
  }
  return parts.join("\n\n");
}
