import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { PlatformId } from "./previewizer-design-templates";
import { PreviewizerCompositionSlot } from "./previewizer-composition-slot";
import { PreviewizerV0GraphicSlot } from "./previewizer-v0-graphic-slot";
import {
  normalizeBlurPlugQrStamp,
  type BlurPlugProps,
  type CompositionPropsById,
  type CompositionTemplateId
} from "./previewizer-template-compositions";
import type { OverlayDocument } from "./previewizer-overlay-layers";
import type { OutputSize } from "./previewizer-presets";
import { paintQrStampOnCanvas } from "./compositions/previewizer-qr-badge";

type ExportCompositeArgs = {
  baseCanvas: HTMLCanvasElement;
  overlayDoc: OverlayDocument;
  outputSize: OutputSize;
  platformId: PlatformId;
  titleText?: string;
};

type ExportCompositionArgs = {
  baseCanvas: HTMLCanvasElement;
  outputSize: OutputSize;
  compositionId: CompositionTemplateId;
  compositionProps: CompositionPropsById[CompositionTemplateId];
  compositionImageSrc?: string | null;
  compositionFocalX?: number;
  compositionFocalY?: number;
  compositionCropRect?: { x: number; y: number; w: number; h: number } | null;
  qrSrc?: string | null;
};

function copyFontScopeStyles(wrapper: HTMLElement) {
  const scope = document.querySelector(".previewizer-font-scope");
  if (!(scope instanceof HTMLElement)) return;
  wrapper.className = scope.className;
}

function waitNextFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Ensure every <img> in the export tree has decoded before html2canvas snapshots. */
function waitForImages(root: HTMLElement, timeoutMs = 4000): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    void Promise.all(
      images.map(
        (img) =>
          new Promise<void>((res) => {
            if (img.complete && img.naturalWidth > 0) {
              res();
              return;
            }
            const finish = () => res();
            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
            // decode() is more reliable for data-URLs already in cache
            if (typeof img.decode === "function") {
              void img.decode().then(finish).catch(finish);
            }
          })
      )
    ).then(() => {
      window.clearTimeout(timer);
      done();
    });
  });
}

function waitForExportReady(
  onReady: (resolve: () => void) => void,
  timeoutMs = 4000
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    onReady(() => {
      window.clearTimeout(timer);
      // One more frame so the painted canvas is committed to the DOM.
      requestAnimationFrame(() => done());
    });
  });
}

