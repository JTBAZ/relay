import {
  clampRect,
  type GraphicLayerRole,
  type GraphicOverlayLayer
} from "./previewizer-overlay-layers";
import { PRESET_META, type PromoGraphicId } from "./previewizer-v0-promo-graphics";
import type { AspectRatioKey, NormalizedRect } from "./previewizer-presets";

export type PlatformId = "deviantart" | "patreon" | "x" | "bluesky";

export type GraphicPlacementAnchor =
  | "center"
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | "custom";

const SIZE_BY_ASPECT: Partial<
  Record<AspectRatioKey, Partial<Record<PromoGraphicId, { w: number; h: number }>>>
> = {
  "4:5": {
    platform_lockup: { w: 0.62, h: 0.1 },
    sticker_outline: { w: 0.84, h: 0.38 },
    ghost_tag: { w: 0.78, h: 0.34 },
    sale_burst: { w: 0.72, h: 0.72 },
    stamp_mono: { w: 0.78, h: 0.34 }
  },
  "9:16": {
    platform_lockup: { w: 0.55, h: 0.08 },
    sticker_outline: { w: 0.8, h: 0.32 },
    ghost_tag: { w: 0.74, h: 0.28 },
    sale_burst: { w: 0.68, h: 0.68 },
    stamp_mono: { w: 0.74, h: 0.28 }
  }
};

/** Default shell footprint per graphic (matches v0 full-frame proportions). */
export function defaultGraphicSize(
  graphicId: PromoGraphicId,
  aspectKey: AspectRatioKey = "1:1"
): { w: number; h: number } {
  const aspectOverride = SIZE_BY_ASPECT[aspectKey]?.[graphicId];
  if (aspectOverride) return aspectOverride;

  switch (graphicId) {
    case "platform_lockup":
      return { w: 0.58, h: 0.1 };
    case "corner_ribbon":
      return { w: 1, h: 0.24 };
    case "split_banner":
      return { w: 1, h: 0.18 };
    case "sale_burst":
      return { w: 0.78, h: 0.78 };
    case "sticker_outline":
    case "flash_pill":
    case "ghost_tag":
    case "stamp_mono":
      return { w: 0.82, h: 0.36 };
    case "platform_card":
      return { w: 0.84, h: 0.22 };
    default:
      return { w: 0.82, h: 0.36 };
  }
}

export function rectFromAnchor(
  anchor: GraphicPlacementAnchor,
  graphicId: PromoGraphicId,
  aspectKey: AspectRatioKey = "1:1",
  sizeScale = 1
): NormalizedRect {
  const base = defaultGraphicSize(graphicId, aspectKey);
  const w = Math.min(1, base.w * sizeScale);
  const h = Math.min(1, base.h * sizeScale);
  const pad = aspectKey === "9:16" ? 0.05 : 0.04;

  if (anchor === "custom" || anchor === "center") {
    return clampRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  }
  if (anchor === "top-left") return clampRect({ x: pad, y: pad, w, h });
  if (anchor === "top") return clampRect({ x: (1 - w) / 2, y: pad, w, h });
  if (anchor === "top-right") return clampRect({ x: 1 - pad - w, y: pad, w, h });
  if (anchor === "left") return clampRect({ x: pad, y: (1 - h) / 2, w, h });
  if (anchor === "right") return clampRect({ x: 1 - pad - w, y: (1 - h) / 2, w, h });
  if (anchor === "bottom-left") return clampRect({ x: pad, y: 1 - pad - h, w, h });
  if (anchor === "bottom") return clampRect({ x: (1 - w) / 2, y: 1 - pad - h, w, h });
  return clampRect({ x: 1 - pad - w, y: 1 - pad - h, w, h });
}

export function v0FontToKey(
  fontClass: import("./previewizer-v0-promo-graphics").FontClass
): GraphicOverlayLayer["fontKey"] {
  if (fontClass === "condensed") return "condensed";
  if (fontClass === "mono") return "mono";
  if (fontClass === "minimal") return "minimal";
  return "impact";
}

export function fontKeyToV0(
  fontKey: GraphicOverlayLayer["fontKey"]
): import("./previewizer-v0-promo-graphics").FontClass {
  if (fontKey === "condensed") return "condensed";
  if (fontKey === "minimal" || fontKey === "warm" || fontKey === "editorial") return "minimal";
  if (fontKey === "mono") return "mono";
  return "impact";
}

export const ANCHOR_OPTIONS: { id: GraphicPlacementAnchor; label: string }[] = [
  { id: "top-left", label: "↖" },
  { id: "top", label: "↑" },
  { id: "top-right", label: "↗" },
  { id: "left", label: "←" },
  { id: "center", label: "●" },
  { id: "right", label: "→" },
  { id: "bottom-left", label: "↙" },
  { id: "bottom", label: "↓" },
  { id: "bottom-right", label: "↘" }
];

export function newGraphicLayerId(role: GraphicLayerRole): string {
  return `graphic-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createGraphicLayer(
  graphicId: PromoGraphicId,
  aspectKey: AspectRatioKey,
  options: {
    text: string;
    platformId?: PlatformId;
    layerRole?: GraphicLayerRole;
    anchor?: GraphicPlacementAnchor;
    opacity?: number;
    textFillRatio?: number;
    fontKey?: GraphicOverlayLayer["fontKey"];
    sizeScale?: number;
  }
): GraphicOverlayLayer {
  const fontKey = options.fontKey ?? v0FontToKey(PRESET_META[graphicId].defaultFont);
  const anchor = options.anchor ?? "center";

  return {
    id: newGraphicLayerId(options.layerRole ?? "custom"),
    kind: "graphic",
    graphicId,
    text: graphicId === "platform_lockup" ? options.text : options.text.toUpperCase(),
    fontKey,
    fontSize: graphicId === "platform_lockup" ? 40 : 54,
    textFillRatio: options.textFillRatio ?? 1,
    opacity: options.opacity ?? 1,
    placementAnchor: anchor,
    rect: rectFromAnchor(anchor, graphicId, aspectKey, options.sizeScale),
    layerRole: options.layerRole ?? "custom",
    platformId: options.platformId,
    visible: true
  };
}
