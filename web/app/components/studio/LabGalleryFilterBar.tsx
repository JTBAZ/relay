"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaTypeValue } from "@/app/components/MediaTypeMultiSelect";
import type { FacetsData } from "@/lib/relay-api";

type Props = {
  q: string;
  onSetQ: (value: string) => void;
  mediaTypes: MediaTypeValue[];
  onSetMediaTypes: (next: MediaTypeValue[]) => void;
  tagPick: string[];
  onToggleTag: (tag: string) => void;
  tierPick: string[];
  onToggleTier: (tierId: string) => void;
  facets: FacetsData;
  /** Lab: opens power/sidebar filters. Omit to hide More. */
  onOpenMoreFilters?: () => void;
  /** Soft mint chassis tokens for /studio/lab2 Active Posts. */
  variant?: "lab" | "lab2";
};

const MEDIA_OPTIONS: Array<{ label: string; value: MediaTypeValue | "all" }> = [
  { label: "All", value: "all" },
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Audio", value: "audio" },
  { label: "Text", value: "text" }
];

/**
 * Lab search + filters — schedule-rail GallerySearchBar layout (left-aligned row).
 */
export function LabGalleryFilterBar({
  q,
  onSetQ,
  mediaTypes,
  onSetMediaTypes,
  tagPick,
  onToggleTag,
  tierPick,
  onToggleTier,
  facets,
  onOpenMoreFilters,
  variant = "lab"
}: Props) {
  const [tagOpen, setTagOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLab2 = variant === "lab2";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTagOpen(false);
        setMediaOpen(false);
        setTierOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const closeAll = () => {
    setTagOpen(false);
    setMediaOpen(false);
    setTierOpen(false);
  };

  const activeTag = tagPick[0] ?? null;
  const mediaLabel =
    mediaTypes.length === 0
      ? "All"
      : MEDIA_OPTIONS.find((m) => m.value === mediaTypes[0])?.label ?? "All";
  const activeTier = facets.tiers.filter((t) => tierPick.includes(t.tier_id));
  const tierLabel =
    activeTier.length === 0
      ? "Tier"
      : activeTier.length === 1
        ? activeTier[0].title
        : `${activeTier.length} tiers`;

  const tagChoices = facets.tag_ids.slice(0, 24);
  const hasFilters =
    Boolean(q.trim()) ||
    tagPick.length > 0 ||
    mediaTypes.length > 0 ||
    tierPick.length > 0;

  const idleChip =
    "border-[#1e2a22] bg-[#0a0f0b] text-[#666c69] hover:border-[#243426] hover:text-[#aab4ae]";
  const mintActive = "border-[#9bf0c466] bg-[#9bf0c40e] text-[#9bf0c4]";
  const mediaActive = isLab2 ? mintActive : "border-[#7eb8e866] bg-[#7eb8e80e] text-[#7eb8e8]";
  const tierActive = isLab2 ? mintActive : "border-[#f0b86a66] bg-[#f0b86a0e] text-[#f0b86a]";
  const mediaActiveItem = isLab2
    ? "bg-[#9bf0c40e] text-[#9bf0c4]"
    : "bg-[#7eb8e80e] text-[#7eb8e8]";
  const tierActiveItem = isLab2
    ? "bg-[#9bf0c40e] text-[#9bf0c4]"
    : "bg-[#f0b86a0e] text-[#f0b86a]";

  const shellClass = isLab2
    ? "relative z-10 flex shrink-0 items-center gap-2 border-b border-[#0d0d0d] bg-[#070a08] px-5 py-2.5"
    : "relative z-10 flex shrink-0 items-center gap-2 border-b border-[#111] bg-[#050706] px-5 py-2.5";

  const searchClass = isLab2
    ? "group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#1e2a22] bg-[#0a0f0b] px-3 transition-colors duration-150 focus-within:border-[#2d3630] sm:max-w-[420px]"
    : "group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#1d211e] bg-[#0c0e0c] px-3 transition-colors duration-150 focus-within:border-[#2d3630] sm:max-w-[420px]";

  const menuShell =
    "absolute left-0 top-[calc(100%+6px)] z-50 max-h-64 min-w-[172px] overflow-auto rounded-xl border border-[#1e2a22] bg-[#0e100f] py-1 shadow-xl shadow-black/60";

  return (
    <div
      ref={containerRef}
      className={shellClass}
      style={{ zIndex: tagOpen || mediaOpen || tierOpen ? 30 : 10 }}
    >
      <div className={searchClass}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="shrink-0 text-[#3e4742]"
          aria-hidden
        >
          <circle cx="5.2" cy="5.2" r="3.4" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M7.8 7.8L10.2 10.2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => onSetQ(e.target.value)}
          placeholder="Search posts…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-[#c8cec9] placeholder-[#3e4742] focus:outline-none"
          aria-label="Search posts"
        />
        {q ? (
          <button
            type="button"
            onClick={() => onSetQ("")}
            className="shrink-0 text-[#3e4742] transition-colors hover:text-[#888]"
            aria-label="Clear search"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path
                d="M2 2L8 8M8 2L2 8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="h-5 w-px shrink-0 bg-[#172018]" />

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              closeAll();
              setTagOpen((v) => !v);
            }}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[11px] transition-all duration-150 ${
              activeTag ? mintActive : idleChip
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2 6.5h4.5M2 3.5h8M2 9.5h2.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span>{activeTag ?? "Tags"}</span>
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              className={`transition-transform ${tagOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path
                d="M1.5 3L4 5.5L6.5 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {tagOpen ? (
            <div className={menuShell}>
              {tagChoices.length === 0 ? (
                <p className="px-3 py-2 text-[11.5px] text-[#7a8480]">No tags yet</p>
              ) : (
                tagChoices.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onToggleTag(tag);
                      setTagOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11.5px] transition-colors ${
                      tagPick.includes(tag)
                        ? "bg-[#9bf0c40e] text-[#9bf0c4]"
                        : "text-[#7a8480] hover:bg-[#ffffff06] hover:text-[#c4cbc7]"
                    }`}
                  >
                    {tag}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              closeAll();
              setMediaOpen((v) => !v);
            }}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[11px] transition-all duration-150 ${
              mediaTypes.length > 0 ? mediaActive : idleChip
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <rect x="1.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="6.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1.5" y="6.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="6.5" y="6.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span>{mediaLabel}</span>
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              className={`transition-transform ${mediaOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path
                d="M1.5 3L4 5.5L6.5 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {mediaOpen ? (
            <div className={`${menuShell} min-w-[120px]`}>
              {MEDIA_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    onSetMediaTypes(opt.value === "all" ? [] : [opt.value]);
                    setMediaOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11.5px] transition-colors ${
                    (opt.value === "all" && mediaTypes.length === 0) ||
                    (opt.value !== "all" && mediaTypes[0] === opt.value)
                      ? mediaActiveItem
                      : "text-[#7a8480] hover:bg-[#ffffff06] hover:text-[#c4cbc7]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              closeAll();
              setTierOpen((v) => !v);
            }}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[11px] transition-all duration-150 ${
              tierPick.length > 0 ? tierActive : idleChip
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M6 1.5L7.5 4.5H10.5L8.25 6.75L9 9.75L6 8.25L3 9.75L3.75 6.75L1.5 4.5H4.5L6 1.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span>{tierLabel}</span>
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              className={`transition-transform ${tierOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path
                d="M1.5 3L4 5.5L6.5 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {tierOpen ? (
            <div className={menuShell}>
              {facets.tiers.length === 0 ? (
                <p className="px-3 py-2 text-[11.5px] text-[#7a8480]">No tiers</p>
              ) : (
                facets.tiers.map((t) => (
                  <button
                    key={t.tier_id}
                    type="button"
                    onClick={() => {
                      onToggleTier(t.tier_id);
                      setTierOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11.5px] transition-colors ${
                      tierPick.includes(t.tier_id)
                        ? tierActiveItem
                        : "text-[#7a8480] hover:bg-[#ffffff06] hover:text-[#c4cbc7]"
                    }`}
                  >
                    {t.title}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {onOpenMoreFilters ? (
          <button
            type="button"
            onClick={onOpenMoreFilters}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[11px] transition-all duration-150 ${idleChip}`}
          >
            More
          </button>
        ) : null}
      </div>

      {hasFilters ? (
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => {
              onSetQ("");
              onSetMediaTypes([]);
              for (const tag of [...tagPick]) onToggleTag(tag);
              for (const id of [...tierPick]) onToggleTier(id);
            }}
            className="text-[10.5px] text-[#3e4742] transition-colors hover:text-[#9ab4a5]"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
