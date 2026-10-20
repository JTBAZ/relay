/**
 * Previewizer overlay layer model — normalized rects, canvas bake, bundled logos.
 */

import type { GraphicPlacementAnchor } from "./previewizer-graphic-placement";
import {
  type PromoGraphicId
} from "./previewizer-v0-promo-graphics";
import type { NormalizedRect, OutputSize, AspectRatioKey } from "./previewizer-presets";

export type { PromoGraphicId };
export type { GraphicPlacementAnchor };

export type FontPresetKey = "editorial" | "minimal" | "warm" | "mono" | "impact" | "condensed";

export type TextPlateMode = "none" | "banner" | "pill";

export type LogoAssetId =
  | "deviantart"
  | "patreon"
  | "x"
  | "bluesky"
  | "relay"
  | `custom-${string}`;

export type LogoBucketItem = {
  id: LogoAssetId;
  label: string;
  src: string;
};

export const BUNDLED_LOGOS: LogoBucketItem[] = [
  { id: "deviantart", label: "DeviantArt", src: "/previewizer/logos/deviantart.png" },
  { id: "patreon", label: "Patreon", src: "/previewizer/logos/patreon.png" },
  { id: "x", label: "X", src: "/previewizer/logos/x.png" },
  { id: "bluesky", label: "Bluesky", src: "/previewizer/logos/bluesky.png" }
];

export const RELAY_WATERMARK_LOGO: LogoBucketItem = {
  id: "relay",
  label: "Relay",
  src: "/previewizer/logos/relay-wordmark.png"
};

export const PLATFORM_URL_DEFAULTS: Record<"deviantart" | "patreon" | "x" | "bluesky", string> = {
  patreon: "PATREON.COM/YOU",
  x: "X.COM/YOU",
  deviantart: "DEVIANTART.COM/YOU",
  bluesky: "BSKY.APP/YOU"
};

/** Aspect-aware safe bands for template placement (normalized 0–1). */
export const SAFE_ZONE_RECTS: Record<
  AspectRatioKey,
  {
    titleTop: NormalizedRect;
    promoCenter: NormalizedRect;
    bottomBand: NormalizedRect;
    logoLockup: NormalizedRect;
    cornerLogo: NormalizedRect;
    watermark: NormalizedRect;
  }
> = {
  "1:1": {
    titleTop: { x: 0.08, y: 0.06, w: 0.84, h: 0.12 },
    promoCenter: { x: 0.18, y: 0.38, w: 0.64, h: 0.12 },
    bottomBand: { x: 0.18, y: 0.76, w: 0.78, h: 0.12 },
    logoLockup: { x: 0.04, y: 0.76, w: 0.12, h: 0.12 },
    cornerLogo: { x: 0.04, y: 0.04, w: 0.12, h: 0.12 },
    watermark: { x: 0.62, y: 0.9, w: 0.34, h: 0.06 }
  },
  "4:5": {
    titleTop: { x: 0.08, y: 0.06, w: 0.84, h: 0.11 },
    promoCenter: { x: 0.16, y: 0.4, w: 0.68, h: 0.11 },
    bottomBand: { x: 0.18, y: 0.8, w: 0.78, h: 0.11 },
    logoLockup: { x: 0.04, y: 0.8, w: 0.12, h: 0.11 },
    cornerLogo: { x: 0.04, y: 0.05, w: 0.11, h: 0.11 },
    watermark: { x: 0.6, y: 0.91, w: 0.36, h: 0.05 }
  },
  "9:16": {
    titleTop: { x: 0.1, y: 0.16, w: 0.72, h: 0.08 },
    promoCenter: { x: 0.14, y: 0.42, w: 0.72, h: 0.1 },
    bottomBand: { x: 0.18, y: 0.62, w: 0.7, h: 0.09 },
    logoLockup: { x: 0.06, y: 0.62, w: 0.1, h: 0.09 },
    cornerLogo: { x: 0.06, y: 0.16, w: 0.1, h: 0.09 },
    watermark: { x: 0.52, y: 0.68, w: 0.42, h: 0.04 }
  }
};

export function getBundledLogo(id: "deviantart" | "patreon" | "x" | "bluesky"): LogoBucketItem {
  const item = BUNDLED_LOGOS.find((l) => l.id === id);
  if (!item) throw new Error(`Unknown platform logo: ${id}`);
  return item;
}

function newLayerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export type TextOverlayLayer = {
  id: string;
  kind: "text";
  text: string;
  fontKey: FontPresetKey;
  /** Base font size at export when rect matches template default height. */
  fontSize: number;
  textColor: "#ffffff" | "#000000" | "#9bf0c4";
  strokeWidth: number;
  strokeColor: string;
  plate: TextPlateMode;
  plateOpacity: number;
  rect: NormalizedRect;
};

export type LogoOverlayLayer = {
  id: string;
  kind: "logo";
  assetId: string;
  label: string;
  src: string;
  opacity: number;
  rect: NormalizedRect;
};

export type GraphicLayerRole = "branding" | "promo" | "stamp" | "custom";

export type GraphicOverlayLayer = {
  id: string;
  kind: "graphic";
  graphicId: PromoGraphicId;
  text: string;
  fontKey: FontPresetKey;
  /** Base font size reference when rect matches template default. */
  fontSize: number;
  /** Hook text size within shell (0.5–1.5). */
  textFillRatio: number;
  opacity: number;
  placementAnchor: GraphicPlacementAnchor;
  rect: NormalizedRect;
  /** Stable role for template re-apply matching. */
  layerRole?: GraphicLayerRole;
  /** Platform SVG for platform_lockup layers. */
  platformId?: "deviantart" | "patreon" | "x" | "bluesky";
  /** When false, layer is hidden from preview/export. */
  visible?: boolean;
};

export type OverlayLayer = TextOverlayLayer | LogoOverlayLayer | GraphicOverlayLayer;

export type OverlayDocument = {
  textLayers: TextOverlayLayer[];
  graphicLayers: GraphicOverlayLayer[];
  logoLayers: LogoOverlayLayer[];
};

