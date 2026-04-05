"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { galleryItemKey } from "@/lib/gallery-group";
import {
  RELAY_API_BASE,
  type Collection,
  type FacetsData,
  type GalleryItem,
  type GalleryPostDetail,
  type PostVisibility,
  type TierFacet
} from "@/lib/relay-api";
import PostBatchPostDetails from "./PostBatchPostDetails";
import { InspectAssetPreview } from "./inspect/inspect-asset-preview";
import { InspectMetaSidebar } from "./inspect/inspect-meta-sidebar";
import { InspectSmartTagPanel } from "./inspect/inspect-smart-tag-panel";
import PostAssetCarouselStrip from "./PostAssetCarouselStrip";

const SEL = "#00aa6f";

type Props = {
  items: GalleryItem[];
  startFlatIndex: number;
  tierTitleById: Record<string, string>;
  selectedKeys: Set<string>;
  postDetail: GalleryPostDetail | null;
  postDetailLoading: boolean;
  creatorId: string;
  facets: FacetsData;
  collections: Collection[];
  /** When true, fullscreen video uses native `loop`. */
  videoLoop?: boolean;
  onClose: () => void;
  /** Parent bulk selection becomes only this asset (fullscreen / inspect). */
  onIsolateSelectionForAsset?: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
  onPostMetadataUpdated: () => Promise<void>;
  /** After manual export retry from the focused asset; refresh list so `has_export` updates. */
  onMediaExportRetryComplete?: () => void;
  setItemVisibility: (items: GalleryItem[], visibility: PostVisibility) => Promise<void>;
  onVisibilityError?: (message: string) => void;
};

