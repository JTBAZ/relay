/**
 * Previewizer blank-mode options — promo graphics, branding, and manual layer helpers.
 * Composition templates live in previewizer-template-compositions.tsx.
 */

import {
  PLATFORM_URL_DEFAULTS,
  type GraphicLayerRole,
  type GraphicOverlayLayer
} from "./previewizer-overlay-layers";
import {
  createGraphicLayer,
  v0FontToKey,
  type GraphicPlacementAnchor
} from "./previewizer-graphic-placement";
import {
  PRESET_META,
  type PromoGraphicId
} from "./previewizer-v0-promo-graphics";
import type { AspectRatioKey } from "./previewizer-presets";

export type PromoStyleId = "flash" | "editorial" | "soft";

export { type PromoGraphicId, PRESET_META as PROMO_GRAPHIC_META };

export const PROMO_GRAPHIC_GROUPS: { label: string; ids: PromoGraphicId[] }[] = [
  {
    label: "Platform branding",
    ids: ["platform_lockup"]
  },
  {
    label: "Sale graphics",
    ids: ["sale_burst", "sticker_outline", "corner_ribbon", "flash_pill"]
  },
  {
    label: "Soft CTAs",
    ids: ["ghost_tag", "split_banner", "stamp_mono", "platform_card"]
  }
];

export type PlatformId = "deviantart" | "patreon" | "x" | "bluesky";

export type PromoCopyPreset = {
  id: string;
  label: string;
  text: string;
};

export const PROMO_COPY_PRESETS: PromoCopyPreset[] = [
  { id: "30_off", label: "30% OFF", text: "30% OFF" },
  { id: "50_off", label: "50% OFF", text: "50% OFF" },
  { id: "new_page", label: "New page", text: "NEW PAGE" },
  { id: "limited", label: "Limited time", text: "LIMITED TIME" },
  { id: "join", label: "Join Patreon", text: "JOIN PATREON" },
  { id: "new_issue", label: "New issue", text: "NEW ISSUE" }
];

export const PROMO_STYLE_LABELS: Record<PromoStyleId, string> = {
  flash: "Flash Sale",
  editorial: "Editorial",
  soft: "Soft Promo"
};

export type DesignTemplateOptions = {
  platformId: PlatformId;
  backgroundMode: "crop" | "blur";
  relayBranding: boolean;
  platformUrl?: string;
  promoText?: string;
  titleText?: string;
  promoGraphic?: PromoGraphicId;
  hookFont?: import("./previewizer-overlay-layers").FontPresetKey;
  textFillRatio?: number;
  graphicOpacity?: number;
  graphicAnchor?: GraphicPlacementAnchor;
  selectedGraphicLayerId?: string | null;
  /** @deprecated */
  promoStyle?: PromoStyleId;
};

export const DEFAULT_TEMPLATE_OPTIONS: DesignTemplateOptions = {
  platformId: "patreon",
  backgroundMode: "crop",
  relayBranding: false,
  promoGraphic: "sticker_outline",
  promoText: "30% OFF",
  textFillRatio: 1,
  graphicOpacity: 1,
  graphicAnchor: "center"
};

function buildBrandingLayer(
  aspectKey: AspectRatioKey,
  platform: PlatformId,
  urlText: string,
  anchor: GraphicPlacementAnchor = "bottom",
  opacity = 1,
  textFillRatio = 1
): GraphicOverlayLayer {
  return createGraphicLayer("platform_lockup", aspectKey, {
    text: urlText,
    platformId: platform,
    layerRole: "branding",
    anchor,
    opacity,
    textFillRatio,
    fontKey: "minimal"
  });
}

function buildPromoGraphicLayer(
  aspectKey: AspectRatioKey,
  promoText: string,
  graphicId: PromoGraphicId,
  options: Pick<
    DesignTemplateOptions,
    "hookFont" | "textFillRatio" | "graphicOpacity" | "graphicAnchor"
  >,
  layerRole: GraphicLayerRole = "promo"
): GraphicOverlayLayer {
  const meta = PRESET_META[graphicId];
  const fontKey = options.hookFont ?? v0FontToKey(meta.defaultFont);
  const displayText =
    graphicId === "ghost_tag" && fontKey === "minimal"
      ? promoText
      : promoText.toUpperCase();
  const anchor = options.graphicAnchor ?? "center";

  return {
    ...createGraphicLayer(graphicId, aspectKey, {
      text: displayText,
      layerRole,
      anchor,
      opacity: options.graphicOpacity ?? 1,
      textFillRatio: options.textFillRatio ?? 1,
      fontKey
    }),
    fontSize: 54
  };
}

function resolvePlatformUrl(platform: PlatformId, override?: string): string {
  return (override?.trim() || PLATFORM_URL_DEFAULTS[platform]).toUpperCase();
}

/** Add a graphic layer from the overlay studio picker (blank mode). */
export function createGraphicLayerFromPreset(
  graphicId: PromoGraphicId,
  aspectKey: AspectRatioKey,
  options: DesignTemplateOptions
): GraphicOverlayLayer {
  const urlText = resolvePlatformUrl(options.platformId, options.platformUrl);
  const promoText = options.promoText?.trim() || "30% OFF";

  if (graphicId === "platform_lockup") {
    return buildBrandingLayer(
      aspectKey,
      options.platformId,
      urlText,
      options.graphicAnchor ?? "bottom",
      options.graphicOpacity ?? 1,
      options.textFillRatio ?? 1
    );
  }

  return buildPromoGraphicLayer(aspectKey, promoText, graphicId, options, "custom");
}

export function supportsTitleField(promoGraphic?: PromoGraphicId): boolean {
  return promoGraphic === "split_banner";
}
