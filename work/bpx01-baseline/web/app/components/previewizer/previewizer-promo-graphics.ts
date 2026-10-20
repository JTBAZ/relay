/**
 * Canva-style promo graphic shells — Canvas 2D renderers ported from v0 SVG shells.
 * Each graphic draws in a 200×200 unit space, scaled to the layer rect.
 */

import type { FontPresetKey } from "./previewizer-overlay-layers";
import type { OutputSize } from "./previewizer-presets";

const FONT_STACKS: Record<FontPresetKey, string> = {
  editorial: "'Georgia', 'Times New Roman', serif",
  minimal: "'Inter', system-ui, sans-serif",
  warm: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  mono: "'Courier New', Courier, monospace",
  impact: "'Bebas Neue', Impact, 'Arial Black', 'Helvetica Neue', sans-serif",
  condensed: "'Oswald', 'Arial Narrow', 'Helvetica Neue', sans-serif"
};

export type PromoGraphicId =
  | "sale_burst"
  | "sticker_outline"
  | "corner_ribbon"
  | "ghost_tag"
  | "split_banner"
  | "stamp_mono"
  | "flash_pill"
  | "platform_card";

export type GraphicAnchor = "center" | "top-left";

export type PromoGraphicMeta = {
  id: PromoGraphicId;
  name: string;
  desc: string;
  defaultFont: FontPresetKey;
  anchor: GraphicAnchor;
  group: "sale" | "soft";
};

export const PROMO_GRAPHIC_META: Record<PromoGraphicId, PromoGraphicMeta> = {
  sale_burst: {
    id: "sale_burst",
    name: "Flash Sale",
    desc: "14-pt starburst shell",
    defaultFont: "impact",
    anchor: "center",
    group: "sale"
  },
  sticker_outline: {
    id: "sticker_outline",
    name: "Sticker",
    desc: "White sticker + green border",
    defaultFont: "impact",
    anchor: "center",
    group: "sale"
  },
  corner_ribbon: {
    id: "corner_ribbon",
    name: "Corner Drop",
    desc: "Top-left ribbon band",
    defaultFont: "condensed",
    anchor: "top-left",
    group: "sale"
  },
  flash_pill: {
    id: "flash_pill",
    name: "Classic Pill",
    desc: "Dark pill + outer ring",
    defaultFont: "impact",
    anchor: "center",
    group: "sale"
  },
  ghost_tag: {
    id: "ghost_tag",
    name: "Soft CTA",
    desc: "Outline ghost pill",
    defaultFont: "minimal",
    anchor: "center",
    group: "soft"
  },
  split_banner: {
    id: "split_banner",
    name: "Editorial",
    desc: "Accent stripe + dark plate",
    defaultFont: "condensed",
    anchor: "center",
    group: "soft"
  },
  stamp_mono: {
    id: "stamp_mono",
    name: "Exclusive Stamp",
    desc: "Dashed mono stamp",
    defaultFont: "mono",
    anchor: "center",
    group: "soft"
  },
  platform_card: {
    id: "platform_card",
    name: "Platform Card",
    desc: "Logo dot + URL card",
    defaultFont: "minimal",
    anchor: "center",
    group: "soft"
  }
};

export const PROMO_GRAPHIC_GROUPS: { label: string; ids: PromoGraphicId[] }[] = [
  {
    label: "Sale graphics",
    ids: ["sale_burst", "sticker_outline", "corner_ribbon", "flash_pill"]
  },
  {
    label: "Soft CTAs",
    ids: ["ghost_tag", "split_banner", "stamp_mono", "platform_card"]
  }
];

const DISPLAY_FONT_KEYS: FontPresetKey[] = ["impact", "condensed"];
const VIEW = 200;

type PixelRect = { x: number; y: number; w: number; h: number };

function burstPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
  angleOffset = 0
): Path2D {
  const path = new Path2D();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2 + angleOffset;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function withGraphicSpace(
  ctx: CanvasRenderingContext2D,
  px: PixelRect,
  anchor: GraphicAnchor,
  fn: (ctx: CanvasRenderingContext2D) => void
): void {
  ctx.save();
  const scale = Math.min(px.w / VIEW, px.h / VIEW);
  if (anchor === "top-left") {
    ctx.translate(px.x, px.y);
    ctx.scale(scale, scale);
  } else {
    const tx = px.x + (px.w - VIEW * scale) / 2;
    const ty = px.y + (px.h - VIEW * scale) / 2;
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
  }
  fn(ctx);
  ctx.restore();
}

function drawSaleBurstShell(ctx: CanvasRenderingContext2D): void {
  const cx = 100;
  const cy = 100;
  const outerR = 72;
  const innerR = outerR * 0.8;
  const main = burstPath(cx, cy, outerR, innerR, 14);
  const inner = burstPath(cx, cy, outerR * 0.78, innerR * 0.75, 14);

  ctx.save();
  ctx.translate(6, 9);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill(main);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.stroke(main);

  ctx.fillStyle = "#0e0e0e";
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.8;
  ctx.fill(main);
  ctx.stroke(main);

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1.2;
  ctx.stroke(inner);

  const glow = ctx.createRadialGradient(cx, cy * 0.84, 0, cx, cy, outerR);
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fill(main);
}

function drawStickerOutlineShell(ctx: CanvasRenderingContext2D): void {
  const x = 20;
  const y = 64;
  const w = 160;
  const h = 72;
  const rx = 18;

  ctx.fillStyle = "rgba(0,170,111,0.38)";
  roundRect(ctx, x + 7, y + 7, w, h, rx);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 4;
  roundRect(ctx, x - 6, y - 6, w + 12, h + 12, rx + 6);
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.strokeStyle = "#00aa6f";
  ctx.lineWidth = 5;
  roundRect(ctx, x, y, w, h, rx);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  roundRect(ctx, x, y, w, h * 0.32, rx);
  ctx.fill();

  ctx.fillStyle = "rgba(0,170,111,0.08)";
  ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
}

function drawCornerRibbonShell(ctx: CanvasRenderingContext2D): void {
  const rH = 36;
  const notchX = 162;
  const notchTip = 180;
  const foldW = 24;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, rH, 155, 9);

  ctx.fillStyle = "#007a50";
  ctx.beginPath();
  ctx.moveTo(0, rH);
  ctx.lineTo(0, rH + 20);
  ctx.lineTo(foldW, rH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#00aa6f";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(notchX, 0);
  ctx.lineTo(notchTip, rH / 2);
  ctx.lineTo(notchX, rH);
  ctx.lineTo(0, rH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(notchX, 0);
  ctx.lineTo(notchTip, rH / 2);
  ctx.lineTo(notchX * 0.9, rH * 0.3);
  ctx.lineTo(0, rH * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(notchX, 0);
  ctx.lineTo(notchTip, rH / 2);
  ctx.lineTo(notchX, rH);
  ctx.lineTo(0, rH);
  ctx.closePath();
  ctx.stroke();
}

function drawGhostTagShell(ctx: CanvasRenderingContext2D): void {
  const px = 18;
  const py = 74;
  const pw = 164;
  const ph = 52;
  const pr = 26;

  ctx.strokeStyle = "rgba(155,240,196,0.15)";
  ctx.lineWidth = 6;
  roundRect(ctx, px - 14, py - 14, pw + 28, ph + 28, pr + 14);
  ctx.stroke();

  ctx.strokeStyle = "rgba(155,240,196,0.32)";
  ctx.lineWidth = 2;
  roundRect(ctx, px - 7, py - 7, pw + 14, ph + 14, pr + 7);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 2.5;
  roundRect(ctx, px, py, pw, ph, pr);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  roundRect(ctx, px + 4, py + 3, pw - 8, ph * 0.32, pr - 2);
  ctx.fill();
}

function drawSplitBannerShell(ctx: CanvasRenderingContext2D): void {
  const bY = 66;
  const bH = 68;
  const stripeW = 22;
  const plateX = stripeW;

  ctx.fillStyle = "#9bf0c4";
  ctx.fillRect(0, bY, stripeW, bH);

  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.fillRect(0, bY, stripeW * 0.42, bH);

  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fillRect(plateX, bY, VIEW - plateX, bH);

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plateX, bY);
  ctx.lineTo(VIEW, bY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(plateX, bY + bH);
  ctx.lineTo(VIEW, bY + bH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(plateX, bY);
  ctx.lineTo(plateX, bY + bH);
  ctx.stroke();
}

function drawStampMonoShell(ctx: CanvasRenderingContext2D): void {
  const px = 16;
  const py = 68;
  const pw = 168;
  const ph = 64;
  const pr = 32;

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, px - 10, py - 10, pw + 20, ph + 20, pr + 10);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  roundRect(ctx, px, py, pw, ph, pr);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, px + 6, py + 4, pw - 12, ph * 0.28, pr - 4);
  ctx.fill();

  for (const pos of [
    { cx: 22, cy: 22 },
    { cx: 178, cy: 22 }
  ]) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pos.cx, pos.cy, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFlashPillShell(ctx: CanvasRenderingContext2D): void {
  const px = 16;
  const py = 72;
  const pw = 168;
  const ph = 56;
  const pr = 28;

  ctx.fillStyle = "rgba(0,0,0,0.52)";
  roundRect(ctx, px + 5, py + 8, pw, ph, pr);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  roundRect(ctx, px - 6, py - 6, pw + 12, ph + 12, pr + 6);
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, px, py, pw, ph, pr);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, px + 5, py + 4, pw - 10, ph * 0.3, pr - 2);
  ctx.fill();
}

function drawPlatformCardShell(ctx: CanvasRenderingContext2D, accent = "#FF424D"): void {
  const cx = 16;
  const cy = 68;
  const cw = 168;
  const ch = 64;
  const cr = 14;
  const dotCx = 48;
  const dotCy = 100;
  const dotR = 18;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, cx + 5, cy + 7, cw, ch, cr);
  ctx.fill();

  ctx.fillStyle = "rgba(17,17,17,0.92)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx, cy, cw, ch, cr);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, cx, cy, cw, ch * 0.22, cr);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, dotR + 3.5, 0, Math.PI * 2);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawShell(ctx: CanvasRenderingContext2D, graphicId: PromoGraphicId): void {
  switch (graphicId) {
    case "sale_burst":
      drawSaleBurstShell(ctx);
      break;
    case "sticker_outline":
      drawStickerOutlineShell(ctx);
      break;
    case "corner_ribbon":
      drawCornerRibbonShell(ctx);
      break;
    case "ghost_tag":
      drawGhostTagShell(ctx);
      break;
    case "split_banner":
      drawSplitBannerShell(ctx);
      break;
    case "stamp_mono":
      drawStampMonoShell(ctx);
      break;
    case "flash_pill":
      drawFlashPillShell(ctx);
      break;
    case "platform_card":
      drawPlatformCardShell(ctx);
      break;
  }
}

