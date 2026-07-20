"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { EyeOff, Layers } from "lucide-react";
import { CrosspostChipRow } from "@/app/components/distribution/platform-presence-chips";
import { accessChipLabel } from "@/app/components/GalleryGridTile";
import { postCarouselMainVisual } from "@/app/components/PostAssetCarouselStrip";
import { summaryToPresence } from "@/lib/active-post-presence";
import { pickPrimaryAccessTierIdForChip } from "@/lib/tier-access";
import type { GalleryItem, TierFacet } from "@/lib/relay-api";

/** v0 PostGridCard mint */
const MINT = "#9bf0c4";
const AMBER = "#F59E0B";

type Props = {
  items: GalleryItem[];
  tierTitleById: Record<string, string>;
  tierFacets?: TierFacet[];
  selected: boolean;
  partiallySelected?: boolean;
  flatIndex: number;
  onToggleSelect: (items: GalleryItem[]) => void;
  /** Open packaging hero for this post (body / Enter). */
  onOpen: (items: GalleryItem[]) => void;
  onFocusIndex: (index: number) => void;
  onPresentClick: (destination: string, externalUrl: string) => void;
  onGhostClick: (destination: string, items: GalleryItem[]) => void;
};

/**
 * Active Posts presence card — v0 PostGridCard chrome (3/4 overlay).
 * Body / Enter = open packaging hero; checkbox = select; chips = present/ghost grammar.
 */
