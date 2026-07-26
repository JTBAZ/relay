/**
 * Previewizer filter presets — pure Canvas 2D transforms.
 * Normalized selection coords are 0–1 relative to source image dimensions.
 */

export type NormalizedRect = { x: number; y: number; w: number; h: number };

export type PresetId = "tight_crop" | "blur_outside" | "pixelate" | "censor_stamp";

export type AspectRatioKey = "1:1" | "4:5" | "9:16";

export type OutputSize = { width: number; height: number };

export const ASPECT_OUTPUT: Record<AspectRatioKey, OutputSize> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 }
};

export const PRESET_LABELS: Record<PresetId, string> = {
  tight_crop: "Tight Crop",
  blur_outside: "Blur Outside Border",
  pixelate: "Pixelate Selection",
  censor_stamp: "Censor Stamp"
};

export const DEFAULT_SELECTION: NormalizedRect = { x: 0.25, y: 0.2, w: 0.5, h: 0.45 };

const BLUR_SIGMA = 12;
const PIXELATE_CELL = 16;

export function aspectToNumber(key: AspectRatioKey): number {
  const { width, height } = ASPECT_OUTPUT[key];
  return width / height;
}

/** Crop rect in source pixels, centered on selection, locked to target aspect. */
export function computeCropRect(
  imgW: number,
  imgH: number,
  sel: NormalizedRect,
  targetAspect: number
): { sx: number; sy: number; sw: number; sh: number } {
  const selPx = {
    x: sel.x * imgW,
    y: sel.y * imgH,
    w: Math.max(sel.w * imgW, 1),
    h: Math.max(sel.h * imgH, 1)
  };
  const cx = selPx.x + selPx.w / 2;
  const cy = selPx.y + selPx.h / 2;
  const pad = 0.12;
  let sw = selPx.w * (1 + pad * 2);
  let sh = selPx.h * (1 + pad * 2);
  const current = sw / sh;
  if (current > targetAspect) {
    sh = sw / targetAspect;
  } else {
    sw = sh * targetAspect;
  }
  let sx = cx - sw / 2;
  let sy = cy - sh / 2;
  if (sw > imgW) {
    sw = imgW;
    sh = sw / targetAspect;
  }
  if (sh > imgH) {
    sh = imgH;
    sw = sh * targetAspect;
  }
  sx = Math.max(0, Math.min(sx, imgW - sw));
  sy = Math.max(0, Math.min(sy, imgH - sh));
  return { sx, sy, sw, sh };
}

function clampSelection(rect: NormalizedRect): NormalizedRect {
  const w = Math.max(0.02, Math.min(1, rect.w));
  const h = Math.max(0.02, Math.min(1, rect.h));
  const x = Math.max(0, Math.min(1 - w, rect.x));
  const y = Math.max(0, Math.min(1 - h, rect.y));
  return { x, y, w, h };
}

/** Shift selection center when user pans on the output preview (normalized output delta 0–1). */
export function panSelectionFromPreviewDelta(
  sel: NormalizedRect,
  imgW: number,
  imgH: number,
  aspectKey: AspectRatioKey,
  dnx: number,
  dny: number
): NormalizedRect {
  const targetAspect = aspectToNumber(aspectKey);
  const { sw, sh } = computeCropRect(imgW, imgH, sel, targetAspect);
  const dSelX = -(dnx * sw) / imgW;
  const dSelY = -(dny * sh) / imgH;
  const cx = sel.x + sel.w / 2 + dSelX;
  const cy = sel.y + sel.h / 2 + dSelY;
  return clampSelection({
    x: cx - sel.w / 2,
    y: cy - sel.h / 2,
    w: sel.w,
    h: sel.h
  });
}

/**
 * Keep selection center, reshape width/height to match output aspect in image space.
 * `imgAspect` = naturalWidth / naturalHeight. Smaller box = more zoom.
 */
export function reshapeSelectionToAspect(
  sel: NormalizedRect,
  aspectKey: AspectRatioKey,
  imgAspect: number
): NormalizedRect {
  const target = aspectToNumber(aspectKey);
  // Selection aspect in normalized image coords: (w/h) * imgAspect = target
  // => w/h = target / imgAspect
  const selAspect = target / Math.max(imgAspect, 0.0001);
  const cx = sel.x + sel.w / 2;
  const cy = sel.y + sel.h / 2;
  // Preserve approximate coverage (geometric mean of current size)
  const area = Math.max(0.04, sel.w * sel.h);
  let h = Math.sqrt(area / selAspect);
  let w = h * selAspect;
  const maxW = 1;
  const maxH = 1;
  if (w > maxW) {
    w = maxW;
    h = w / selAspect;
  }
  if (h > maxH) {
    h = maxH;
    w = h * selAspect;
  }
  w = Math.max(0.08, w);
  h = Math.max(0.08, h);
  return clampSelection({
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h
  });
}

/** Scale selection about its center (aspect locked). factor > 1 zooms out. */
export function scaleSelectionAboutCenter(
  sel: NormalizedRect,
  factor: number,
  aspectKey: AspectRatioKey,
  imgAspect: number
): NormalizedRect {
  const target = aspectToNumber(aspectKey);
  const selAspect = target / Math.max(imgAspect, 0.0001);
  const cx = sel.x + sel.w / 2;
  const cy = sel.y + sel.h / 2;
  let w = sel.w * factor;
  let h = w / selAspect;
  w = Math.max(0.08, Math.min(1, w));
  h = w / selAspect;
  if (h > 1) {
    h = 1;
    w = h * selAspect;
  }
  return clampSelection({
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h
  });
}

