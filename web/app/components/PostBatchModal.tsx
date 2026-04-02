"use client";

import { useEffect, useState } from "react";
import { galleryItemKey } from "@/lib/gallery-group";
import type { Collection, FacetsData, GalleryItem, GalleryPostDetail } from "@/lib/relay-api";
import GalleryGridTile from "./GalleryGridTile";
import PostBatchPostDetails from "./PostBatchPostDetails";

type Props = {
  items: GalleryItem[];
  startFlatIndex: number;
  tierTitleById: Record<string, string>;
  selectedKeys: Set<string>;
  focusIndex: number;
  postDetail: GalleryPostDetail | null;
  postDetailLoading: boolean;
  creatorId: string;
  facets: FacetsData;
  collections: Collection[];
  onClose: () => void;
  onToggleSelect: (item: GalleryItem) => void;
  onInspect: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
  onPostMetadataUpdated: () => Promise<void>;
};

export default function PostBatchModal({
  items,
  startFlatIndex,
  tierTitleById,
  selectedKeys,
  focusIndex,
  postDetail,
  postDetailLoading,
  creatorId,
  facets,
  collections,
  onClose,
  onToggleSelect,
  onInspect,
  onFocusIndex,
  onPostMetadataUpdated
}: Props) {
  const primary = items[0]!;
  const n = items.length;
  const title = postDetail?.title ?? primary.title;
  const published = postDetail?.published_at ?? primary.published_at;
  const publishedDay = published.slice(0, 10);

  const [tagActionError, setTagActionError] = useState<string | null>(null);

  useEffect(() => {
    setTagActionError(null);
  }, [primary.post_id]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 md:p-8"
      role="dialog"
      aria-modal
      aria-labelledby="post-batch-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/78 backdrop-blur-[3px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(92vh,56rem)] w-full max-w-[min(92vw,72rem)] flex-col overflow-hidden rounded-xl border border-[#4a3f36] bg-[#1a1510] shadow-[0_24px_64px_rgba(0,0,0,0.65)] animate-post-batch-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#3d342b] bg-[#1f1915] px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 pr-2">
            <h2
              id="post-batch-modal-title"
              className="text-base font-semibold leading-snug text-[#f5ebe0] sm:text-lg"
            >
              {title}
            </h2>
            <p
              className="mt-1 text-xs text-[#b8a995] sm:text-sm cursor-help"
              title="Original publish date from Patreon for this post."
            >
              Published to Patreon · <span className="text-[#e8d4b0]">{publishedDay}</span>
            </p>
            <p
              className="mt-1 text-xs text-[#8a7f72] sm:text-sm cursor-help"
              title="Scroll the area below to see every asset in this post."
            >
              <strong className="text-[#e8a077]">{n}</strong> assets in this post — header stays put while you scroll.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#5c4f44] bg-[#2a221c] text-lg leading-none text-[#c9bfb3] hover:border-[#c45c2d] hover:text-[#ede5da]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 pb-6 pt-5 sm:px-6 sm:pb-8 sm:pt-6">
            <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#8a7f72] sm:text-xs">
              Assets in this post
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:gap-5">
              {items.map((item, i) => {
                const flat = startFlatIndex + i;
                const k = galleryItemKey(item);
                return (
                  <div key={k} className="min-w-0">
                    <GalleryGridTile
                      item={item}
                      tierTitleById={tierTitleById}
                      selected={selectedKeys.has(k)}
                      focused={focusIndex === flat}
                      flatIndex={flat}
                      onToggleSelect={onToggleSelect}
                      onInspect={onInspect}
                      onFocusIndex={onFocusIndex}
                      largePreview
                      showSelectCheckbox={false}
                    />
                  </div>
                );
              })}
            </div>

            {tagActionError ? (
              <p className="mt-4 rounded-md border border-[#8b3a1a] bg-[#2a1810] px-3 py-2 text-sm text-[#f0c4b8]">
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
              onTagError={setTagActionError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
