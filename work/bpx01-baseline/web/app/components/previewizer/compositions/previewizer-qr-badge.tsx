"use client";

import type { CSSProperties } from "react";
import type { BlurPlugQrSize } from "../previewizer-template-compositions";

export const QR_STAMP_SIZE_PRESETS: Record<
  BlurPlugQrSize,
  { sizeCqh: number; sizeMin: number; sizeMax: number }
> = {
  small: { sizeCqh: 16.25, sizeMin: 70, sizeMax: 140 },
  medium: { sizeCqh: 25, sizeMin: 100, sizeMax: 220 },
  large: { sizeCqh: 35, sizeMin: 140, sizeMax: 300 }
};

/** Resolve CSS clamp(min, cqh, max) against a concrete frame height (export bake). */
export function resolveQrStampPixelSize(size: BlurPlugQrSize, frameHeight: number): number {
  const preset = QR_STAMP_SIZE_PRESETS[size];
  const fromCqh = (preset.sizeCqh / 100) * Math.max(1, frameHeight);
  return Math.round(Math.max(preset.sizeMin, Math.min(preset.sizeMax, fromCqh)));
}

function loadQrImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode QR image"));
    img.src = src;
  });
}

/** Canvas-bake a free-placed QR stamp — avoids html2canvas dropping data-URL imgs / cqh. */
export async function paintQrStampOnCanvas(
  ctx: CanvasRenderingContext2D,
  args: {
    qrSrc: string;
    xPct: number;
    yPct: number;
    size: BlurPlugQrSize;
    frameWidth: number;
    frameHeight: number;
  }
): Promise<void> {
  const img = await loadQrImage(args.qrSrc);
  const dim = resolveQrStampPixelSize(args.size, args.frameHeight);
  const pad = Math.max(4, Math.min(12, Math.round(dim * 0.06)));
  const radius = Math.max(6, Math.min(14, Math.round(dim * 0.08)));
  const cx = (Math.max(0, Math.min(100, args.xPct)) / 100) * args.frameWidth;
  const cy = (Math.max(0, Math.min(100, args.yPct)) / 100) * args.frameHeight;
  const left = cx - dim / 2;
  const top = cy - dim / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(left, top, dim, dim, radius);
    ctx.fill();
  } else {
    ctx.fillRect(left, top, dim, dim);
  }
  ctx.restore();

  const inner = Math.max(1, dim - pad * 2);
  ctx.drawImage(img, left + pad, top + pad, inner, inner);
}

/** High-contrast QR badge for Previewizer composition lockups (html2canvas-safe PNG img). */
export function PreviewizerQrBadge({
  qrSrc,
  sizeCqh = 8,
  sizeMin = 36,
  sizeMax = 72,
  size,
  fixedPx,
  style,
  "data-testid": testId = "previewizer-qr-badge"
}: {
  qrSrc: string;
  sizeCqh?: number;
  sizeMin?: number;
  sizeMax?: number;
  /** Stamp-like S/M/L preset — overrides sizeCqh/min/max when set. */
  size?: BlurPlugQrSize;
  /** Absolute px size (export-safe; skips cqh which html2canvas mishandles). */
  fixedPx?: number;
  style?: CSSProperties;
  "data-testid"?: string;
}) {
  const preset = size ? QR_STAMP_SIZE_PRESETS[size] : null;
  const cqh = preset?.sizeCqh ?? sizeCqh;
  const min = preset?.sizeMin ?? sizeMin;
  const max = preset?.sizeMax ?? sizeMax;
  const dim = fixedPx != null ? `${fixedPx}px` : `clamp(${min}px, ${cqh}cqh, ${max}px)`;
  const pad =
    fixedPx != null
      ? `${Math.max(4, Math.min(12, Math.round(fixedPx * 0.06)))}px`
      : "clamp(3px, 0.6cqh, 5px)";
  const radius =
    fixedPx != null
      ? `${Math.max(6, Math.min(14, Math.round(fixedPx * 0.08)))}px`
      : "clamp(6px, 1cqh, 10px)";
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: dim,
        height: dim,
        padding: pad,
        borderRadius: radius,
        background: "#ffffff",
        boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
        boxSizing: "border-box",
        ...style
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data-URL QR for export bake */}
      <img
        src={qrSrc}
        alt=""
        width={256}
        height={256}
        decoding="sync"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block"
        }}
      />
    </span>
  );
}