/** Bake base canvas + full-bleed composition overlay into one export canvas. */
export async function compositeExportWithComposition({
  baseCanvas,
  outputSize,
  compositionId,
  compositionProps,
  compositionImageSrc = null,
  compositionFocalX = 50,
  compositionFocalY = 50,
  compositionCropRect = null,
  qrSrc = null
}: ExportCompositionArgs): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = `${outputSize.width}px`;
  wrapper.style.height = `${outputSize.height}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.background = "#000";
  copyFontScopeStyles(wrapper);

  // Always draw the pre-baked base under the composition so a failed mosaic
  // paint still has photo pixels (Blur Plug previously skipped this).
  const bg = document.createElement("img");
  bg.src = baseCanvas.toDataURL("image/png");
  bg.width = outputSize.width;
  bg.height = outputSize.height;
  bg.style.position = "absolute";
  bg.style.inset = "0";
  bg.style.width = "100%";
  bg.style.height = "100%";
  bg.style.objectFit = "fill";
  wrapper.appendChild(bg);

  const compositionMount = document.createElement("div");
  compositionMount.style.position = "absolute";
  compositionMount.style.inset = "0";
  compositionMount.style.pointerEvents = "none";
  wrapper.appendChild(compositionMount);

  document.body.appendChild(wrapper);

  // Prefer the already-cropped base for Blur Plug so export doesn't re-decode
  // the original blob and re-apply crop under a race. PNG keeps overlay sharp.
  const exportImageSrc =
    compositionId === "blur_plug"
      ? baseCanvas.toDataURL("image/png")
      : (compositionImageSrc ?? baseCanvas.toDataURL("image/png"));
  const exportCropRect = compositionId === "blur_plug" ? null : compositionCropRect;

  let resolveReady: (() => void) | null = null;
  const needsPaintReady = compositionId === "blur_plug";
  const readyPromise = needsPaintReady
    ? waitForExportReady((resolve) => {
        resolveReady = resolve;
      })
    : Promise.resolve();

  const root = createRoot(compositionMount);
  root.render(
    createElement(PreviewizerCompositionSlot, {
      compositionId,
      compositionProps,
      exportMode: true,
      onExportReady: needsPaintReady ? () => resolveReady?.() : undefined,
      imageSrc: exportImageSrc,
      focalX: compositionFocalX,
      focalY: compositionFocalY,
      cropRect: exportCropRect,
      qrSrc
    })
  );

  await readyPromise;
  await waitNextFrames(2);
  await waitForImages(wrapper);

  try {
    const shot = await html2canvas(wrapper, {
      width: outputSize.width,
      height: outputSize.height,
      scale: 1,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      // Canvas mosaic must be snapshotted from bitmap, not re-cloned empty.
      foreignObjectRendering: false
    });

    const out = document.createElement("canvas");
    out.width = outputSize.width;
    out.height = outputSize.height;
    const ctx = out.getContext("2d");
    if (!ctx) return baseCanvas;
    ctx.drawImage(shot, 0, 0);

    // Blur Plug QR is canvas-baked: html2canvas often drops data-URL imgs / cqh stamps.
    if (compositionId === "blur_plug" && qrSrc) {
      const props = compositionProps as BlurPlugProps;
      const qrStamp = normalizeBlurPlugQrStamp(props.qrStamp);
      if (qrStamp.enabled) {
        try {
          await paintQrStampOnCanvas(ctx, {
            qrSrc,
            xPct: qrStamp.x,
            yPct: qrStamp.y,
            size: qrStamp.size,
            frameWidth: outputSize.width,
            frameHeight: outputSize.height
          });
        } catch {
          /* keep export without QR rather than failing the whole bake */
        }
      }
    }

    return out;
  } finally {
    root.unmount();
    wrapper.remove();
  }
}

/** Bake base canvas + v0 React graphics into one export canvas. */
export async function compositeExportWithGraphics({
  baseCanvas,
  overlayDoc,
  outputSize,
  platformId,
  titleText
}: ExportCompositeArgs): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = `${outputSize.width}px`;
  wrapper.style.height = `${outputSize.height}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.background = "#000";

  const bg = document.createElement("img");
  bg.src = baseCanvas.toDataURL("image/png");
  bg.width = outputSize.width;
  bg.height = outputSize.height;
  bg.style.position = "absolute";
  bg.style.inset = "0";
  bg.style.width = "100%";
  bg.style.height = "100%";
  bg.style.objectFit = "fill";
  wrapper.appendChild(bg);

  const graphicMount = document.createElement("div");
  graphicMount.style.position = "absolute";
  graphicMount.style.inset = "0";
  graphicMount.style.pointerEvents = "none";
  wrapper.appendChild(graphicMount);

  document.body.appendChild(wrapper);

  const roots: Root[] = [];
  for (const layer of overlayDoc.graphicLayers ?? []) {
    if (layer.visible === false) continue;
    const slot = document.createElement("div");
    slot.style.position = "absolute";
    slot.style.left = `${layer.rect.x * 100}%`;
    slot.style.top = `${layer.rect.y * 100}%`;
    slot.style.width = `${layer.rect.w * 100}%`;
    slot.style.height = `${layer.rect.h * 100}%`;
    slot.style.overflow = "visible";
    graphicMount.appendChild(slot);

    const root = createRoot(slot);
    root.render(
      createElement(PreviewizerV0GraphicSlot, {
        layer,
        platform: platformId,
        title: titleText,
        scale: 1
      })
    );
    roots.push(root);
  }

  await waitNextFrames(2);

  try {
    const shot = await html2canvas(wrapper, {
      width: outputSize.width,
      height: outputSize.height,
      scale: 1,
      useCORS: true,
      backgroundColor: null,
      logging: false
    });

    const out = document.createElement("canvas");
    out.width = outputSize.width;
    out.height = outputSize.height;
    const ctx = out.getContext("2d");
    if (!ctx) return baseCanvas;
    ctx.drawImage(shot, 0, 0);
    return out;
  } finally {
    roots.forEach((r) => r.unmount());
    wrapper.remove();
  }
}
