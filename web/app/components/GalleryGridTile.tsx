"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { EyeOff, Play, Search } from "lucide-react";
import {
  RELAY_API_BASE,
  relayFetch,
  type GalleryItem,
  type PostVisibility,
  type TierFacet
} from "@/lib/relay-api";
import {
  pickPrimaryAccessTierIdForChip,
  sortTierIdsForAccessChip
} from "@/lib/tier-access";
import {
  postCarouselMainVisual,
  relayPipelineReady
} from "./PostAssetCarouselStrip";

const SEL = "#00aa6f";

function libraryPlaceholderLabel(item: GalleryItem): string {
  if (item.processing_status === "FAILED") return "Media unavailable";
  if (!item.has_export) return "Not yet exported";
  if (!relayPipelineReady(item)) return "Preparing media";
  return "No preview";
}

/** Footer height for library grid — fixed so every tile stays the same size. */
const LIB_META_H = "h-20";

export function accessChipLabel(tierId: string, tierTitleById: Record<string, string>): string {
  const t = tierTitleById[tierId]?.trim();
  if (t) return t;
  if (tierId.startsWith("patreon_tier_")) return tierId.slice("patreon_tier_".length);
  if (tierId.startsWith("relay_tier_")) return tierId.slice("relay_tier_".length);
  return tierId;
}

export const visDot: Record<PostVisibility, string> = {
  visible: "bg-[#00aa6f]",
  hidden: "bg-[var(--lib-fg-muted)]",
  review: "bg-amber-400"
};

export function mediaTypeLabel(mime?: string, mediaId?: string): string {
  if (mediaId?.startsWith("post_only_")) return "Text";
  if (!mime) return "Media";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return mime.split("/")[0] || "File";
}

