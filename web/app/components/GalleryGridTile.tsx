"use client";

import { RELAY_API_BASE, type GalleryItem, type PostVisibility } from "@/lib/relay-api";

export function accessChipLabel(tierId: string, tierTitleById: Record<string, string>): string {
  const t = tierTitleById[tierId]?.trim();
  if (t) return t;
  if (tierId.startsWith("patreon_tier_")) return tierId.slice("patreon_tier_".length);
  if (tierId.startsWith("relay_tier_")) return tierId.slice("relay_tier_".length);
  return tierId;
}

export const visDot: Record<PostVisibility, string> = {
  visible: "bg-green-500",
  hidden: "bg-gray-500",
  flagged: "bg-amber-500"
};

export function mediaTypeLabel(mime?: string, mediaId?: string): string {
  if (mediaId?.startsWith("post_only_")) return "Text";
  if (!mime) return "Media";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return mime.split("/")[0] || "File";
}

type Props = {
  item: GalleryItem;
  tierTitleById: Record<string, string>;
  selected: boolean;
  focused: boolean;
  flatIndex: number;
  onToggleSelect: (item: GalleryItem) => void;
  onInspect: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
  /** Narrow strip tile inside an expanded post batch */
  compact?: boolean;
  /** Larger image + type; for post-batch modal previews */
  largePreview?: boolean;
  /** When false, hides the selection checkbox (e.g. modal where bulk bar is off-screen) */
  showSelectCheckbox?: boolean;
};

export default function GalleryGridTile({
  item,
  tierTitleById,
  selected,
  focused,
  flatIndex,
  onToggleSelect,
  onInspect,
  onFocusIndex,
  compact = false,
  largePreview = false,
  showSelectCheckbox = true
}: Props) {
  const dot = visDot[item.visibility] ?? visDot.visible;
  const ring = focused ? "ring-2 ring-[#c45c2d] border-[#c45c2d]" : "border-[#3d342b] hover:border-[#5c4f44]";
  const thumbClass = largePreview
    ? "aspect-square min-h-[10rem] sm:min-h-[12rem] md:min-h-[14rem]"
    : compact
      ? "aspect-square min-h-[5.5rem]"
      : "aspect-square";

  return (
    <div
      className={`group relative rounded-lg border overflow-hidden bg-[#1a1510] outline-none transition-shadow ${ring}`}
      tabIndex={0}
      onFocus={() => onFocusIndex(flatIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onInspect(item);
        }
      }}
    >
      <div className={`${thumbClass} relative bg-[#2a221c]`}>
        {item.has_export && item.mime_type?.startsWith("image/") ? (
          <button
            type="button"
            onClick={() => onInspect(item)}
            className="absolute inset-0 block"
            aria-label={`Inspect ${item.title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- relay-served export URLs */}
            <img
              src={`${RELAY_API_BASE}${item.content_url_path}`}
              alt=""
              className="w-full h-full object-cover"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onInspect(item)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center"
            aria-label={`Inspect ${item.title}`}
          >
            <span className="text-[10px] uppercase tracking-wider text-[#8a7f72]">
              {mediaTypeLabel(item.mime_type, item.media_id)}
            </span>
            <span
              className={`text-[#d8cebf] line-clamp-3 ${largePreview ? "text-sm" : compact ? "text-[10px]" : "text-xs"}`}
            >
              {item.title}
            </span>
          </button>
        )}
        <span
          className={`absolute top-2 left-2 rounded-full ${dot} ${largePreview ? "w-2.5 h-2.5" : "w-2 h-2"}`}
          title={item.visibility}
        />
        {showSelectCheckbox ? (
          <label className="absolute top-2 right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-black/50">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5"
              aria-label={`Select ${item.title}`}
            />
          </label>
        ) : null}
      </div>
      {/* Default grid meta matches PostBatchGridCell + /single-post-grid-tile-preview.html (right reference). */}
      <div
        className={
          largePreview
            ? "space-y-1 p-3"
            : compact
              ? "space-y-1 p-1.5"
              : "flex min-h-[4.5rem] flex-col space-y-2 p-3 pt-2.5"
        }
      >
        <p
          className={
            largePreview
              ? "truncate text-sm font-medium text-[#ede5da]"
              : compact
                ? "truncate text-[10px] font-medium text-[#ede5da]"
                : "truncate text-sm font-semibold leading-snug text-[#ede5da] sm:text-[0.9375rem]"
          }
        >
          {item.title}
        </p>
        <p
          className={
            largePreview
              ? "text-xs text-[#6b645c]"
              : compact
                ? "text-[8px] text-[#6b645c]"
                : "text-xs text-[#9a9188] sm:text-[0.8125rem]"
          }
        >
          {item.published_at.slice(0, 10)}
        </p>
        {item.tier_ids.length > 0 ? (
          <div
            className={
              largePreview
                ? "flex flex-wrap gap-0.5"
                : compact
                  ? "flex flex-wrap gap-0.5"
                  : "mt-auto flex flex-wrap gap-1 pt-0.5"
            }
          >
            {item.tier_ids.slice(0, largePreview ? 4 : compact ? 2 : 3).map((tid) => (
              <span
                key={tid}
                className={
                  largePreview
                    ? "rounded border border-[#5c4f44] px-1.5 py-0.5 text-[10px] text-[#e8d4b0]"
                    : compact
                      ? "rounded border border-[#5c4f44] px-1 text-[8px] text-[#e8d4b0]"
                      : "rounded border border-[#6b5a4e] bg-[#241f1a]/80 px-2 py-0.5 text-[10px] font-medium text-[#e8d4b0] sm:text-xs"
                }
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
