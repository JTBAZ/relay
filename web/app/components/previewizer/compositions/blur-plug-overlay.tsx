"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

import {
  blurPlugExportBlurPx,
  paintBlurPlugCssBlur
} from "./blur-plug-export-paint";
import { PreviewizerQrBadge } from "./previewizer-qr-badge";
import {
  BLUR_PLUG_QR_LAYER_ID,
  normalizeBlurPlugQrStamp,
  type BlurPlugQrStamp
} from "../previewizer-template-compositions";

export type BlurType = "gaussian" | "pixelated" | "zoom" | "none";
export type BlurPlugPlatform = "patreon" | "deviantart" | "bluesky" | "twitter";
export type RevealShape = "none" | "circle" | "rect" | "diamond";
export type BorderEffectId =
  | "frame"
  | "film"
  | "glow"
  | "brackets"
  | "vignette"
  | "confetti";
export type BorderStyle = BorderEffectId | "none";
export type StampStyleId =
  | "members_only"
  | "eighteen_plus"
  | "blank_bar"
  | "nsfw";
export type StampFontId =
  | "system"
  | "impact"
  | "condensed"
  | "mono"
  | "editorial";

export type StampNsfwVariant =
  | "alert"
  | "blackout"
  | "hazard"
  | "neon"
  | "ink";

export type StampEighteenVariant =
  | "classic"
  | "crimson"
  | "badge"
  | "mature"
  | "outline";

export type StampVariantId = StampNsfwVariant | StampEighteenVariant;

export type BlurPlugStampItem = {
  id: string;
  style: StampStyleId;
  x: number;
  y: number;
  size: number;
  rotation: number;
  font?: StampFontId;
  variant?: StampVariantId;
};

const STAMP_FONT_STACKS: Record<StampFontId, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  impact: "var(--font-bebas-neue, 'Bebas Neue'), Impact, 'Arial Black', sans-serif",
  condensed: "'Oswald', 'Arial Narrow', 'Helvetica Neue', sans-serif",
  mono: "'Courier New', Courier, monospace",
  editorial: "var(--font-playfair, 'Playfair Display'), Georgia, 'Times New Roman', serif"
};

export type TextSize = "xsmall" | "small" | "medium" | "large";
export type Anchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface BlurPlugOverlayProps {
  imageSrc: string;
  blurType?: BlurType;
  handle?: string;
  label?: string;
  platform?: BlurPlugPlatform;
  anchor?: Anchor;
  revealShape?: RevealShape;
  revealSize?: number;
  revealX?: number;
  revealY?: number;
  revealFeather?: number;
  /** Crisp reveal layer opacity 0–100. */
  revealOpacity?: number;
  /** Destination QR PNG data URL (optional). */
  qrSrc?: string | null;
  /** Free-placed QR stamp (position + S/M/L). */
  qrStamp?: BlurPlugQrStamp | null;
  /** @deprecated Prefer borderStyles. */
  borderStyle?: BorderStyle;
  /** Active border effects — multiple can be on at once. */
  borderStyles?: BorderEffectId[];
  /** Placeable censor stamps (simple layer list). */
  stamps?: BlurPlugStampItem[];
  selectedStampId?: string | null;
  onSelectStamp?: (id: string | null) => void;
  onStampMove?: (id: string, x: number, y: number) => void;
  onStampPatch?: (
    id: string,
    patch: Partial<Pick<BlurPlugStampItem, "size" | "rotation" | "font" | "variant">>
  ) => void;
  onStampMoveEnd?: () => void;
  labelSize?: TextSize;
  handleSize?: TextSize;
  exportMode?: boolean;
  /** Fired once the export-critical photo layer is painted/loaded. */
  onExportReady?: () => void;
  /** Focal point for cover-crop (0–100). Ignored when cropRect is set. */
  focalX?: number;
  focalY?: number;
  /** Aspect-locked selection box on the full source (0–1). Preferred framing mode. */
  cropRect?: { x: number; y: number; w: number; h: number } | null;
  /** Mosaic cell size in CSS px (pixelated mode). */
  pixelSize?: number;
  /** Blur / mosaic effect opacity 0–100. */
  blurOpacity?: number;
  /** Vignette clear-center size 0–100 (when vignette is active). */
  vignetteSize?: number;
  /** Vignette edge darkness 0–100 (when vignette is active). */
  vignetteIntensity?: number;
  /** Inner glow hue 0–360 (when glow is active). */
  glowHue?: number;
}

type MosaicCrop = { x: number; y: number; w: number; h: number };

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // blob:/data: are same-origin; forcing anonymous CORS can break decode.
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load mosaic source"));
    img.src = src;
  });
}

function paintSoftMosaic(args: {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  width: number;
  height: number;
  cellPx: number;
  zoom: number;
  crop: MosaicCrop | null;
  focalX: number;
  focalY: number;
}): boolean {
  const { canvas, img, width: w, height: h, cellPx, zoom, crop, focalX, focalY } = args;
  if (w < 2 || h < 2 || img.naturalWidth < 1) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const full = document.createElement("canvas");
  full.width = Math.max(1, Math.round(w));
  full.height = Math.max(1, Math.round(h));
  const fctx = full.getContext("2d");
  if (!fctx) return false;

  if (crop) {
    const sx = crop.x * img.naturalWidth;
    const sy = crop.y * img.naturalHeight;
    const sw = Math.max(1, crop.w * img.naturalWidth);
    const sh = Math.max(1, crop.h * img.naturalHeight);
    const dw = w * zoom;
    const dh = h * zoom;
    fctx.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const fx = Math.max(0, Math.min(100, focalX)) / 100;
    const fy = Math.max(0, Math.min(100, focalY)) / 100;
    const ox = (w - drawW) * fx;
    const oy = (h - drawH) * fy;
    fctx.drawImage(img, ox, oy, drawW, drawH);
  }

  const cell = cellPx;
  const soften = Math.max(2, Math.round(cell * 0.45));
  const soft = document.createElement("canvas");
  soft.width = full.width;
  soft.height = full.height;
  const sctx = soft.getContext("2d");
  if (!sctx) return false;
  sctx.filter = `blur(${soften}px)`;
  sctx.drawImage(full, 0, 0);
  sctx.filter = "none";

  const cols = Math.max(2, Math.ceil(w / cell));
  const rows = Math.max(2, Math.ceil(h / cell));
  const tiny = document.createElement("canvas");
  tiny.width = cols;
  tiny.height = rows;
  const tctx = tiny.getContext("2d");
  if (!tctx) return false;
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(soft, 0, 0, soft.width, soft.height, 0, 0, cols, rows);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, cols, rows, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  return true;
}

// ── Deterministic confetti particles (seeded LCG so SSR and client match) ──
function makeConfetti(count: number) {
  let seed = 20240607
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const colors = ["#7C3AED", "#14B8A6", "#FB923C", "#F472B6", "#FACC15", "#ffffff"]
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: 4 + rand() * 9,
    rot: rand() * 360,
    color: colors[Math.floor(rand() * colors.length)],
    round: rand() > 0.5,
  }))
}
const CONFETTI = makeConfetti(46)

