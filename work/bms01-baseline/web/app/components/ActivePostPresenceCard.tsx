"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { EyeOff, Layers } from "lucide-react";
import { CrosspostChipRow } from "@/app/components/distribution/platform-presence-chips";
import { accessChipLabel } from "@/app/components/GalleryGridTile";
import { postCarouselMainVisual } from "@/app/components/PostAssetCarouselStrip";
import {
  Lab2DestBadge,
  Lab2StatusBar,
  Lab2StatusPill,
  lab2HueFromSeed
} from "@/app/components/studio-lab2/lab2-card-chrome";
import {
  galleryPostLifecycleStatus,
  summaryToPresence,
  type GalleryPostLifecycle
} from "@/lib/active-post-presence";
import { pickPrimaryAccessTierIdForChip } from "@/lib/tier-access";
import { relayFetch, type GalleryItem, type TierFacet } from "@/lib/relay-api";

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
  /** CSS aspect-ratio. Lab uses square tiles; classic stays portrait; lab2 uses v0 4/3. */
  aspectRatio?: string;
  /** lab2 adds v0 status pill chrome over live media. */
  presentation?: "default" | "lab2";
  /** Owning studio — required for export Retry when media download failed. */
  creatorId?: string;
  onExportRetryComplete?: () => void;
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
  aspectRatio = "3 / 4",
  presentation = "default",
  creatorId,
  onExportRetryComplete,
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
  const [exportRetryBusy, setExportRetryBusy] = useState(false);
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
  const isLab2 = presentation === "lab2";
  const lifecycle: GalleryPostLifecycle = galleryPostLifecycleStatus(primary);
  const publishedLabel = (() => {
    if (!primary.published_at) return null;
    const d = new Date(primary.published_at);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();

  const selectLabel =
    items.length > 1
      ? `Select post ${primary.title} (${items.length} assets)`
      : `Select ${primary.title}`;

  const main = postCarouselMainVisual(item);
  const showExportFail =
    !item.has_export && Boolean(item.export_error) && Boolean(creatorId);

  const runExportRetry = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!creatorId || exportRetryBusy) return;
    setExportRetryBusy(true);
    try {
      await relayFetch<unknown>("/api/v1/export/media", {
        method: "POST",
        body: JSON.stringify({ creator_id: creatorId, media_id: item.media_id })
      });
      onExportRetryComplete?.();
    } finally {
      setExportRetryBusy(false);
    }
  };

  const primaryDest = presentDests[0] ?? null;
  const cardHue = lab2HueFromSeed(primary.post_id || primary.title || String(flatIndex));

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

  const onKeyActivate = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(items);
    } else if (e.key === " ") {
      e.preventDefault();
      onToggleSelect(items);
    }
  };

  const selectControl = (opts?: { hideUntilActive?: boolean }) => (
    <label
      className="z-20 flex cursor-pointer items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: opts?.hideUntilActive ? 18 : 20,
        height: opts?.hideUntilActive ? 18 : 20,
        borderRadius: 9999,
        background: selected
          ? MINT
          : hovered || partiallySelected
            ? "rgba(0,0,0,0.55)"
            : "transparent",
        border: selected
          ? "none"
          : `1px solid ${hovered || partiallySelected ? "#555" : "transparent"}`,
        opacity:
          opts?.hideUntilActive && !(selected || hovered || partiallySelected) ? 0 : 1
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
  );

  /* ── lab2: v0 /4 GalleryCard chrome (tinted tile, dest + status, muted title) ── */
  if (isLab2) {
    return (
      <div
        data-gallery-tile
        data-lab2-card
        role="listitem"
        className="group relative flex w-full min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-[#141e16] p-2.5 text-left outline-none transition-all duration-150 hover:scale-[1.015] hover:border-[#2a3e2e] [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)]"
        style={{
          aspectRatio,
          backgroundColor: cardHue,
          boxShadow: selected ? "0 0 0 1px #9bf0c440, 0 0 16px #9bf0c415" : "none",
          zIndex: hovered ? 10 : 0
        }}
        tabIndex={0}
        onClick={() => onOpen(items)}
        onFocus={() => onFocusIndex(flatIndex)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={onKeyActivate}
      >
        {/* Optional media as faint plane — never displaces chrome */}
        <div className="pointer-events-none absolute inset-0" onMouseDown={skipMouseFocus}>
          {main.relayProcessing ? null : main.src && main.isVideo ? (
            <video
              className="block h-full w-full object-cover object-center opacity-[0.28]"
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
              className="block h-full w-full object-cover object-center opacity-[0.28]"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(5,7,6,0.55) 0%, transparent 55%)"
            }}
          />
        </div>

        {primary.visibility === "hidden" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
            <EyeOff className="h-6 w-6 text-white/70" aria-hidden />
          </div>
        ) : null}

        {/* Top: dest badge + status (checkbox only when active) */}
        <div className="relative z-10 flex items-start justify-between gap-1">
          <div className="flex items-center gap-1">
            {selectControl({ hideUntilActive: true })}
            <Lab2DestBadge dest={primaryDest} />
            {isMultiMedia ? (
              <span
                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-medium"
                style={{
                  background: `${AMBER}18`,
                  border: `1px solid ${AMBER}44`,
                  color: AMBER
                }}
              >
                <Layers className="h-2 w-2" aria-hidden />
                {mediaCount}
              </span>
            ) : null}
          </div>
          <Lab2StatusPill status={lifecycle} />
        </div>

        {/* Bottom: optional chips on hover, title, date, status bar */}
        <div className="relative z-10 flex flex-col gap-1">
          {hovered ? (
            <div
              className="mb-0.5"
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
          ) : null}
          <p className="line-clamp-2 text-[10.5px] font-medium leading-tight text-[#8ea898]">
            {primary.title || "Untitled"}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[8.5px] tabular-nums text-[#3a4a3e]">
              {publishedLabel || audienceLabel || (isMultiMedia ? `${mediaCount} pages` : "—")}
            </span>
            <Lab2StatusBar status={lifecycle} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-gallery-tile
      role="listitem"
      className="group relative w-full min-w-0 overflow-hidden rounded-xl border text-left outline-none transition-all duration-200 [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)]"
      style={{
        aspectRatio,
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
      onKeyDown={onKeyActivate}
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
            <span className="text-[11px] text-[#666]">
              {showExportFail ? "Couldn't fetch file" : "No preview"}
            </span>
          </div>
        )}
      </div>

      {showExportFail ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-2 border-t border-amber-500/35 bg-black/85 px-2 py-1.5"
          onClick={(e) => e.stopPropagation()}
          role="status"
        >
          <span
            className="min-w-0 flex-1 truncate text-[10px] leading-tight text-amber-100/90"
            title={item.export_error}
          >
            Couldn&apos;t fetch file
          </span>
          <button
            type="button"
            disabled={exportRetryBusy}
            onClick={runExportRetry}
            className="shrink-0 rounded border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-100 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
          >
            {exportRetryBusy ? "…" : "Retry"}
          </button>
        </div>
      ) : null}

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
      <div className="absolute left-2 top-2">{selectControl()}</div>

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
