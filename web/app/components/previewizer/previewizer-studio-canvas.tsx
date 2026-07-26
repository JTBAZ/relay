"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyOverlayDocument,
  loadOverlayImage,
  type OverlayDocument
} from "./previewizer-overlay-layers";
import { PreviewizerV0GraphicSlot } from "./previewizer-v0-graphic-slot";
import { PreviewizerCompositionSlot } from "./previewizer-composition-slot";
import type { PlatformId } from "./previewizer-design-templates";
import type {
  CompositionPropsById,
  CompositionTemplateId
} from "./previewizer-template-compositions";
import type {
  StampFontId,
  StampNsfwVariant,
  StampEighteenVariant
} from "./compositions/blur-plug-overlay";
import {
  applyExactSelectionCrop,
  applyPreset,
  panSelectionFromCropPreview,
  panSelectionFromPreviewDelta,
  type AspectRatioKey,
  type NormalizedRect,
  type OutputSize,
  type PresetId
} from "./previewizer-presets";

type StampPatch = Partial<{
  size: number;
  rotation: number;
  font: StampFontId;
  variant: StampNsfwVariant | StampEighteenVariant;
}>;

type Props = {
  imageEl: HTMLImageElement | null;
  preset: PresetId;
  selection: NormalizedRect;
  aspectKey: AspectRatioKey;
  outputSize: OutputSize;
  overlayDoc: OverlayDocument;
  platformId: PlatformId;
  titleText?: string;
  compositionId?: CompositionTemplateId | null;
  compositionProps?: CompositionPropsById[CompositionTemplateId] | null;
  compositionImageSrc?: string | null;
  compositionFocalX?: number;
  compositionFocalY?: number;
  compositionCropRect?: NormalizedRect | null;
  activeTemplateLabel?: string | null;
  selectedStampId?: string | null;
  onSelectStamp?: (id: string | null) => void;
  onStampMove?: (id: string, x: number, y: number) => void;
  onStampPatch?: (id: string, patch: StampPatch) => void;
  onStampMoveEnd?: () => void;
  qrSrc?: string | null;
  onSelectionChange: (sel: NormalizedRect) => void;
  onInteractionEnd?: () => void;
  compact?: boolean;
};

type Layout = { ox: number; oy: number; dw: number; dh: number };

type DragState = { lastNx: number; lastNy: number };

function pointerNorm(e: React.PointerEvent, layout: Layout, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  return {
    nx: (px - layout.ox) / layout.dw,
    ny: (py - layout.oy) / layout.dh
  };
}