// ── Platform logos (monochrome, 24×24 viewBox unless noted) ──
function PlatformLogo({ platform, className }: { platform: BlurPlugPlatform; className?: string }) {
  const common = {
    className,
    "aria-hidden": true as const,
    style: { display: "block", width: "100%", height: "100%" },
  }
  switch (platform) {
    case "patreon":
      return (
        <svg viewBox="0 0 109 118" fill="currentColor" {...common}>
          <rect x="16" y="20" width="16" height="78" rx="4" />
          <circle cx="68" cy="42" r="27" />
        </svg>
      )
    case "deviantart":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...common}>
          <path d="M19.207 4.794l.23-.43V0H15.07l-.436.44-2.058 3.925-.646.436H4.793v5.702h4.46l.42.418-4.88 9.386-.24.43V24H8.93l.436-.44 2.07-3.925.644-.436h7.126v-5.702h-4.47l-.42-.418 4.88-9.386z" />
        </svg>
      )
    case "bluesky":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...common}>
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364C23.622 9.418 24 4.458 24 3.768c0-.69-.139-1.86-.902-2.203-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
        </svg>
      )
    case "twitter":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...common}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
  }
}

// ── Anchor → flex alignment map ──
const ANCHORS: Record<Anchor, { justify: string; align: string; text: "left" | "center" | "right" }> = {
  "top-left": { justify: "flex-start", align: "flex-start", text: "left" },
  "top-center": { justify: "flex-start", align: "center", text: "center" },
  "top-right": { justify: "flex-start", align: "flex-end", text: "right" },
  "middle-left": { justify: "center", align: "flex-start", text: "left" },
  "middle-center": { justify: "center", align: "center", text: "center" },
  "middle-right": { justify: "center", align: "flex-end", text: "right" },
  "bottom-left": { justify: "flex-end", align: "flex-start", text: "left" },
  "bottom-center": { justify: "flex-end", align: "center", text: "center" },
  "bottom-right": { justify: "flex-end", align: "flex-end", text: "right" },
}

/**
 * Aspect-correct reveal mask styles. Size is % of the shorter side (cqmin),
 * matching the minimap — Circle stays round on 9:16.
 */
function buildRevealMaskStyle(
  shape: Exclude<RevealShape, "none">,
  x: number,
  y: number,
  size: number,
  feather: number
): CSSProperties {
  const cx = `${Math.max(0, Math.min(100, x))}%`;
  const cy = `${Math.max(0, Math.min(100, y))}%`;
  const r = Math.max(1, Math.min(100, size));
  const soft = Math.max(0, Math.min(100, feather)) / 100;
  const solidPct = Math.max(0, 100 - soft * 55);

  const applyMask = (image: string, sized = false): CSSProperties => ({
    WebkitMaskImage: image,
    maskImage: image,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    ...(sized
      ? {
          WebkitMaskSize: `${r * 2}cqmin ${r * 2}cqmin`,
          maskSize: `${r * 2}cqmin ${r * 2}cqmin`,
          WebkitMaskPosition: `${cx} ${cy}`,
          maskPosition: `${cx} ${cy}`
        }
      : {
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%"
        })
  });

  if (shape === "circle") {
    return applyMask(
      `radial-gradient(circle ${r}cqmin at ${cx} ${cy}, #fff ${solidPct}%, transparent 100%)`
    );
  }

  if (shape === "rect") {
    // Axis-aligned square from shorter side (not a tall strip on 9:16)
    const image =
      soft < 0.02
        ? "linear-gradient(#fff 0 0)"
        : `radial-gradient(closest-side, #fff ${solidPct}%, transparent 100%)`;
    return applyMask(image, true);
  }

  // Diamond: cqmin clip-path (true geometry) + soft circular falloff when feathered
  const diamondClip = `polygon(${cx} calc(${cy} - ${r}cqmin), calc(${cx} + ${r}cqmin) ${cy}, ${cx} calc(${cy} + ${r}cqmin), calc(${cx} - ${r}cqmin) ${cy})`;
  if (soft < 0.02) {
    return { clipPath: diamondClip, WebkitClipPath: diamondClip };
  }
  return {
    clipPath: diamondClip,
    WebkitClipPath: diamondClip,
    ...applyMask(
      `radial-gradient(circle ${r}cqmin at ${cx} ${cy}, #fff ${solidPct}%, transparent 100%)`
    )
  };
}

// ── Aesthetic border effects (rendered on top, non-interactive) ──
function buildVignetteBackground(size: number, intensity: number): string {
  const s = Math.max(0, Math.min(100, size)) / 100;
  const t = Math.max(0, Math.min(100, intensity)) / 100;

  // Larger size = larger clear center / softer reach toward edges
  const clearStop = 18 + s * 42;
  const midStop = Math.min(92, clearStop + 18 + (1 - s) * 14);
  const edgeA = 0.25 + t * 0.55;
  const midA = 0.55 + t * 0.35;
  const outerA = 0.72 + t * 0.26;
  const ellipseW = 58 + s * 28;
  const ellipseH = 52 + s * 30;

  return [
    `radial-gradient(ellipse ${ellipseW}% ${ellipseH}% at 50% 48%, transparent 0%, transparent ${clearStop}%, rgba(0,0,0,${edgeA}) ${midStop}%, rgba(0,0,0,${midA}) ${Math.min(98, midStop + 12)}%, rgba(0,0,0,${outerA}) 100%)`,
    `radial-gradient(ellipse 120% 90% at 50% 50%, transparent 35%, rgba(0,0,0,${0.12 + t * 0.28}) 100%)`
  ].join(", ");
}

function buildInnerGlowShadow(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  // Keep the original purple→teal dual-tone offset (~272°) as hue rotates.
  const h2 = (h + 272) % 360;
  return [
    `inset 0 0 clamp(20px,9cqh,72px) clamp(4px,2cqh,16px) hsla(${h}, 83%, 58%, 0.55)`,
    `inset 0 0 clamp(8px,3cqh,26px) hsla(${h2}, 76%, 42%, 0.5)`
  ].join(", ");
}

