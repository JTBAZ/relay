"use client";

import { RELAY_API_BASE, type GalleryItem, type PostVisibility } from "@/lib/relay-api";

const visibilityBadge: Record<PostVisibility, { dot: string; label: string }> = {
  visible: { dot: "bg-green-500", label: "Visible" },
  hidden: { dot: "bg-gray-500", label: "Hidden" },
  flagged: { dot: "bg-amber-500", label: "Flagged" }
};

type Props = {
  item: GalleryItem;
  isFocused: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onInspect: () => void;
};

export default function GalleryListRow({
  item,
  isFocused,
  isSelected,
  onSelect,
  onFocus,
  onInspect
}: Props) {
  const badge = visibilityBadge[item.visibility] ?? visibilityBadge.visible;

  return (
    <div
      className={`flex items-stretch gap-3 px-4 py-2 border-b border-[#2a221c] ${
        isFocused ? "bg-[#2a1810]" : "hover:bg-[#1f1915]"
      }`}
      onClick={onFocus}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        className="mt-5"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="w-16 h-16 shrink-0 bg-[#2a221c] rounded overflow-hidden flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onInspect();
        }}
        aria-label={`Inspect ${item.title}`}
      >
        {item.has_export && item.mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${RELAY_API_BASE}${item.content_url_path}`}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : item.has_export && item.mime_type?.startsWith("video/") ? (
          <svg className="w-7 h-7 text-[#8a7f72]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3V9z" fill="currentColor" />
          </svg>
        ) : item.has_export && item.mime_type?.startsWith("audio/") ? (
          <svg className="w-7 h-7 text-[#8a7f72]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        ) : item.media_id.startsWith("post_only_") ? (
          <span className="text-[10px] text-[#8a7f72] text-center leading-tight px-1">text<br/>post</span>
        ) : (
          <span className="text-[8px] text-[#5c534a]">no thumb</span>
        )}
      </button>
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dot}`} title={badge.label} />
          <span className="font-[family-name:var(--font-display)] text-[#f5ebe0] truncate">
            {item.title}
          </span>
        </div>
        <div className="text-[10px] text-[#8a7f72]">
          {item.published_at.slice(0, 10)} · {item.media_id}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {item.tag_ids.map((t) => (
            <span key={t} className="text-[10px] px-1.5 bg-[#2a221c] rounded">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
