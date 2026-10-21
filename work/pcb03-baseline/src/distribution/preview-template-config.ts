/**
 * Previewizer custom template config — schemaVersion 1.
 * No crop/selection. Destination hybrid C: persist custom URL only for `custom`.
 */

export const PREVIEW_TEMPLATE_SCHEMA_VERSION = 1 as const;

export const MAX_CUSTOM_PREVIEW_TEMPLATES = 3;

export const MAX_PREVIEW_TEMPLATE_NAME_LENGTH = 80;

/** Platforms resolved live on apply — do not persist customDestinationUrl. */
export const KNOWN_PREVIEW_DESTINATION_IDS = [
  "patreon",
  "bluesky",
  "x",
  "instagram",
  "website"
] as const;

export type KnownPreviewDestinationId = (typeof KNOWN_PREVIEW_DESTINATION_IDS)[number];

export const CUSTOM_PREVIEW_DESTINATION_ID = "custom" as const;

export const PREVIEW_TEMPLATE_PRESET_IDS = [
  "tight_crop",
  "blur_outside",
  "pixelate",
  "censor_stamp"
] as const;

export type PreviewTemplatePresetId = (typeof PREVIEW_TEMPLATE_PRESET_IDS)[number];

export const PREVIEW_TEMPLATE_ASPECT_KEYS = ["1:1", "4:5", "9:16"] as const;

export type PreviewTemplateAspectKey = (typeof PREVIEW_TEMPLATE_ASPECT_KEYS)[number];

export type PreviewTemplateDestinationV1 = {
  selectedDestinationId: string | null;
  /** Only set when selectedDestinationId is `custom`. */
  customDestinationUrl: string | null;
};

/**
 * Stored JSON shape. compositionProps / overlayDoc / templateOptions are opaque
 * objects validated structurally; client merges with composition defaults on hydrate.
 */
export type PreviewTemplateConfigV1 = {
  schemaVersion: typeof PREVIEW_TEMPLATE_SCHEMA_VERSION;
  preset: PreviewTemplatePresetId;
  aspectKey: PreviewTemplateAspectKey;
  compositionId: string | null;
  compositionProps: Record<string, unknown> | null;
  compositionVariantIndex: number | null;
  overlayDoc: Record<string, unknown>;
  templateOptions: Record<string, unknown>;
  destination: PreviewTemplateDestinationV1;
};

export class PreviewTemplateConfigError extends Error {
  public override readonly name = "PreviewTemplateConfigError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isKnownPreviewDestinationId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (KNOWN_PREVIEW_DESTINATION_IDS as readonly string[]).includes(id);
}

export function isCustomPreviewDestinationId(id: string | null | undefined): boolean {
  return id === CUSTOM_PREVIEW_DESTINATION_ID;
}

/**
 * Normalize destination for persistence (hybrid C).
 * Clears customDestinationUrl unless destination is custom.
 */
export function normalizePreviewTemplateDestination(
  raw: PreviewTemplateDestinationV1
): PreviewTemplateDestinationV1 {
  const selected =
    typeof raw.selectedDestinationId === "string" && raw.selectedDestinationId.trim()
      ? raw.selectedDestinationId.trim()
      : null;
  if (isCustomPreviewDestinationId(selected)) {
    const url =
      typeof raw.customDestinationUrl === "string" && raw.customDestinationUrl.trim()
        ? raw.customDestinationUrl.trim()
        : null;
    return { selectedDestinationId: selected, customDestinationUrl: url };
  }
  return { selectedDestinationId: selected, customDestinationUrl: null };
}

function parsePreset(raw: unknown, details: Array<{ field: string; issue: string }>): PreviewTemplatePresetId | null {
  if (typeof raw !== "string" || !(PREVIEW_TEMPLATE_PRESET_IDS as readonly string[]).includes(raw)) {
    details.push({ field: "preset", issue: "invalid" });
    return null;
  }
  return raw as PreviewTemplatePresetId;
}

function parseAspect(
  raw: unknown,
  details: Array<{ field: string; issue: string }>
): PreviewTemplateAspectKey | null {
  if (typeof raw !== "string" || !(PREVIEW_TEMPLATE_ASPECT_KEYS as readonly string[]).includes(raw)) {
    details.push({ field: "aspectKey", issue: "invalid" });
    return null;
  }
  return raw as PreviewTemplateAspectKey;
}

