"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedRect } from "./previewizer-presets";

export type SelectionShape = "rect" | "ellipse";

type Props = {
  imageUrl: string | null;
  selection: NormalizedRect;
  onSelectionChange: (sel: NormalizedRect) => void;
  selectionShape?: SelectionShape;
  disabled?: boolean;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeDrag(
  start: { x: number; y: number },
  end: { x: number; y: number }
): NormalizedRect {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x, end.x);
  const y2 = Math.max(start.y, end.y);
  return {
    x: clamp01(x1),
    y: clamp01(y1),
    w: Math.max(0.02, clamp01(x2) - clamp01(x1)),
    h: Math.max(0.02, clamp01(y2) - clamp01(y1))
  };
}

export function PreviewizerCanvas({
  imageUrl,
  selection,
  onSelectionChange,
  selectionShape = "ellipse",
  disabled = false
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragCurrent = useRef<{ x: number; y: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!canvas || !container || !img?.complete) return;

    const cw = container.clientWidth;
    const ch = Math.min(container.clientWidth * 0.85, 480);
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const ox = (cw - dw) / 2;
    const oy = (ch - dh) / 2;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, ox, oy, dw, dh);

    const sel = dragging && dragStart.current && dragCurrent.current
      ? normalizeDrag(dragStart.current, dragCurrent.current)
      : selection;

    const sx = ox + sel.x * dw;
    const sy = oy + sel.y * dh;
    const sw = sel.w * dw;
    const sh = sel.h * dh;

    ctx.save();
    ctx.fillStyle = "rgba(0, 170, 111, 0.12)";
    ctx.strokeStyle = "rgba(155, 240, 196, 0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (selectionShape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(155, 240, 196, 0.95)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FOCAL AREA", sx + sw / 2, sy + sh / 2);
    ctx.restore();
  }, [dragging, selection, selectionShape]);

  useEffect(() => {
    if (!imageUrl) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.src = imageUrl;
  }, [imageUrl, draw]);

  useEffect(() => {
    draw();
  }, [selection, draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  function pointerToNormalized(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const ox = (canvas.width - dw) / 2;
    const oy = (canvas.height - dh) / 2;
    return {
      x: clamp01((px - ox) / dw),
      y: clamp01((py - oy) / dh)
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !imageUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointerToNormalized(e);
    dragStart.current = p;
    dragCurrent.current = p;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging || !dragStart.current) return;
    dragCurrent.current = pointerToNormalized(e);
    draw();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging || !dragStart.current || !dragCurrent.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const next = normalizeDrag(dragStart.current, dragCurrent.current);
    onSelectionChange(next);
    dragStart.current = null;
    dragCurrent.current = null;
    setDragging(false);
  }

  if (!imageUrl) {
    return (
      <div
        ref={containerRef}
        className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] text-sm text-[#6b7280]"
      >
        Upload an image to begin
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair touch-none"
        style={{ maxHeight: 480 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        aria-label="Drag to mark focal area"
      />
      <p className="border-t border-[#1a1a1a] px-3 py-2 text-[11px] text-[#6b7280]">
        Drag to mark the focal area — presets use this region
      </p>
    </div>
  );
}