export default function ActivePostPresenceCard({
  items,
  tierTitleById,
  tierFacets = [],
  selected,
  partiallySelected = false,
  flatIndex,
  onToggleSelect,
  onOpen,
  onFocusIndex,
  onPresentClick,
  onGhostClick
}: Props) {
  const mediaItems = items.filter((it) => !it.shadow_cover);
  const slideItems = mediaItems.length > 0 ? mediaItems : items;
  const [hovered, setHovered] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const selectCheckboxRef = useRef<HTMLInputElement>(null);

  const isMultiMedia = slideItems.length > 1;
  const mediaCount = slideItems.length;

  useEffect(() => {
    const el = selectCheckboxRef.current;
    if (el) el.indeterminate = partiallySelected;
  }, [partiallySelected]);

  useEffect(() => {
    if (!isMultiMedia || !hovered) return;
    const t = setInterval(() => {
      setActiveSlide((s) => (s + 1) % mediaCount);
    }, 900);
    return () => clearInterval(t);
  }, [isMultiMedia, hovered, mediaCount]);

  useEffect(() => {
    if (!hovered) setActiveSlide(0);
  }, [hovered]);

  const item = slideItems[Math.min(activeSlide, slideItems.length - 1)] ?? items[0]!;
  const primary = slideItems[0] ?? items[0]!;
  const { present, missing } = summaryToPresence(primary.distribution_summary);
  const presentDests = present.map((p) => p.destination);
  const presentUrls = Object.fromEntries(
    present.map((p) => [p.destination, p.external_url])
  );

  const tierId =
    primary.tier_ids.length > 0
      ? pickPrimaryAccessTierIdForChip(primary.tier_ids, tierFacets)
      : null;
  const audienceLabel = tierId ? accessChipLabel(tierId, tierTitleById) : "";

  const selectLabel =
    items.length > 1
      ? `Select post ${primary.title} (${items.length} assets)`
      : `Select ${primary.title}`;

  const main = postCarouselMainVisual(item);

  const borderColor = selected
    ? `${MINT}80`
    : partiallySelected
      ? `${MINT}55`
      : hovered && isMultiMedia
        ? `${AMBER}55`
        : hovered
          ? "#333"
          : isMultiMedia
            ? `${AMBER}22`
            : "#1f1f1f";

  const skipMouseFocus = (e: ReactMouseEvent) => {
    if (e.button === 0) e.preventDefault();
  };

  return (
    <div
      data-gallery-tile
      role="listitem"
      className="group relative w-full min-w-0 overflow-hidden rounded-xl border text-left outline-none transition-all duration-200 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)]"
      style={{
        aspectRatio: "3 / 4",
        borderColor,
        background: "#0a0a0a",
        transform: hovered ? "translateY(-2px) scale(1.01)" : "none",
        boxShadow: selected
          ? "0 0 0 1px #9bf0c440, 0 0 20px #9bf0c415"
          : hovered && isMultiMedia
            ? "0 4px 24px rgba(245,158,11,0.12)"
            : hovered
              ? "0 4px 24px rgba(0,0,0,0.4)"
              : "none",
        zIndex: hovered ? 10 : 0
      }}
      tabIndex={0}
      onClick={() => onOpen(items)}
      onFocus={() => onFocusIndex(flatIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(items);
        } else if (e.key === " ") {
          e.preventDefault();
          onToggleSelect(items);
        }
      }}
    >
      {/* Full-bleed media */}
      <div className="absolute inset-0" onMouseDown={skipMouseFocus}>
        {main.relayProcessing ? (
          <div className="flex h-full w-full items-center justify-center px-3 text-center">
            <span className="text-[11px] font-medium text-[#666]">Preparing media</span>
          </div>
        ) : main.src && main.isVideo ? (
          <video
            className="block h-full w-full object-cover object-center"
            src={main.src}
            muted
            playsInline
            preload="metadata"
            aria-hidden
          />
        ) : main.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- relay-served export URLs
          <img
            key={main.src + activeSlide}
            src={main.src}
            alt=""
            className="block h-full w-full object-cover object-center"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center">
            <span className="text-[11px] text-[#666]">No preview</span>
          </div>
        )}
      </div>

      {/* Bottom gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(5,7,6,0.9) 0%, transparent 50%)" }}
      />

      {primary.visibility === "hidden" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
          <EyeOff className="h-8 w-8 text-white/85" aria-hidden />
        </div>
      ) : null}

      {/* Multi-media badge — top-right */}
      {isMultiMedia ? (
        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md px-1.5 py-0.5"
          style={{
            background: `${AMBER}18`,
            border: `1px solid ${AMBER}44`,
            backdropFilter: "blur(4px)"
          }}
        >
          <Layers className="h-2.5 w-2.5" style={{ color: AMBER }} aria-hidden />
          <span className="text-[9px] font-semibold leading-none" style={{ color: AMBER }}>
            {mediaCount}
          </span>
        </div>
      ) : primary.visibility === "review" ? (
        <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold leading-none text-neutral-950">
          18+
        </span>
      ) : null}

      {/* Checkbox — top-left (v0 circular mint) */}
      <label
        className="absolute left-2 top-2 z-20 flex cursor-pointer items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 20,
          height: 20,
          borderRadius: 9999,
          background: selected
            ? MINT
            : hovered || partiallySelected
              ? "rgba(0,0,0,0.55)"
              : "transparent",
          border: selected
            ? "none"
            : `1px solid ${hovered || partiallySelected ? "#555" : "transparent"}`
        }}
      >
        <input
          ref={selectCheckboxRef}
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(items)}
          onClick={(e) => e.stopPropagation()}
          className="peer sr-only"
          aria-label={selectLabel}
        />
        {selected ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
            <path
              d="M2 6l3 3 5-5"
              fill="none"
              stroke="#050706"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </label>

      {/* Carousel dots */}
      {isMultiMedia ? (
        <div
          className="pointer-events-none absolute z-10 flex items-center justify-center gap-1"
          style={{ bottom: 44, left: 0, right: 0 }}
        >
          {slideItems.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === activeSlide ? 12 : 4,
                height: 4,
                background: i === activeSlide ? AMBER : `${AMBER}40`
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Crosspost chips */}
      <div
        className="absolute bottom-12 left-2 right-2 z-10"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CrosspostChipRow
          present={presentDests}
          missing={missing}
          parentHovered={hovered}
          presentUrls={presentUrls}
          onPresentActivate={(destination, externalUrl) => {
            onPresentClick(destination, externalUrl);
          }}
          onGhostActivate={(destination) => {
            onGhostClick(destination, items);
          }}
        />
      </div>

      {/* Title + audience */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 px-2.5 pb-2.5">
        <p className="truncate text-[10px] font-semibold leading-snug text-white">
          {primary.title}
        </p>
        <p
          className="text-[10px]"
          style={{ color: isMultiMedia ? `${AMBER}88` : "#666" }}
        >
          {isMultiMedia ? `${mediaCount} pages · ` : null}
          {audienceLabel || "—"}
        </p>
      </div>
    </div>
  );
}
