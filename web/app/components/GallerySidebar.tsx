"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  RELAY_API_BASE,
  relayFetch,
  type FacetsData,
  type PostVisibility,
  type TriageResult
} from "@/lib/relay-api";
import TriageDialog, { type TriageCategory } from "./TriageDialog";
import CollectionsPanel from "./CollectionsPanel";
import Toast from "./Toast";
import MediaTypeMultiSelect, { type MediaTypeValue } from "./MediaTypeMultiSelect";

type Props = {
  creatorId: string;
  facets: FacetsData;
  q: string;
  onSetQ: (v: string) => void;
  mediaTypes: MediaTypeValue[];
  onSetMediaTypes: (v: MediaTypeValue[]) => void;
  tagPick: string[];
  tierPick: string[];
  visibilityFilter: PostVisibility | "all";
  onToggleTag: (t: string) => void;
  onToggleTier: (t: string) => void;
  onSetVisibility: (v: PostVisibility | "all") => void;
  bulkTags: string;
  onBulkTagsChange: (v: string) => void;
  onApplyBulkTags: () => void;
  selectedCount: number;
  selectedPostIds: string[];
  activeCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onTriageComplete: () => void;
  collectionsReloadToken?: number;
};

const visOptions: { value: PostVisibility | "all"; label: string }[] = [
  { value: "visible", label: "Workspace" },
  { value: "flagged", label: "Flagged" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" }
];

export default function GallerySidebar({
  creatorId,
  facets,
  q,
  onSetQ,
  mediaTypes,
  onSetMediaTypes,
  tagPick,
  tierPick,
  visibilityFilter,
  onToggleTag,
  onToggleTier,
  onSetVisibility,
  bulkTags,
  onBulkTagsChange,
  onApplyBulkTags,
  selectedCount,
  selectedPostIds,
  activeCollectionId,
  onSelectCollection,
  onTriageComplete,
  collectionsReloadToken = 0
}: Props) {
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [triageApplying, setTriageApplying] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [visibleTagCount, setVisibleTagCount] = useState(20);

  const filteredTags = useMemo(() => {
    const search = tagSearch.trim().toLowerCase();
    if (!search) return facets.tag_ids;
    return facets.tag_ids.filter((tag) => tag.toLowerCase().includes(search));
  }, [facets.tag_ids, tagSearch]);

  const displayedTags = filteredTags.slice(0, visibleTagCount);
  const remainingTagCount = Math.max(0, filteredTags.length - displayedTags.length);

  const runAnalyze = async () => {
    setTriageLoading(true);
    setTriageError(null);
    try {
      const result = await relayFetch<TriageResult>("/api/v1/gallery/triage/analyze", {
        method: "POST",
        body: JSON.stringify({ creator_id: creatorId })
      });
      setTriageResult(result);
    } catch (err) {
      setTriageError(err instanceof Error ? err.message : "Triage failed");
    } finally {
      setTriageLoading(false);
    }
  };

  const confirmAutoFlag = async (categories: TriageCategory[]) => {
    if (!triageResult) return;
    setTriageApplying(true);
    setTriageError(null);
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/triage/auto-flag`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId, categories })
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setTriageError(j?.error?.message ?? res.statusText);
        return;
      }

      const parts: string[] = [];
      if (categories.includes("text_only") && triageResult.text_only_post_ids.length > 0) {
        parts.push(`${triageResult.text_only_post_ids.length} text-only posts flagged`);
      }
      if (categories.includes("duplicates")) {
        const dupCount = triageResult.duplicate_groups.reduce((n, g) => n + g.duplicate_post_ids.length, 0);
        if (dupCount > 0) parts.push(`${dupCount} duplicates flagged`);
      }
      if (categories.includes("small_media") && triageResult.small_media_ids.length > 0) {
        parts.push(`${triageResult.small_media_ids.length} small media flagged`);
      }
      if (categories.includes("cover_images") && triageResult.cover_media_ids.length > 0) {
        parts.push(`${triageResult.cover_media_ids.length} cover images flagged`);
      }

      setTriageResult(null);
      setToastMessage(parts.length > 0 ? parts.join(", ") : "No changes applied");
      onTriageComplete();
    } finally {
      setTriageApplying(false);
    }
  };

  return (
    <>
      <aside className="border-r border-[#3d342b] p-4 space-y-6 bg-[#161210] overflow-y-auto">
        <section className="space-y-2">
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
            1) Auto Cleaner
          </h3>
          <p className="text-[10px] text-[#8a7f72]">
            Scan for text-only posts, duplicates, blank thumbnails, and cover images to clean up your library.
          </p>
          {triageError ? (
            <p className="text-xs text-red-400">{triageError}</p>
          ) : null}
          <button
            id="sidebar-run-auto-cleaner"
            type="button"
            onClick={() => void runAnalyze()}
            disabled={triageLoading}
            className="w-full text-xs py-1.5 bg-[#4a3728] hover:bg-[#5c4a38] rounded disabled:opacity-50"
          >
            {triageLoading ? "Scanning…" : "Run Auto Cleaner"}
          </button>
        </section>

        <section className="space-y-2">
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8] mb-2">
            2) Find Assets
          </h3>
          <input
            value={q}
            onChange={(e) => onSetQ(e.target.value)}
            placeholder="Search title, tags, description, themes…"
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs"
          />
          <p className="text-[10px] text-[#8a7f72]">Media types</p>
          <MediaTypeMultiSelect selected={mediaTypes} onChange={onSetMediaTypes} />
          <input
            value={tagSearch}
            onChange={(e) => {
              setTagSearch(e.target.value);
              setVisibleTagCount(20);
            }}
            placeholder="Search tags..."
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {displayedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  tagPick.includes(tag)
                    ? "bg-[#c45c2d] border-[#e8a077] text-white"
                    : "border-[#5c4f44] text-[#c9bfb3]"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {remainingTagCount > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleTagCount((count) => count + 20)}
              className="text-[10px] text-[#e8a077] hover:text-[#f0c4b8]"
            >
              Show {Math.min(remainingTagCount, 20)} more tags
            </button>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
            3) Access Review
          </h3>
          <p className="text-[10px] text-[#8a7f72]">
            Workspace is the default working set (visible items). Flagged collects auto-clean and manual flags for review.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSetVisibility(opt.value)}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  visibilityFilter === opt.value
                    ? "bg-[#c45c2d] border-[#e8a077] text-white"
                    : "border-[#5c4f44] text-[#c9bfb3]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {facets.tiers.length === 0 ? (
            <p className="text-xs text-[#8a7f72]">No tiers found for current creator.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {facets.tiers.map((tier) => (
                <button
                  key={tier.tier_id}
                  type="button"
                  onClick={() => onToggleTier(tier.tier_id)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    tierPick.includes(tier.tier_id)
                      ? "bg-[#2d6a5c] border-[#7fd4bc] text-white"
                      : "border-[#5c4f44] text-[#c9bfb3]"
                  }`}
                >
                  {tier.title}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
            4) Collections
          </h3>
          <CollectionsPanel
            creatorId={creatorId}
            activeCollectionId={activeCollectionId}
            onSelectCollection={onSelectCollection}
            selectedPostIds={selectedPostIds}
            onCollectionChange={onTriageComplete}
            reloadToken={collectionsReloadToken}
          />
        </section>

        <section className="space-y-2 rounded-lg border border-[#3d342b] bg-[#1a1410]/60 p-3">
          <h3 className="font-[family-name:var(--font-display)] text-sm text-[#f0e6d8]">
            Visitor page
          </h3>
          <p className="text-[10px] leading-relaxed text-[#8a7f72]">
            Collections and tags power search here and can feed your published layout. What patrons see
            still respects per-file visibility from this Library.
          </p>
          <Link
            href="/designer"
            className="inline-flex items-center rounded-md border border-[#5c4f44] bg-[#2a221c] px-3 py-1.5 text-xs font-medium text-[#e8a077] hover:border-[#e8a077] hover:text-[#f0c4b8] motion-safe:transition-colors"
          >
            Open Designer
          </Link>
        </section>

        <section className="space-y-2">
          <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
            5) Tag Selected
          </h3>
          <p className="text-[10px] text-[#8a7f72]">
            Add comma-separated tags to all selected posts.
          </p>
          <input
            value={bulkTags}
            onChange={(e) => onBulkTagsChange(e.target.value)}
            placeholder="tag_a, tag_b"
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs"
          />
          <button
            type="button"
            onClick={onApplyBulkTags}
            disabled={selectedCount === 0 || !bulkTags.trim()}
            className="w-full text-xs py-1.5 bg-[#8b3a1a] rounded disabled:opacity-50"
          >
            Apply Tags to {selectedCount} Selected
          </button>
        </section>
      </aside>

      {triageResult ? (
        <TriageDialog
          result={triageResult}
          onConfirm={(categories) => void confirmAutoFlag(categories)}
          onCancel={() => setTriageResult(null)}
          applying={triageApplying}
        />
      ) : null}

      {toastMessage ? (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}
    </>
  );
}
