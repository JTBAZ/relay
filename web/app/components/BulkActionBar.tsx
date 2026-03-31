"use client";

import { RELAY_API_BASE, type PostVisibility } from "@/lib/relay-api";

type Props = {
  selectedCount: number;
  creatorId: string;
  selectedPostIds: string[];
  onDone: () => void;
};

export default function BulkActionBar({
  selectedCount,
  creatorId,
  selectedPostIds,
  onDone
}: Props) {
  if (selectedCount === 0) return null;

  const setVisibility = async (visibility: PostVisibility) => {
    await fetch(`${RELAY_API_BASE}/api/v1/gallery/visibility`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creator_id: creatorId,
        post_ids: selectedPostIds,
        visibility
      })
    });
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
        Show
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
