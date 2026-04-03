"use client";

import { useState } from "react";
import { RELAY_API_BASE, type GalleryItem, type PostVisibility } from "@/lib/relay-api";

const visibilityBadge: Record<PostVisibility, { dot: string; label: string }> = {
  visible: { dot: "bg-green-500", label: "Visible" },
  hidden: { dot: "bg-gray-500", label: "Hidden" },
  review: { dot: "bg-amber-500", label: "Review" }
};

type Props = {
  item: GalleryItem;
  /** tier_id → display title (from gallery facets / canonical tiers) */
  tierTitleById: Record<string, string>;
  isFocused: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onInspect: () => void;
  onRestoreToWorkspace?: () => void;
  creatorId?: string;
  onExportRetryComplete?: () => void;
};

function accessChipLabel(tierId: string, tierTitleById: Record<string, string>): string {
  const t = tierTitleById[tierId]?.trim();
  if (t) return t;
  if (tierId.startsWith("patreon_tier_")) return tierId.slice("patreon_tier_".length);
  if (tierId.startsWith("relay_tier_")) return tierId.slice("relay_tier_".length);
  return tierId;
}

export default function GalleryListRow({
  item,
  tierTitleById,
  isFocused,
  isSelected,
  onSelect,
  onFocus,
  onInspect,
  onRestoreToWorkspace,
  creatorId,
  onExportRetryComplete
}: Props) {
  const badge = visibilityBadge[item.visibility] ?? visibilityBadge.visible;
  const [exportRetryBusy, setExportRetryBusy] = useState(false);

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
            className="h-full w-full object-cover object-center"
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
      {item.export_error && creatorId && !item.has_export && !item.media_id.startsWith("post_only_") ? (
        <div className="flex shrink-0 flex-col items-stretch justify-center gap-1 px-1">
          <span className="max-w-[4.5rem] truncate text-[8px] text-amber-200/90" title={item.export_error}>
            Fetch failed
          </span>
          <button
            type="button"
            disabled={exportRetryBusy}
            onClick={async (e) => {
              e.stopPropagation();
              if (!creatorId || exportRetryBusy) return;
              setExportRetryBusy(true);
              try {
                const res = await fetch(`${RELAY_API_BASE}/api/v1/export/media`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ creator_id: creatorId, media_id: item.media_id })
                });
                if (res.ok) onExportRetryComplete?.();
              } finally {
                setExportRetryBusy(false);
              }
            }}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[8px] text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {exportRetryBusy ? "…" : "Retry"}
          </button>
        </div>
      ) : null}
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
        {item.tier_ids.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1" title="Patreon access / tiers">
            {item.tier_ids.map((tid) => (
              <span
                key={tid}
                className="text-[10px] px-1.5 rounded border border-[#6b5a3e] text-[#e8d4b0] bg-[#1a1510]"
              >
                {accessChipLabel(tid, tierTitleById)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1 mt-1">
          {item.tag_ids.map((t) => (
            <span key={t} className="text-[10px] px-1.5 bg-[#2a221c] rounded">
              {t}
            </span>
          ))}
        </div>
        {onRestoreToWorkspace ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRestoreToWorkspace();
            }}
            className="mt-1 text-[10px] text-[#7fd4bc] hover:text-[#b8f5e3] underline"
          >
            To workspace
          </button>
        ) : null}
      </div>
    </div>
  );
}
