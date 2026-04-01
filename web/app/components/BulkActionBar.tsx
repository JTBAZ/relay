"use client";

import {
  RELAY_API_BASE,
  buildGalleryVisibilityBody,
  type GalleryItem,
  type PostVisibility
} from "@/lib/relay-api";

type Props = {
  selectedCount: number;
  creatorId: string;
  selectedItems: GalleryItem[];
  onDone: () => void;
  onVisibilityError?: (message: string) => void;
};

export default function BulkActionBar({
  selectedCount,
  creatorId,
  selectedItems,
  onDone,
  onVisibilityError
}: Props) {
  if (selectedCount === 0) return null;

  const setVisibility = async (visibility: PostVisibility) => {
    const body = buildGalleryVisibilityBody(creatorId, selectedItems, visibility);
    const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/visibility`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      onVisibilityError?.(j?.error?.message ?? res.statusText);
      return;
    }
    onDone();
  };

  return (
    <div className="sticky bottom-0 z-10 bg-[#1a1410]/95 backdrop-blur border-t border-[#3d342b] px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-[#b8a995]">{selectedCount} selected</span>
      <button
        type="button"
        onClick={() => void setVisibility("hidden")}
        className="text-xs px-3 py-1 rounded bg-gray-600/60 hover:bg-gray-600 text-[#ede5da]"
      >
        Hide
      </button>
      <button
        type="button"
        onClick={() => void setVisibility("visible")}
        className="text-xs px-3 py-1 rounded bg-green-700/60 hover:bg-green-700 text-[#ede5da]"
      >
        To workspace
      </button>
      <button
        type="button"
        onClick={() => void setVisibility("flagged")}
        className="text-xs px-3 py-1 rounded bg-amber-700/60 hover:bg-amber-700 text-[#ede5da]"
      >
        Flag
      </button>
    </div>
  );
}
