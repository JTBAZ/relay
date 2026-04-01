"use client";

import { RELAY_API_BASE, type GalleryItem, type PostVisibility } from "@/lib/relay-api";

type Props = {
  items: GalleryItem[];
  tierTitleById: Record<string, string>;
  selectedKeys: Set<string>;
  focusIndex: number;
  onToggleSelect: (item: GalleryItem) => void;
  onFocusIndex: (index: number) => void;
  onInspect: (item: GalleryItem) => void;
};

function itemKey(i: GalleryItem): string {
  return `${i.post_id}::${i.media_id}`;
}

function accessChipLabel(tierId: string, tierTitleById: Record<string, string>): string {
  const t = tierTitleById[tierId]?.trim();
  if (t) return t;
  if (tierId.startsWith("patreon_tier_")) return tierId.slice("patreon_tier_".length);
  if (tierId.startsWith("relay_tier_")) return tierId.slice("relay_tier_".length);
  return tierId;
}

const visDot: Record<PostVisibility, string> = {
  visible: "bg-green-500",
  hidden: "bg-gray-500",
  flagged: "bg-amber-500"
};

function mediaTypeLabel(mime?: string, mediaId?: string): string {
  if (mediaId?.startsWith("post_only_")) return "Text";
  if (!mime) return "Media";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return mime.split("/")[0] || "File";
}

export default function GalleryGrid({
  items,
  tierTitleById,
  selectedKeys,
  focusIndex,
  onToggleSelect,
  onFocusIndex,
  onInspect
}: Props) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-4"
      role="list"
    >
      {items.map((item, index) => {
        const k = itemKey(item);
        const selected = selectedKeys.has(k);
        const focused = index === focusIndex;
        const dot = visDot[item.visibility] ?? visDot.visible;
        return (
          <div
            key={k}
            role="listitem"
            tabIndex={0}
            className={`group relative rounded-lg border overflow-hidden bg-[#1a1510] outline-none transition-shadow ${
              focused ? "ring-2 ring-[#c45c2d] border-[#c45c2d]" : "border-[#3d342b] hover:border-[#5c4f44]"
            }`}
            onFocus={() => onFocusIndex(index)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onInspect(item);
              }
            }}
          >
            <div className="aspect-square relative bg-[#2a221c]">
              {item.has_export && item.mime_type?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <button
                  type="button"
                  onClick={() => onInspect(item)}
                  className="absolute inset-0 block"
                  aria-label={`Inspect ${item.title}`}
                >
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
                  <span className="text-xs text-[#d8cebf] line-clamp-3">{item.title}</span>
                </button>
              )}
              <span
                className={`absolute top-2 left-2 w-2 h-2 rounded-full ${dot}`}
                title={item.visibility}
              />
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
            </div>
            <div className="p-2 space-y-1">
              <p className="text-[11px] text-[#ede5da] truncate font-medium">{item.title}</p>
              <p className="text-[9px] text-[#6b645c]">{item.published_at.slice(0, 10)}</p>
              {item.tier_ids.length > 0 ? (
                <div className="flex flex-wrap gap-0.5">
                  {item.tier_ids.slice(0, 3).map((tid) => (
                    <span
                      key={tid}
                      className="text-[8px] px-1 rounded border border-[#5c4f44] text-[#e8d4b0]"
                    >
                      {accessChipLabel(tid, tierTitleById)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