function BorderEffect({
  style,
  vignetteSize = 50,
  vignetteIntensity = 55,
  glowHue = 262
}: {
  style: BorderEffectId;
  vignetteSize?: number;
  vignetteIntensity?: number;
  glowHue?: number;
}) {
  if (style === "confetti") {
    return (
      <div style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        {CONFETTI.map((p, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size * (p.round ? 1 : 0.5)}px`,
              background: p.color,
              borderRadius: p.round ? "50%" : "1px",
              transform: `rotate(${p.rot}deg)`,
              opacity: 0.9,
              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            }}
          />
        ))}
      </div>
    );
  }

  if (style === "vignette") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: buildVignetteBackground(vignetteSize, vignetteIntensity),
          pointerEvents: "none"
        }}
        aria-hidden="true"
      />
    );
  }

  if (style === "frame") {
    return (
      <div
        style={{
          position: "absolute",
          inset: "clamp(6px, 2.5cqh, 20px)",
          border: "clamp(1.5px, 0.5cqh, 4px) solid rgba(255,255,255,0.92)",
          borderRadius: "2px",
          boxShadow:
            "inset 0 0 0 clamp(3px,1cqh,8px) rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
    );
  }

  if (style === "glow") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: buildInnerGlowShadow(glowHue),
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
    );
  }

  if (style === "brackets") {
    const armLen = "clamp(20px, 9cqh, 64px)";
    const thick = "clamp(2px, 0.7cqh, 5px)";
    const off = "clamp(10px, 4cqh, 30px)";
    const corner = (pos: "tl" | "tr" | "bl" | "br") => {
      const isTop = pos === "tl" || pos === "tr";
      const isLeft = pos === "tl" || pos === "bl";
      return {
        position: "absolute" as const,
        width: armLen,
        height: armLen,
        [isTop ? "top" : "bottom"]: off,
        [isLeft ? "left" : "right"]: off,
        [isTop ? "borderTop" : "borderBottom"]: `${thick} solid rgba(255,255,255,0.95)`,
        [isLeft ? "borderLeft" : "borderRight"]: `${thick} solid rgba(255,255,255,0.95)`,
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))",
      };
    };
    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
        <span style={corner("tl")} />
        <span style={corner("tr")} />
        <span style={corner("bl")} />
        <span style={corner("br")} />
      </div>
    );
  }

  // film strip — dark bars top & bottom with perforation holes
  const perforations = Array.from({ length: 10 });
  const bar = (edge: "top" | "bottom") => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [edge]: 0,
        height: "clamp(14px, 6cqh, 44px)",
        background: "#0d0d0d",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 clamp(4px,1.5cqh,12px)",
      }}
    >
      {perforations.map((_, i) => (
        <span
          key={i}
          style={{
            width: "clamp(6px, 2.4cqh, 18px)",
            height: "clamp(8px, 3cqh, 22px)",
            background: "#e8e8e8",
            borderRadius: "clamp(1px,0.5cqh,3px)",
          }}
        />
      ))}
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
      {bar("top")}
      {bar("bottom")}
    </div>
  );
}

function stampScale(size: number) {
  // CSS/text stamps stay crisp under transform scale — allow up to ~3.6× (size 100).
  return Math.max(0.35, Math.min(3.6, size / 28));
}

const STAMP_SIZE_MIN = 8;
const STAMP_SIZE_MAX = 100;

const STAMP_FONT_CHIPS: StampFontId[] = [
  "system",
  "impact",
  "condensed",
  "mono",
  "editorial"
];

const STAMP_FONT_CHIP_LABELS: Record<StampFontId, string> = {
  system: "System",
  impact: "Bold Display",
  condensed: "Condensed",
  mono: "Mono",
  editorial: "Classic"
};

function resolveEighteenVariant(variant?: StampVariantId): StampEighteenVariant {
  // Style variants parked for later — always render baseline classic.
  void variant;
  return "classic";
}

function resolveNsfwVariant(variant?: StampVariantId): StampNsfwVariant {
  // Style variants parked for later — always render baseline alert.
  void variant;
  return "alert";
}

/** Approximate unscaled stamp box — chrome sits outside scale() so handles stay clickable. */
function approxStampDims(stamp: BlurPlugStampItem): { w: number; h: number } {
  const s = stampScale(stamp.size);
  if (stamp.style === "eighteen_plus") {
    return { w: Math.round(84 * s), h: Math.round(84 * s) };
  }
  switch (stamp.style) {
    case "blank_bar":
      return { w: Math.round(168 * s), h: Math.round(40 * s) };
    case "nsfw":
      return { w: Math.round(108 * s), h: Math.round(44 * s) };
    default:
      return { w: Math.round(168 * s), h: Math.round(48 * s) };
  }
}

function clampStampSize(n: number) {
  return Math.max(STAMP_SIZE_MIN, Math.min(STAMP_SIZE_MAX, Math.round(n)));
}

function clampStampRotation(n: number) {
  return Math.max(-45, Math.min(45, Math.round(n)));
}

function stampCenterClient(root: HTMLElement, stamp: BlurPlugStampItem) {
  const rect = root.getBoundingClientRect();
  return {
    cx: rect.left + (stamp.x / 100) * rect.width,
    cy: rect.top + (stamp.y / 100) * rect.height,
    root
  };
}

const HANDLE_STYLE: CSSProperties = {
  position: "absolute",
  width: 14,
  height: 14,
  borderRadius: 999,
  background: "#a78bfa",
  border: "2px solid #fff",
  boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
  pointerEvents: "auto",
  touchAction: "none",
  boxSizing: "border-box",
  zIndex: 2
};

/** Compact Photoshop-style rotate cursor (dark fill, white outline — normal tool size). */
const ROTATE_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M5.2 15.2c2.6-5.2 10.9-5.2 13.5 0" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M5.2 15.2 3.1 11.8l3.9.55z" fill="#fff"/>
  <path d="M18.7 15.2 20.8 11.8l-3.9.55z" fill="#fff"/>
  <path d="M5.2 15.2c2.6-5.2 10.9-5.2 13.5 0" stroke="#2a2a2a" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M5.2 15.2 3.6 12.5l2.9.4z" fill="#2a2a2a"/>
  <path d="M18.7 15.2 20.3 12.5l-2.9.4z" fill="#2a2a2a"/>
</svg>`;

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 12 14, grab`;
const ROTATE_CURSOR_ACTIVE = ROTATE_CURSOR;

function StampEditChrome({
  stamp,
  onPatch,
  onPatchEnd
}: {
  stamp: BlurPlugStampItem;
  onPatch?: (
    id: string,
    patch: Partial<Pick<BlurPlugStampItem, "size" | "rotation" | "font" | "variant">>
  ) => void;
  onPatchEnd?: () => void;
}) {
  const resizeRef = useRef<{
    pointerId: number;
    startDist: number;
    startSize: number;
    cx: number;
    cy: number;
  } | null>(null);
  const rotateRef = useRef<{
    pointerId: number;
    startAngle: number;
    startRotation: number;
    cx: number;
    cy: number;
  } | null>(null);
  const [rotating, setRotating] = useState(false);

  const { w, h } = approxStampDims(stamp);
  const showChipRow = stamp.style !== "blank_bar";
  const activeFont: StampFontId = stamp.font ?? "system";
  // Real box (not 0×0) so overflowing controls stay hit-testable under ancestor transforms.
  // Anchor so the stamp box center stays on (x,y); chips hang below without shifting it.
  const boxTop = 16; // room for rotate handle
  const chipBand = showChipRow ? 40 : 12;
  const chromeW = Math.max(w + 20, showChipRow ? 148 : w + 20);
  const chromeH = boxTop + h + chipBand;
  const boxLeft = (chromeW - w) / 2;

  function applyFont(fontId: StampFontId, e: React.PointerEvent | React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onPatch?.(stamp.id, { font: fontId });
  }

  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!onPatch) return;
    e.stopPropagation();
    e.preventDefault();
    const overlay = e.currentTarget.closest("[data-blur-plug-root]") as HTMLElement | null;
    if (!overlay) return;
    const { cx, cy } = stampCenterClient(overlay, stamp);
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = {
      pointerId: e.pointerId,
      startDist: dist,
      startSize: stamp.size,
      cx,
      cy
    };
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !onPatch) return;
    e.stopPropagation();
    const dist = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
    const next = clampStampSize(drag.startSize + (dist - drag.startDist) * 0.18);
    onPatch(stamp.id, { size: next });
  }

  function onResizeUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    resizeRef.current = null;
    onPatchEnd?.();
  }

  function onRotateDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!onPatch) return;
    e.stopPropagation();
    e.preventDefault();
    const overlay = e.currentTarget.closest("[data-blur-plug-root]") as HTMLElement | null;
    if (!overlay) return;
    const { cx, cy } = stampCenterClient(overlay, stamp);
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    e.currentTarget.setPointerCapture(e.pointerId);
    setRotating(true);
    rotateRef.current = {
      pointerId: e.pointerId,
      startAngle,
      startRotation: stamp.rotation,
      cx,
      cy
    };
  }

  function onRotateMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = rotateRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !onPatch) return;
    e.stopPropagation();
    const angle = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI;
    let delta = angle - drag.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    onPatch(stamp.id, { rotation: clampStampRotation(drag.startRotation + delta) });
  }

  function onRotateUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = rotateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    rotateRef.current = null;
    setRotating(false);
    onPatchEnd?.();
  }

  return (
    <div
      data-stamp-chrome={stamp.id}
      style={{
        position: "absolute",
        left: `${stamp.x}%`,
        top: `${stamp.y}%`,
        width: chromeW,
        height: chromeH,
        transform: `translate(-50%, ${-(boxTop + h / 2)}px)`,
        zIndex: 30,
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: boxLeft,
          top: boxTop,
          width: w,
          height: h,
          transform: `rotate(${stamp.rotation}deg)`,
          transformOrigin: "center center",
          pointerEvents: "none"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -4,
            border: "1.5px solid rgba(167,139,250,0.95)",
            borderRadius: stamp.style === "eighteen_plus" ? "50%" : 8,
            boxSizing: "border-box",
            pointerEvents: "none"
          }}
        />
        {/* Rotate stem */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -22,
            width: 1.5,
            height: 18,
            marginLeft: -0.75,
            background: "rgba(167,139,250,0.9)",
            pointerEvents: "none"
          }}
        />
        <div
          role="slider"
          aria-label="Rotate stamp"
          aria-valuemin={-45}
          aria-valuemax={45}
          aria-valuenow={stamp.rotation}
          onPointerDown={onRotateDown}
          onPointerMove={onRotateMove}
          onPointerUp={onRotateUp}
          onPointerCancel={onRotateUp}
          style={{
            ...HANDLE_STYLE,
            left: "50%",
            top: -28,
            marginLeft: -7,
            marginTop: -7,
            cursor: rotating ? ROTATE_CURSOR_ACTIVE : ROTATE_CURSOR
          }}
        />
        <div
          role="slider"
          aria-label="Resize stamp"
          aria-valuemin={STAMP_SIZE_MIN}
          aria-valuemax={STAMP_SIZE_MAX}
          aria-valuenow={stamp.size}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          style={{
            ...HANDLE_STYLE,
            right: -7,
            bottom: -7,
            borderRadius: 3,
            cursor: "nwse-resize"
          }}
        />
      </div>

      {showChipRow ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 4,
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
            pointerEvents: "auto",
            zIndex: 4,
            padding: "4px 5px",
            borderRadius: 8,
            background: "rgba(12,12,14,0.92)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)"
          }}
        >
          {STAMP_FONT_CHIPS.map((fontId, index) => {
            const active = activeFont === fontId;
            return (
              <button
                key={fontId}
                type="button"
                title={STAMP_FONT_CHIP_LABELS[fontId]}
                aria-label={`Font ${index + 1}: ${STAMP_FONT_CHIP_LABELS[fontId]}`}
                aria-pressed={active}
                onPointerDown={(e) => applyFont(fontId, e)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: active
                    ? "1.5px solid rgba(167,139,250,0.95)"
                    : "1px solid rgba(255,255,255,0.18)",
                  background: active
                    ? "rgba(124,58,237,0.45)"
                    : "rgba(255,255,255,0.06)",
                  color: "#f3f4f6",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 0,
                  pointerEvents: "auto",
                  touchAction: "manipulation"
                }}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function eighteenVariantStyles(variant: StampEighteenVariant): {
  box: CSSProperties;
  font: StampFontId;
  fontWeight: number;
  letterSpacing: number | string;
  color: string;
  textShadow: string;
  label: string;
} {
  const circleBase: CSSProperties = {
    width: "clamp(56px, 16cqh, 112px)",
    height: "clamp(56px, 16cqh, 112px)",
    padding: 0,
    fontSize: "clamp(18px, 5.5cqh, 40px)"
  };

  switch (variant) {
    case "crimson": {
      // Manga panel: slanted frame + speed lines (SVG underlay), heavy comic type
      const panelSvg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" fill="none">
          <defs>
            <pattern id="speed" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(115)">
              <rect width="8" height="8" fill="#b91c1c"/>
              <rect width="3.2" height="8" fill="#ef4444"/>
            </pattern>
          </defs>
          <path d="M14 4 H116 L106 86 H4 Z" fill="#0a0a0a"/>
          <path d="M17 8 H111 L102 82 H8 Z" fill="url(#speed)"/>
          <path d="M17 8 H111 L102 82 H8 Z" stroke="#0a0a0a" stroke-width="2.5" stroke-linejoin="miter"/>
        </svg>`
      );
      return {
        box: {
          width: "clamp(68px, 19cqh, 132px)",
          height: "clamp(50px, 14.5cqh, 100px)",
          padding: 0,
          borderRadius: 0,
          border: "none",
          backgroundColor: "transparent",
          backgroundImage: `url("data:image/svg+xml,${panelSvg}")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "100% 100%",
          boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
          fontSize: "clamp(20px, 6cqh, 44px)",
          paddingTop: "0.04em"
        },
        font: "impact",
        fontWeight: 900,
        letterSpacing: "-0.02em",
        color: "#fff",
        textShadow:
          "1.5px 0 #0a0a0a, -1.5px 0 #0a0a0a, 0 1.5px #0a0a0a, 0 -1.5px #0a0a0a, 2.5px 2.5px 0 #0a0a0a",
        label: "18+"
      };
    }
    case "badge": {
      // v3 target: flatter rounded-square 18+, concentric white+red halo (not drop-shadow),
      // shared crimson outline with heart, type slightly overflowing the heart midsection.
      const glyphs = `
        <g transform="translate(-21.5 0)">
          <rect x="-1.2" y="-10.5" width="8" height="22" rx="2.6"/>
          <rect x="-9.2" y="-10.5" width="9.5" height="6.6" rx="2.6"/>
        </g>
        <g transform="translate(1 0)">
          <path fill-rule="evenodd" d="M-8.2-10.6H8.2c2.8 0 5 2.2 5 5v2.15c0 1.65-.8 3.1-2.15 4 1.35.9 2.15 2.35 2.15 4v2.15c0 2.8-2.2 5-5 5H-8.2c-2.8 0-5-2.2-5-5v-3.9c0-1.65.8-3.1 2.15-4-1.35-.9-2.15-2.35-2.15-4V-5.6c0-2.8 2.2-5 5-5zm2.7 3.95c-.8 0-1.45.65-1.45 1.45v1.5c0 .8.65 1.45 1.45 1.45H5.5c.8 0 1.45-.65 1.45-1.45v-1.5c0-.8-.65-1.45-1.45-1.45H-5.5zm0 10.05c-.8 0-1.45.65-1.45 1.45v1.5c0 .8.65 1.45 1.45 1.45H5.5c.8 0 1.45-.65 1.45-1.45v-1.5c0-.8-.65-1.45-1.45-1.45H-5.5z"/>
        </g>
        <g transform="translate(23.5 0)">
          <path d="M-2.9-8.4h5.8v5.5h5.5v5.8h-5.5v5.5h-5.8v-5.5h-5.5v-5.8h5.5z"/>
        </g>`;
      const markSvg = encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 110">
          <defs>
            <g id="eighteenMark">${glyphs}</g>
          </defs>
          <!-- Heart backing: slightly inset so type can overflow the silhouette -->
          <g transform="translate(60 55) scale(0.64) translate(-50 -46)">
            <path d="M50 86C22 64 6 46 6 28.5 6 15.5 16.5 6 29 6c8.2 0 15.4 4.2 21 12.2C55.6 10.2 62.8 6 71 6 83.5 6 94 15.5 94 28.5 94 46 78 64 50 86Z"
              fill="#f43f5e" stroke="#e11d48" stroke-width="10" stroke-linejoin="round"/>
            <path d="M50 86C22 64 6 46 6 28.5 6 15.5 16.5 6 29 6c8.2 0 15.4 4.2 21 12.2C55.6 10.2 62.8 6 71 6 83.5 6 94 15.5 94 28.5 94 46 78 64 50 86Z"
              fill="#f43f5e" stroke="#fff" stroke-width="5.5" stroke-linejoin="round"/>
          </g>
          <!-- Concentric halo (v3): same origin — crimson outer → white → pink face -->
          <use href="#eighteenMark" xlink:href="#eighteenMark" transform="translate(60 49.5) scale(1.08)" fill="#e11d48"/>
          <use href="#eighteenMark" xlink:href="#eighteenMark" transform="translate(60 49.5) scale(0.98)" fill="#ffffff"/>
          <use href="#eighteenMark" xlink:href="#eighteenMark" transform="translate(60 49.5) scale(0.86)" fill="#ff2d78"/>
        </svg>`
      );
      return {
        box: {
          width: "clamp(92px, 25cqh, 168px)",
          height: "clamp(84px, 23cqh, 154px)",
          padding: 0,
          borderRadius: 0,
          border: "none",
          backgroundColor: "transparent",
          backgroundImage: `url("data:image/svg+xml,${markSvg}")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
          backgroundSize: "contain",
          boxShadow: "none",
          fontSize: 0,
          lineHeight: 0,
          color: "transparent"
        },
        font: "system",
        fontWeight: 900,
        letterSpacing: 0,
        color: "transparent",
        textShadow: "none",
        label: "18+"
      };
    }
    case "mature":
      return {
        box: {
          padding: "clamp(8px, 2.2cqh, 14px) clamp(14px, 4cqw, 26px)",
          borderRadius: "999px",
          background: "rgba(17,24,39,0.94)",
          border: "clamp(1.5px, 0.45cqh, 3px) solid rgba(255,255,255,0.7)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
          fontSize: "clamp(11px, 3.2cqh, 22px)"
        },
        font: "condensed",
        fontWeight: 800,
        letterSpacing: "0.08em",
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.45)",
        label: "MATURE"
      };
    case "outline":
      return {
        box: {
          ...circleBase,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.92)",
          border: "clamp(2px, 0.6cqh, 4px) dashed rgba(17,24,39,0.88)",
          boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
          paddingTop: "0.06em",
          paddingLeft: "0.04em"
        },
        font: "impact",
        fontWeight: 900,
        letterSpacing: 0,
        color: "#111",
        textShadow: "none",
        label: "18+"
      };
    case "classic":
    default:
      return {
        box: {
          ...circleBase,
          borderRadius: "50%",
          background: "rgba(8,8,8,0.94)",
          border: "clamp(2px, 0.6cqh, 4px) solid rgba(255,255,255,0.88)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          // Slight padding bias keeps "18+" optically centered without child transforms
          paddingTop: "0.06em",
          paddingLeft: "0.04em"
        },
        font: "impact",
        fontWeight: 900,
        letterSpacing: 0,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.55)",
        label: "18+"
      };
  }
}

function nsfwVariantStyles(variant: StampNsfwVariant): {
  box: CSSProperties;
  font: StampFontId;
  fontWeight: number;
  letterSpacing: number | string;
  color: string;
  textShadow: string;
} {
  const basePad: CSSProperties = {
    padding: "clamp(8px, 2.2cqh, 16px) clamp(14px, 4cqw, 28px)",
    fontSize: "clamp(12px, 3.6cqh, 26px)"
  };

  switch (variant) {
    case "blackout":
      return {
        box: {
          ...basePad,
          borderRadius: "clamp(2px, 0.5cqh, 4px)",
          background: "rgba(8,8,8,0.96)",
          border: "clamp(1px, 0.35cqh, 2px) solid rgba(255,255,255,0.88)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.55)"
        },
        font: "system",
        fontWeight: 900,
        letterSpacing: "0.04em",
        color: "#fff",
        textShadow: "none"
      };
    case "hazard":
      return {
        box: {
          ...basePad,
          borderRadius: "clamp(3px, 0.7cqh, 6px)",
          background: "#facc15",
          border: "clamp(2px, 0.55cqh, 3.5px) solid #111",
          boxShadow:
            "inset 0 0 0 clamp(2px, 0.55cqh, 4px) #facc15, inset 0 0 0 clamp(4px, 1cqh, 7px) #111, 0 6px 18px rgba(0,0,0,0.45)"
        },
        font: "impact",
        fontWeight: 900,
        letterSpacing: 0,
        color: "#111",
        textShadow: "none"
      };
    case "neon":
      return {
        box: {
          ...basePad,
          borderRadius: "clamp(4px, 1cqh, 8px)",
          background: "rgba(10,6,14,0.92)",
          border: "clamp(1.5px, 0.45cqh, 3px) solid #f472b6",
          boxShadow:
            "0 0 12px rgba(236,72,153,0.65), 0 0 28px rgba(236,72,153,0.35), 0 6px 18px rgba(0,0,0,0.5)"
        },
        font: "condensed",
        fontWeight: 800,
        letterSpacing: "0.14em",
        color: "#fce7f3",
        textShadow: "0 0 8px rgba(244,114,182,0.9)"
      };
    case "ink":
      return {
        box: {
          width: "clamp(56px, 16cqh, 112px)",
          height: "clamp(56px, 16cqh, 112px)",
          padding: 0,
          borderRadius: "50%",
          background: "rgba(90,16,16,0.88)",
          border: "clamp(2px, 0.55cqh, 3.5px) dashed rgba(255,220,220,0.75)",
          boxShadow:
            "inset 0 0 0 clamp(3px, 0.9cqh, 7px) rgba(0,0,0,0.25), 0 8px 22px rgba(0,0,0,0.5)",
          fontSize: "clamp(11px, 3.2cqh, 22px)"
        },
        font: "impact",
        fontWeight: 900,
        letterSpacing: 0,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.55)"
      };
    case "alert":
    default:
      return {
        box: {
          ...basePad,
          borderRadius: "clamp(4px, 1cqh, 8px)",
          background: "rgba(140,20,20,0.92)",
          border: "clamp(1.5px, 0.45cqh, 3px) solid rgba(255,220,220,0.55)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.45)"
        },
        font: "impact",
        fontWeight: 900,
        letterSpacing: 0,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.55)"
      };
  }
}

function CensorStamp({
  stamp,
  selected,
  interactive,
  onSelect,
  onMove,
  onPatch,
  onMoveEnd
}: {
  stamp: BlurPlugStampItem;
  selected: boolean;
  interactive: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onPatch?: (
    id: string,
    patch: Partial<Pick<BlurPlugStampItem, "size" | "rotation" | "font" | "variant">>
  ) => void;
  onMoveEnd?: () => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    rootW: number;
    rootH: number;
  } | null>(null);

  const scale = stampScale(stamp.size);
  const fontKey: StampFontId = stamp.font ?? "system";
  const nsfwVariant = resolveNsfwVariant(stamp.variant);
  const eighteenVariant = resolveEighteenVariant(stamp.variant);
  // Single transform on the stamp root — nested child transforms break in html2canvas.
  const wrap: CSSProperties = {
    position: "absolute",
    left: `${stamp.x}%`,
    top: `${stamp.y}%`,
    transform: `translate(-50%, -50%) rotate(${stamp.rotation}deg) scale(${scale})`,
    transformOrigin: "center center",
    pointerEvents: interactive ? "auto" : "none",
    zIndex: selected ? 8 : 6,
    // Keep stamp below chrome hit targets when selected (chips/handles are z 30).
    isolation: selected && interactive ? "isolate" : undefined,
    cursor: interactive ? "grab" : undefined,
    touchAction: interactive ? "none" : undefined,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    color: "#fff",
    fontFamily: STAMP_FONT_STACKS[fontKey],
    fontWeight: fontKey === "editorial" ? 700 : 900,
    // letter-spacing trailing space skews html2canvas text bounds — keep 0
    letterSpacing: 0,
    textTransform: "uppercase",
    lineHeight: 1,
    whiteSpace: "nowrap",
    textShadow: "0 1px 2px rgba(0,0,0,0.55)",
    userSelect: "none"
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(stamp.id);
    const root = e.currentTarget.offsetParent as HTMLElement | null;
    const rootW = root?.clientWidth || 1;
    const rootH = root?.clientHeight || 1;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: stamp.x,
      startY: stamp.y,
      rootW,
      rootH
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !onMove) return;
    e.stopPropagation();
    const dx = ((e.clientX - drag.startClientX) / drag.rootW) * 100;
    const dy = ((e.clientY - drag.startClientY) / drag.rootH) * 100;
    onMove(
      stamp.id,
      Math.max(0, Math.min(100, Math.round(drag.startX + dx))),
      Math.max(0, Math.min(100, Math.round(drag.startY + dy)))
    );
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    dragRef.current = null;
    onMoveEnd?.();
  }

  const handlers = interactive
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp
      }
    : {};

  let body: ReactNode;
  if (stamp.style === "blank_bar") {
    body = (
      <div
        {...handlers}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? "Blank bar stamp" : undefined}
        style={{
          ...wrap,
          width: "clamp(88px, 42cqw, 280px)",
          height: "clamp(28px, 9cqh, 64px)",
          borderRadius: "clamp(4px, 1cqh, 8px)",
          background: "rgba(10,10,10,0.94)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.45)"
        }}
      />
    );
  } else if (stamp.style === "eighteen_plus") {
    const eighteenLook = eighteenVariantStyles(eighteenVariant);
    body = (
      <div
        {...handlers}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={
          interactive ? `18+ stamp (${eighteenVariant})` : undefined
        }
        style={{
          ...wrap,
          ...eighteenLook.box,
          fontFamily: STAMP_FONT_STACKS[eighteenLook.font],
          fontWeight: eighteenLook.fontWeight,
          letterSpacing: eighteenLook.letterSpacing,
          color: eighteenLook.color,
          textShadow: eighteenLook.textShadow
        }}
      >
        {eighteenLook.label}
      </div>
    );
  } else if (stamp.style === "nsfw") {
    const nsfwLook = nsfwVariantStyles(nsfwVariant);
    body = (
      <div
        {...handlers}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `NSFW stamp (${nsfwVariant})` : undefined}
        style={{
          ...wrap,
          ...nsfwLook.box,
          fontFamily: STAMP_FONT_STACKS[nsfwLook.font],
          fontWeight: nsfwLook.fontWeight,
          letterSpacing: nsfwLook.letterSpacing,
          color: nsfwLook.color,
          textShadow: nsfwLook.textShadow
        }}
      >
        NSFW
      </div>
    );
  } else {
    body = (
      <div
        {...handlers}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? "Members Only stamp" : undefined}
        style={{
          ...wrap,
          padding: "clamp(10px, 2.8cqh, 18px) clamp(16px, 5cqw, 36px)",
          borderRadius: "999px",
          background: "rgba(0,0,0,0.72)",
          border: "clamp(1.5px, 0.5cqh, 3px) dashed rgba(255,255,255,0.65)",
          boxShadow:
            "0 0 0 clamp(4px, 1.2cqh, 10px) rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.5)",
          fontSize: "clamp(11px, 3.2cqh, 22px)"
        }}
      >
        Members Only
      </div>
    );
  }

  return (
    <>
      {body}
      {selected && interactive ? (
        <StampEditChrome stamp={stamp} onPatch={onPatch} onPatchEnd={onMoveEnd} />
      ) : null}
    </>
  );
}

// cqh font-size scales per TextSize
const LABEL_SIZES: Record<Exclude<TextSize, "xsmall">, string> = {
  small:  "clamp(7px,  1.8cqh, 13px)",
  medium: "clamp(9px,  2.6cqh, 18px)",
  large:  "clamp(13px, 3.8cqh, 26px)",
};
const HANDLE_SIZES: Record<TextSize, string> = {
  xsmall: "clamp(9px,  3.2cqh, 22px)",
  small:  "clamp(13px, 6cqh,  46px)",
  medium: "clamp(22px, 11cqh, 82px)",
  large:  "clamp(30px, 15cqh, 112px)",
};

function QrStampLayer({
  qrSrc,
  stamp,
  selected,
  interactive,
  onSelect,
  onMove,
  onMoveEnd
}: {
  qrSrc: string;
  stamp: BlurPlugQrStamp;
  selected: boolean;
  interactive: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveEnd?: () => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    rootW: number;
    rootH: number;
  } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(BLUR_PLUG_QR_LAYER_ID);
    const root = e.currentTarget.offsetParent as HTMLElement | null;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: stamp.x,
      startY: stamp.y,
      rootW: root?.clientWidth || 1,
      rootH: root?.clientHeight || 1
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !onMove) return;
    e.stopPropagation();
    const dx = ((e.clientX - drag.startClientX) / drag.rootW) * 100;
    const dy = ((e.clientY - drag.startClientY) / drag.rootH) * 100;
    onMove(
      BLUR_PLUG_QR_LAYER_ID,
      Math.max(0, Math.min(100, Math.round(drag.startX + dx))),
      Math.max(0, Math.min(100, Math.round(drag.startY + dy)))
    );
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    onMoveEnd?.();
  }

  return (
    <div
      data-testid="previewizer-qr-stamp"
      data-stamp-chrome={BLUR_PLUG_QR_LAYER_ID}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        left: `${stamp.x}%`,
        top: `${stamp.y}%`,
        transform: "translate(-50%, -50%)",
        zIndex: selected ? 9 : 7,
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "grab" : undefined,
        touchAction: interactive ? "none" : undefined,
        userSelect: "none",
        outline: selected && interactive ? "2px solid rgba(124,58,237,0.95)" : "none",
        outlineOffset: 4,
        borderRadius: 12
      }}
    >
      <PreviewizerQrBadge qrSrc={qrSrc} size={stamp.size} />
    </div>
  );
}

export default function BlurPlugOverlay({
  imageSrc,
  blurType = "none",
  handle = "patreon.com/user",
  label = "Follow me on",
  platform = "patreon",
  anchor = "bottom-center",
  revealShape = "none",
  revealSize = 26,
  revealX = 50,
  revealY = 42,
  revealFeather = 0,
  revealOpacity = 100,
  qrSrc = null,
  qrStamp = null,
  borderStyle = "none",
  borderStyles,
  stamps = [],
  selectedStampId = null,
  onSelectStamp,
  onStampMove,
  onStampPatch,
  onStampMoveEnd,
  labelSize = "medium",
  handleSize = "medium",
  exportMode = false,
  onExportReady,
  focalX = 50,
  focalY = 50,
  cropRect = null,
  pixelSize = 18,
  blurOpacity = 100,
  vignetteSize = 50,
  vignetteIntensity = 55,
  glowHue = 262
}: BlurPlugOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mosaicCanvasRef = useRef<HTMLCanvasElement>(null);
  const objectPosition = `${Math.max(0, Math.min(100, focalX))}% ${Math.max(0, Math.min(100, focalY))}%`;
  const cellPx = Math.max(8, Math.min(48, Math.round(pixelSize)));
  const activeBorders: BorderEffectId[] =
    borderStyles ??
    (borderStyle && borderStyle !== "none" ? [borderStyle] : []);
  const crop = cropRect
    ? {
        x: Math.max(0, Math.min(1, cropRect.x)),
        y: Math.max(0, Math.min(1, cropRect.y)),
        w: Math.max(0.02, Math.min(1, cropRect.w)),
        h: Math.max(0.02, Math.min(1, cropRect.h))
      }
    : null;

  const imgFilter: Record<BlurType, string> = {
    // Studio preview keeps CSS filters; exportMode bakes gaussian/zoom to canvas.
    gaussian: "blur(18px) saturate(1.05)",
    pixelated: "none",
    zoom: "blur(9px)",
    none: "none"
  };
  // Only Blur+Zoom scales up; gaussian/pixelated must match the crisp underlay 1:1.
  const imgTransform = blurType === "zoom" ? "scale(1.55)" : "none";
  const isMosaic = blurType === "pixelated";
  /** html2canvas drops CSS filters — bake gaussian/zoom when exporting. */
  const isCssBlurExport =
    exportMode && (blurType === "gaussian" || blurType === "zoom");
  const effectOpacity = Math.max(0, Math.min(100, blurOpacity)) / 100;
  // Fade the effect over a crisp base (not the whole frame).
  const usesEffectOpacity = blurType === "gaussian" || blurType === "pixelated";

  const a = ANCHORS[anchor];
  const hasReveal = revealShape !== "none";
  const imageCoverStyle: CSSProperties = crop
    ? {
        position: "absolute",
        left: `${(-crop.x / crop.w) * 100}%`,
        top: `${(-crop.y / crop.h) * 100}%`,
        width: `${(1 / crop.w) * 100}%`,
        height: `${(1 / crop.h) * 100}%`,
        maxWidth: "none",
        objectFit: "fill",
        transform: imgTransform,
        transformOrigin: "center center"
      }
    : {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition,
        transform: imgTransform,
        transformOrigin: "center center"
      };

  const cssBlurCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportReadySentRef = useRef(false);
  const signalExportReady = () => {
    if (!exportMode || !onExportReady || exportReadySentRef.current) return;
    exportReadySentRef.current = true;
    onExportReady();
  };

  useEffect(() => {
    exportReadySentRef.current = false;
  }, [
    exportMode,
    imageSrc,
    isMosaic,
    isCssBlurExport,
    blurType,
    cellPx,
    cropRect?.x,
    cropRect?.y,
    cropRect?.w,
    cropRect?.h
  ]);

  // Plain / none export: wait until the photo decodes before html2canvas.
  useEffect(() => {
    if (!exportMode || !onExportReady || isMosaic || isCssBlurExport) return;
    let cancelled = false;
    void loadImageElement(imageSrc)
      .then(() => {
        if (!cancelled) signalExportReady();
      })
      .catch(() => {
        if (!cancelled) signalExportReady();
      });
    return () => {
      cancelled = true;
    };
    // signalExportReady reads latest exportMode/onExportReady via closure each run
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional ready handshake
  }, [exportMode, onExportReady, isMosaic, isCssBlurExport, imageSrc]);

  useEffect(() => {
    if (!isCssBlurExport) return;
    const root = rootRef.current;
    const canvas = cssBlurCanvasRef.current;
    if (!root || !canvas) return;

    let cancelled = false;
    let source: HTMLImageElement | null = null;
    const zoom = blurType === "zoom" ? 1.55 : 1;
    const blurPx = blurPlugExportBlurPx(blurType, true);

    const paint = () => {
      if (cancelled || !source || source.naturalWidth < 1) return;
      const w = root.clientWidth;
      const h = root.clientHeight;
      paintBlurPlugCssBlur({
        canvas,
        img: source,
        width: w,
        height: h,
        blurPx,
        zoom,
        crop,
        focalX,
        focalY
      });
    };

    void loadImageElement(imageSrc)
      .then((img) => {
        if (cancelled) return;
        source = img;
        paint();
        signalExportReady();
      })
      .catch(() => {
        if (!cancelled) signalExportReady();
      });

    const ro = new ResizeObserver(() => paint());
    ro.observe(root);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- crop object rebuilt each render
  }, [
    isCssBlurExport,
    imageSrc,
    blurType,
    focalX,
    focalY,
    cropRect?.x,
    cropRect?.y,
    cropRect?.w,
    cropRect?.h,
    exportMode,
    onExportReady
  ]);

  useEffect(() => {
    if (!isMosaic) return;
    const root = rootRef.current;
    const canvas = mosaicCanvasRef.current;
    if (!root || !canvas) return;

    let cancelled = false;
    let source: HTMLImageElement | null = null;
    // Pixelated path never uses Blur+Zoom scale.
    const zoom = 1;

    const paint = () => {
      if (cancelled || !source || source.naturalWidth < 1) return;
      const w = root.clientWidth;
      const h = root.clientHeight;
      // Export is full output size; scale cells so density matches the studio preview.
      const paintCell = exportMode
        ? Math.max(8, Math.round(cellPx * (Math.min(w, h) / 420)))
        : cellPx;
      paintSoftMosaic({
        canvas,
        img: source,
        width: w,
        height: h,
        cellPx: paintCell,
        zoom,
        crop,
        focalX,
        focalY
      });
    };

    void loadImageElement(imageSrc)
      .then((img) => {
        if (cancelled) return;
        source = img;
        paint();
        signalExportReady();
      })
      .catch(() => {
        if (!cancelled) signalExportReady();
      });

    const ro = new ResizeObserver(() => paint());
    ro.observe(root);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- crop object rebuilt each render
  }, [
    isMosaic,
    imageSrc,
    cellPx,
    focalX,
    focalY,
    blurType,
    cropRect?.x,
    cropRect?.y,
    cropRect?.w,
    cropRect?.h,
    exportMode,
    onExportReady
  ]);

  return (
    <div
      ref={rootRef}
      data-blur-plug-root
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        containerType: "size",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {usesEffectOpacity ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          style={{
            ...imageCoverStyle,
            filter: "none"
          }}
        />
      ) : null}
      {isMosaic ? (
        <canvas
          ref={mosaicCanvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: usesEffectOpacity ? effectOpacity : 1
          }}
        />
      ) : isCssBlurExport ? (
        <canvas
          ref={cssBlurCanvasRef}
          aria-hidden="true"
          data-blur-plug-css-export={blurType}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: usesEffectOpacity ? effectOpacity : 1
          }}
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          style={{
            ...imageCoverStyle,
            filter: imgFilter[blurType],
            opacity: usesEffectOpacity ? effectOpacity : 1,
            transition: exportMode
              ? undefined
              : "filter 0.35s ease, transform 0.45s ease, opacity 0.25s ease"
          }}
        />
      )}

      {/* Crisp reveal — same framing as base; aspect-correct CSS mask (no stretched SVG) */}
      {hasReveal ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            opacity: Math.max(0, Math.min(100, revealOpacity)) / 100,
            ...buildRevealMaskStyle(
              revealShape,
              revealX,
              revealY,
              revealSize,
              revealFeather
            )
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt=""
            style={{
              ...imageCoverStyle,
              transition: exportMode ? undefined : "transform 0.45s ease"
            }}
          />
        </div>
      ) : null}

      {/* Legibility scrim — studio only; html2canvas over-darkens this gradient on export */}
      {!exportMode ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.45) 100%)",
          }}
          aria-hidden="true"
        />
      ) : null}

      {/* Typography plug — anchored */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: a.justify,
          alignItems: a.align,
          textAlign: a.text,
          padding: "clamp(16px, 6cqh, 48px)",
          gap: "clamp(6px, 2cqh, 16px)",
        }}
      >
        {/* Logo + label row */}
        {label && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "clamp(6px, 1.8cqh, 14px)",
              flexDirection: a.text === "right" ? "row-reverse" : "row",
            }}
          >
            <span
              style={{
                width: "clamp(26px, 8cqh, 64px)",
                height: "clamp(26px, 8cqh, 64px)",
                color: "#ffffff",
                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))",
              }}
            >
              <PlatformLogo platform={platform} />
            </span>
            <span
              style={{
                color: "rgba(255,255,255,0.9)",
                fontSize: LABEL_SIZES[labelSize === "xsmall" ? "small" : labelSize],
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontWeight: 700,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                lineHeight: 1,
                textShadow: "0 2px 10px rgba(0,0,0,0.7)",
              }}
            >
              {label}
            </span>
          </div>
        )}

        {/* Big bold handle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(8px, 2cqh, 16px)",
            flexWrap: "wrap",
            maxWidth: "100%"
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: HANDLE_SIZES[handleSize],
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 0.98,
              textShadow: "0 4px 24px rgba(0,0,0,0.75), 0 1px 4px rgba(0,0,0,0.9)",
              wordBreak: "break-word",
              maxWidth: "100%",
            }}
          >
            {handle}
          </p>
        </div>
      </div>

      {/* Aesthetic border effects — stack when multiple are active */}
      {activeBorders.map((style) => (
        <BorderEffect
          key={style}
          style={style}
          vignetteSize={vignetteSize}
          vignetteIntensity={vignetteIntensity}
          glowHue={glowHue}
        />
      ))}

      {/* Destination QR — studio only; export bakes via paintQrStampOnCanvas */}
      {!exportMode && qrSrc && normalizeBlurPlugQrStamp(qrStamp).enabled ? (
        <QrStampLayer
          qrSrc={qrSrc}
          stamp={normalizeBlurPlugQrStamp(qrStamp)}
          selected={selectedStampId === BLUR_PLUG_QR_LAYER_ID}
          interactive={Boolean(onStampMove)}
          onSelect={onSelectStamp}
          onMove={onStampMove}
          onMoveEnd={onStampMoveEnd}
        />
      ) : null}

      {/* Censor stamps — drag when interactive (studio preview only) */}
      {stamps.map((stamp) => (
        <CensorStamp
          key={stamp.id}
          stamp={stamp}
          selected={selectedStampId === stamp.id}
          interactive={!exportMode && Boolean(onStampMove || onStampPatch)}
          onSelect={onSelectStamp}
          onMove={onStampMove}
          onPatch={onStampPatch}
          onMoveEnd={onStampMoveEnd}
        />
      ))}
    </div>
  )
}