export const FONT_PRESETS: Record<FontPresetKey, { label: string; stack: string }> = {
  editorial: { label: "Classic", stack: "'Georgia', 'Times New Roman', serif" },
  minimal: { label: "Modern", stack: "'Inter', system-ui, sans-serif" },
  warm: { label: "Elegant", stack: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  mono: { label: "Monospace", stack: "'Courier New', Courier, monospace" },
  impact: {
    label: "Bold Display",
    stack: "'Bebas Neue', Impact, 'Arial Black', 'Helvetica Neue', sans-serif"
  },
  condensed: {
    label: "Condensed",
    stack: "'Oswald', 'Arial Narrow', 'Helvetica Neue', sans-serif"
  }
};

const DISPLAY_FONT_KEYS: FontPresetKey[] = ["impact", "condensed"];

const imageCache = new Map<string, HTMLImageElement>();

export function loadOverlayImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load overlay image: ${src}`));
    img.src = src;
  });
}

export async function preloadOverlayImages(doc: OverlayDocument): Promise<void> {
  const srcs = doc.logoLayers.map((l) => l.src);
  await Promise.all(srcs.map((s) => loadOverlayImage(s).catch(() => undefined)));
}

export function createDefaultOverlayDocument(): OverlayDocument {
  return { textLayers: [], graphicLayers: [], logoLayers: [] };
}

export function squareLogoRect(
  x: number,
  y: number,
  sizeW: number,
  outW: number,
  outH: number
): NormalizedRect {
  return { x, y, w: sizeW, h: sizeW * (outW / outH) };
}

export function clampRect(rect: NormalizedRect): NormalizedRect {
  const w = Math.max(0.03, Math.min(1, rect.w));
  const h = Math.max(0.03, Math.min(1, rect.h));
  const x = Math.max(0, Math.min(1 - w, rect.x));
  const y = Math.max(0, Math.min(1 - h, rect.y));
  return { x, y, w, h };
}

export type TextTemplateId = "title" | "promo" | "bottom_banner" | "centered_plate" | "plain";

export function createTextLayerFromTemplate(
  template: TextTemplateId,
  outW: number,
  outH: number,
  layerIndex = 0
): TextOverlayLayer {
  const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nudgeY = Math.min(0.06 * layerIndex, 0.2);

  if (template === "title") {
    return {
      id,
      kind: "text",
      text: "The Reapers — Issue #1",
      fontKey: "editorial",
      fontSize: 52,
      textColor: "#ffffff",
      strokeWidth: 2,
      strokeColor: "rgba(0,0,0,0.6)",
      plate: "none",
      plateOpacity: 0,
      rect: clampRect({ x: 0.08, y: 0.06 + nudgeY, w: 0.84, h: 0.12 })
    };
  }
  if (template === "promo") {
    return {
      id,
      kind: "text",
      text: "30% OFF",
      fontKey: "impact",
      fontSize: 54,
      textColor: "#ffffff",
      strokeWidth: 2,
      strokeColor: "rgba(0,0,0,0.55)",
      plate: "pill",
      plateOpacity: 0.85,
      rect: clampRect({ x: 0.16, y: 0.36 + nudgeY, w: 0.68, h: 0.14 })
    };
  }
  if (template === "bottom_banner") {
    return {
      id,
      kind: "text",
      text: "SAMPLE TEXT — PATREON.COM/YOU",
      fontKey: "minimal",
      fontSize: 42,
      textColor: "#ffffff",
      strokeWidth: 3,
      strokeColor: "rgba(0,0,0,0.65)",
      plate: "banner",
      plateOpacity: 0.72,
      rect: clampRect({ x: 0, y: 0.88 - nudgeY, w: 1, h: 0.12 })
    };
  }
  if (template === "centered_plate") {
    return {
      id,
      kind: "text",
      text: "NEW POST",
      fontKey: "minimal",
      fontSize: 48,
      textColor: "#ffffff",
      strokeWidth: 0,
      strokeColor: "rgba(0,0,0,0.65)",
      plate: "pill",
      plateOpacity: 0.75,
      rect: clampRect({ x: 0.12, y: 0.4 + nudgeY, w: 0.76, h: 0.14 })
    };
  }
  return {
    id,
    kind: "text",
    text: "PATREON.COM/YOU",
    fontKey: "minimal",
    fontSize: 44,
    textColor: "#ffffff",
    strokeWidth: 4,
    strokeColor: "rgba(0,0,0,0.7)",
    plate: "none",
    plateOpacity: 0,
    rect: clampRect({ x: 0.05, y: 0.82 - nudgeY, w: 0.9, h: 0.1 })
  };
}

export function createLogoLayer(item: LogoBucketItem, outW: number, outH: number): LogoOverlayLayer {
  const sizeW = 0.14;
  const y = 0.82 - sizeW * (outW / outH);
  return {
    id: newLayerId("logo"),
    kind: "logo",
    assetId: item.id,
    label: item.label,
    src: item.src,
    opacity: 0.95,
    rect: squareLogoRect(0.04, Math.max(0.04, y), sizeW, outW, outH)
  };
}

/** @deprecated Templates use platform_lockup graphic layers instead. */
export function createPlatformLockupLayers(
  platform: "deviantart" | "patreon" | "x" | "bluesky",
  urlText: string,
  aspectKey: AspectRatioKey,
  outW: number,
  outH: number,
  options?: { role?: "primary" | "action" }
): Pick<OverlayDocument, "textLayers" | "logoLayers"> {
  const zones = SAFE_ZONE_RECTS[aspectKey];
  const logoItem = getBundledLogo(platform);
  const logoSizeW = zones.logoLockup.w;
  const logoY = zones.logoLockup.y;
  const isAction = options?.role === "action";
  return {
    logoLayers: [
      {
        id: newLayerId("logo"),
        kind: "logo",
        assetId: logoItem.id,
        label: logoItem.label,
        src: logoItem.src,
        opacity: isAction ? 0.88 : 0.95,
        rect: clampRect(squareLogoRect(zones.logoLockup.x, logoY, logoSizeW, outW, outH))
      }
    ],
    textLayers: [
      {
        id: newLayerId("text"),
        kind: "text",
        text: urlText,
        fontKey: "minimal",
        fontSize: isAction ? 34 : 40,
        textColor: "#ffffff",
        strokeWidth: isAction ? 1 : 2,
        strokeColor: "rgba(0,0,0,0.65)",
        plate: "banner",
        plateOpacity: isAction ? 0.58 : 0.72,
        rect: clampRect(zones.bottomBand)
      }
    ]
  };
}

export function createRelayWatermarkLayer(
  aspectKey: AspectRatioKey,
  outW: number,
  outH: number
): LogoOverlayLayer {
  const zones = SAFE_ZONE_RECTS[aspectKey];
  const sizeW = zones.watermark.w;
  return {
    id: newLayerId("logo"),
    kind: "logo",
    assetId: RELAY_WATERMARK_LOGO.id,
    label: RELAY_WATERMARK_LOGO.label,
    src: RELAY_WATERMARK_LOGO.src,
    opacity: 0.35,
    rect: clampRect(squareLogoRect(zones.watermark.x, zones.watermark.y, sizeW, outW, outH))
  };
}

export function createRelayWatermarkTextLayer(aspectKey: AspectRatioKey): TextOverlayLayer {
  const zones = SAFE_ZONE_RECTS[aspectKey];
  return {
    id: newLayerId("text"),
    kind: "text",
    text: "via Relay",
    fontKey: "mono",
    fontSize: 22,
    textColor: "#ffffff",
    strokeWidth: 0,
    strokeColor: "rgba(0,0,0,0.5)",
    plate: "none",
    plateOpacity: 0,
    rect: clampRect(zones.watermark)
  };
}

function rectToPixels(rect: NormalizedRect, out: OutputSize) {
  return {
    x: rect.x * out.width,
    y: rect.y * out.height,
    w: rect.w * out.width,
    h: rect.h * out.height
  };
}

function fontSizeForTextLayer(layer: TextOverlayLayer, out: OutputSize): number {
  const px = rectToPixels(layer.rect, out);
  const refH = 0.12 * out.height;
  const scale = px.h / refH;
  return Math.max(16, Math.round(layer.fontSize * scale));
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextOverlayLayer, out: OutputSize): void {
  if (!layer.text.trim()) return;
  const px = rectToPixels(layer.rect, out);
  const fontStack = FONT_PRESETS[layer.fontKey].stack;
  const size = fontSizeForTextLayer(layer, out);

  if (layer.plate === "banner") {
    ctx.fillStyle = `rgba(0, 0, 0, ${layer.plateOpacity})`;
    ctx.fillRect(px.x, px.y, px.w, px.h);
  } else if (layer.plate === "pill") {
    ctx.fillStyle = `rgba(0, 0, 0, ${layer.plateOpacity})`;
    ctx.beginPath();
    ctx.roundRect(px.x, px.y, px.w, px.h, Math.min(px.h / 2, 20));
    ctx.fill();
  }

  ctx.font = `700 ${size}px ${fontStack}`;
  if (DISPLAY_FONT_KEYS.includes(layer.fontKey)) {
    ctx.letterSpacing = `${Math.max(1, Math.round(size * 0.04))}px`;
  } else {
    ctx.letterSpacing = "0px";
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = px.x + px.w / 2;
  const cy = px.y + px.h / 2;
  if (layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth;
    ctx.strokeText(layer.text, cx, cy);
  }
  ctx.fillStyle = layer.textColor;
  ctx.fillText(layer.text, cx, cy);
}

function drawLogoLayer(
  ctx: CanvasRenderingContext2D,
  layer: LogoOverlayLayer,
  out: OutputSize,
  img: HTMLImageElement | null
): void {
  if (!img) return;
  const px = rectToPixels(layer.rect, out);
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.drawImage(img, px.x, px.y, px.w, px.h);
  ctx.restore();
}

function drawGraphicLayer(): void {
  /* Graphics render via v0 React overlay — see PreviewizerStudioCanvas. */
}

export function applyOverlayDocument(
  ctx: CanvasRenderingContext2D,
  out: OutputSize,
  doc: OverlayDocument,
  logoImages: Map<string, HTMLImageElement>,
  options?: { includeGraphics?: boolean }
): void {
  for (const layer of doc.textLayers) {
    drawTextLayer(ctx, layer, out);
  }
  if (options?.includeGraphics) {
    for (const layer of doc.graphicLayers ?? []) {
      void layer;
      drawGraphicLayer();
    }
  }
  for (const layer of doc.logoLayers) {
    drawLogoLayer(ctx, layer, out, logoImages.get(layer.src) ?? null);
  }
}

export function getAllLayers(doc: OverlayDocument): OverlayLayer[] {
  return [...doc.textLayers, ...(doc.graphicLayers ?? []), ...doc.logoLayers];
}

export function findLayer(doc: OverlayDocument, id: string | null): OverlayLayer | null {
  if (!id) return null;
  const text = doc.textLayers.find((l) => l.id === id);
  if (text) return text;
  const graphic = (doc.graphicLayers ?? []).find((l) => l.id === id);
  if (graphic) return graphic;
  return doc.logoLayers.find((l) => l.id === id) ?? null;
}

/** Keep logo square in pixel space when resizing. */
export function uniformSquareLogoRect(
  rect: NormalizedRect,
  outW: number,
  outH: number,
  anchor: "se" | "nw" = "se"
): NormalizedRect {
  const aspect = outW / outH;
  const w = rect.w;
  const h = w * aspect;
  if (anchor === "se") {
    return clampRect({ x: rect.x, y: rect.y, w, h });
  }
  return clampRect({ x: rect.x + rect.w - w, y: rect.y + rect.h - h, w, h });
}
