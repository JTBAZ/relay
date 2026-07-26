"use client";

import { useMemo, useState, type DragEvent } from "react";
import { ImageIcon, Sparkles, X } from "lucide-react";
import {
  readStagedMediaDrag,
  RELAY_STAGED_MEDIA_MIME,
  type StagedMediaDragItem,
} from "@/lib/staged-media-dnd";

type Props = {
  filled: StagedMediaDragItem[];
  onFilledChange: (items: StagedMediaDragItem[]) => void;
  onCommit: (mediaIds: string[]) => void;
  /** VS8 — clear attached media on the server when the bin is emptied. */
  onClearAttached?: () => void | Promise<void>;
  commitLabel?: string;
  commitDisabled?: boolean;
  /** Server-attached count when local staging is empty. */
  attachedCount?: number;
  readinessErrors?: string[];
};

/**
 * Compact Import Bay drop target for EventPopover (post actions only).
 * Drop replaces the event's media set; clear removes server media.
 */
export function EventMediaDropBin({
  filled,
  onFilledChange,
  onCommit,
  onClearAttached,
  commitLabel = "Attach media",
  commitDisabled = false,
  attachedCount = 0,
  readinessErrors = [],
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const previewItems = useMemo(() => filled.slice(0, 3), [filled]);
  const extraCount = Math.max(0, filled.length - previewItems.length);
  const showAttachedHint = filled.length === 0 && attachedCount > 0;

  function acceptDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (commitDisabled) return;
    const payload = readStagedMediaDrag(e.dataTransfer);
    if (!payload) return;
    const byId = new Map<string, StagedMediaDragItem>();
    for (const id of payload.media_ids) {
      const fromPayload = payload.items?.find((it) => it.id === id);
      if (fromPayload) {
        byId.set(id, fromPayload);
      } else {
        byId.set(id, {
          id,
          src: null,
          filename: id,
          mimeType: "application/octet-stream",
        });
      }
    }
    const next = [...byId.values()];
    onFilledChange(next);
    // Replace media set on drop (VS8-T02).
    onCommit(next.map((it) => it.id));
  }

  return (
    <div className="px-4 pb-3">
      <div
        role="region"
        aria-label="Drop media for this scheduled post"
        onDragEnter={(e) => {
          if (
            ![...e.dataTransfer.types].includes(RELAY_STAGED_MEDIA_MIME) &&
            ![...e.dataTransfer.types].includes("text/plain")
          ) {
            return;
          }
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={acceptDrop}
        className={`overflow-hidden rounded-lg border transition-all duration-150 ${
          dragOver
            ? "border-[#9bf0c4] bg-[#9bf0c4]/5 shadow-[0_0_0_1px_rgba(155,240,196,0.3)]"
            : filled.length === 0 && !showAttachedHint
              ? "border-dashed border-[#3a3a3a] bg-[#0a0a0a]"
              : "border-[#2a2a2a] bg-[#0a0a0a]"
        }`}
      >
        <div className="relative flex min-h-[72px] items-center justify-center overflow-hidden">
          {filled.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
              <Sparkles
                className={`h-3.5 w-3.5 ${dragOver ? "text-[#9bf0c4]" : "text-[#555]"}`}
                aria-hidden
              />
              <p
                className={`text-[11px] font-medium leading-snug ${
                  dragOver ? "text-[#9bf0c4]" : "text-[#c8c8c8]"
                }`}
              >
                {dragOver
                  ? "Release to drop"
                  : showAttachedHint
                    ? `${attachedCount} attached — drop to replace`
                    : "Drop media here"}
              </p>
              <p className="text-[9px] text-[#555]">Import Bay → this event</p>
            </div>
          ) : (
            <div className="flex h-[72px] w-full gap-0.5 p-1">
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
            </div>
          )}
          {filled.length > 0 || showAttachedHint ? (
            <button
              type="button"
              onClick={() => {
                onFilledChange([]);
                void onClearAttached?.();
              }}
              className="absolute right-1 top-1 rounded border border-[#2a2a2a] bg-[#0a0a0a]/90 p-0.5 text-[#666] hover:text-[#aaa]"
              aria-label="Clear attached media"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {readinessErrors.length > 0 ? (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-400/90" role="status">
          Needs: {readinessErrors.join(", ")}
        </p>
      ) : null}

      {filled.length > 0 ? (
        <button
          type="button"
          disabled={commitDisabled}
          onClick={() => onCommit(filled.map((it) => it.id))}
          className="mt-2 w-full rounded-lg bg-[#9bf0c4] py-1.5 text-[11px] font-semibold text-[#050706] transition-colors hover:bg-[#b8f5d4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {commitLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Show drop bin only when the rail marks the post as needing media (armed / drag-open). */
export function eventNeedsMediaDrop(event: {
  action: string;
  status: string;
  needs_media?: boolean;
  post_id?: string | null;
  task_kind?: string | null;
}): boolean {
  if (event.status === "done") return false;
  if (event.task_kind === "social_upkeep" || event.task_kind === "active_rest") return false;
  if (event.action !== "post") return false;
  // Require explicit server flag — missing/undefined must not open a bin.
  return event.needs_media === true;
}

/** Popover media section: pending publish posts can attach or replace. */
export function eventShowsMediaBin(event: {
  action: string;
  status: string;
  post_id?: string | null;
  task_kind?: string | null;
}): boolean {
  if (event.status === "done") return false;
  if (event.task_kind === "social_upkeep" || event.task_kind === "active_rest") return false;
  if (event.action !== "post") return false;
  return true;
}

/** True when the event still requires media before publish confirmation. */
export function eventMediaIncomplete(event: {
  needs_media?: boolean;
  media_state?: string;
  readiness_errors?: string[];
}): boolean {
  if (event.needs_media === true) return true;
  if (event.media_state === "missing" || event.media_state === "partial") return true;
  return (event.readiness_errors ?? []).includes("attach_media");
}
