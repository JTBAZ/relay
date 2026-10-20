"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BlurPlugProps,
  BlurPlugRevealShape
} from "./previewizer-template-compositions";
import {
  panSelectionInImageSpace,
  scaleSelectionAboutCenter,
  type AspectRatioKey,
  type NormalizedRect
} from "./previewizer-presets";

type Props = {
  imageEl: HTMLImageElement | null;
  aspectKey: AspectRatioKey;
  selection: NormalizedRect;
  blurProps: BlurPlugProps;
  onSelectionChange: (sel: NormalizedRect, trackUndo?: boolean) => void;
  onBlurPropsChange: (patch: Partial<BlurPlugProps>) => void;
  onInteractionEnd?: () => void;
  /** Drawer embed fills the reveal column; floating keeps the old sticky card. */
  variant?: "floating" | "drawer";
};

type DragMode = "pan-box" | "resize" | "reveal" | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hitReveal(
  nx: number,
  ny: number,
  props: BlurPlugProps,
  sel: NormalizedRect
): boolean {
  if (props.revealShape === "none") return false;
  if (nx < sel.x || nx > sel.x + sel.w || ny < sel.y || ny > sel.y + sel.h) return false;
  // Local % within the selection box (same space as revealX/Y)
  const lx = ((nx - sel.x) / sel.w) * 100;
  const ly = ((ny - sel.y) / sel.h) * 100;
  const size = Math.max(1, props.revealSize);
  // Aspect-correct: radius is % of shorter side (matches main preview cqmin + drawRevealShape)
  const short = Math.min(sel.w, sel.h);
  const scaleX = (sel.w / short) * size;
  const scaleY = (sel.h / short) * size;
  const dx = (lx - props.revealX) / scaleX;
  const dy = (ly - props.revealY) / scaleY;
  if (props.revealShape === "circle") {
    return dx * dx + dy * dy < 1.2;
  }
  if (props.revealShape === "diamond") {
    return Math.abs(dx) + Math.abs(dy) < 1.2;
  }
  return Math.abs(dx) <= 1.1 && Math.abs(dy) <= 1.1;
}

function hitSelection(nx: number, ny: number, sel: NormalizedRect): boolean {
  return nx >= sel.x && nx <= sel.x + sel.w && ny >= sel.y && ny <= sel.y + sel.h;
}

function hitResizeHandle(nx: number, ny: number, sel: NormalizedRect): boolean {
  const hx = sel.x + sel.w;
  const hy = sel.y + sel.h;
  const r = 0.04;
  return Math.abs(nx - hx) <= r && Math.abs(ny - hy) <= r;
}

function drawRevealShape(
  ctx: CanvasRenderingContext2D,
  shape: BlurPlugRevealShape,
  cx: number,
  cy: number,
  sizePx: number
) {
  if (shape === "none") return;
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(cx, cy, sizePx, 0, Math.PI * 2);
  } else if (shape === "rect") {
    ctx.rect(cx - sizePx, cy - sizePx, sizePx * 2, sizePx * 2);
  } else {
    ctx.moveTo(cx, cy - sizePx);
    ctx.lineTo(cx + sizePx, cy);
    ctx.lineTo(cx, cy + sizePx);
    ctx.lineTo(cx - sizePx, cy);
    ctx.closePath();
  }
}

