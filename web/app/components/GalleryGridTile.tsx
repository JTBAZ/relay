"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { EyeOff, Play, Search } from "lucide-react";
import {
  RELAY_API_BASE,
  type GalleryItem,
  type PostVisibility,
  type TierFacet
} from "@/lib/relay-api";
import {
  pickPrimaryAccessTierIdForChip,
  sortTierIdsForAccessChip
} from "@/lib/tier-access";
import PostAssetCarouselStrip, { postCarouselMainVisual } from "./PostAssetCarouselStrip";

const SEL = "#00aa6f";

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
    "max-w-[5rem] shrink-0 truncate rounded bg-white/[0.06] px-1 py-0.5 text-[9px] leading-none text-white/[0.28]";

  return (
    <div
      className={`flex ${LIB_META_H} shrink-0 flex-col justify-between border-t border-white/[0.06] bg-[#080a09] px-2 py-1.5`}
    >
      <div className="flex min-h-0 items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-left text-xs font-semibold leading-tight text-[var(--lib-fg)]">
          {item.title}
        </p>
        {tierLabel ? (
          <span
            className="max-w-[40%] shrink-0 truncate rounded-md bg-white/[0.1] px-1.5 py-0.5 text-[9px] font-medium leading-none text-white/75"
            title={tierLabel}
          >
            {tierLabel}
          </span>
        ) : (
          <span className="w-0 shrink-0" aria-hidden />
        )}
      </div>

      {/* Reserved for resolution / file size when API provides it */}
      <div className="h-3.5 shrink-0" aria-hidden />

      <div className="flex min-h-0 items-center gap-1 overflow-hidden">
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
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [exportRetryBusy, setExportRetryBusy] = useState(false);
  const selectCheckboxRef = useRef<HTMLInputElement>(null);
  const postIdForFx = item?.post_id ?? "";

  useEffect(() => {
    setCarouselIdx(0);
  }, [postIdForFx]);

  useEffect(() => {
    setCarouselIdx((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    const el = selectCheckboxRef.current;
    if (el) {
      el.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  if (!item) return null;

  const current = items[Math.min(carouselIdx, items.length - 1)]!;

  const uniformLibrary = !largePreview && !compact;

  const dot = visDot[current.visibility] ?? visDot.visible;
  const isVideo =
    Boolean(current.mime_type?.startsWith("video/")) &&
    current.has_export &&
    (multi || items.length === 1);
  const borderRing = selected
    ? "border-2"
    : partiallySelected
      ? "border-2 border-dashed border-[color-mix(in_srgb,#00aa6f_55%,var(--lib-border))]"
      : "border border-[var(--lib-border)] hover:border-[#00aa6f]/50";
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
      const res = await fetch(`${RELAY_API_BASE}/api/v1/export/media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId, media_id: item.media_id })
      });
      if (res.ok) {
        onExportRetryComplete?.();
      }
    } finally {
      setExportRetryBusy(false);
    }
  };

  return (
    <div
      data-gallery-tile
      role="listitem"
      className={`group flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl bg-[var(--lib-tile)] outline-none transition-[box-shadow,border-color] ${borderRing} ${keyboardFocusRingClass}`}
      style={borderColorStyle}
      tabIndex={0}
      onClick={() => onToggleSelect(items)}
      onFocus={() => onFocusIndex(flatIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect(items);
        }
      }}
    >
      <div className={thumbShell}>
        {items.length === 1 && item.has_export && item.mime_type?.startsWith("image/") ? (
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
            <div className="absolute inset-0 overflow-hidden bg-[var(--lib-muted)]">
              {(() => {
                const main = postCarouselMainVisual(current);
                if (main.src && main.isVideo) {
                  return (
                    <video
                      className="block h-full w-full object-cover object-center"
                      src={main.src}
                      muted
                      playsInline
                      preload="metadata"
                      aria-hidden
                    />
                  );
                }
                if (main.src) {
                  return (
                    /* eslint-disable-next-line @next/next/no-img-element -- relay-served export URLs */
                    <img
                      src={main.src}
                      alt=""
                      className="block h-full w-full object-cover object-center"
                    />
                  );
                }
                return (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--lib-fg-muted)]">
                      {mediaTypeLabel(current.mime_type, current.media_id)}
                    </span>
                  </div>
                );
              })()}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15]">
              <div className="pointer-events-auto border-t border-white/[0.12] bg-gradient-to-t from-black/92 via-black/78 to-transparent px-2 pb-1.5 pt-2">
                <PostAssetCarouselStrip
                  items={items}
                  activeIndex={carouselIdx}
                  onSelect={(i) => {
                    setCarouselIdx(i);
                    onIsolateAssetSelection?.(items[i]!);
                  }}
                  activeBorderClass="border-[#00aa6f]"
                  center
                />
              </div>
            </div>
            <button
              type="button"
              className="absolute inset-0 bottom-14 z-[1] cursor-pointer"
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

        {isVideo ? (
          <div
            className={`pointer-events-none absolute flex items-center justify-center ${
              multi ? "left-0 right-0 top-0 bottom-[3.75rem]" : "inset-0"
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
              multi ? "top-0 bottom-14" : "inset-0"
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
