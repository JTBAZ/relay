"use client";

import { useState } from "react";
import type { TriageResult } from "@/lib/relay-api";

type TriageCategory = "text_only" | "duplicates" | "small_media" | "cover_images";

type Props = {
  result: TriageResult;
  onConfirm: (categories: TriageCategory[]) => void;
  onCancel: () => void;
  applying: boolean;
};

export type { TriageCategory };

export default function TriageDialog({ result, onConfirm, onCancel, applying }: Props) {
  const [selected, setSelected] = useState<Set<TriageCategory>>(
    () => new Set<TriageCategory>(["text_only", "duplicates", "small_media", "cover_images"])
  );

  const toggle = (cat: TriageCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const dupCount = result.duplicate_groups.reduce((n, g) => n + g.duplicate_post_ids.length, 0);

  const categories: { id: TriageCategory; label: string; detail: string; count: number }[] = [
    {
      id: "text_only",
      label: "Text-only posts",
      detail: "Posts with no media attachments",
      count: result.text_only_post_ids.length
    },
    {
      id: "duplicates",
      label: "Duplicate posts",
      detail: `${result.duplicate_groups.length} groups, ${dupCount} duplicates`,
      count: dupCount
    },
    {
      id: "small_media",
      label: "Small/blank media",
      detail: "Exported media under 5KB (likely blank thumbnails)",
      count: result.small_media_ids.length
    },
    {
      id: "cover_images",
      label: "Cover images",
      detail: "Post cover/thumbnail images (not primary content)",
      count: (result.cover_media_ids ?? []).length
    }
  ];

  const selectedCount = categories
    .filter((c) => selected.has(c.id))
    .reduce((n, c) => n + c.count, 0);

  const nothingFound = result.total_review_items === 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      role="dialog"
      aria-modal
      onClick={onCancel}
    >
      <div
        className="bg-[#1a1410] border border-[#3d342b] rounded-lg p-6 max-w-md w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
          Auto-Triage Scan
        </h3>

        {nothingFound ? (
          <div className="py-4 text-center">
            <p className="text-sm text-[#d8cebf]">Your library looks clean.</p>
            <p className="text-xs text-[#8a7f72] mt-1">No text-only posts, duplicates, or blank thumbnails found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-[#8a7f72]">Select what to send to Review:</p>
            {categories.map((cat) => (
              <label
                key={cat.id}
                className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                  selected.has(cat.id) && cat.count > 0
                    ? "border-[#e8a077] bg-[#2a1810]"
                    : "border-[#3d342b] hover:border-[#5c4f44]"
                } ${cat.count === 0 ? "opacity-40 cursor-default" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(cat.id) && cat.count > 0}
                  onChange={() => toggle(cat.id)}
                  disabled={cat.count === 0}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#f0e6d8]">{cat.label}</span>
                    <span className="text-xs font-medium text-[#e8a077]">{cat.count}</span>
                  </div>
                  <p className="text-[10px] text-[#8a7f72] mt-0.5">{cat.detail}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        <hr className="border-[#3d342b]" />

        {!nothingFound ? (
          <p className="text-xs text-[#8a7f72]">
            {selectedCount} items will move to Review. They stay out of the main Workspace list until you open Review and restore or hide them.
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded border border-[#4a3f36] text-[#c9bfb3] hover:bg-[#2a221c]"
            disabled={applying}
          >
            {nothingFound ? "Close" : "Cancel"}
          </button>
          {!nothingFound ? (
            <button
              type="button"
              onClick={() => onConfirm(Array.from(selected))}
              disabled={applying || selectedCount === 0}
              className="text-xs px-4 py-2 rounded bg-[#8b3a1a] text-white hover:bg-[#a5481e] disabled:opacity-50"
            >
              {applying ? "Applying…" : `Send ${selectedCount} to Review`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
