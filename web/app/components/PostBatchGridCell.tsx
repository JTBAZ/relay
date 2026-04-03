"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { galleryItemKey } from "@/lib/gallery-group";
import type { GalleryItem } from "@/lib/relay-api";
import { RELAY_API_BASE } from "@/lib/relay-api";
import SnipIcon from "@/app/components/icons/SnipIcon";
import { accessChipLabel, mediaTypeLabel, visDot } from "./GalleryGridTile";
import PostAssetCarouselStrip, { postCarouselMainVisual } from "./PostAssetCarouselStrip";

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
};

function StackLayer({ item, depth, total }: { item: GalleryItem; depth: number; total: number }) {
  const fromBack = total - 1 - depth;
  const translate = fromBack * 9;
  const scale = 1 - fromBack * 0.065;
  const z = depth + 1;
  const dot = visDot[item.visibility] ?? visDot.visible;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: z }}
    >
      <div
        className="w-[88%] aspect-square max-h-[92%] rounded-md overflow-hidden bg-[var(--lib-muted)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] border border-[var(--lib-border)]"
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
              className="h-full w-full object-cover object-center"
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              muted
              playsInline
              preload="metadata"
              aria-hidden
            />
          ) : (
            <div className="flex h-full w-full min-h-[4rem] flex-col items-center justify-center p-1 text-center">
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

export default function PostBatchGridCell({
  items,
  startFlatIndex,
  tierTitleById,
  focusIndex,
  onInspect,
  onFocusIndex,
  visitorCatalog = false,
  visitorPatronStar,
  visitorPatronSnip
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
  const dot = visDot[current.visibility] ?? visDot.visible;
  const showPatronSnip = Boolean(visitorCatalog && visitorPatronSnip);
  const showPatronStar = Boolean(visitorCatalog && visitorPatronStar);
  const snipActive =
    visitorPatronSnip?.snippedMediaIds.has(current.media_id) ?? false;
  const starActive = visitorPatronStar?.active ?? false;
  const snipEngageAuthed = visitorPatronSnip?.patronAuthed ?? false;
  const starEngageAuthed = visitorPatronStar?.patronAuthed ?? false;

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
      <div className="relative aspect-square bg-[var(--lib-muted)]">
        {multi ? (
          <>
            <div className="absolute inset-0 overflow-hidden bg-[var(--lib-muted)]">
              {main.src && main.isVideo ? (
                <video
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
                />
              ))}
            </div>
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
        {primary.tier_ids.length > 0 || showPatronStar ? (
          <div className="mt-auto flex flex-row flex-wrap items-center gap-2 pt-0.5">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {primary.tier_ids.slice(0, 3).map((tid) => (
                <span
                  key={tid}
                  className="rounded border border-[var(--lib-border)] bg-[var(--lib-muted)]/80 px-2 py-0.5 text-[10px] font-medium text-[var(--lib-fg)] sm:text-xs"
                >
                  {accessChipLabel(tid, tierTitleById)}
                </span>
              ))}
            </div>
            {showPatronStar ? (
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
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
