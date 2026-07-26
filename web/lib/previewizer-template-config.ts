/**
 * Client serialize / hydrate for PreviewTemplateConfigV1.
 * Mirrors server rules in src/distribution/preview-template-config.ts (hybrid destination C, no selection).
 */

import {
  createDefaultOverlayDocument,
  type OverlayDocument
} from "@/app/components/previewizer/previewizer-overlay-layers";
import {
  DEFAULT_TEMPLATE_OPTIONS,
  type DesignTemplateOptions
} from "@/app/components/previewizer/previewizer-design-templates";
import {
  DEFAULT_COMPOSITION_PROPS,
  type CompositionPropsById,
  type CompositionTemplateId
} from "@/app/components/previewizer/previewizer-template-compositions";
import type { AspectRatioKey, PresetId } from "@/app/components/previewizer/previewizer-presets";

export const PREVIEW_TEMPLATE_SCHEMA_VERSION = 1 as const;

export const MAX_CUSTOM_PREVIEW_TEMPLATES = 3;

export const CUSTOM_PREVIEW_DESTINATION_ID = "custom" as const;

export const KNOWN_PREVIEW_DESTINATION_IDS = [
  "patreon",
  "bluesky",
  "x",
  "instagram",
  "website"
] as const;

export type PreviewTemplateDestinationV1 = {
  selectedDestinationId: string | null;
  customDestinationUrl: string | null;
};

export type PreviewTemplateConfigV1 = {
  schemaVersion: typeof PREVIEW_TEMPLATE_SCHEMA_VERSION;
  preset: PresetId;
  aspectKey: AspectRatioKey;
  compositionId: CompositionTemplateId | null;
  compositionProps: CompositionPropsById[CompositionTemplateId] | Record<string, unknown> | null;
  compositionVariantIndex: number | null;
  overlayDoc: OverlayDocument;
  templateOptions: DesignTemplateOptions;
  destination: PreviewTemplateDestinationV1;
};

/** Studio fields we serialize (selection intentionally omitted). */
export type PreviewTemplateStudioSlice = {
  preset: PresetId;
  aspectKey: AspectRatioKey;
  compositionId: CompositionTemplateId | null;
  compositionProps: CompositionPropsById[CompositionTemplateId] | null;
  compositionVariantIndex: number | null;
  overlayDoc: OverlayDocument;
  templateOptions: DesignTemplateOptions;
};

export type PreviewTemplateDestinationInput = {
  selectedDestinationId: string | null;
  customDestinationUrl: string | null;
};

/** Patch applied on hydrate — never includes selection. */
export type PreviewTemplateHydratePatch = {
  preset: PresetId;
  aspectKey: AspectRatioKey;
  compositionId: CompositionTemplateId | null;
  compositionProps: CompositionPropsById[CompositionTemplateId] | null;
  compositionVariantIndex: number | null;
  overlayDoc: OverlayDocument;
  templateOptions: DesignTemplateOptions;
  destination: PreviewTemplateDestinationV1;
};

const COMPOSITION_IDS = new Set<string>([
  "blur_plug",
  "bottom_blur_paywall",
  "mystery_crop",
  "cinematic_eyes",
  "frosted_glass_card",
  "collage_windows"
]);

const PRESET_IDS = new Set<string>(["tight_crop", "blur_outside", "pixelate", "censor_stamp"]);
const ASPECT_KEYS = new Set<string>(["1:1", "4:5", "9:16"]);

export function isCustomPreviewDestinationId(id: string | null | undefined): boolean {
  return id === CUSTOM_PREVIEW_DESTINATION_ID;
}

export function normalizePreviewTemplateDestination(
  raw: PreviewTemplateDestinationInput
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

function asCompositionId(raw: string | null): CompositionTemplateId | null {
  if (!raw || !COMPOSITION_IDS.has(raw)) return null;
  return raw as CompositionTemplateId;
}

function mergeCompositionProps(
  compositionId: CompositionTemplateId | null,
  props: Record<string, unknown> | null
): CompositionPropsById[CompositionTemplateId] | null {
  if (!compositionId) return null;
  const defaults = DEFAULT_COMPOSITION_PROPS[compositionId];
  return { ...defaults, ...(props ?? {}) } as CompositionPropsById[CompositionTemplateId];
}

function normalizeOverlayDoc(raw: unknown): OverlayDocument {
  if (!raw || typeof raw !== "object") return createDefaultOverlayDocument();
  const doc = raw as Partial<OverlayDocument>;
  return {
    textLayers: Array.isArray(doc.textLayers) ? doc.textLayers : [],
    graphicLayers: Array.isArray(doc.graphicLayers) ? doc.graphicLayers : [],
    logoLayers: Array.isArray(doc.logoLayers) ? doc.logoLayers : []
  };
}

function normalizeTemplateOptions(raw: unknown): DesignTemplateOptions {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TEMPLATE_OPTIONS };
  return { ...DEFAULT_TEMPLATE_OPTIONS, ...(raw as Partial<DesignTemplateOptions>) };
}

