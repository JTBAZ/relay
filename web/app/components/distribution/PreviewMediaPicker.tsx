"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import {
  fetchCreatorGalleryItems,
  fetchRelayLibraryStaging,
  type GalleryItem
} from "@/lib/relay-api";
import {
  mergePreviewMediaPickerOptions,
  type PreviewMediaPickerOption
} from "@/lib/preview-media-picker-options";

type Props = {
  creatorId: string;
  postMedia?: GalleryItem[];
  selectedMediaId: string;
  onSelect: (mediaId: string) => void;
};

const SOURCE_LABEL: Record<PreviewMediaPickerOption["source"], string> = {
  post: "Post",
  staging: "Bin",
  library: "Library"
};

export function PreviewMediaPicker({ creatorId, postMedia, selectedMediaId, onSelect }: Props) {
  const [stagingItems, setStagingItems] = useState<Awaited<ReturnType<typeof fetchRelayLibraryStaging>>["items"]>([]);
  const [libraryItems, setLibraryItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualId, setShowManualId] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      const cid = creatorId.trim();
      if (!cid) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [staging, gallery] = await Promise.all([
          fetchRelayLibraryStaging(cid),
          fetchCreatorGalleryItems({
            creator_id: cid,
            media_type: "image",
            limit: 24,
            sort: "published"
          })
        ]);
        setStagingItems(staging.items);
        setLibraryItems(gallery.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [creatorId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const options = useMemo(
    () =>
      mergePreviewMediaPickerOptions({
        postMedia,
        stagingItems,
        libraryItems
      }),
    [postMedia, stagingItems, libraryItems]
  );

  const selectedOption = options.find((option) => option.mediaId === selectedMediaId.trim());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wide">
          Preview image
        </p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1 text-[10px] text-[#6b7280] hover:text-[#d1d5db] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[10px] text-[#6b7280]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading library images…
        </div>
      ) : options.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-6 text-center"
          style={{ borderColor: "#2a2a2a" }}
        >
          <ImageIcon className="h-5 w-5 text-[#6b7280]" aria-hidden />
          <p className="max-w-xs px-3 text-[10px] text-[#6b7280]">
            Upload a preview to your Import bay or library, then refresh. You can also paste a media ID
            below.
          </p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {options.map((option) => {
            const selected = option.mediaId === selectedMediaId.trim();
            return (
              <button
                key={option.mediaId}
                type="button"
                onClick={() => onSelect(option.mediaId)}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-colors"
                style={{
                  borderColor: selected ? "#00aa6f" : "#2a2a2a",
                  boxShadow: selected ? "0 0 0 2px rgba(0,170,111,0.25)" : undefined
                }}
                aria-pressed={selected}
                title={option.mediaId}
              >
                {option.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Relay API thumb URLs
                  <img src={option.thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#1a1a1a] text-[9px] text-[#6b7280]">
                    image
                  </div>
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                  {SOURCE_LABEL[option.source]}
                </span>
                {selected ? (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#00aa6f] text-black">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {selectedMediaId.trim() ? (
        <p className="truncate font-mono text-[9px] text-[#6b7280]" title={selectedMediaId}>
          {selectedOption ? `Selected: ${selectedMediaId}` : `ID: ${selectedMediaId}`}
        </p>
      ) : (
        <p className="text-[10px] text-amber-300/90">Pick a preview image for platforms using Preview.</p>
      )}

      <button
        type="button"
        onClick={() => setShowManualId((prev) => !prev)}
        className="text-[10px] text-[#6b7280] underline-offset-2 hover:text-[#9ca3af] hover:underline"
      >
        {showManualId ? "Hide manual ID" : "Paste media ID manually"}
      </button>

      {showManualId ? (
        <input
          id="preview-media-id"
          type="text"
          value={selectedMediaId}
          onChange={(e) => onSelect(e.target.value)}
          placeholder="rel_media_…"
          className="w-full rounded-xl border px-3 py-2 text-xs text-[#f9fafb] placeholder:text-[#6b7280] outline-none focus:border-[#00aa6f]"
          style={{ borderColor: "#2a2a2a", background: "#111" }}
        />
      ) : null}
    </div>
  );
}
