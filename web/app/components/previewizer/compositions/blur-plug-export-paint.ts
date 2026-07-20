/**
 * Export-safe Blur Plug photo paints (canvas bitmap).
 * CSS filters are unreliable under html2canvas — bake effects before snapshot.
 */

export type BlurPlugExportCrop = { x: number; y: number; w: number; h: number };

function drawFramedSource(args: {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  width: number;
  height: number;
  zoom: number;
  crop: BlurPlugExportCrop | null;
  focalX: number;
  focalY: number;
}) {
  const { ctx, img, width: w, height: h, zoom, crop, focalX, focalY } = args;
  if (crop) {
    const sx = crop.x * img.naturalWidth;
    const sy = crop.y * img.naturalHeight;
    const sw = Math.max(1, crop.w * img.naturalWidth);
    const sh = Math.max(1, crop.h * img.naturalHeight);
    const dw = w * zoom;
    const dh = h * zoom;
    ctx.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const fx = Math.max(0, Math.min(100, focalX)) / 100;
  const fy = Math.max(0, Math.min(100, focalY)) / 100;
  const ox = (w - drawW) * fx;
  const oy = (h - drawH) * fy;
  ctx.drawImage(img, ox, oy, drawW, drawH);
}

/**
 * Paint a CSS-equivalent Gaussian (or zoom) blur onto a canvas for export.
 * Matches studio radii: gaussian 18px, zoom 9px (+ optional scale).
 */
export function paintBlurPlugCssBlur(args: {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  width: number;
  height: number;
  blurPx: number;
  zoom?: number;
  crop: BlurPlugExportCrop | null;
  focalX: number;
  focalY: number;
}): boolean {
  const {
    canvas,
    img,
    width: w,
    height: h,
    blurPx,
    zoom = 1,
    crop,
    focalX,
    focalY
  } = args;
  if (w < 2 || h < 2 || img.naturalWidth < 1) return false;

  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
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

  drawFramedSource({
    ctx: fctx,
    img,
    width: w,
    height: h,
    zoom,
    crop,
    focalX,
    focalY
  });

  const radius = Math.max(0, blurPx);
  if (radius <= 0) {
    ctx.drawImage(full, 0, 0);
    return true;
  }

  ctx.filter = `blur(${radius}px) saturate(1.05)`;
  ctx.drawImage(full, 0, 0);
  ctx.filter = "none";
  return true;
}

/** Studio / export blur radii for Blur Plug CSS effects. */
export function blurPlugExportBlurPx(
  blurType: "gaussian" | "zoom" | "none" | "pixelated",
  exportMode: boolean
): number {
  if (blurType === "gaussian") {
    // Match the live studio look (was previously weakened to 12px in exportMode).
    return exportMode ? 18 : 18;
  }
  if (blurType === "zoom") return 9;
  return 0;
}
