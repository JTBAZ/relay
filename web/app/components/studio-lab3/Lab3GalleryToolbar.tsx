"use client";

import { useState, type RefObject } from "react";
import { CalendarDays, Plus, Search, SlidersHorizontal } from "lucide-react";

type Props = {
  postCount: number;
  activeCollectionId: string | null;
  q: string;
  onSetQ: (value: string) => void;
  onClearCollection: () => void;
  onOpenFilters: () => void;
  onAddWork: () => void;
  onOpenSchedule?: () => void;
  scheduleOpen?: boolean;
  filtersToggleRef?: RefObject<HTMLButtonElement | null>;
  addWorkToggleRef?: RefObject<HTMLButtonElement | null>;
  scheduleToggleRef?: RefObject<HTMLButtonElement | null>;
};

const toolBtn =
  "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-[var(--lab3-text-muted,#6a736e)] hover:text-[var(--lab3-text,#d0ddd4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]";

export function Lab3GalleryToolbar({
  postCount,
  activeCollectionId,
  q,
  onSetQ,
  onClearCollection,
  onOpenFilters,
  onAddWork,
  onOpenSchedule,
  scheduleOpen = false,
  filtersToggleRef,
  addWorkToggleRef,
  scheduleToggleRef
}: Props) {
  const [searchOpen, setSearchOpen] = useState(() => q.trim().length > 0);
  const allWork = activeCollectionId == null;

  return (
    <div
      className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--lab3-hairline,#1c211f)] bg-[var(--lab3-bg,#050706)] px-5 sm:px-6"
      data-lab3-gallery-toolbar
    >
      <div className="flex min-w-0 items-center gap-2" data-lab3-toolbar-primary>
        <button
          type="button"
          onClick={onClearCollection}
          aria-pressed={allWork}
          className={`rounded-lg px-2 py-1.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)] ${
            allWork ? "text-[var(--lab3-text-strong,#e8e8e8)]" : "text-[var(--lab3-text-muted,#6a736e)] hover:text-[var(--lab3-text,#d0ddd4)]"
          }`}
        >
          All work
        </button>
        <span className="text-[12px] tabular-nums text-[var(--lab3-text-dim,#545c58)]">
          {postCount.toLocaleString()}
        </span>
        <button
          ref={addWorkToggleRef}
          type="button"
          onClick={onAddWork}
          className="ml-1 flex h-9 items-center gap-1.5 rounded-lg border border-[var(--lab3-hairline-strong,#1e2a22)] bg-[var(--lab3-surface-2,#0a0f0b)] px-2.5 text-[12px] font-medium text-[var(--lab3-mint,#9bf0c4)] hover:border-[var(--lab3-mint,#9bf0c4)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lab3-mint,#9bf0c4)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Import
        </button>
        <div
          className="ml-3 flex items-center gap-1 border-l border-[var(--lab3-hairline,#1c211f)] pl-3"
          data-lab3-toolbar-tools
        >
          <div
            className="flex overflow-hidden"
            style={{ width: searchOpen ? "12rem" : "2.25rem" }}
          >
            {searchOpen ? (
              <input
                type="search"
                value={q}
                onChange={(e) => onSetQ(e.target.value)}
                placeholder="Search"
                aria-label="Search library"
                autoFocus
                className="h-9 w-full rounded-lg border border-[var(--lab3-hairline-strong,#1e2a22)] bg-[var(--lab3-surface-2,#0a0f0b)] px-2.5 text-[12px] text-[var(--lab3-text,#d0ddd4)] placeholder-[#3e4742] focus:border-[var(--lab3-mint,#9bf0c4)] focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search library"
                className={`${toolBtn} w-9 justify-center px-0`}
              >
                <Search className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <button
            ref={filtersToggleRef}
            type="button"
            onClick={onOpenFilters}
            className={toolBtn}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
          </button>
        </div>
      </div>

      {onOpenSchedule ? (
        <button
          ref={scheduleToggleRef}
          type="button"
          onClick={onOpenSchedule}
          aria-expanded={scheduleOpen}
          aria-label={scheduleOpen ? "Close schedule" : "Open schedule"}
          className={`${toolBtn} lg:hidden`}
          data-lab3-toolbar-schedule=""
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          Schedule
        </button>
      ) : null}
    </div>
  );
}
