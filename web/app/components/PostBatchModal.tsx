"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { galleryItemKey } from "@/lib/gallery-group";
import {
  RELAY_API_BASE,
  type Collection,
  type FacetsData,
  type GalleryItem,
  type GalleryPostDetail
} from "@/lib/relay-api";
import GalleryGridTile from "./GalleryGridTile";
import PostBatchPostDetails from "./PostBatchPostDetails";

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
  onToggleSelect: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
  onPostMetadataUpdated: () => Promise<void>;
  /** After manual export retry from an asset tile; refresh list so `has_export` updates. */
  onMediaExportRetryComplete?: () => void;
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
  onToggleSelect,
  onFocusIndex,
  onPostMetadataUpdated,
  onMediaExportRetryComplete
}: Props) {
  const primary = items[0]!;
  const title = postDetail?.title ?? primary.title;
  const published = postDetail?.published_at ?? primary.published_at;
  const publishedDay = published.slice(0, 10);

  const [tagActionError, setTagActionError] = useState<string | null>(null);
  const [showShadowCovers, setShowShadowCovers] = useState(false);
  const [fullscreenItem, setFullscreenItem] = useState<GalleryItem | null>(null);

  const openAssetFullscreen = useCallback(
    (item: GalleryItem) => {
      onIsolateSelectionForAsset?.(item);
      setFullscreenItem(item);
    },
    [onIsolateSelectionForAsset]
  );

  const shadowCoverCount = useMemo(
    () => items.filter((i) => i.shadow_cover).length,
    [items]
  );

  const gridItems = useMemo(
    () => items.filter((i) => showShadowCovers || !i.shadow_cover),
    [items, showShadowCovers]
  );

  const nVisible = gridItems.length;
  const nTotal = items.length;

  useEffect(() => {
    setTagActionError(null);
  }, [primary.post_id]);

  useEffect(() => {
    setShowShadowCovers(false);
    setFullscreenItem(null);
  }, [primary.post_id]);

  useEffect(() => {
    if (!fullscreenItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenItem]);

  const fullscreenSrc =
    fullscreenItem && fullscreenItem.has_export
      ? `${RELAY_API_BASE}${fullscreenItem.content_url_path}`
      : null;
  const fullscreenIsVideo = Boolean(fullscreenItem?.mime_type?.startsWith("video/"));

  return (
    <>
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 md:p-8"
      role="dialog"
      aria-modal
      aria-labelledby="post-batch-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="animate-post-batch-modal relative flex max-h-[min(92vh,56rem)] w-full max-w-[min(92vw,72rem)] flex-col overflow-hidden rounded-xl border-2 border-[var(--lib-border)] bg-[var(--lib-card)] shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        style={{ boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, ${SEL} 20%, transparent)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--lib-border)] bg-[var(--lib-muted)]/35 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 pr-2">
            <h2
              id="post-batch-modal-title"
              className="text-base font-semibold leading-snug text-[var(--lib-fg)] sm:text-lg"
            >
              {title}
            </h2>
            <p
              className="mt-1 cursor-help text-xs text-[var(--lib-fg-muted)] sm:text-sm"
              title="Original publish date from Patreon for this post."
            >
              Published to Patreon · <span className="text-[var(--lib-fg)]">{publishedDay}</span>
            </p>
            <p
              className="mt-1 cursor-help text-xs text-[var(--lib-fg-muted)] sm:text-sm"
              title="Scroll the area below to see every asset in this post."
            >
              {shadowCoverCount > 0 && !showShadowCovers ? (
                <>
                  <strong style={{ color: SEL }}>{nVisible}</strong>
                  <span>
                    {" "}
                    of {nTotal} assets shown · duplicate Patreon cover
                    {shadowCoverCount === 1 ? "" : "s"} hidden
                  </span>
                </>
              ) : (
                <>
                  <strong style={{ color: SEL }}>{nVisible}</strong>
                  <span>
                    {" "}
                    asset{nVisible === 1 ? "" : "s"} in this post
                  </span>
                </>
              )}
              <span> — header stays put while you scroll.</span>
            </p>
            {shadowCoverCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowShadowCovers((v) => !v)}
                className="mt-2 text-left text-xs font-medium underline decoration-[var(--lib-border)] underline-offset-2 transition-colors hover:text-[var(--lib-fg)]"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--lib-border)] bg-[var(--lib-input)] text-lg leading-none text-[var(--lib-fg-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] hover:text-[var(--lib-fg)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 pb-6 pt-5 sm:px-6 sm:pb-8 sm:pt-6">
            <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:text-xs">
              Assets in this post
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:gap-5">
              {gridItems.map((item, i) => {
                const flat = startFlatIndex + i;
                const k = galleryItemKey(item);
                return (
                  <div key={k} className="min-w-0">
                    <GalleryGridTile
                      items={[item]}
                      tierTitleById={tierTitleById}
                      tierFacets={facets.tiers}
                      selected={selectedKeys.has(k)}
                      flatIndex={flat}
                      onToggleSelect={(g) => onToggleSelect(g[0]!)}
                      onFocusIndex={onFocusIndex}
                      largePreview
                      showSelectCheckbox={false}
                      onIsolateAssetSelection={onIsolateSelectionForAsset}
                      onImageFullscreen={openAssetFullscreen}
                      creatorId={creatorId}
                      onExportRetryComplete={onMediaExportRetryComplete}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
              <div
                className="flex min-h-0 flex-col rounded-xl border bg-[color-mix(in_srgb,var(--lib-selection)_12%,var(--lib-muted))] p-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--lib-selection)_25%,transparent)] sm:p-4"
                style={{
                  borderColor: `color-mix(in srgb, ${SEL} 38%, var(--lib-border))`
                }}
              >
                <h3 className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:text-xs">
                  Description
                </h3>
                <p className="mt-0.5 shrink-0 text-[0.65rem] text-[var(--lib-fg-muted)] sm:text-[11px]">
                  Original post body from Patreon (read-only).
                </p>
                <div
                  className="mt-2 min-h-[200px] max-h-[min(38vh,360px)] flex-1 overflow-y-auto overscroll-contain rounded-lg border border-[color-mix(in_srgb,var(--lib-selection)_22%,var(--lib-border))] bg-[var(--lib-card)]/80 px-3 py-2.5 sm:px-3.5 sm:py-3"
                  role="region"
                  aria-label="Post description"
                >
                  {postDetailLoading ? (
                    <p className="text-xs italic text-[var(--lib-fg-muted)]">Loading…</p>
                  ) : postDetail?.description ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none text-[var(--lib-fg)] prose-p:leading-relaxed prose-headings:text-[var(--lib-fg)] prose-a:text-[color-mix(in_srgb,var(--lib-selection)_85%,white)]"
                      dangerouslySetInnerHTML={{ __html: postDetail.description }}
                    />
                  ) : (
                    <p className="text-sm italic text-[var(--lib-fg-muted)]">
                      No text content for this post.
                    </p>
                  )}
                </div>
              </div>

              <div
                className="flex min-h-0 flex-col rounded-xl border bg-[color-mix(in_srgb,var(--lib-selection)_12%,var(--lib-muted))] p-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--lib-selection)_25%,transparent)] sm:p-4"
                style={{
                  borderColor: `color-mix(in srgb, ${SEL} 38%, var(--lib-border))`
                }}
              >
                <h3 className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)] sm:text-xs">
                  Comments
                </h3>
                <p className="mt-0.5 shrink-0 text-[0.65rem] text-[var(--lib-fg-muted)] sm:text-[11px]">
                  Patreon comments (not synced yet).
                </p>
                <div
                  className="mt-2 min-h-[200px] max-h-[min(38vh,360px)] flex-1 overflow-y-auto overscroll-contain rounded-lg border border-[color-mix(in_srgb,var(--lib-selection)_22%,var(--lib-border))] bg-[var(--lib-card)]/80 px-3 py-2.5 sm:px-3.5 sm:py-3"
                  role="region"
                  aria-label="Comments"
                >
                  <p className="text-sm text-[var(--lib-fg-muted)]">
                    No comments loaded yet. This space will list discussion when ingest supports it.
                  </p>
                </div>
              </div>
            </div>

            {tagActionError ? (
              <p className="mt-4 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {tagActionError}
              </p>
            ) : null}

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
            />
          </div>
        </div>
      </div>
    </div>

    {fullscreenItem && fullscreenSrc ? (
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
        <div className="relative z-[1] flex max-h-[min(92vh,100%)] w-full max-w-[min(96vw,100%)] items-center justify-center">
          {fullscreenIsVideo ? (
            <video
              className="max-h-[min(92vh,100%)] max-w-full rounded-lg shadow-2xl"
              src={fullscreenSrc}
              controls
              playsInline
              loop={videoLoop}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- relay-served export URL */
            <img
              src={fullscreenSrc}
              alt={fullscreenItem.title || "Post media"}
              className="max-h-[min(92vh,100%)] max-w-full object-contain shadow-2xl"
            />
          )}
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