export function PreviewizerStudioCanvas({
  imageEl,
  preset,
  selection,
  aspectKey,
  outputSize,
  overlayDoc,
  platformId,
  titleText,
  compositionId = null,
  compositionProps = null,
  compositionImageSrc = null,
  compositionFocalX = 50,
  compositionFocalY = 50,
  compositionCropRect = null,
  activeTemplateLabel,
  selectedStampId = null,
  onSelectStamp,
  onStampMove,
  onStampPatch,
  onStampMoveEnd,
  qrSrc = null,
  onSelectionChange,
  onInteractionEnd,
  compact = false
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const layoutRef = useRef<Layout>({ ox: 0, oy: 0, dw: 1, dh: 1 });
  const [layout, setLayout] = useState<Layout>({ ox: 0, oy: 0, dw: 1, dh: 1 });
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageEl?.complete) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw < 2 || ch < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const outAspect = outputSize.width / outputSize.height;
    const viewAspect = cw / ch;
    let dw: number;
    let dh: number;
    if (viewAspect > outAspect) {
      dh = ch;
      dw = ch * outAspect;
    } else {
      dw = cw;
      dh = cw / outAspect;
    }
    const ox = (cw - dw) / 2;
    const oy = (ch - dh) / 2;
    const nextLayout = { ox, oy, dw, dh };
    layoutRef.current = nextLayout;
    setLayout(nextLayout);

    const base = document.createElement("canvas");
    base.width = outputSize.width;
    base.height = outputSize.height;
    const baseCtx = base.getContext("2d");
    if (!baseCtx) return;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, cw, ch);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (compositionId === "blur_plug") {
      applyExactSelectionCrop(baseCtx, imageEl, selection, outputSize);
      ctx.drawImage(base, ox, oy, dw, dh);
    } else {
      applyPreset(baseCtx, imageEl, preset, selection, aspectKey);
      ctx.drawImage(base, ox, oy, dw, dh);

      const off = document.createElement("canvas");
      off.width = outputSize.width;
      off.height = outputSize.height;
      const octx = off.getContext("2d");
      if (octx) {
        applyOverlayDocument(octx, outputSize, overlayDoc, logoImagesRef.current);
        ctx.drawImage(off, ox, oy, dw, dh);
      }
    }
  }, [
    imageEl,
    outputSize,
    overlayDoc,
    preset,
    selection,
    aspectKey,
    compositionId
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = new Map<string, HTMLImageElement>();
      for (const layer of overlayDoc.logoLayers) {
        try {
          map.set(layer.src, await loadOverlayImage(layer.src));
        } catch {
          /* skip */
        }
      }
      if (!cancelled) {
        logoImagesRef.current = map;
        void draw();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [overlayDoc.logoLayers, draw]);

  useEffect(() => {
    void draw();
  }, [draw, overlayDoc, preset, selection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      void draw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    const onResize = () => void draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imageEl) return;
    const layout = layoutRef.current;
    const { nx, ny } = pointerNorm(e, layout, e.currentTarget);
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { lastNx: nx, lastNy: ny };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || !imageEl) return;
    const { nx, ny } = pointerNorm(e, layoutRef.current, e.currentTarget);
    const dnx = nx - drag.lastNx;
    const dny = ny - drag.lastNy;
    if (Math.abs(dnx) < 0.0005 && Math.abs(dny) < 0.0005) return;
    dragRef.current = { lastNx: nx, lastNy: ny };
    onSelectionChange(
      compositionId === "blur_plug"
        ? panSelectionFromCropPreview(selection, dnx, dny)
        : panSelectionFromPreviewDelta(
            selection,
            imageEl.naturalWidth,
            imageEl.naturalHeight,
            aspectKey,
            dnx,
            dny
          )
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
    onInteractionEnd?.();
  }

  if (!imageEl) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] text-sm text-[#6b7280]">
        Drop an image to begin
      </div>
    );
  }

  const cursorClass = dragging ? "cursor-grabbing" : "cursor-grab";
  const aspectRatio = outputSize.width / outputSize.height;
  const compositionScale =
    layout.dw > 0 && outputSize.width > 0 ? layout.dw / outputSize.width : 1;

  return (
    <div
      className={compact ? "flex min-h-0 flex-1 flex-col gap-2" : "shrink-0"}
      style={
        compact
          ? undefined
          : {
              width: `min(100%, calc((100dvh - 220px) * ${aspectRatio}))`,
              maxWidth: "100%"
            }
      }
    >
      {!compact ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#9ca3af]">
            Drag to pan the photo — template overlay stays fixed
          </span>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={
          compact
            ? "relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]"
            : "relative w-full overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]"
        }
        style={
          compact
            ? {
                aspectRatio: `${outputSize.width} / ${outputSize.height}`,
                transition: "aspect-ratio 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
              }
            : {
                aspectRatio: `${outputSize.width} / ${outputSize.height}`,
                maxHeight: "calc(100dvh - 220px)",
                transition:
                  "aspect-ratio 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
              }
        }
      >
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 z-0 h-full w-full touch-none ${cursorClass}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-label="Preview canvas"
        />
        <div className="pointer-events-none absolute inset-0 z-10">
          {compositionId && compositionProps ? (
            <div
              className="absolute overflow-hidden"
              style={{
                left: layout.ox,
                top: layout.oy,
                width: layout.dw,
                height: layout.dh
              }}
            >
              <div
                style={{
                  width: outputSize.width,
                  height: outputSize.height,
                  transform: `scale(${compositionScale})`,
                  transformOrigin: "top left"
                }}
              >
                <PreviewizerCompositionSlot
                  compositionId={compositionId}
                  compositionProps={compositionProps}
                  imageSrc={compositionImageSrc}
                  focalX={compositionFocalX}
                  focalY={compositionFocalY}
                  cropRect={compositionCropRect}
                  selectedStampId={selectedStampId}
                  onSelectStamp={onSelectStamp}
                  onStampMove={onStampMove}
                  onStampPatch={onStampPatch}
                  onStampMoveEnd={onStampMoveEnd}
                  qrSrc={qrSrc}
                />
              </div>
            </div>
          ) : null}
          {!compositionId
            ? (overlayDoc.graphicLayers ?? [])
                .filter((layer) => layer.visible !== false)
                .map((layer) => (
                  <div
                    key={layer.id}
                    className="pointer-events-none absolute overflow-visible"
                    style={{
                      left: layout.ox + layer.rect.x * layout.dw,
                      top: layout.oy + layer.rect.y * layout.dh,
                      width: layer.rect.w * layout.dw,
                      height: layer.rect.h * layout.dh
                    }}
                  >
                    <PreviewizerV0GraphicSlot
                      layer={layer}
                      platform={platformId}
                      title={titleText}
                      scale={1}
                    />
                  </div>
                ))
            : null}
        </div>

        {activeTemplateLabel && !compact ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.75)] px-2.5 py-1">
            <span className="text-xs font-medium text-[#9bf0c4]">{activeTemplateLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