export default function PostBatchModal({
  items,
  startFlatIndex,
  tierTitleById,
  selectedKeys,
  postDetail,
  postDetailLoading,
  creatorId,
  facets,
  collections,
  videoLoop = false,
  onClose,
  onIsolateSelectionForAsset,
  onFocusIndex,
  onPostMetadataUpdated,
  onMediaExportRetryComplete,
  setItemVisibility,
  onVisibilityError
}: Props) {
  const primary = items[0]!;
  const title = postDetail?.title ?? primary.title;

  const [tagActionError, setTagActionError] = useState<string | null>(null);
  const [showShadowCovers, setShowShadowCovers] = useState(false);
  const [fullscreenItem, setFullscreenItem] = useState<GalleryItem | null>(null);
  const [focusAssetIndex, setFocusAssetIndex] = useState(0);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [exportRetryBusy, setExportRetryBusy] = useState(false);

  const openAssetFullscreen = useCallback(
    (item: GalleryItem) => {
      onIsolateSelectionForAsset?.(item);
      setFullscreenItem(item);
    },
    [onIsolateSelectionForAsset]
  );

  const gridItems = useMemo(
    () => items.filter((i) => showShadowCovers || !i.shadow_cover),
    [items, showShadowCovers]
  );

  const shadowCoverCount = useMemo(
    () => items.filter((i) => i.shadow_cover).length,
    [items]
  );

  const nVisible = gridItems.length;
  const nTotal = items.length;

  const focusedItem = gridItems[Math.min(focusAssetIndex, Math.max(0, gridItems.length - 1))] ?? primary;

  const accessTiers: TierFacet[] = useMemo(() => {
    if (postDetail && postDetail.tiers.length > 0) {
      return postDetail.tiers;
    }
    return focusedItem.tier_ids.map((tier_id) => ({
      tier_id,
      title: tier_id.startsWith("patreon_tier_")
        ? tier_id.slice("patreon_tier_".length)
        : tier_id.startsWith("relay_tier_")
          ? tier_id.slice("relay_tier_".length)
          : tier_id
    }));
  }, [postDetail, focusedItem.tier_ids]);

  const applyVis = useCallback(
    async (visibility: PostVisibility) => {
      setVisibilityBusy(true);
      try {
        await setItemVisibility([focusedItem], visibility);
        await onPostMetadataUpdated();
      } catch (e) {
        onVisibilityError?.(e instanceof Error ? e.message : String(e));
      } finally {
        setVisibilityBusy(false);
      }
    },
    [focusedItem, setItemVisibility, onPostMetadataUpdated, onVisibilityError]
  );

  const runExportRetry = useCallback(async () => {
    if (!creatorId || exportRetryBusy) return;
    setExportRetryBusy(true);
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/v1/export/media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId, media_id: focusedItem.media_id })
      });
      if (res.ok) {
        onMediaExportRetryComplete?.();
      }
    } finally {
      setExportRetryBusy(false);
    }
  }, [creatorId, exportRetryBusy, focusedItem.media_id, onMediaExportRetryComplete]);

  useEffect(() => {
    setTagActionError(null);
  }, [primary.post_id]);

  useEffect(() => {
    setShowShadowCovers(false);
    setFullscreenItem(null);
  }, [primary.post_id]);

  useEffect(() => {
    const idx = gridItems.findIndex((it) => selectedKeys.has(galleryItemKey(it)));
    setFocusAssetIndex(idx >= 0 ? idx : 0);
  }, [primary.post_id, gridItems, showShadowCovers, selectedKeys]);

  useEffect(() => {
    setFocusAssetIndex((i) => Math.min(i, Math.max(0, gridItems.length - 1)));
  }, [gridItems.length]);

  useEffect(() => {
    if (!fullscreenItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenItem]);

  const fullscreenEligible =
    focusedItem.has_export &&
    (focusedItem.mime_type?.startsWith("image/") || focusedItem.mime_type?.startsWith("video/"));

  const showExportFail =
    !focusedItem.has_export && Boolean(focusedItem.export_error) && Boolean(creatorId);

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal
        aria-labelledby="post-batch-modal-title"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--lib-border)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-[var(--lib-fg-muted)]">
                Creator Library
              </p>
              <h2 id="post-batch-modal-title" className="truncate text-sm font-medium text-[var(--lib-fg)]">
                {title}
              </h2>
              {shadowCoverCount > 0 && !showShadowCovers ? (
                <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">
                  <strong style={{ color: SEL }}>{nVisible}</strong> of {nTotal} assets shown · duplicate cover
                  {shadowCoverCount === 1 ? "" : "s"} hidden
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">
                  <strong style={{ color: SEL }}>{nVisible}</strong> asset{nVisible === 1 ? "" : "s"} in this post
                </p>
              )}
              {shadowCoverCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowShadowCovers((v) => !v)}
                  className="mt-1 text-left text-[11px] font-medium underline decoration-[var(--lib-border)] underline-offset-2 hover:text-[var(--lib-fg)]"
                  style={{ color: SEL }}
                >
                  {showShadowCovers
                    ? "Hide duplicate cover thumbnails"
                    : `Show duplicate cover thumbnail${shadowCoverCount === 1 ? "" : "s"} (${shadowCoverCount})`}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="relative flex min-h-[220px] flex-1 flex-col bg-[var(--lib-bg)] lg:min-h-0">
              <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
                {fullscreenEligible ? (
                  <button
                    type="button"
                    className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] bg-black/55 shadow-md backdrop-blur-sm transition-colors hover:bg-black/70"
                    style={{ color: SEL }}
                    aria-label={`Fullscreen: ${focusedItem.title}`}
                    title="Fullscreen"
                    onClick={() => openAssetFullscreen(focusedItem)}
                  >
                    <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
                <div className="flex h-full min-h-[200px] w-full max-w-full items-center justify-center lg:min-h-0">
                  <InspectAssetPreview item={focusedItem} videoLoop={videoLoop} />
                </div>
              </div>

              {showExportFail ? (
                <div
                  className="flex shrink-0 items-center justify-between gap-2 border-t border-amber-500/35 bg-black/55 px-3 py-2"
                  role="status"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[11px] leading-tight text-amber-100/90"
                    title={focusedItem.export_error}
                  >
                    Couldn&apos;t fetch file
                  </span>
                  <button
                    type="button"
                    disabled={exportRetryBusy}
                    onClick={() => void runExportRetry()}
                    className="shrink-0 rounded border border-amber-500/50 bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-100 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    {exportRetryBusy ? "…" : "Retry"}
                  </button>
                </div>
              ) : null}

              <div className="shrink-0 border-t border-[var(--lib-border)] bg-[var(--lib-bg)] px-2 py-2">
                <PostAssetCarouselStrip
                  items={gridItems}
                  activeIndex={Math.min(focusAssetIndex, Math.max(0, gridItems.length - 1))}
                  onSelect={(i) => {
                    setFocusAssetIndex(i);
                    const it = gridItems[i];
                    if (it) {
                      onIsolateSelectionForAsset?.(it);
                      onFocusIndex(startFlatIndex + i);
                    }
                  }}
                  activeBorderClass="border-[color-mix(in_srgb,var(--lib-selection)_65%,white)]"
                  size="md"
                />
              </div>
            </div>

            <aside className="flex w-full shrink-0 flex-col border-t border-[var(--lib-border)] lg:w-[360px] lg:border-l lg:border-t-0">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <InspectMetaSidebar
                  preview={focusedItem}
                  previewDetail={postDetail}
                  accessTiers={accessTiers}
                  busy={visibilityBusy}
                  onVisibility={applyVis}
                />

                <div className="border-t border-[var(--lib-border)] px-4 py-4">
                  <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--lib-fg-muted)]">
                    Comments
                  </p>
                  <p className="text-[11px] text-[var(--lib-fg-muted)]">
                    Patreon comments are not synced yet. Discussion will appear here when ingest supports it.
                  </p>
                </div>

                {tagActionError ? (
                  <p className="mx-4 mb-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                    {tagActionError}
                  </p>
                ) : null}

                <div className="px-4 pb-4">
                  <PostBatchPostDetails
                    items={items}
                    postDetail={postDetail}
                    postDetailLoading={postDetailLoading}
                    tierTitleById={tierTitleById}
                    collections={collections}
                    creatorId={creatorId}
                    facets={facets}
                    postId={primary.post_id}
                    onTagsChanged={onPostMetadataUpdated}
                    onCollectionsChanged={onPostMetadataUpdated}
                    onTagError={setTagActionError}
                    tagsAndCollectionsOnly
                  />
                </div>
              </div>
              <InspectSmartTagPanel />
            </aside>
          </div>
        </div>
      </div>

      {fullscreenItem ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal
          aria-label="Fullscreen media"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            aria-label="Close fullscreen"
            onClick={() => setFullscreenItem(null)}
          />
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white transition-colors hover:bg-black/80"
            aria-label="Close"
            onClick={() => setFullscreenItem(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative z-[1] flex h-[min(92vh,100%)] w-full max-w-[min(96vw,100%)] items-center justify-center">
            <div className="max-h-full w-full max-w-full [&_video]:max-h-[min(92vh,100%)] [&_img]:max-h-[min(92vh,100%)]">
              <InspectAssetPreview item={fullscreenItem} videoLoop={videoLoop} />
            </div>
          </div>
          {fullscreenItem.title ? (
            <p className="relative z-[1] mt-4 max-w-2xl truncate text-center text-sm text-white/80">
              {fullscreenItem.title}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