/** Pan selection in normalized image space (minimap drag deltas). */
export function panSelectionInImageSpace(
  sel: NormalizedRect,
  dnx: number,
  dny: number
): NormalizedRect {
  return clampSelection({
    x: sel.x + dnx,
    y: sel.y + dny,
    w: sel.w,
    h: sel.h
  });
}

/** Cover-fit mapping from image space to output canvas. */
export function coverFitTransform(
  imgW: number,
  imgH: number,
  outW: number,
  outH: number
): { scale: number; offsetX: number; offsetY: number; drawW: number; drawH: number } {
  const scale = Math.max(outW / imgW, outH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = (outW - drawW) / 2;
  const offsetY = (outH - drawH) / 2;
  return { scale, offsetX, offsetY, drawW, drawH };
}

export function selectionToOutputRect(
  sel: NormalizedRect,
  imgW: number,
  imgH: number,
  outW: number,
  outH: number
): { dx: number; dy: number; dw: number; dh: number } {
  const { scale, offsetX, offsetY } = coverFitTransform(imgW, imgH, outW, outH);
  return {
    dx: offsetX + sel.x * imgW * scale,
    dy: offsetY + sel.y * imgH * scale,
    dw: sel.w * imgW * scale,
    dh: sel.h * imgH * scale
  };
}

function clampRect(r: NormalizedRect): NormalizedRect {
  const x = Math.max(0, Math.min(1, r.x));
  const y = Math.max(0, Math.min(1, r.y));
  const w = Math.max(0.02, Math.min(1 - x, r.w));
  const h = Math.max(0.02, Math.min(1 - y, r.h));
  return { x, y, w, h };
}

export function applyTightCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sel: NormalizedRect,
  out: OutputSize,
  targetAspect: number
): void {
  const { sx, sy, sw, sh } = computeCropRect(img.naturalWidth, img.naturalHeight, clampRect(sel), targetAspect);
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
}

/** Exact selection crop (no padding) — used by Blur Plug framing. */
export function applyExactSelectionCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sel: NormalizedRect,
  out: OutputSize
): void {
  const s = clampRect(sel);
  const sx = s.x * img.naturalWidth;
  const sy = s.y * img.naturalHeight;
  const sw = Math.max(1, s.w * img.naturalWidth);
  const sh = Math.max(1, s.h * img.naturalHeight);
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
}

/** Pan the crop window when dragging the main preview (preview shows the selection). */
export function panSelectionFromCropPreview(
  sel: NormalizedRect,
  dnx: number,
  dny: number
): NormalizedRect {
  return panSelectionInImageSpace(sel, -dnx * sel.w, -dny * sel.h);
}

export function applyBlurOutside(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sel: NormalizedRect,
  out: OutputSize
): void {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const s = clampRect(sel);
  const fit = coverFitTransform(imgW, imgH, out.width, out.height);

  ctx.clearRect(0, 0, out.width, out.height);
  ctx.filter = `blur(${BLUR_SIGMA}px)`;
  ctx.drawImage(img, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
  ctx.filter = "none";

  const sx = s.x * imgW;
  const sy = s.y * imgH;
  const sw = s.w * imgW;
  const sh = s.h * imgH;
  const dx = fit.offsetX + sx * fit.scale;
  const dy = fit.offsetY + sy * fit.scale;
  const dw = sw * fit.scale;
  const dh = sh * fit.scale;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cellSize: number
): void {
  if (w <= 0 || h <= 0) return;
  const iw = Math.max(2, Math.floor(w / cellSize));
  const ih = Math.max(2, Math.floor(h / cellSize));
  const off = document.createElement("canvas");
  off.width = iw;
  off.height = ih;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(ctx.canvas, x, y, w, h, 0, 0, iw, ih);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, iw, ih, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

export function applyPixelateSelection(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sel: NormalizedRect,
  out: OutputSize
): void {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const fit = coverFitTransform(imgW, imgH, out.width, out.height);
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(img, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
  const { dx, dy, dw, dh } = selectionToOutputRect(clampRect(sel), imgW, imgH, out.width, out.height);
  pixelateRegion(ctx, dx, dy, dw, dh, PIXELATE_CELL);
}

export function applyCensorStamp(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sel: NormalizedRect,
  out: OutputSize
): void {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const fit = coverFitTransform(imgW, imgH, out.width, out.height);
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(img, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
  const { dx, dy, dw, dh } = selectionToOutputRect(clampRect(sel), imgW, imgH, out.width, out.height);
  const radius = Math.min(dw, dh) * 0.08;
  ctx.fillStyle = "rgba(18, 18, 18, 0.92)";
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, radius);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function applyPreset(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  preset: PresetId,
  sel: NormalizedRect,
  aspectKey: AspectRatioKey
): void {
  const out = ASPECT_OUTPUT[aspectKey];
  const targetAspect = aspectToNumber(aspectKey);
  switch (preset) {
    case "tight_crop":
      applyTightCrop(ctx, img, sel, out, targetAspect);
      break;
    case "blur_outside":
      applyBlurOutside(ctx, img, sel, out);
      break;
    case "pixelate":
      applyPixelateSelection(ctx, img, sel, out);
      break;
    case "censor_stamp":
      applyCensorStamp(ctx, img, sel, out);
      break;
  }
}

export function renderPresetToCanvas(
  img: HTMLImageElement,
  preset: PresetId,
  sel: NormalizedRect,
  aspectKey: AspectRatioKey
): HTMLCanvasElement {
  const out = ASPECT_OUTPUT[aspectKey];
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  applyPreset(ctx, img, preset, sel, aspectKey);
  return canvas;
}
