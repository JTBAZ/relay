"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { CalendarClock, ImageIcon, Rocket, X } from "lucide-react";
import {
  readStagedMediaDrag,
  RELAY_STAGED_MEDIA_MIME,
  type StagedMediaDragItem,
} from "@/lib/staged-media-dnd";

export type DropAssetsFilledItem = StagedMediaDragItem;

export type DropScheduleTarget = {
  id: string;
  title: string;
  at: string;
  needsMedia: boolean;
};

type Phase = "idle" | "choice" | "pick-event";

type DropAssetsCardProps = {
  filled: DropAssetsFilledItem[];
  onFilledChange: (items: DropAssetsFilledItem[]) => void;
  /** Leave Scheduler → Autopost with media prefilled (platform / compose handoff). */
  onAutopost: (mediaIds: string[]) => void;
  /** Upcoming / open events that can receive media. */
  scheduleTargets: DropScheduleTarget[];
  /** Attach filled media to the chosen schedule event. */
  onScheduleAttach: (eventId: string, mediaIds: string[]) => void | Promise<void>;
  attachBusy?: boolean;
  timeZone?: string;
  /** ritual = lab2 magnetic drop + decisive choice panel. */
  presentation?: "default" | "ritual";
};

function formatEventWhen(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function DropAssetsCard({
  filled,
  onFilledChange,
  onAutopost,
  scheduleTargets,
  onScheduleAttach,
  attachBusy = false,
  timeZone,
  presentation = "default",
}: DropAssetsCardProps) {
  const ritual = presentation === "ritual";
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [justDropped, setJustDropped] = useState(false);

  const previewItems = useMemo(() => filled.slice(0, 3), [filled]);
  const extraCount = Math.max(0, filled.length - previewItems.length);
  const mediaIds = useMemo(() => filled.map((it) => it.id), [filled]);

  useEffect(() => {
    if (filled.length === 0) {
      setPhase("idle");
      setAttachError(null);
      setJustDropped(false);
      return;
    }
    setPhase((prev) => (prev === "idle" ? "choice" : prev));
  }, [filled.length]);

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
    setPhase("choice");
    setAttachError(null);
    if (ritual && !prefersReducedMotion()) {
      setJustDropped(true);
      window.setTimeout(() => setJustDropped(false), 420);
    }
  }

  function clearFilled() {
    onFilledChange([]);
    setPhase("idle");
    setAttachError(null);
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

  if (filled.length === 0) {
    if (ritual) {
      /* Idle invite lives in Lab2IntakeBand (corridor-aligned with Import Bay). */
      return null;
    }

    return (
      <div
        role="region"
        aria-label="Drop media onto Scheduler"
        {...dragHandlers}
        className={`group flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-3 transition-all duration-200 ${
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
            Then choose AutoPost or Schedule Post
          </span>
        </span>
      </div>
    );
  }

  /* Filled — choice / pick-event */
  if (ritual) {
    const primary = filled[0]!;
    const primaryMime = (primary.mimeType ?? "").toLowerCase();
    const kindBadge = primaryMime.startsWith("video/")
      ? "VID"
      : primaryMime.startsWith("audio/")
        ? "AUD"
        : "IMG";
    const displayName =
      filled.length === 1 ? primary.filename : `${filled.length} assets ready`;

    return (
      <div
        role="region"
        aria-label="Dropped media"
        data-lab2-route-panel
        {...dragHandlers}
        className={`overflow-hidden rounded-xl border border-[#1a2a1e] bg-[#080d09] transition-all duration-300 motion-reduce:transition-none ${
          dragOver
            ? "shadow-[0_0_0_1px_rgba(155,240,196,0.25)]"
            : justDropped
              ? "shadow-[0_0_24px_rgba(155,240,196,0.1)]"
              : ""
        }`}
        style={
          prefersReducedMotion()
            ? undefined
            : { animation: "lab2-choice-settle 280ms cubic-bezier(0.16,1,0.3,1) both" }
        }
      >
        {/* Media header */}
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-[#1e2a22] bg-[#0c100e]">
            {primary.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- staging URLs
              <img src={primary.src} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#3a4a44]">
                <ImageIcon className="h-4 w-4" aria-hidden />
              </div>
            )}
            <span className="absolute bottom-0.5 left-0.5 rounded bg-[#050706]/90 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-[#8ea898]">
              {kindBadge}
            </span>
            {extraCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 rounded bg-[#050706]/90 px-1 py-px text-[7px] font-semibold tabular-nums text-[#9bf0c4]">
                +{extraCount}
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold leading-tight text-[#edf2ef]">
              {displayName}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#5a6a62]">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#9bf0c4]" aria-hidden />
              Ready to route
            </p>
          </div>
          <button
            type="button"
            onClick={clearFilled}
            className="flex-shrink-0 rounded-md p-1 text-[#2a3a30] transition-colors hover:text-[#5a6a5e]"
            aria-label="Clear dropped assets"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {phase === "choice" ? (
          <div className="border-t border-[#111]" data-testid="drop-assets-choice-ritual">
            <p className="px-3.5 pb-1.5 pt-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#3a4a3e]">
              Route to
            </p>
            <button
              type="button"
              onClick={() => onAutopost(mediaIds)}
              className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[#0c1510]"
              data-testid="drop-assets-autopost"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[#1e3a28] bg-[#0e1c14] text-[#9bf0c4]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path
                    d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[#edf2ef]">AutoPost now</span>
                <span className="mt-0.5 block text-[10px] text-[#5a6a62]">Publish immediately</span>
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className="flex-shrink-0 text-[#2e4038] transition-transform group-hover:translate-x-0.5 group-hover:text-[#5fb98f]"
                aria-hidden
              >
                <path
                  d="M4.5 2.5L8 6l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="mx-3.5 h-px bg-[#111]" aria-hidden />
            <button
              type="button"
              onClick={() => {
                setAttachError(null);
                setPhase("pick-event");
              }}
              className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[#0c1510]"
              data-testid="drop-assets-schedule"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[#1e2a22] bg-[#0a0f0b] text-[#8ea898]">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[#edf2ef]">Schedule post</span>
                <span className="mt-0.5 block text-[10px] text-[#5a6a62]">Choose a future event</span>
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className="flex-shrink-0 text-[#2e4038] transition-transform group-hover:translate-x-0.5 group-hover:text-[#5fb98f]"
                aria-hidden
              >
                <path
                  d="M4.5 2.5L8 6l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ) : null}

        {phase === "pick-event" ? (
          <div
            className="space-y-2 border-t border-[#111] px-3 py-2.5"
            data-testid="drop-assets-event-picker"
          >
            <div className="flex items-center justify-between gap-2 px-0.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#3a4a3e]">
                Attach to
              </p>
              <button
                type="button"
                onClick={() => setPhase("choice")}
                className="text-[10px] text-[#4a5a4e] hover:text-[#8ea898]"
              >
                Back
              </button>
            </div>
            {scheduleTargets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#1a2a1e] px-2.5 py-3 text-center text-[10px] leading-snug text-[#3a4a3e]">
                No media-ready events this month. Add a scheduled post with +, then drop again.
              </p>
            ) : (
              <ul className="max-h-[180px] space-y-1 overflow-y-auto library-hide-scrollbars">
                {scheduleTargets.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      disabled={attachBusy}
                      onClick={() => {
                        setAttachError(null);
                        void Promise.resolve(onScheduleAttach(target.id, mediaIds)).catch(
                          (err: unknown) => {
                            setAttachError(
                              err instanceof Error ? err.message : "Could not attach media."
                            );
                          }
                        );
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[#2a4a2e] hover:bg-[#0e1c11] disabled:opacity-50"
                    >
                      <span className="line-clamp-2 text-[11px] font-medium text-[#8ea898]">
                        {target.title}
                      </span>
                      <span className="text-[9px] text-[#3a4a3e]">
                        {formatEventWhen(target.at, timeZone)}
                        {target.needsMedia ? " · needs media" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachError ? (
              <p className="text-[10px] text-red-400" role="alert">
                {attachError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Dropped media"
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

      <div className="space-y-2 border-t border-[#1a1a1a] px-2.5 py-2.5">
        <p className="truncate text-[11px] font-medium text-[#e8e8e8]">
          {filled.length === 1 ? filled[0]!.filename : `${filled.length} assets ready`}
        </p>

        {phase === "choice" ? (
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => onAutopost(mediaIds)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#9bf0c4] py-2 text-[11px] font-semibold text-[#050706] transition-colors hover:bg-[#b8f5d4]"
              data-testid="drop-assets-autopost"
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              AutoPost
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachError(null);
                setPhase("pick-event");
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2a302d] bg-[#121512] py-2 text-[11px] font-semibold text-[#c8cec9] transition-colors hover:border-[#3a453f] hover:bg-[#171b18]"
              data-testid="drop-assets-schedule"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Schedule Post
            </button>
            <p className="text-center text-[9px] leading-snug text-[#545c58]">
              AutoPost publishes now · Schedule attaches to a queued event
            </p>
          </div>
        ) : null}

        {phase === "pick-event" ? (
          <div className="space-y-2" data-testid="drop-assets-event-picker">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">
                Which event?
              </p>
              <button
                type="button"
                onClick={() => setPhase("choice")}
                className="text-[10px] text-[#888] hover:text-[#c8cec9]"
              >
                Back
              </button>
            </div>
            {scheduleTargets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#2a302d] px-2.5 py-3 text-center text-[10px] leading-snug text-[#6b7280]">
                No media-ready events this month. Add a scheduled post with +, then drop again.
              </p>
            ) : (
              <ul className="max-h-[160px] space-y-1 overflow-y-auto library-hide-scrollbars">
                {scheduleTargets.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      disabled={attachBusy}
                      onClick={() => {
                        setAttachError(null);
                        void Promise.resolve(onScheduleAttach(target.id, mediaIds)).catch(
                          (err: unknown) => {
                            setAttachError(
                              err instanceof Error ? err.message : "Could not attach media."
                            );
                          }
                        );
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-[#1d211e] bg-[#0c0e0c] px-2.5 py-2 text-left transition-colors hover:border-[#2a302c] hover:bg-[#121512] disabled:opacity-50"
                    >
                      <span className="line-clamp-2 text-[11px] font-medium text-[#e8e8e8]">
                        {target.title}
                      </span>
                      <span className="text-[9px] text-[#6b7280]">
                        {formatEventWhen(target.at, timeZone)}
                        {target.needsMedia ? " · needs media" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachError ? (
              <p className="text-[10px] text-red-400" role="alert">
                {attachError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
