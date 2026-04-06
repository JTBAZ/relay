"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { galleryItemKey } from "@/lib/gallery-group";
import {
  RELAY_API_BASE,
  galleryItemExportVisibleToVisitor,
  galleryItemPreviewSrc,
  type GalleryItem,
  type TierFacet
} from "@/lib/relay-api";
import { pickPrimaryAccessTierIdForChip } from "@/lib/tier-access";
import { mediaTypeLabel, visDot } from "@/app/components/GalleryGridTile";
import { useGalleryMultiVideoHoverSync } from "@/lib/gallery-tile-video";
import { designerUnlockLabelFromFacets } from "@/lib/tier-access";
import { visitorMediaTierGateLocked } from "@/lib/visitor-tier-gate";
import {
  VisitorTierGateBackdrop,
  VisitorTierGateOverlay,
  type VisitorTierGateOverlayVariant
} from "@/app/components/visitor/VisitorTierGateOverlay";
import {
  VisitorPatronTileEngageCluster,
  type VisitorPatronTileSnipProps,
  type VisitorPatronTileStarProps
} from "@/app/components/visitor/VisitorPatronTileEngage";

function tierChipLabel(
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

export type VisitorBatchSlideMediaProps = {
  items: GalleryItem[];
  /** Resets slide index when the post changes (e.g. `primary.post_id`). */
  resetKey: string;
  /** Outer media box: e.g. `aspect-square` or `aspect-[16/9] w-full` */
  imgClass: string;
  showTierBadges: boolean;
  tierFacets: TierFacet[];
  tierTitleById: Record<string, string>;
  onActivateItem: (item: GalleryItem, assetIndex: number) => void;
  /**
   * When true, show post title over a bottom gradient (curated section tiles).
   * When false, only media + dots + hint (grid cell composes its own footer).
   */
  embedTitleOverlay?: boolean;
  /** Tier order (low→high) for censored-tile labels — same as designer preview */
  tierOrderIds?: string[];
  patronMembershipUrl?: string | null;
  accentColor?: string;
  lockedOverlayVariant?: VisitorTierGateOverlayVariant;
  visitorPatronStar?: VisitorPatronTileStarProps;
  visitorPatronSnip?: VisitorPatronTileSnipProps;
};

/**
 * Slide-to-explore multi-asset surface: horizontal hover scrubs variants with a subtle slide transition.
 * Shared by visitor grid (`PostBatchGridCell`) and curated sections (`PatronLayoutSections`).
 */
export function VisitorBatchSlideMedia({
  items,
  resetKey,
  imgClass,
  showTierBadges,
  tierFacets,
  tierTitleById,
  onActivateItem,
  embedTitleOverlay = false,
  tierOrderIds = [],
  patronMembershipUrl = null,
  accentColor = "#00aa6f",
  lockedOverlayVariant = "blurred",
  visitorPatronStar,
  visitorPatronSnip
}: VisitorBatchSlideMediaProps) {
  const n = items.length;
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCarouselIdx(0);
    setPreviewIndex(null);
  }, [resetKey]);

  useEffect(() => {
    setCarouselIdx((i) => Math.min(i, Math.max(0, n - 1)));
  }, [n]);

  const displayIdx = previewIndex !== null ? previewIndex : carouselIdx;
  const current = items[Math.min(displayIdx, n - 1)]!;
  const allLocked = items.every((it) => !galleryItemExportVisibleToVisitor(it));
  const tierLabel = tierChipLabel(current, showTierBadges, tierFacets, tierTitleById);
  const dot = visDot[current.visibility] ?? visDot.visible;

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

  const openCurrent = () => {
    const idx = previewIndex !== null ? previewIndex : carouselIdx;
    if (previewIndex !== null) setCarouselIdx(previewIndex);
    setPreviewIndex(null);
    onActivateItem(items[idx]!, idx);
  };

  const transition =
    "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden bg-[var(--lib-muted)] ${imgClass}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {allLocked ? (
        visitorMediaTierGateLocked(current) ? (
          <div className="absolute inset-0 overflow-hidden bg-[var(--lib-muted)]">
            <VisitorTierGateBackdrop previewSrc={galleryItemPreviewSrc(current)} />
            <VisitorTierGateOverlay
              unlockLabel={designerUnlockLabelFromFacets(current, tierOrderIds, tierTitleById)}
              accentColor={accentColor}
              membershipUrl={patronMembershipUrl}
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
            const src = item.content_url_path ? `${RELAY_API_BASE}${item.content_url_path}` : "";

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
                      membershipUrl={patronMembershipUrl}
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

          {embedTitleOverlay ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] bg-gradient-to-t from-black/75 via-black/20 to-transparent p-2.5 pb-10 pt-8 opacity-80 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:group-hover:opacity-95"
              aria-hidden={false}
            >
              <p className="truncate text-xs font-medium text-white drop-shadow-sm md:text-sm">
                {current.title}
              </p>
            </div>
          ) : null}

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
                    boxShadow: idx === displayIdx ? "0 0 8px var(--lib-selection)" : "none"
                  }}
                />
              );
            })}
          </div>

          {n > 1 && isHovered ? (
            <div className="pointer-events-none absolute left-2 top-2 z-[20] rounded bg-black/40 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--lib-fg)] opacity-80 backdrop-blur-md">
              Move to explore
            </div>
          ) : null}

          {tierLabel ? (
            <span
              className="pointer-events-none absolute right-2 top-2 z-[20] max-w-[min(100%,8rem)] truncate rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm"
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
            onClick={openCurrent}
            className="absolute inset-0 z-[5] block cursor-pointer"
            aria-label={`Open: ${current.title}`}
          />
        </>
      )}

      <VisitorPatronTileEngageCluster
        postId={current.post_id}
        currentMediaId={current.media_id}
        visitorPatronStar={visitorPatronStar}
        visitorPatronSnip={visitorPatronSnip}
        className="absolute bottom-2 right-2 z-[25]"
      />
    </div>
  );
}