/**
 * Parse and validate unknown JSON into PreviewTemplateConfigV1.
 * Rejects unknown schemaVersion; strips selection if present (never stored).
 */
export function parsePreviewTemplateConfig(raw: unknown): PreviewTemplateConfigV1 {
  const details: Array<{ field: string; issue: string }> = [];

  if (!isPlainObject(raw)) {
    throw new PreviewTemplateConfigError("Invalid preview template config.", [
      { field: "config", issue: "required" }
    ]);
  }

  // Explicitly ignore crop if callers accidentally include it
  if ("selection" in raw) {
    // strip only — not an error
  }

  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== PREVIEW_TEMPLATE_SCHEMA_VERSION) {
    details.push({ field: "schemaVersion", issue: "unsupported" });
  }

  const preset = parsePreset(raw.preset, details);
  const aspectKey = parseAspect(raw.aspectKey, details);

  let compositionId: string | null = null;
  if (raw.compositionId === null || raw.compositionId === undefined) {
    compositionId = null;
  } else if (typeof raw.compositionId === "string" && raw.compositionId.trim()) {
    compositionId = raw.compositionId.trim();
  } else {
    details.push({ field: "compositionId", issue: "invalid" });
  }

  let compositionProps: Record<string, unknown> | null = null;
  if (raw.compositionProps === null || raw.compositionProps === undefined) {
    compositionProps = null;
  } else if (isPlainObject(raw.compositionProps)) {
    compositionProps = raw.compositionProps;
  } else {
    details.push({ field: "compositionProps", issue: "invalid" });
  }

  let compositionVariantIndex: number | null = null;
  if (raw.compositionVariantIndex === null || raw.compositionVariantIndex === undefined) {
    compositionVariantIndex = null;
  } else if (
    typeof raw.compositionVariantIndex === "number" &&
    Number.isInteger(raw.compositionVariantIndex) &&
    raw.compositionVariantIndex >= 0
  ) {
    compositionVariantIndex = raw.compositionVariantIndex;
  } else {
    details.push({ field: "compositionVariantIndex", issue: "invalid" });
  }

  if (!isPlainObject(raw.overlayDoc)) {
    details.push({ field: "overlayDoc", issue: "invalid" });
  }
  if (!isPlainObject(raw.templateOptions)) {
    details.push({ field: "templateOptions", issue: "invalid" });
  }

  let destination: PreviewTemplateDestinationV1 = {
    selectedDestinationId: null,
    customDestinationUrl: null
  };
  if (!isPlainObject(raw.destination)) {
    details.push({ field: "destination", issue: "invalid" });
  } else {
    const sel = raw.destination.selectedDestinationId;
    const selectedDestinationId =
      sel === null || sel === undefined
        ? null
        : typeof sel === "string"
          ? sel.trim() || null
          : null;
    if (sel !== null && sel !== undefined && typeof sel !== "string") {
      details.push({ field: "destination.selectedDestinationId", issue: "invalid" });
    }
    const urlRaw = raw.destination.customDestinationUrl;
    const customDestinationUrl =
      urlRaw === null || urlRaw === undefined
        ? null
        : typeof urlRaw === "string"
          ? urlRaw.trim() || null
          : null;
    if (urlRaw !== null && urlRaw !== undefined && typeof urlRaw !== "string") {
      details.push({ field: "destination.customDestinationUrl", issue: "invalid" });
    }
    destination = normalizePreviewTemplateDestination({
      selectedDestinationId,
      customDestinationUrl
    });
  }

  if (details.length > 0 || !preset || !aspectKey || !isPlainObject(raw.overlayDoc) || !isPlainObject(raw.templateOptions)) {
    throw new PreviewTemplateConfigError("Invalid preview template config.", details);
  }

  return {
    schemaVersion: PREVIEW_TEMPLATE_SCHEMA_VERSION,
    preset,
    aspectKey,
    compositionId,
    compositionProps,
    compositionVariantIndex,
    overlayDoc: raw.overlayDoc,
    templateOptions: raw.templateOptions,
    destination
  };
}