function textColorForGraphic(graphicId: PromoGraphicId): string {
  if (graphicId === "sticker_outline") return "#0e0e0e";
  if (graphicId === "ghost_tag") return "#9bf0c4";
  return "#ffffff";
}

function shouldUppercase(graphicId: PromoGraphicId, fontKey: FontPresetKey): boolean {
  if (graphicId === "ghost_tag" && fontKey === "minimal") return false;
  return fontKey !== "minimal" && fontKey !== "warm";
}

function textAnchorForGraphic(graphicId: PromoGraphicId): { x: number; y: number; align: CanvasTextAlign } {
  switch (graphicId) {
    case "corner_ribbon":
      return { x: 28, y: 18, align: "left" };
    case "split_banner":
      return { x: 36, y: 108, align: "left" };
    case "platform_card":
      return { x: 78, y: 96, align: "left" };
    default:
      return { x: 100, y: 100, align: "center" };
  }
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  baseSize: number,
  maxWidth: number,
  minSize = 14
): number {
  let size = baseSize;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
  }
  return size;
}

export type GraphicDrawLayer = {
  graphicId: PromoGraphicId;
  text: string;
  fontKey: FontPresetKey;
  fontSize: number;
  anchor?: GraphicAnchor;
};

export function fontSizeForGraphicLayer(
  layer: GraphicDrawLayer,
  px: PixelRect,
  out: OutputSize
): number {
  const refH = 0.14 * out.height;
  const scale = px.h / refH;
  return Math.max(14, Math.round(layer.fontSize * scale));
}

