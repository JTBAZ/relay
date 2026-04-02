"use client";

import { galleryItemKey } from "@/lib/gallery-group";
import type { GalleryItem } from "@/lib/relay-api";
import { accessChipLabel, mediaTypeLabel, visDot } from "./GalleryGridTile";
import { RELAY_API_BASE } from "@/lib/relay-api";

type Props = {
  items: GalleryItem[];
  startFlatIndex: number;
  tierTitleById: Record<string, string>;
  focusIndex: number;
  onOpenPostBatch: () => void;
  onInspect: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
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
        className="w-[88%] aspect-square max-h-[92%] rounded-md overflow-hidden bg-[#2a221c] shadow-[0_6px_20px_rgba(0,0,0,0.45)] border border-[#4a3f36]"
        style={{
          transform: `translate(${translate}px, ${translate}px) scale(${scale})`
        }}
      >
        <div className="relative w-full h-full">
          {item.has_export && item.mime_type?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center min-h-[4rem]">
              <span className="text-[8px] uppercase text-[#8a7f72]">
                {mediaTypeLabel(item.mime_type, item.media_id)}
              </span>
            </div>
          )}
          {depth === total - 1 ? (
            <span
              className={`absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full ${dot}`}
              title={item.visibility}
            />
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
  onOpenPostBatch,
  onInspect,
  onFocusIndex
}: Props) {
  const n = items.length;
  const primary = items[0]!;
  const stackLayers = items.slice(0, Math.min(3, n));
  const layersForRender = [...stackLayers].reverse();

  const batchFocusedCollapsed =
    focusIndex >= startFlatIndex && focusIndex < startFlatIndex + n;
  const outerRing = batchFocusedCollapsed
    ? "ring-2 ring-[#c45c2d] border-[#c45c2d]"
    : "border-[#3d342b] hover:border-[#5c4f44]";

  return (
    <div
      className={`group relative rounded-lg border overflow-hidden bg-[#1a1510] outline-none transition-shadow ${outerRing}`}
      role="group"
      aria-label={`Post ${primary.title}, ${n} assets`}
      tabIndex={0}
      onFocus={() => onFocusIndex(startFlatIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onInspect(primary);
        }
      }}
    >
      <div className="aspect-square relative bg-[#2a221c]">
        <button
          type="button"
          onClick={() => onInspect(primary)}
          className="absolute inset-0 z-[5] block cursor-pointer"
          aria-label={`Inspect first asset: ${primary.title}`}
        />
        <div className="absolute inset-0 p-2">
          {layersForRender.map((item, depth) => (
            <StackLayer
              key={galleryItemKey(item)}
              item={item}
              depth={depth}
              total={layersForRender.length}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-[25] flex justify-center items-end pointer-events-none pt-12 pb-2 px-2 bg-gradient-to-t from-[rgba(8,6,5,0.94)] via-[rgba(8,6,5,0.55)] to-transparent">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPostBatch();
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[rgba(196,92,45,0.45)] bg-[rgba(18,14,11,0.65)] px-3 py-1.5 backdrop-blur-sm text-[#c9bfb3] hover:border-[rgba(232,160,119,0.75)] hover:bg-[rgba(26,21,16,0.85)] hover:text-[#f5ebe0] motion-safe:transition-colors"
            aria-haspopup="dialog"
            aria-label={`See all ${n} assets in this post`}
          >
            <span className="text-[11px] font-semibold tracking-wide text-[#8a7f72] group-hover:text-[#b8a995] sm:text-xs">
              See All
            </span>
            <span className="text-xs opacity-45 px-px" aria-hidden>
              ·
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-[#e8d4b0] group-hover:text-[#f0e6d8] sm:text-xs">
              <span className="tabular-nums text-[#e8a077]">{n}</span> assets
            </span>
            <span className="ml-0.5 text-sm font-light leading-none text-[#c45c2d] sm:text-base" aria-hidden>
              ›
            </span>
          </button>
        </div>
      </div>
      <div className="min-h-[4.5rem] p-3 pt-2.5 space-y-2 flex flex-col">
        <p className="text-sm leading-snug text-[#ede5da] truncate font-semibold sm:text-[0.9375rem]">
          {primary.title}
        </p>
        <p className="text-xs text-[#9a9188] sm:text-[0.8125rem]">{primary.published_at.slice(0, 10)}</p>
        {primary.tier_ids.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
            {primary.tier_ids.slice(0, 3).map((tid) => (
              <span
                key={tid}
                className="rounded border border-[#6b5a4e] bg-[#241f1a]/80 px-2 py-0.5 text-[10px] font-medium text-[#e8d4b0] sm:text-xs"
              >
                {accessChipLabel(tid, tierTitleById)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
