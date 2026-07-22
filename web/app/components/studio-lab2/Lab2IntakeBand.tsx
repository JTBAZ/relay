"use client";

import { useState, type DragEvent } from "react";
import {
  readStagedMediaDrag,
  RELAY_STAGED_MEDIA_MIME,
  type StagedMediaDragItem
} from "@/lib/staged-media-dnd";
import type { DropAssetsFilledItem } from "@/app/components/schedule-rail/DropAssetsCard";

type Props = {
  /** Bay is actively dragging media — arm the invite before pointer enters. */
  armed?: boolean;
  /** Existing filled items (merge on drop). */
  filled?: DropAssetsFilledItem[];
  onAccept: (items: DropAssetsFilledItem[]) => void;
};

function isStagedDrag(e: DragEvent): boolean {
  const types = [...e.dataTransfer.types];
  return types.includes(RELAY_STAGED_MEDIA_MIME) || types.includes("text/plain");
}

/**
 * Lab2 media-intake band — 76px row aligned with Import Bay.
 * Lights up from corridor `armed` (bay drag) or local dragOver.
 */
export function Lab2IntakeBand({ armed = false, filled = [], onAccept }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const lit = armed || dragOver;

  function acceptDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const payload = readStagedMediaDrag(e.dataTransfer);
    if (!payload) return;
    const byId = new Map(filled.map((it) => [it.id, it]));
    for (const id of payload.media_ids) {
      const fromPayload = payload.items?.find((it) => it.id === id);
      if (fromPayload) {
        byId.set(id, fromPayload);
      } else if (!byId.has(id)) {
        byId.set(id, {
          id,
          src: null,
          filename: id,
          mimeType: "application/octet-stream"
        } satisfies StagedMediaDragItem);
      }
    }
    onAccept([...byId.values()]);
  }

  return (
    <div
      data-lab2-intake-band
      data-armed={lit ? "true" : undefined}
      className={`relative flex h-[76px] flex-shrink-0 items-center justify-center px-4 transition-all duration-200 ${
        lit ? "bg-[#0a140d]" : "bg-[#080c09]"
      }`}
      onDragEnter={(e) => {
        if (!isStagedDrag(e)) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!isStagedDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={acceptDrop}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px transition-opacity duration-200"
        style={{
          background: lit
            ? "linear-gradient(to right, transparent, #9bf0c42e 45%, #9bf0c42e 100%)"
            : "linear-gradient(to right, transparent, #101813 40%, #101813 100%)"
        }}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-200 ${
          lit ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "linear-gradient(to right, #9bf0c422, transparent)" }}
      />

      <div
        role="region"
        aria-label="Drop media onto Scheduler"
        data-lab2-drop-invite
        className={`flex w-full items-center justify-center rounded-xl border py-2.5 transition-all duration-200 ${
          lit
            ? "border-[#9bf0c4] bg-[#9bf0c40e] shadow-[0_0_0_1px_#9bf0c420]"
            : "lab2-animate-drop-pulse border-dashed border-[#1a2a1e]"
        }`}
      >
        {lit ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#9bf0c4]">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 2v7M4 6l3 3 3-3M2 11h10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Release to schedule
          </span>
        ) : (
          <span className="flex flex-col items-center gap-0.5 text-center">
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#3a5040]">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M6 2v5M3.5 5L6 7.5 8.5 5M2 9.5h8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Drop media here
            </span>
            <span className="text-[8.5px] text-[#243026]">drag from the bay →</span>
          </span>
        )}
      </div>
    </div>
  );
}