export function PreviewizerBlurPlugMinimap({
  imageEl,
  aspectKey,
  selection,
  blurProps,
  onSelectionChange,
  onBlurPropsChange,
  onInteractionEnd,
  variant = "floating"
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startNx: number;
    startNy: number;
    startSel: NormalizedRect;
    startRevealX: number;
    startRevealY: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const imgAspect =
    imageEl && imageEl.naturalHeight > 0
      ? imageEl.naturalWidth / imageEl.naturalHeight
      : 1;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame || !imageEl?.complete) return;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);

    // Full base image, letterboxed into the tool frame
    const fit = Math.min(w / imageEl.naturalWidth, h / imageEl.naturalHeight);
    const dw = imageEl.naturalWidth * fit;
    const dh = imageEl.naturalHeight * fit;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    ctx.drawImage(imageEl, ox, oy, dw, dh);

    const sx = ox + selection.x * dw;
    const sy = oy + selection.y * dh;
    const sw = selection.w * dw;
    const sh = selection.h * dh;

    // Dim outside the aspect-locked selection box
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(sx, sy, sw, sh);
    ctx.clip("evenodd");
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.strokeStyle = "rgba(155,240,196,0.95)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);

    // Resize handle (bottom-right)
    const hs = 8;
    ctx.fillStyle = "rgba(155,240,196,0.95)";
    ctx.fillRect(sx + sw - hs / 2, sy + sh - hs / 2, hs, hs);

    // Reveal window inside the crop box
    if (blurProps.revealShape !== "none") {
      const rcx = sx + (blurProps.revealX / 100) * sw;
      const rcy = sy + (blurProps.revealY / 100) * sh;
      const rsize = (blurProps.revealSize / 100) * Math.min(sw, sh);
      ctx.save();
      ctx.fillStyle = "rgba(124,58,237,0.28)";
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1.5;
      drawRevealShape(ctx, blurProps.revealShape, rcx, rcy, rsize);
      ctx.fill();
      drawRevealShape(ctx, blurProps.revealShape, rcx, rcy, rsize);
      ctx.stroke();
      ctx.restore();
    }
  }, [imageEl, selection, blurProps]);

  useEffect(() => {
    void draw();
  }, [draw]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => void draw());
    ro.observe(frame);
    return () => ro.disconnect();
  }, [draw]);

  function pointerNorm(e: React.PointerEvent) {
    const frame = frameRef.current;
    if (!frame || !imageEl) return { nx: 0, ny: 0 };
    const rect = frame.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const fit = Math.min(rect.width / imageEl.naturalWidth, rect.height / imageEl.naturalHeight);
    const dw = imageEl.naturalWidth * fit;
    const dh = imageEl.naturalHeight * fit;
    const ox = (rect.width - dw) / 2;
    const oy = (rect.height - dh) / 2;
    return {
      nx: clamp((px - ox) / dw, 0, 1),
      ny: clamp((py - oy) / dh, 0, 1)
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imageEl) return;
    const { nx, ny } = pointerNorm(e);
    const onReveal = hitReveal(nx, ny, blurProps, selection);
    e.currentTarget.setPointerCapture(e.pointerId);

    let mode: DragMode = "pan-box";
    let liveSel = selection;
    if (onReveal) {
      mode = "reveal";
    } else if (hitResizeHandle(nx, ny, selection)) {
      mode = "resize";
    } else if (!hitSelection(nx, ny, selection)) {
      liveSel = panSelectionInImageSpace(
        selection,
        nx - (selection.x + selection.w / 2),
        ny - (selection.y + selection.h / 2)
      );
      onSelectionChange(liveSel, false);
    }

    dragRef.current = {
      mode,
      startNx: nx,
      startNy: ny,
      startSel: { ...liveSel },
      startRevealX: blurProps.revealX,
      startRevealY: blurProps.revealY,
      moved: false
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !imageEl) return;
    const { nx, ny } = pointerNorm(e);

    if (drag.mode === "pan-box") {
      const dnx = nx - drag.startNx;
      const dny = ny - drag.startNy;
      if (Math.abs(dnx) < 0.0005 && Math.abs(dny) < 0.0005) return;
      dragRef.current = { ...drag, moved: true };
      onSelectionChange(panSelectionInImageSpace(drag.startSel, dnx, dny), false);
      return;
    }

    if (drag.mode === "resize") {
      const start = drag.startSel;
      const startSize = Math.max(start.w, start.h);
      const dx = nx - (start.x + start.w);
      const dy = ny - (start.y + start.h);
      const delta = Math.max(dx, dy);
      const factor = clamp((startSize + delta) / Math.max(startSize, 0.01), 0.25, 4);
      dragRef.current = { ...drag, moved: true };
      onSelectionChange(scaleSelectionAboutCenter(start, factor, aspectKey, imgAspect), false);
      return;
    }

    if (drag.mode === "reveal") {
      const pdx = ((nx - drag.startNx) / Math.max(selection.w, 0.01)) * 100;
      const pdy = ((ny - drag.startNy) / Math.max(selection.h, 0.01)) * 100;
      if (Math.abs(pdx) > 0.4 || Math.abs(pdy) > 0.4) {
        dragRef.current = { ...drag, moved: true };
      }
      onBlurPropsChange({
        revealX: clamp(Math.round(drag.startRevealX + pdx), 0, 100),
        revealY: clamp(Math.round(drag.startRevealY + pdy), 0, 100)
      });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
    onInteractionEnd?.();
  }

  const zoomPct = Math.round((1 / Math.max(selection.w, selection.h)) * 100);
  const isDrawer = variant === "drawer";

  return (
    <div
      className={
        isDrawer
          ? "w-full rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-3 shadow-[0_0_0_1px_rgba(155,240,196,0.06)]"
          : "sticky top-4 w-[252px] shrink-0 self-start rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_1px_rgba(155,240,196,0.06)]"
      }
    >
      <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        className={`relative w-full overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ aspectRatio: "1 / 1" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs text-[#9ca3af]">Zoom ({zoomPct}%)</span>
          <input
            type="range"
            min={8}
            max={100}
            value={Math.round(Math.max(selection.w, selection.h) * 100)}
            onChange={(e) => {
              if (!imageEl) return;
              const target = Number(e.target.value) / 100;
              const current = Math.max(selection.w, selection.h);
              const factor = target / Math.max(current, 0.01);
              onSelectionChange(
                scaleSelectionAboutCenter(selection, factor, aspectKey, imgAspect),
                true
              );
            }}
            className="mt-1 w-full accent-[#9bf0c4]"
          />
        </label>
        {isDrawer && blurProps.revealShape !== "none" ? (
          <>
            <label className="block">
              <span className="text-xs text-[#9ca3af]">Size ({blurProps.revealSize}%)</span>
              <input
                type="range"
                min={8}
                max={50}
                value={blurProps.revealSize}
                onChange={(e) =>
                  onBlurPropsChange({ revealSize: Number(e.target.value) })
                }
                className="mt-1 w-full accent-[#a78bfa]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#9ca3af]">Feather ({blurProps.revealFeather})</span>
              <input
                type="range"
                min={0}
                max={100}
                value={blurProps.revealFeather}
                onChange={(e) =>
                  onBlurPropsChange({ revealFeather: Number(e.target.value) })
                }
                className="mt-1 w-full accent-[#a78bfa]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#9ca3af]">
                Opacity ({blurProps.revealOpacity ?? 100}%)
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={blurProps.revealOpacity ?? 100}
                onChange={(e) =>
                  onBlurPropsChange({ revealOpacity: Number(e.target.value) })
                }
                className="mt-1 w-full accent-[#a78bfa]"
              />
            </label>
          </>
        ) : null}
      </div>
      </div>
    </div>
  );
}
