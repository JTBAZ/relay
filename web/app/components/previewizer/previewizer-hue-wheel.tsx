"use client";

import { useCallback, useRef } from "react";
import { buildCollageWindowsPalette } from "./compositions/collage-windows-palette";

type PreviewizerHueWheelProps = {
  value: number;
  onChange: (hue: number) => void;
};

function pickHueFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  innerRatio: number,
  outerRatio: number
): number | null {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const outer = (rect.width / 2) * outerRatio;
  const inner = (rect.width / 2) * innerRatio;

  if (dist < inner || dist > outer) return null;

  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

export function PreviewizerHueWheel({ value, onChange }: PreviewizerHueWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const preview = buildCollageWindowsPalette(value).preview;

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current;
      if (!el) return;
      const next = pickHueFromPointer(clientX, clientY, el.getBoundingClientRect(), 0.52, 1);
      if (next !== null) onChange(next);
    },
    [onChange]
  );

  return (
    <div className="flex items-center gap-4">
      <div
        ref={wheelRef}
        className="relative h-[7.5rem] w-[7.5rem] shrink-0 touch-none select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          updateFromPointer(event.clientX, event.clientY);
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))"
          }}
        />
        <div className="absolute inset-[52%] rounded-full border border-[#2a2a2a] bg-[#0a0a0a]" />
        <div
          className="absolute inset-[52%] rounded-full border border-[#3a3a3a]"
          style={{ backgroundColor: preview }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${value}deg)` }}
        >
          <div className="absolute left-1/2 top-[11%] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#9ca3af]">Hue</span>
          <span className="text-xs font-medium tabular-nums text-[#f9fafb]">{value}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-[#6B7FD4]"
        />
      </div>
    </div>
  );
}
