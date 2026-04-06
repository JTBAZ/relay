"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Star } from "lucide-react";
import { galleryItemKey } from "@/lib/gallery-group";
import {
  RELAY_API_BASE,
  galleryItemExportVisibleToVisitor,
  galleryItemPreviewSrc,
  type GalleryItem,
  type TierFacet
} from "@/lib/relay-api";
import { designerUnlockLabelFromFacets, pickPrimaryAccessTierIdForChip } from "@/lib/tier-access";
import { visitorMediaTierGateLocked } from "@/lib/visitor-tier-gate";
import SnipIcon from "@/app/components/icons/SnipIcon";
import {
  VisitorTierGateBackdrop,
  VisitorTierGateOverlay,
  type VisitorTierGateOverlayVariant
} from "@/app/components/visitor/VisitorTierGateOverlay";
import { mediaTypeLabel, visDot } from "./GalleryGridTile";
import PostAssetCarouselStrip, { postCarouselMainVisual } from "./PostAssetCarouselStrip";
import { useGalleryMultiVideoHoverSync } from "@/lib/gallery-tile-video";

type Props = {
  items: GalleryItem[];
  startFlatIndex: number;
  tierTitleById: Record<string, string>;
  focusIndex: number;
  onInspect: (item: GalleryItem, flatIndex: number) => void;
  onFocusIndex: (index: number) => void;
  /** Public gallery: use `--lib-selection` accents instead of `--lib-primary`. */
  visitorCatalog?: boolean;
  /** Visitor + patron: star whole post (footer row). */
  visitorPatronStar?: {
    patronAuthed: boolean;
    active: boolean;
    onToggle: () => void;
  };
  /** Visitor + patron: snip current asset to a collection (beside carousel / hero). */
  visitorPatronSnip?: {
    patronAuthed: boolean;
    snippedMediaIds: Set<string>;
    onSnipRequest: (postId: string, mediaId: string) => void;
  };
  /** Site layout: tier chip on tile (top-right of media); only when export is visible to this viewer. */
  showTierBadges?: boolean;
  tierFacets?: TierFacet[];
  /** Visitor catalog: tier order for censored-tile labels */
  visitorTierOrderIds?: string[];
  visitorMembershipUrl?: string | null;
  visitorAccentColor?: string;
  visitorLockedOverlayVariant?: VisitorTierGateOverlayVariant;
};

