"use client";

import { useState } from "react";

type Props = {
  initial?: { title: string; description?: string };
  onSave: (title: string, description: string) => void;
  onCancel: () => void;
};

export default function CollectionEditor({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      role="dialog"
      aria-modal
      onClick={onCancel}
    >
      <div
        className="bg-[#1a1410] border border-[#3d342b] rounded-lg p-6 max-w-sm w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
          {initial ? "Edit Collection" : "New Collection"}
        </h3>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-3 py-1.5 rounded text-sm text-[#ede5da]"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Description</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-3 py-1.5 rounded text-sm text-[#ede5da] resize-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded border border-[#4a3f36] text-[#c9bfb3]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (title.trim()) onSave(title.trim(), desc.trim());
            }}
            disabled={!title.trim()}
            className="text-xs px-4 py-2 rounded bg-[#8b3a1a] text-white disabled:opacity-50"
          >
            {initial ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