function LibraryUniformMeta({
  item,
  items,
  tierTitleById,
  tierFacets
}: {
  item: GalleryItem;
  items: GalleryItem[];
  tierTitleById: Record<string, string>;
  tierFacets: TierFacet[];
}) {
  const tierId =
    item.tier_ids.length > 0
      ? pickPrimaryAccessTierIdForChip(item.tier_ids, tierFacets)
      : null;
  const tierLabel = tierId ? accessChipLabel(tierId, tierTitleById) : null;

  const chips: { key: string; label: string }[] = [];
  if (items.length > 1) {
    chips.push({ key: "__assets", label: `${items.length} assets` });
  }
  const tagShow = item.tag_ids.slice(0, 2);
  for (const t of tagShow) {
    chips.push({ key: `tag:${t}`, label: t });
  }
  const tagMore = item.tag_ids.length - tagShow.length;
  if (tagMore > 0) {
    chips.push({ key: "__moretags", label: `+${tagMore}` });
  }

  const chipLow =
    "max-w-[5rem] shrink-0 truncate rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[9px] leading-none text-white/40";

  return (
    <div
      className={`flex ${LIB_META_H} shrink-0 flex-col justify-between border-t border-white/[0.08] bg-[#0a0c0b] px-2.5 py-2`}
    >
      <div className="flex min-h-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-left text-xs font-semibold leading-tight text-[var(--lib-fg)]">
          {item.title}
        </p>
        {tierLabel ? (
          <span
            className="max-w-[40%] shrink-0 truncate rounded-md bg-[var(--lib-primary)]/15 px-1.5 py-0.5 text-[9px] font-medium leading-none text-[var(--lib-primary)]"
            title={tierLabel}
          >
            {tierLabel}
          </span>
        ) : (
          <span className="w-0 shrink-0" aria-hidden />
        )}
      </div>

      {/* Reserved for resolution / file size when API provides it */}
      <div className="h-3 shrink-0" aria-hidden />

      <div className="flex min-h-0 items-center gap-1.5 overflow-hidden">
        {chips.length === 0 ? (
          <span className="text-[9px] text-white/[0.12]">&nbsp;</span>
        ) : (
          chips.map((c) => (
            <span key={c.key} className={chipLow} title={c.label}>
              {c.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

type Props = {
  items: GalleryItem[];
  tierTitleById: Record<string, string>;
  /** Tier facets from `/gallery/facets` (amount_cents drives access chip choice). */
  tierFacets?: TierFacet[];
  selected: boolean;
  /** Multi-asset post: some but not all rows in this post are selected (carousel isolate). */
  partiallySelected?: boolean;
  flatIndex: number;
  onToggleSelect: (items: GalleryItem[]) => void;
  onFocusIndex: (index: number) => void;
  /** Carousel: select only that asset for bulk actions. */
  onIsolateAssetSelection?: (item: GalleryItem) => void;
  compact?: boolean;
  largePreview?: boolean;
  showSelectCheckbox?: boolean;
  /** When set, image/video thumb opens fullscreen (caller handles overlay). Clicks stop tile selection. */
  onImageFullscreen?: (item: GalleryItem) => void;
  /** Required for export Retry when `export_error` is set. */
  creatorId?: string;
  /** After a successful manual export retry, refresh gallery items. */
  onExportRetryComplete?: () => void;
};

export default function GalleryGridTile({
  items,
  tierTitleById,
  tierFacets = [],
  selected,
  partiallySelected = false,
  flatIndex,
  onToggleSelect,
  onFocusIndex,
  onIsolateAssetSelection,
  compact = false,
  largePreview = false,
  showSelectCheckbox = true,
  onImageFullscreen,
  creatorId,
  onExportRetryComplete
}: Props) {
  const item = items[0];
  const multi = items.length > 1;

  /**
   * Default carousel to the first non-shadow-cover item so that when Patreon serves a blurred
   * cover URL ({"b":70,...} CDN transform) and the attachment is the real full image, we show
   * the attachment first. Falls back to 0 if all items are shadow covers.
   */
  const defaultCarouselIdx = Math.max(0, items.findIndex((it) => !it.shadow_cover));
  const [carouselIdx, setCarouselIdx] = useState(defaultCarouselIdx);
  const [exportRetryBusy, setExportRetryBusy] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hotspotActive, setHotspotActive] = useState(false);
  /** Tile root: wheel events originate on children (fullscreen overlay etc.); non-passive listener must sit here. */
  const tileRef = useRef<HTMLDivElement | null>(null);
  const hotspotActiveRef = useRef(false);
  const selectCheckboxRef = useRef<HTMLInputElement>(null);
  const scrollAccumRef = useRef(0);
  const postIdForFx = item?.post_id ?? "";

  useEffect(() => {
    setCarouselIdx(Math.max(0, items.findIndex((it) => !it.shadow_cover)));
  }, [postIdForFx]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCarouselIdx((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    const el = selectCheckboxRef.current;
    if (el) {
      el.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  const current = items[Math.min(carouselIdx, items.length - 1)]!;

  const uniformLibrary = !largePreview && !compact;
  const showVideoPlayOverlay =
    Boolean(current.mime_type?.startsWith("video/")) &&
    current.has_export &&
    relayPipelineReady(current) &&
    (multi || items.length === 1);
  const dot = visDot[current.visibility] ?? visDot.visible;
  const borderRing = selected
    ? "border-2 shadow-lg shadow-[#00aa6f]/10"
    : partiallySelected
      ? "border-2 border-dashed border-[color-mix(in_srgb,#00aa6f_55%,var(--lib-border))]"
      : "border border-[var(--lib-border)] hover:border-[#00aa6f]/40 hover:shadow-md hover:shadow-black/20";
  const borderColorStyle: CSSProperties | undefined = selected ? { borderColor: SEL } : undefined;
  /** Keyboard only — mouse clicks must not look like selection (see thumb `onMouseDown`). */
  const keyboardFocusRingClass =
    "[&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-[var(--lib-ring)] [&:has(:focus-visible)]:ring-offset-2 [&:has(:focus-visible)]:ring-offset-[var(--lib-tile)]";

  /** Skip default mouse focus on thumb buttons so deselect + :focus-visible ring do not fight. */
  const skipMouseFocus = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.button === 0) e.preventDefault();
  };

  const thumbClass = largePreview
    ? "aspect-[4/3] min-h-[10rem] sm:min-h-[12rem] md:min-h-[14rem]"
    : compact
      ? "aspect-[4/3] min-h-[5.5rem]"
      : "";

  const selectLabel =
    items.length > 1 ? `Select post ${item.title} (${items.length} assets)` : `Select ${item.title}`;

  const fullscreenEligible =
    Boolean(onImageFullscreen) &&
    items.length === 1 &&
    item.has_export &&
    relayPipelineReady(item) &&
    (item.mime_type?.startsWith("image/") || item.mime_type?.startsWith("video/"));

  const thumbShell = uniformLibrary
    ? "relative min-h-0 w-full flex-1 overflow-hidden bg-[var(--lib-muted)]"
    : `${thumbClass} relative overflow-hidden bg-[var(--lib-muted)]`;

  const showExportFail =
    items.length === 1 && !item.has_export && Boolean(item.export_error) && Boolean(creatorId);

  const runExportRetry = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!creatorId || items.length !== 1 || exportRetryBusy) return;
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

  /**
   * Native wheel on tile root (non-passive) so preventDefault applies to events bubbling from
   * thumb children while hotspot hover is active.
   */
  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;

    const onNativeWheel = (event: WheelEvent) => {
      if (!hotspotActiveRef.current || !multi) return;
      event.preventDefault();
      event.stopPropagation();

      scrollAccumRef.current += event.deltaY || event.deltaX;
      if (Math.abs(scrollAccumRef.current) < 50) return;
      const direction = scrollAccumRef.current > 0 ? 1 : -1;
      scrollAccumRef.current = 0;
      setCarouselIdx((index) => {
        const next = index + direction;
        if (next < 0 || next >= items.length) return index;
        onIsolateAssetSelection?.(items[next]!);
        return next;
      });
    };

    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onNativeWheel);
    };
  }, [items, multi, onIsolateAssetSelection]);

  return (
    <div
      ref={tileRef}
      data-gallery-tile
      role="listitem"
      className={`group flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-[var(--lib-tile)] outline-none transition-all duration-200 ${borderRing} ${keyboardFocusRingClass} ${
        hovered ? "z-10 scale-[1.028] shadow-xl shadow-black/40" : "z-0 scale-100"
      }`}
      style={borderColorStyle}
      tabIndex={0}
      onClick={() => onToggleSelect(items)}
      onFocus={() => onFocusIndex(flatIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        scrollAccumRef.current = 0;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect(items);
        }
      }}
    >
      <div className={thumbShell}>
        {items.length === 1 && !relayPipelineReady(item) ? (
          <div
            className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[var(--lib-muted)]/95 px-4 text-center"
            role="status"
          >
            <span
              className={`text-[var(--lib-fg-muted)] ${largePreview ? "text-sm" : compact ? "text-[10px]" : "text-xs"} font-medium leading-snug`}
            >
              {libraryPlaceholderLabel(item)}
            </span>
          </div>
        ) : items.length === 1 && item.has_export && item.mime_type?.startsWith("image/") ? (
          <button
            type="button"
            className="absolute inset-0 block h-full w-full"
            aria-label={onImageFullscreen ? `Fullscreen: ${item.title}` : selectLabel}
            onMouseDown={skipMouseFocus}
            onClick={
              onImageFullscreen
                ? (e) => {
                    e.stopPropagation();
                    onIsolateAssetSelection?.(item);
                    onImageFullscreen(item);
                  }
                : undefined
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- relay-served export URLs */}
            <img
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              alt=""
              className="block h-full w-full object-cover object-center"
            />
          </button>
        ) : items.length === 1 && item.has_export && item.mime_type?.startsWith("video/") ? (
          <button
            type="button"
            className="absolute inset-0 block h-full w-full"
            aria-label={onImageFullscreen ? `Fullscreen: ${item.title}` : selectLabel}
            onMouseDown={skipMouseFocus}
            onClick={
              onImageFullscreen
                ? (e) => {
                    e.stopPropagation();
                    onIsolateAssetSelection?.(item);
                    onImageFullscreen(item);
                  }
                : undefined
            }
          >
            <video
              className="block h-full w-full object-cover object-center"
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              muted
              playsInline
              preload="metadata"
              aria-hidden
            />
          </button>
        ) : items.length === 1 ? (
          <button
            type="button"
            className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden p-2 text-center"
            aria-label={selectLabel}
          >
            <span className="text-[10px] uppercase tracking-wider text-[var(--lib-fg-muted)]">
              {mediaTypeLabel(item.mime_type, item.media_id)}
            </span>
            <span
              className={`line-clamp-2 w-full text-[var(--lib-fg)] ${largePreview ? "text-sm" : compact ? "text-[10px]" : "text-xs"}`}
            >
              {item.title}
            </span>
          </button>
        ) : multi ? (
          <>
            {items.length >= 3 ? (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-[0]">
                <div className="absolute inset-y-2 -right-1.5 left-4 rounded-xl border border-white/[0.07] bg-[var(--lib-muted)] opacity-50" />
                <div className="absolute inset-y-1 -right-0.5 left-2 rounded-xl border border-white/[0.10] bg-[var(--lib-tile)] opacity-75" />
              </div>
            ) : items.length === 2 ? (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-[0]">
                <div className="absolute inset-y-1 -right-0.5 left-2 rounded-xl border border-white/[0.10] bg-[var(--lib-tile)] opacity-75" />
              </div>
            ) : null}

            <div
              className="absolute bottom-2.5 right-2.5 z-[20]"
              onMouseEnter={() => {
                hotspotActiveRef.current = true;
                setHotspotActive(true);
              }}
              onMouseLeave={() => {
                hotspotActiveRef.current = false;
                setHotspotActive(false);
                scrollAccumRef.current = 0;
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                aria-label={`${items.length} assets - hover and scroll to browse`}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 backdrop-blur-md transition-all duration-200 ${
                  hotspotActive
                    ? "border-[#00aa6f]/60 bg-black/80 shadow-lg shadow-black/40"
                    : "border-white/10 bg-black/40"
                }`}
              >
                <span
                  className={`h-1 w-1 rounded-full transition-colors duration-200 ${
                    hotspotActive ? "bg-[#00aa6f]" : "bg-white/30"
                  }`}
                  aria-hidden
                />
                <span
                  className={`text-[9px] font-medium leading-none tabular-nums transition-colors duration-200 ${
                    hotspotActive ? "text-white/80" : "text-white/30"
                  }`}
                >
                  {items.length}
                </span>
              </div>

              <div
                className={`absolute bottom-full right-0 mb-1.5 transition-all duration-200 ${
                  hotspotActive ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
                }`}
              >
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/75 px-2 py-1.5 shadow-lg shadow-black/40 backdrop-blur-md">
                  {items.map((media, index) => (
                    <button
                      key={`${media.media_id}:${index}`}
                      type="button"
                      aria-label={`Asset ${index + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCarouselIdx(index);
                        onIsolateAssetSelection?.(items[index]!);
                      }}
                      className={`rounded-full transition-all duration-150 ${
                        index === carouselIdx
                          ? "h-2 w-2 bg-[#00aa6f] shadow-sm shadow-[#00aa6f]/40"
                          : "h-1.5 w-1.5 bg-white/30 hover:bg-white/60"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute inset-0 z-[1] overflow-hidden rounded-xl">
              {items.map((media, index) => {
                const main = postCarouselMainVisual(media);
                const active = index === carouselIdx;
                return (
                  <div
                    key={`${media.media_id}:${index}`}
                    aria-hidden={!active}
                    className="absolute inset-0 transition-all duration-300 ease-out"
                    style={{
                      opacity: active ? 1 : 0,
                      transform: active ? "translateX(0)" : `translateX(${index < carouselIdx ? "-8%" : "8%"})`
                    }}
                  >
                    {main.relayProcessing ? (
                      <div className="flex h-full w-full items-center justify-center bg-[var(--lib-muted)] px-4 text-center">
                        <span className="text-[11px] font-medium leading-tight text-[var(--lib-fg-muted)]">
                          {libraryPlaceholderLabel(media)}
                        </span>
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
                      /* eslint-disable-next-line @next/next/no-img-element -- relay-served export URLs */
                      <img src={main.src} alt="" className="block h-full w-full object-cover object-center" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[var(--lib-muted)]">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--lib-fg-muted)]">
                          {mediaTypeLabel(media.mime_type, media.media_id)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="absolute inset-0 z-[2] cursor-pointer"
              aria-label={selectLabel}
              onMouseDown={skipMouseFocus}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(items);
              }}
            />
          </>
        ) : null}

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

        <div className="absolute right-2 top-2 z-20 flex max-w-[55%] flex-col items-end gap-1">
          {item.visibility === "review" ? (
            <span className="pointer-events-none rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold leading-none text-neutral-950 shadow-sm">
              18+
            </span>
          ) : null}
          {fullscreenEligible ? (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] bg-black/55 shadow-md backdrop-blur-sm transition-colors hover:bg-black/70"
              style={{ color: SEL }}
              aria-label={`View ${item.title} fullscreen`}
              title="Fullscreen"
              onClick={(e) => {
                e.stopPropagation();
                onIsolateAssetSelection?.(item);
                onImageFullscreen!(item);
              }}
            >
              <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>

        {showSelectCheckbox ? (
          <label
            className="absolute left-2 top-2 z-20 flex cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(items)}
              onClick={(e) => e.stopPropagation()}
              className="peer sr-only"
              aria-label={selectLabel}
            />
            <span
              className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--lib-ring)] ${
                selected
                  ? "border-transparent text-neutral-950"
                  : "border-[var(--lib-border)] bg-black/50 hover:border-[#00aa6f]/65"
              }`}
              style={selected ? { backgroundColor: SEL, borderColor: SEL } : undefined}
            >
              {selected ? (
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                  <path
                    d="M2 6l3 3 5-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
          </label>
        ) : null}

        {showVideoPlayOverlay ? (
          <div
            className={`pointer-events-none absolute flex items-center justify-center ${
              multi ? "bottom-[3.75rem] left-0 right-0 top-0" : "inset-0"
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="ml-0.5 h-6 w-6" strokeWidth={2} style={{ color: SEL }} aria-hidden />
            </span>
          </div>
        ) : null}

        {current.visibility === "hidden" ? (
          <div
            className={`pointer-events-none absolute left-0 right-0 flex items-center justify-center bg-black/35 ${
              multi ? "bottom-14 top-0" : "inset-0"
            }`}
          >
            <EyeOff className="h-8 w-8 text-[var(--lib-fg)]/85" aria-hidden />
          </div>
        ) : null}

        <span
          className={`absolute rounded-full ${dot} ${largePreview ? "h-2 w-2" : "h-1.5 w-1.5"} ${
            multi ? "bottom-16 left-2" : "bottom-2 left-2"
          }`}
          title={current.visibility}
        />
      </div>

      {uniformLibrary ? (
        <LibraryUniformMeta
          item={item}
          items={items}
          tierTitleById={tierTitleById}
          tierFacets={tierFacets}
        />
      ) : (
        <div
          className={
            largePreview
              ? "space-y-1 p-3"
              : compact
                ? "space-y-1 p-1.5"
                : "flex min-h-0 flex-col space-y-1 p-3 pt-2"
          }
        >
          <p
            className={
              largePreview
                ? "truncate text-sm font-medium text-[var(--lib-fg)]"
                : compact
                  ? "truncate text-[10px] font-medium text-[var(--lib-fg)]"
                  : "truncate text-sm font-semibold leading-snug text-[var(--lib-fg)] sm:text-[0.9375rem]"
            }
          >
            {item.title}
          </p>
          {largePreview ? (
            <div className="space-y-1">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                Tags on this asset
              </p>
              {item.tag_ids.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {item.tag_ids.map((t) => (
                    <span
                      key={t}
                      className="max-w-full truncate rounded border border-[var(--lib-border)] bg-[var(--lib-muted)]/70 px-1.5 py-0.5 text-[10px] text-[var(--lib-fg)]"
                      title={t}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] italic leading-snug text-[var(--lib-fg-muted)]">
                  No row tags — only post-level tags until you add per-asset tags (Tags → Selected assets only).
                </p>
              )}
            </div>
          ) : item.tag_ids.length > 0 ? (
            <p className="line-clamp-1 text-[10px] text-[var(--lib-fg-muted)]">
              {item.tag_ids.slice(0, 3).join(" · ")}
              {item.tag_ids.length > 3 ? ` +${item.tag_ids.length - 3}` : ""}
            </p>
          ) : null}
          {(largePreview || compact) && item.tier_ids.length > 0 ? (
            <div className="flex flex-wrap gap-0.5">
              {sortTierIdsForAccessChip(item.tier_ids, tierFacets)
                .slice(0, largePreview ? 4 : 2)
                .map((tid) => (
                <span
                  key={tid}
                  className={
                    largePreview
                      ? "rounded border border-[var(--lib-border)] px-1.5 py-0.5 text-[10px] text-[var(--lib-fg-muted)]"
                      : "rounded border border-[var(--lib-border)] px-1 text-[8px] text-[var(--lib-fg-muted)]"
                  }
                >
                  {accessChipLabel(tid, tierTitleById)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