export function serializePreviewTemplateConfig(
  studio: PreviewTemplateStudioSlice,
  destination: PreviewTemplateDestinationInput
): PreviewTemplateConfigV1 {
  return {
    schemaVersion: PREVIEW_TEMPLATE_SCHEMA_VERSION,
    preset: studio.preset,
    aspectKey: studio.aspectKey,
    compositionId: studio.compositionId,
    compositionProps: studio.compositionProps
      ? ({ ...studio.compositionProps } as Record<string, unknown>)
      : null,
    compositionVariantIndex: studio.compositionVariantIndex,
    overlayDoc: {
      textLayers: studio.overlayDoc.textLayers.map((l) => ({ ...l })),
      graphicLayers: studio.overlayDoc.graphicLayers.map((l) => ({ ...l })),
      logoLayers: studio.overlayDoc.logoLayers.map((l) => ({ ...l }))
    },
    templateOptions: { ...studio.templateOptions },
    destination: normalizePreviewTemplateDestination(destination)
  };
}

export class PreviewTemplateConfigParseError extends Error {
  public override readonly name = "PreviewTemplateConfigParseError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

/**
 * Parse API/stored config into a hydrate patch. Leaves selection to the caller.
 */
export function hydratePreviewTemplateConfig(raw: unknown): PreviewTemplateHydratePatch {
  const details: Array<{ field: string; issue: string }> = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PreviewTemplateConfigParseError("Invalid preview template config.", [
      { field: "config", issue: "required" }
    ]);
  }
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== PREVIEW_TEMPLATE_SCHEMA_VERSION) {
    details.push({ field: "schemaVersion", issue: "unsupported" });
  }

  if (typeof obj.preset !== "string" || !PRESET_IDS.has(obj.preset)) {
    details.push({ field: "preset", issue: "invalid" });
  }
  if (typeof obj.aspectKey !== "string" || !ASPECT_KEYS.has(obj.aspectKey)) {
    details.push({ field: "aspectKey", issue: "invalid" });
  }

  let compositionId: CompositionTemplateId | null = null;
  if (obj.compositionId === null || obj.compositionId === undefined) {
    compositionId = null;
  } else if (typeof obj.compositionId === "string") {
    compositionId = asCompositionId(obj.compositionId);
    if (obj.compositionId.trim() && !compositionId) {
      details.push({ field: "compositionId", issue: "invalid" });
    }
  } else {
    details.push({ field: "compositionId", issue: "invalid" });
  }

  let compositionPropsRaw: Record<string, unknown> | null = null;
  if (obj.compositionProps === null || obj.compositionProps === undefined) {
    compositionPropsRaw = null;
  } else if (typeof obj.compositionProps === "object" && !Array.isArray(obj.compositionProps)) {
    compositionPropsRaw = obj.compositionProps as Record<string, unknown>;
  } else {
    details.push({ field: "compositionProps", issue: "invalid" });
  }

  let compositionVariantIndex: number | null = null;
  if (obj.compositionVariantIndex === null || obj.compositionVariantIndex === undefined) {
    compositionVariantIndex = null;
  } else if (
    typeof obj.compositionVariantIndex === "number" &&
    Number.isInteger(obj.compositionVariantIndex) &&
    obj.compositionVariantIndex >= 0
  ) {
    compositionVariantIndex = obj.compositionVariantIndex;
  } else {
    details.push({ field: "compositionVariantIndex", issue: "invalid" });
  }

  if (!obj.destination || typeof obj.destination !== "object" || Array.isArray(obj.destination)) {
    details.push({ field: "destination", issue: "invalid" });
  }

  if (details.length > 0) {
    throw new PreviewTemplateConfigParseError("Invalid preview template config.", details);
  }

  const dest = obj.destination as Record<string, unknown>;
  const selectedDestinationId =
    dest.selectedDestinationId === null || dest.selectedDestinationId === undefined
      ? null
      : typeof dest.selectedDestinationId === "string"
        ? dest.selectedDestinationId.trim() || null
        : null;
  const customDestinationUrl =
    dest.customDestinationUrl === null || dest.customDestinationUrl === undefined
      ? null
      : typeof dest.customDestinationUrl === "string"
        ? dest.customDestinationUrl.trim() || null
        : null;

  return {
    preset: obj.preset as PresetId,
    aspectKey: obj.aspectKey as AspectRatioKey,
    compositionId,
    compositionProps: mergeCompositionProps(compositionId, compositionPropsRaw),
    compositionVariantIndex,
    overlayDoc: normalizeOverlayDoc(obj.overlayDoc),
    templateOptions: normalizeTemplateOptions(obj.templateOptions),
    destination: normalizePreviewTemplateDestination({
      selectedDestinationId,
      customDestinationUrl
    })
  };
}

/**
 * Soft hydrate for optional session preload — never throws; caller keeps mount defaults on failure.
 * Patch never includes selection/crop.
 */
export function tryHydratePreviewTemplateConfig(
  raw: unknown
):
  | { ok: true; patch: PreviewTemplateHydratePatch }
  | { ok: false; message: string } {
  try {
    return { ok: true, patch: hydratePreviewTemplateConfig(raw) };
  } catch (e) {
    if (e instanceof PreviewTemplateConfigParseError) {
      return { ok: false, message: e.message };
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Invalid preview template config."
    };
  }
}