function StackLayer({
  item,
  depth,
  total,
  playbackVideoRef
}: {
  item: GalleryItem;
  depth: number;
  total: number;
  /** Front-layer video only: hover playback from parent tile. */
  playbackVideoRef?: MutableRefObject<HTMLVideoElement | null>;
}) {
  const fromBack = total - 1 - depth;
  const translate = fromBack * 9;
  const scale = 1 - fromBack * 0.065;
  const z = depth + 1;
  const dot = visDot[item.visibility] ?? visDot.visible;

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ zIndex: z }}
    >
      <div
        className="w-[88%] max-h-[92%] aspect-square rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)] shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
        style={{
          transform: `translate(${translate}px, ${translate}px) scale(${scale})`
        }}
      >
        <div className="relative h-full w-full">
          {item.has_export && item.mime_type?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              alt=""
              className="h-full w-full object-cover object-center"
            />
          ) : item.has_export && item.mime_type?.startsWith("video/") ? (
            <video
              ref={
                depth === total - 1 ? playbackVideoRef : undefined
              }
              className="h-full w-full object-cover object-center"
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              muted
              playsInline
              preload="metadata"
              aria-hidden
            />
          ) : (
            <div className="flex h-full min-h-[4rem] w-full flex-col items-center justify-center p-1 text-center">
              <span className="text-[8px] uppercase text-[var(--lib-fg-muted)]">
                {mediaTypeLabel(item.mime_type, item.media_id)}
              </span>
            </div>
          )}
          {depth === total - 1 ? (
            <span
              className={`absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${dot}`}
              title={item.visibility}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

const snipBtnClass = (active: boolean) =>
  `shrink-0 rounded-full border border-[var(--lib-border)] bg-black/55 p-1.5 shadow-md backdrop-blur-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${
    active
      ? "text-[var(--lib-selection)]"
      : "text-[oklch(0.42_0.07_155)] hover:bg-black/75 hover:text-[oklch(0.52_0.09_155)]"
  }`;

function visitorEngageRevealWrap(forceVisible: boolean): string {
  return forceVisible
    ? "opacity-100"
    : "opacity-0 transition-opacity duration-200 [pointer:coarse]:opacity-50 [@media(hover:hover)]:group-hover:opacity-60 group-focus-within:opacity-60";
}

const visitorEngageRevealBtn =
  "[@media(hover:hover)]:hover:opacity-100 focus-visible:opacity-100";

function tierBadgeForItem(
  item: GalleryItem,
  showTierBadges: boolean,
  tierFacets: TierFacet[],
  tierTitleById: Record<string, string>
): string | null {
  if (!showTierBadges || !galleryItemExportVisibleToVisitor(item) || !item.tier_ids?.length) {
    return null;
  }
  const chipId = pickPrimaryAccessTierIdForChip(item.tier_ids, tierFacets);
  if (!chipId) return null;
  return tierTitleById[chipId]?.trim() || chipId;
}

/** Visitor multi-asset: “slide to explore” on horizontal hover (v0 PostCampaignGridCellAnimated). */
function VisitorMultiAssetSlideCell({
  items,
  startFlatIndex,
  tierTitleById,
  onInspect,
  onFocusIndex,
  visitorPatronStar,
  visitorPatronSnip,
  showTierBadges,
  tierFacets,
  outerRingClass,
  batchFocused,
  primary,
  tierOrderIds,
  membershipUrl,
  accentColor,
  lockedOverlayVariant
}: {
  items: GalleryItem[];
  startFlatIndex: number;
  tierTitleById: Record<string, string>;
  onInspect: (item: GalleryItem, flatIndex: number) => void;
  onFocusIndex: (index: number) => void;
  visitorPatronStar?: Props["visitorPatronStar"];
  visitorPatronSnip?: Props["visitorPatronSnip"];
  showTierBadges: boolean;
  tierFacets: TierFacet[];
  outerRingClass: string;
  batchFocused: boolean;
  primary: GalleryItem;
  tierOrderIds: string[];
  membershipUrl: string | null | undefined;
  accentColor: string;
  lockedOverlayVariant: VisitorTierGateOverlayVariant;
}) {
  const n = items.length;
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCarouselIdx(0);
    setPreviewIndex(null);
  }, [primary.post_id]);

  useEffect(() => {
    setCarouselIdx((i) => Math.min(i, Math.max(0, n - 1)));
  }, [n]);

  const displayIdx = previewIndex !== null ? previewIndex : carouselIdx;
  const current = items[Math.min(displayIdx, n - 1)]!;
  const allLocked = items.every((it) => !galleryItemExportVisibleToVisitor(it));
  const tierLabel = tierBadgeForItem(current, showTierBadges, tierFacets, tierTitleById);
  const dot = visDot[current.visibility] ?? visDot.visible;

  const showPatronSnip = Boolean(visitorPatronSnip);
  const showPatronStar = Boolean(visitorPatronStar);
  const snipActive = visitorPatronSnip?.snippedMediaIds.has(current.media_id) ?? false;
  const starActive = visitorPatronStar?.active ?? false;
  const snipEngageAuthed = visitorPatronSnip?.patronAuthed ?? false;
  const starEngageAuthed = visitorPatronStar?.patronAuthed ?? false;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current || n <= 1) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const segmentWidth = 1 / n;
      const next = Math.min(Math.max(0, Math.floor(x / segmentWidth)), n - 1);
      setPreviewIndex((prev) => (prev === next ? prev : next));
    },
    [n]
  );

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setPreviewIndex(null);
  }, []);

  const setVideoRef = useGalleryMultiVideoHoverSync(items, displayIdx, isHovered);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPreviewIndex(null);
      setCarouselIdx((i) => (i > 0 ? i - 1 : n - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPreviewIndex(null);
      setCarouselIdx((i) => (i < n - 1 ? i + 1 : 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const idx = previewIndex !== null ? previewIndex : carouselIdx;
      if (previewIndex !== null) setCarouselIdx(previewIndex);
      setPreviewIndex(null);
      onInspect(items[idx]!, startFlatIndex + idx);
    }
  };

  useEffect(() => {
    if (batchFocused && cardRef.current) {
      cardRef.current.focus();
    }
  }, [batchFocused]);

  const onCardClick = () => {
    if (previewIndex !== null) setCarouselIdx(previewIndex);
    const idx = previewIndex !== null ? previewIndex : carouselIdx;
    onFocusIndex(startFlatIndex);
    onInspect(items[idx]!, startFlatIndex + idx);
  };

  return (
    <div
      ref={cardRef}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-[var(--lib-tile)] outline-none transition-shadow ${outerRingClass}`}
      role="group"
      aria-label={`Post ${primary.title}, ${n} assets`}
      tabIndex={0}
      onFocus={() => onFocusIndex(startFlatIndex)}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      <div className="relative aspect-square bg-[var(--lib-muted)]">
        {allLocked ? (
          visitorMediaTierGateLocked(current) ? (
            <div className="absolute inset-0 overflow-hidden bg-[var(--lib-muted)]">
              <VisitorTierGateBackdrop previewSrc={galleryItemPreviewSrc(current)} />
              <VisitorTierGateOverlay
                unlockLabel={designerUnlockLabelFromFacets(current, tierOrderIds, tierTitleById)}
                accentColor={accentColor}
                membershipUrl={membershipUrl}
                variant={lockedOverlayVariant}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--lib-muted)]">
              <div
                className="absolute inset-0 bg-[var(--lib-bg)] opacity-70 backdrop-blur-sm"
                aria-hidden
              />
              <div className="relative z-10 flex flex-col items-center gap-2">
                <Lock className="h-8 w-8 opacity-50 text-[var(--lib-fg-muted)]" />
                <span className="text-xs font-medium text-[var(--lib-fg-muted)] opacity-60">Locked</span>
              </div>
            </div>
          )
        ) : (
          <>
            {items.map((item, idx) => {
              const locked = !galleryItemExportVisibleToVisitor(item);
              const isActive = idx === displayIdx;
              const isVideo = Boolean(item.mime_type?.startsWith("video/"));
              const src = item.content_url_path
                ? `${RELAY_API_BASE}${item.content_url_path}`
                : "";

              const transition =
                "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

              if (locked) {
                return visitorMediaTierGateLocked(item) ? (
                  <div
                    key={galleryItemKey(item)}
                    className="absolute inset-0 overflow-hidden bg-[var(--lib-muted)]"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive
                        ? `translateX(0) scale(${isHovered ? 1.02 : 1})`
                        : `translateX(${idx < displayIdx ? -20 : 20}%) scale(0.95)`,
                      zIndex: isActive ? 10 : 5,
                      transition,
                      pointerEvents: "none"
                    }}
                  >
                    <VisitorTierGateBackdrop previewSrc={galleryItemPreviewSrc(item)} />
                    <VisitorTierGateOverlay
                      unlockLabel={designerUnlockLabelFromFacets(item, tierOrderIds, tierTitleById)}
                      accentColor={accentColor}
                      membershipUrl={membershipUrl}
                      variant={lockedOverlayVariant}
                    />
                  </div>
                ) : (
                  <div
                    key={galleryItemKey(item)}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--lib-muted)]"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive
                        ? `translateX(0) scale(${isHovered ? 1.02 : 1})`
                        : `translateX(${idx < displayIdx ? -20 : 20}%) scale(0.95)`,
                      zIndex: isActive ? 10 : 5,
                      transition,
                      pointerEvents: "none"
                    }}
                  >
                    <Lock className="h-8 w-8 opacity-50 text-[var(--lib-fg-muted)]" />
                  </div>
                );
              }

              const baseTransform = isActive
                ? `translateX(0) scale(${isHovered ? 1.02 : 1})`
                : `translateX(${idx < displayIdx ? -20 : 20}%) scale(0.95)`;

              if (isVideo && src) {
                return (
                  <video
                    key={galleryItemKey(item)}
                    ref={(el) => setVideoRef(item, el)}
                    className="absolute inset-0 h-full w-full object-cover object-center"
                    src={src}
                    muted
                    playsInline
                    preload="metadata"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: baseTransform,
                      zIndex: isActive ? 10 : 5,
                      transition
                    }}
                  />
                );
              }

              return src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={galleryItemKey(item)}
                  src={src}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  style={{
                    opacity: isActive ? 1 : 0,
                    transform: baseTransform,
                    zIndex: isActive ? 10 : 5,
                    transition
                  }}
                />
              ) : (
                <div
                  key={galleryItemKey(item)}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    opacity: isActive ? 1 : 0,
                    transform: baseTransform,
                    zIndex: isActive ? 10 : 5,
                    transition
                  }}
                >
                  <span className="text-[9px] uppercase text-[var(--lib-fg-muted)]">
                    {mediaTypeLabel(item.mime_type, item.media_id)}
                  </span>
                </div>
              );
            })}

            <div
              className="pointer-events-none absolute inset-0 z-[14]"
              style={{
                background: `linear-gradient(90deg, rgba(0,0,0,${isHovered ? 0.1 : 0}) 0%, transparent 20%, transparent 80%, rgba(0,0,0,${isHovered ? 0.1 : 0}) 100%)`,
                transition: "opacity 0.3s ease"
              }}
              aria-hidden
            />

            <div
              className="pointer-events-none absolute bottom-3 left-1/2 z-[20] flex -translate-x-1/2 items-center gap-1.5"
              style={{ opacity: isHovered ? 1 : 0.65, transition: "opacity 0.3s ease" }}
            >
              {items.map((item, idx) => {
                const itemLocked = !galleryItemExportVisibleToVisitor(item);
                return (
                  <span
                    key={galleryItemKey(item)}
                    className="block rounded-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                    style={{
                      width: idx === displayIdx ? "1rem" : "0.375rem",
                      height: "0.375rem",
                      backgroundColor: itemLocked
                        ? "var(--lib-fg-muted)"
                        : idx === displayIdx
                          ? "var(--lib-selection)"
                          : "rgba(255, 255, 255, 0.5)",
                      opacity: itemLocked ? 0.4 : 1,
                      boxShadow:
                        idx === displayIdx ? "0 0 8px var(--lib-selection)" : "none"
                    }}
                  />
                );
              })}
            </div>

            {isHovered ? (
              <div className="pointer-events-none absolute left-2 top-2 z-[20] rounded bg-black/40 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--lib-fg)] opacity-80 backdrop-blur-md">
                Move to explore
              </div>
            ) : null}

            {tierLabel ? (
              <span
                className="pointer-events-none absolute right-2 top-2 z-[20] max-w-[min(100%,8rem)] truncate rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm"
                title={tierLabel}
              >
                {tierLabel}
              </span>
            ) : null}

            <span
              className={`pointer-events-none absolute left-2 top-2 z-[19] h-1.5 w-1.5 rounded-full ${dot}`}
              title={current.visibility}
            />

            <button
              type="button"
              onClick={onCardClick}
              className="absolute inset-0 z-[5] block cursor-pointer"
              aria-label={`Inspect: ${current.title}`}
            />
          </>
        )}
      </div>

      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5"
        style={{ backgroundColor: "var(--lib-card)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug text-[var(--lib-fg)] sm:text-[0.9375rem]">
            {primary.title}
          </p>
          <p className="text-xs text-[var(--lib-fg-muted)] sm:text-[0.8125rem]">
            {primary.published_at.slice(0, 10)}
            <span className="ml-1.5 opacity-70">
              {displayIdx + 1}/{n}
            </span>
          </p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1 ${visitorEngageRevealWrap(snipActive || starActive)}`}
        >
          {showPatronSnip ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                visitorPatronSnip!.onSnipRequest(primary.post_id, current.media_id);
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full bg-[var(--lib-muted)] transition ${visitorEngageRevealBtn} ${
                snipActive ? "text-[var(--lib-selection)]" : "text-[var(--lib-fg-muted)]"
              }`}
              aria-label={
                snipEngageAuthed
                  ? snipActive
                    ? "Snipped — add to another collection or manage in Saved"
                    : "Snip current image to a collection"
                  : "Sign in with Patreon to snip the current asset to a collection"
              }
              aria-pressed={snipEngageAuthed ? snipActive : undefined}
            >
              <SnipIcon className="h-4 w-4" />
            </button>
          ) : null}
          {showPatronStar ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                visitorPatronStar!.onToggle();
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)]/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${visitorEngageRevealBtn} ${
                visitorPatronStar!.active
                  ? "border-[color-mix(in_srgb,var(--lib-selection)_50%,var(--lib-border))] text-[var(--lib-selection)]"
                  : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
              }`}
              aria-label={
                starEngageAuthed
                  ? visitorPatronStar!.active
                    ? "Remove entire post from favorites"
                    : "Favorite entire post"
                  : "Sign in with Patreon to favorite this whole post"
              }
              aria-pressed={starEngageAuthed ? visitorPatronStar!.active : undefined}
            >
              <Star
                className="h-4 w-4"
                fill={visitorPatronStar!.active ? "currentColor" : "none"}
                strokeWidth={2}
              />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PostBatchGridCell({
  items,
  startFlatIndex,
  tierTitleById,
  focusIndex,
  onInspect,
  onFocusIndex,
  visitorCatalog = false,
  visitorPatronStar,
  visitorPatronSnip,
  showTierBadges = true,
  tierFacets = [],
  visitorTierOrderIds = [],
  visitorMembershipUrl = null,
  visitorAccentColor = "#00aa6f",
  visitorLockedOverlayVariant = "blurred"
}: Props) {
  const n = items.length;
  const primary = items[0]!;
  const multi = n > 1;
  const [carouselIdx, setCarouselIdx] = useState(0);
  const current = items[Math.min(carouselIdx, n - 1)]!;

  useEffect(() => {
    setCarouselIdx(0);
  }, [primary.post_id]);

  useEffect(() => {
    setCarouselIdx((i) => Math.min(i, Math.max(0, n - 1)));
  }, [n]);

  const stackLayers = items.slice(0, Math.min(3, n));
  const layersForRender = [...stackLayers].reverse();

  const accentRing = visitorCatalog ? "ring-[var(--lib-selection)]" : "ring-[var(--lib-primary)]";
  const accentBorder = visitorCatalog ? "border-[var(--lib-selection)]" : "border-[var(--lib-primary)]";
  const accentHover = visitorCatalog
    ? "hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))]"
    : "hover:border-[var(--lib-primary)]/35";

  const batchFocusedCollapsed =
    focusIndex >= startFlatIndex && focusIndex < startFlatIndex + n;
  const outerRing = batchFocusedCollapsed
    ? `ring-2 ${accentRing} ${accentBorder}`
    : `border-[var(--lib-border)] ${accentHover}`;

  const inspectFlat = startFlatIndex + carouselIdx;
  const main = postCarouselMainVisual(current);
  const displayItem = multi ? current : primary;
  const tierImageBadgeLabel = tierBadgeForItem(displayItem, showTierBadges, tierFacets, tierTitleById);
  const dot = visDot[current.visibility] ?? visDot.visible;
  const showPatronSnip = Boolean(visitorCatalog && visitorPatronSnip);
  const showPatronStar = Boolean(visitorCatalog && visitorPatronStar);
  const snipActive = visitorPatronSnip?.snippedMediaIds.has(current.media_id) ?? false;
  const starActive = visitorPatronStar?.active ?? false;
  const snipEngageAuthed = visitorPatronSnip?.patronAuthed ?? false;
  const starEngageAuthed = visitorPatronStar?.patronAuthed ?? false;

  const [tileMediaHovered, setTileMediaHovered] = useState(false);
  const tileVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = tileVideoRef.current;
    if (!el) return;
    if (tileMediaHovered) void el.play().catch(() => {});
    else {
      el.pause();
      el.currentTime = 0;
    }
  }, [tileMediaHovered, carouselIdx, primary.post_id]);

  if (visitorCatalog && multi) {
    return (
      <VisitorMultiAssetSlideCell
        items={items}
        startFlatIndex={startFlatIndex}
        tierTitleById={tierTitleById}
        onInspect={onInspect}
        onFocusIndex={onFocusIndex}
        visitorPatronStar={visitorPatronStar}
        visitorPatronSnip={visitorPatronSnip}
        showTierBadges={showTierBadges}
        tierFacets={tierFacets}
        outerRingClass={outerRing}
        batchFocused={batchFocusedCollapsed}
        primary={primary}
        tierOrderIds={visitorTierOrderIds}
        membershipUrl={visitorMembershipUrl}
        accentColor={visitorAccentColor}
        lockedOverlayVariant={visitorLockedOverlayVariant}
      />
    );
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-[var(--lib-tile)] outline-none transition-shadow ${outerRing}`}
      role="group"
      aria-label={`Post ${primary.title}, ${n} asset${n === 1 ? "" : "s"}`}
      tabIndex={0}
      onFocus={() => onFocusIndex(startFlatIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onInspect(current, inspectFlat);
        }
        if (multi && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          setCarouselIdx((i) => {
            const next = e.key === "ArrowLeft" ? i - 1 : i + 1;
            return (next + n) % n;
          });
        }
      }}
    >
      <div
        className="relative aspect-square bg-[var(--lib-muted)]"
        onMouseEnter={() => setTileMediaHovered(true)}
        onMouseLeave={() => setTileMediaHovered(false)}
      >
        {multi ? (
          <>
            <div className="absolute inset-0 overflow-hidden bg-[var(--lib-muted)]">
              {main.src && main.isVideo ? (
                <video
                  ref={tileVideoRef}
                  className="h-full w-full object-cover object-center"
                  src={main.src}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden
                />
              ) : main.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={main.src} alt="" className="h-full w-full object-cover object-center" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
                  <span className="text-[9px] uppercase text-[var(--lib-fg-muted)]">
                    {mediaTypeLabel(current.mime_type, current.media_id)}
                  </span>
                </div>
              )}
            </div>
            {tierImageBadgeLabel ? (
              <span
                className="pointer-events-none absolute right-2 top-2 z-[12] max-w-[min(100%,8rem)] truncate rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-sm"
                title={tierImageBadgeLabel}
              >
                {tierImageBadgeLabel}
              </span>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15]">
              <div className="pointer-events-auto flex flex-row items-end gap-1.5 border-t border-[var(--lib-border)] bg-gradient-to-t from-black/92 via-black/80 to-transparent px-2 py-2">
                <div className="min-w-0 flex-1">
                  <PostAssetCarouselStrip
                    items={items}
                    activeIndex={carouselIdx}
                    onSelect={setCarouselIdx}
                    activeBorderClass={
                      visitorCatalog
                        ? "border-[var(--lib-selection)]"
                        : "border-[var(--lib-primary)]"
                    }
                    size="md"
                    center
                  />
                </div>
                {showPatronSnip ? (
                  <span className={`inline-flex shrink-0 ${visitorEngageRevealWrap(snipActive)}`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        visitorPatronSnip!.onSnipRequest(primary.post_id, current.media_id);
                      }}
                      className={`${snipBtnClass(snipActive)} ${visitorEngageRevealBtn}`}
                      aria-label={
                        snipEngageAuthed
                          ? snipActive
                            ? "Snipped — add to another collection or manage in Saved"
                            : "Snip current image to a collection"
                          : "Sign in with Patreon to snip the current asset to a collection"
                      }
                      aria-pressed={snipEngageAuthed ? snipActive : undefined}
                      title={
                        snipEngageAuthed
                          ? "Snip current asset to a collection"
                          : "Sign in with Patreon to use collections"
                      }
                    >
                      <SnipIcon className="h-5 w-5" />
                    </button>
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onInspect(current, inspectFlat)}
              className="absolute inset-0 bottom-14 z-[5] block cursor-pointer"
              aria-label={`Inspect: ${current.title}`}
            />
            <span
              className={`pointer-events-none absolute left-2 top-2 z-[6] h-1.5 w-1.5 rounded-full ${dot}`}
              title={current.visibility}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onInspect(primary, startFlatIndex)}
              className="absolute inset-0 z-[5] block cursor-pointer"
              aria-label={`Inspect first asset: ${primary.title}`}
            />
            <div className="absolute inset-0 p-2">
              {layersForRender.map((layerItem, depth) => (
                <StackLayer
                  key={galleryItemKey(layerItem)}
                  item={layerItem}
                  depth={depth}
                  total={layersForRender.length}
                  playbackVideoRef={tileVideoRef}
                />
              ))}
            </div>
            {tierImageBadgeLabel ? (
              <span
                className="pointer-events-none absolute right-2 top-2 z-[25] max-w-[min(100%,8rem)] truncate rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-sm"
                title={tierImageBadgeLabel}
              >
                {tierImageBadgeLabel}
              </span>
            ) : null}
            {showPatronSnip ? (
              <span
                className={`absolute bottom-3 right-2 z-[25] inline-flex ${visitorEngageRevealWrap(
                  visitorPatronSnip!.snippedMediaIds.has(primary.media_id)
                )}`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    visitorPatronSnip!.onSnipRequest(primary.post_id, primary.media_id);
                  }}
                  className={`${snipBtnClass(visitorPatronSnip!.snippedMediaIds.has(primary.media_id))} ${visitorEngageRevealBtn}`}
                  aria-label={
                    snipEngageAuthed
                      ? visitorPatronSnip!.snippedMediaIds.has(primary.media_id)
                        ? "Snipped — open Saved to manage"
                        : "Snip this asset to a collection"
                      : "Sign in with Patreon to snip this asset to a collection"
                  }
                  aria-pressed={
                    snipEngageAuthed
                      ? visitorPatronSnip!.snippedMediaIds.has(primary.media_id)
                      : undefined
                  }
                  title={
                    snipEngageAuthed
                      ? "Snip to a collection"
                      : "Sign in with Patreon to use collections"
                  }
                >
                  <SnipIcon className="h-5 w-5" />
                </button>
              </span>
            ) : null}
          </>
        )}
      </div>
      <div className="flex min-h-[4.5rem] flex-col space-y-2 p-3 pt-2.5">
        <p className="truncate text-sm font-semibold leading-snug text-[var(--lib-fg)] sm:text-[0.9375rem]">
          {primary.title}
        </p>
        <p className="text-xs text-[var(--lib-fg-muted)] sm:text-[0.8125rem]">
          {primary.published_at.slice(0, 10)}
        </p>
        {showPatronStar && !multi ? (
          <div className="mt-auto flex flex-row flex-wrap items-center justify-end gap-2 pt-0.5">
            <span className={`inline-flex shrink-0 ${visitorEngageRevealWrap(starActive)}`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  visitorPatronStar!.onToggle();
                }}
                className={`shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)]/90 p-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${visitorEngageRevealBtn} ${
                  visitorPatronStar!.active
                    ? "border-[color-mix(in_srgb,var(--lib-selection)_50%,var(--lib-border))] text-[var(--lib-selection)]"
                    : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                }`}
                aria-label={
                  starEngageAuthed
                    ? visitorPatronStar!.active
                      ? "Remove entire post from favorites"
                      : "Favorite entire post"
                    : "Sign in with Patreon to favorite this whole post"
                }
                aria-pressed={starEngageAuthed ? visitorPatronStar!.active : undefined}
                title={
                  starEngageAuthed
                    ? "Favorite entire post"
                    : "Sign in with Patreon to save favorites"
                }
              >
                <Star
                  className="h-4 w-4"
                  fill={visitorPatronStar!.active ? "currentColor" : "none"}
                  strokeWidth={2}
                />
              </button>
            </span>
          </div>
        ) : null}
        {showPatronStar && multi && !visitorCatalog ? (
          <div className="mt-auto flex flex-row flex-wrap items-center justify-end gap-2 pt-0.5">
            <span className={`inline-flex shrink-0 ${visitorEngageRevealWrap(starActive)}`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  visitorPatronStar!.onToggle();
                }}
                className={`shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-muted)]/90 p-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lib-selection)] ${visitorEngageRevealBtn} ${
                  visitorPatronStar!.active
                    ? "border-[color-mix(in_srgb,var(--lib-selection)_50%,var(--lib-border))] text-[var(--lib-selection)]"
                    : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                }`}
                aria-label={
                  starEngageAuthed
                    ? visitorPatronStar!.active
                      ? "Remove entire post from favorites"
                      : "Favorite entire post"
                    : "Sign in with Patreon to favorite this whole post"
                }
                aria-pressed={starEngageAuthed ? visitorPatronStar!.active : undefined}
                title={
                  starEngageAuthed
                    ? "Favorite entire post"
                    : "Sign in with Patreon to save favorites"
                }
              >
                <Star
                  className="h-4 w-4"
                  fill={visitorPatronStar!.active ? "currentColor" : "none"}
                  strokeWidth={2}
                />
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
