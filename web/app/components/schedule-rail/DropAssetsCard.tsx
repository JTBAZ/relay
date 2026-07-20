"use client";

import Link from "next/link";
import { useMemo, useState, type DragEvent } from "react";
import { ImageIcon, X } from "lucide-react";
import { CrosspostChipRow } from "@/app/components/distribution/platform-presence-chips";
import LibraryEmptyState from "@/app/components/studio/LibraryEmptyState";
import {
  readStagedMediaDrag,
  RELAY_STAGED_MEDIA_MIME,
  type StagedMediaDragItem,
} from "@/lib/staged-media-dnd";

/** Dev mock planned destinations for an armed Drop Assets cue. */
const DEFAULT_PRESENT = ["patreon", "x"] as const;
const DEFAULT_MISSING = ["bluesky"] as const;

export type DropAssetsFilledItem = StagedMediaDragItem;

type DropAssetsCardProps = {
  armed: boolean;
  filled: DropAssetsFilledItem[];
  onFilledChange: (items: DropAssetsFilledItem[]) => void;
  onCommit: (mediaIds: string[]) => void;
  presentDestinations?: string[];
  missingDestinations?: string[];
};

export function DropAssetsCard({
  armed,
  filled,
  onFilledChange,
  onCommit,
  presentDestinations = [...DEFAULT_PRESENT],
  missingDestinations = [...DEFAULT_MISSING],
}: DropAssetsCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);

  const previewItems = useMemo(() => filled.slice(0, 3), [filled]);
  const extraCount = Math.max(0, filled.length - previewItems.length);
  const showChips =
    armed && (presentDestinations.length > 0 || missingDestinations.length > 0);

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
          mimeType: "application/octet-stream",
        });
      }
    }
    onFilledChange([...byId.values()]);
  }

  function clearFilled() {
    onFilledChange([]);
  }

  const dragHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (
        ![...e.dataTransfer.types].includes(RELAY_STAGED_MEDIA_MIME) &&
        ![...e.dataTransfer.types].includes("text/plain")
      ) {
        return;
      }
      e.preventDefault();
      setDragOver(true);
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDragOver(false);
    },
    onDrop: acceptDrop,
  };

  /* Disarmed — intentional empty (Phase 7); drop bin only when cued. */
  if (!armed && filled.length === 0) {
    return (
      <LibraryEmptyState
        variant="no_cues"
        dashed
        className="border-[#2a302d] bg-[#ffffff05] py-4 [&>p:first-child]:text-[11px] [&>p:first-child]:text-[#aeb7b2] [&>p:last-of-type]:text-[9px] [&>p:last-of-type]:text-[#545c58]"
        action={
          <Link
            href="/studio/autopost"
            className="text-[10px] text-[#9bf0c4]/80 underline-offset-2 hover:text-[#9bf0c4] hover:underline"
          >
            Open Autopost
          </Link>
        }
      />
    );
  }

  /* Empty — compact v0 dashed bin; keep Import Bay MIME wiring */
  if (filled.length === 0) {
    return (
      <div
        role="region"
        aria-label="Drop media here"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...dragHandlers}
        className={`group flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-3 transition-all duration-200 ${
          dragOver
            ? "scale-[1.02] border-[#9bf0c4] bg-[#9bf0c414] text-[#c8f8df]"
            : "border-[#2a302d] bg-[#ffffff05] text-[#727b76] hover:border-[#9bf0c466] hover:bg-[#9bf0c40a] hover:text-[#b6c1bb]"
        }`}
      >
        <span
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
            dragOver
              ? "bg-[#9bf0c424] text-[#9bf0c4]"
              : "bg-[#151a17] text-[#68716c] group-hover:bg-[#9bf0c414] group-hover:text-[#9bf0c4]"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 10.5V2.5M5.2 5.3 8 2.5l2.8 2.8M3 9.5v2.3A1.7 1.7 0 0 0 4.7 13.5h6.6a1.7 1.7 0 0 0 1.7-1.7V9.5"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-[11px] font-medium leading-none text-[#aeb7b2] group-hover:text-[#d5ddd9]">
            {dragOver ? "Release to drop" : "Drop media here"}
          </span>
          <span className="text-[8px] leading-none text-[#545c58]">
            Drag from Import Bay ·{" "}
            <Link
              href="/studio/autopost"
              className="text-[#9bf0c4]/80 underline-offset-2 hover:text-[#9bf0c4] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Autopost
            </Link>
          </span>
        </span>
        {showChips ? (
          <div className="ml-auto shrink-0 opacity-80">
            <CrosspostChipRow
              present={presentDestinations}
              missing={missingDestinations}
              parentHovered={hovered || dragOver}
            />
          </div>
        ) : null}
      </div>
    );
  }

  /* Filled — compact thumbs + commit (same contracts) */
  return (
    <div
      role="region"
      aria-label="Dropped media"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...dragHandlers}
      className={`overflow-hidden rounded-2xl border bg-[#0a0a0a] transition-all duration-150 ${
        dragOver
          ? "border-[#9bf0c4] shadow-[0_0_0_1px_rgba(155,240,196,0.35)]"
          : "border-[#2a2a2a]"
      }`}
    >
      <div className="relative flex h-[56px] w-full gap-0.5 p-1">
        {previewItems.map((item) => (
          <div
            key={item.id}
            className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-[#111]"
          >
            {item.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- staging URLs
              <img src={item.src} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-3.5 w-3.5 text-[#555]" aria-hidden />
              </div>
            )}
          </div>
        ))}
        {extraCount > 0 ? (
          <div className="flex w-7 shrink-0 items-center justify-center rounded-md bg-[#161616] text-[9px] tabular-nums text-[#888]">
            +{extraCount}
          </div>
        ) : null}
        <button
          type="button"
          onClick={clearFilled}
          className="absolute right-1 top-1 rounded border border-[#2a2a2a] bg-[#0a0a0a]/90 p-0.5 text-[#666] hover:text-[#aaa]"
          aria-label="Clear dropped assets"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>

      <div className="space-y-2 border-t border-[#1a1a1a] px-2.5 py-2">
        <p className="truncate text-[11px] font-medium text-[#e8e8e8]">
          {filled.length === 1 ? filled[0]!.filename : `${filled.length} assets ready`}
        </p>
        {showChips ? (
          <CrosspostChipRow
            present={presentDestinations}
            missing={missingDestinations}
            parentHovered={hovered || dragOver}
          />
        ) : null}
        <button
          type="button"
          onClick={() => onCommit(filled.map((it) => it.id))}
          className="w-full rounded-lg bg-[#9bf0c4] py-1.5 text-[11px] font-semibold text-[#050706] transition-colors hover:bg-[#b8f5d4]"
        >
          Commit to Autopost
        </button>
      </div>
    </div>
  );
}