export function drawPromoGraphic(
  ctx: CanvasRenderingContext2D,
  layer: GraphicDrawLayer,
  px: PixelRect,
  out: OutputSize
): void {
  if (!layer.text.trim()) return;
  const meta = PROMO_GRAPHIC_META[layer.graphicId];
  const anchor = layer.anchor ?? meta.anchor;

  withGraphicSpace(ctx, px, anchor, (gctx) => {
    drawShell(gctx, layer.graphicId);
  });

  const fontStack = FONT_STACKS[layer.fontKey];
  let displayText = layer.text;
  if (shouldUppercase(layer.graphicId, layer.fontKey)) {
    displayText = displayText.toUpperCase();
  }

  const baseSize = fontSizeForGraphicLayer(layer, px, out);
  const anchorPt = textAnchorForGraphic(layer.graphicId);

  withGraphicSpace(ctx, px, anchor, (gctx) => {
    gctx.font = `700 ${baseSize}px ${fontStack}`;
    if (DISPLAY_FONT_KEYS.includes(layer.fontKey)) {
      gctx.letterSpacing = `${Math.max(1, Math.round(baseSize * 0.04))}px`;
    }

    const maxWidth =
      layer.graphicId === "split_banner"
        ? 150
        : layer.graphicId === "corner_ribbon"
          ? 130
          : layer.graphicId === "sticker_outline"
            ? 140
            : 120;
    const size = fitFontSize(gctx, displayText, baseSize, maxWidth * (px.w / VIEW));
    gctx.font = `700 ${size}px ${fontStack}`;

    gctx.textAlign = anchorPt.align;
    gctx.textBaseline = "middle";
    const color = textColorForGraphic(layer.graphicId);

    if (layer.graphicId === "split_banner") {
      gctx.font = `600 ${Math.max(10, Math.round(size * 0.35))}px ${FONT_STACKS.minimal}`;
      gctx.fillStyle = "#9bf0c4";
      gctx.fillText("NEW ISSUE", anchorPt.x, anchorPt.y - size * 0.55);
      gctx.font = `700 ${size}px ${fontStack}`;
    }

    if (layer.graphicId === "stamp_mono") {
      gctx.font = `700 ${Math.max(10, Math.round(size * 0.45))}px ${FONT_STACKS.mono}`;
      gctx.fillStyle = "rgba(155,240,196,0.65)";
      gctx.fillText("EXCLUSIVE", anchorPt.x, anchorPt.y - size * 0.65);
      gctx.font = `700 ${size}px ${fontStack}`;
    }

    gctx.strokeStyle = layer.graphicId === "sticker_outline" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.45)";
    gctx.lineWidth = Math.max(0.5, size * 0.04);
    gctx.strokeText(displayText, anchorPt.x, anchorPt.y);
    gctx.fillStyle = color;
    gctx.fillText(displayText, anchorPt.x, anchorPt.y);
  });
}

/** Draw a thumbnail preview for the preset picker (square canvas). */
export function drawPromoGraphicThumbnail(
  ctx: CanvasRenderingContext2D,
  graphicId: PromoGraphicId,
  text: string,
  size: number
): void {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#1a1025");
  grad.addColorStop(1, "#0d1a15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const meta = PROMO_GRAPHIC_META[graphicId];
  drawPromoGraphic(
    ctx,
    {
      graphicId,
      text: text || "30% OFF",
      fontKey: meta.defaultFont,
      fontSize: 48,
      anchor: meta.anchor
    },
    { x: size * 0.05, y: size * 0.05, w: size * 0.9, h: size * 0.9 },
    { width: size, height: size }
  );
}
