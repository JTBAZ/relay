"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RELAY_API_BASE,
  buildGalleryQuery,
  relayFetch,
  type Collection,
  type CollectionAddPostsResult,
  type FacetsData,
  type GalleryItem,
  type GalleryListData
} from "@/lib/relay-api";
import {
  postFitsCeilingInUi,
  postTierFloorCentsFromFacets,
  tierFacetLabel
} from "@/lib/tier-access";

type Props = {
  creatorId: string;
  open: boolean;
  onClose: () => void;
  facets: FacetsData;
  onComplete: () => void;
};

function dedupePostsByPostId(items: GalleryItem[]): GalleryItem[] {
  const seen = new Set<string>();
  const out: GalleryItem[] = [];
  for (const it of items) {
    if (seen.has(it.post_id)) continue;
    seen.add(it.post_id);
    out.push(it);
  }
  return out;
}

export default function CollectionBuilderDrawer({
  creatorId,
  open,
  onClose,
  facets,
  onComplete
}: Props) {
  const facetsData = facets;
  const [title, setTitle] = useState("");
  const [ceilingTierId, setCeilingTierId] = useState<string>("");
  const [themesInput, setThemesInput] = useState("");
  const [drawerQ, setDrawerQ] = useState("");
  const [drawerTagPick, setDrawerTagPick] = useState<string[]>([]);
  const [drawerTierPick, setDrawerTierPick] = useState<string[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());

  const reset = useCallback(() => {
    setTitle("");
    setCeilingTierId("");
    setThemesInput("");
    setDrawerQ("");
    setDrawerTagPick([]);
    setDrawerTierPick([]);
    setItems([]);
    setSelectedPostIds(new Set());
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const fetchWorkspaceItems = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const path = buildGalleryQuery({
        creator_id: creatorId,
        q: drawerQ || undefined,
        tag_ids: drawerTagPick.length ? drawerTagPick : undefined,
        tier_ids: drawerTierPick.length ? drawerTierPick : undefined,
        visibility: "visible",
        sort: "published",
        limit: 200
      });
      const data = await relayFetch<GalleryListData>(path);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId, open, drawerQ, drawerTagPick, drawerTierPick]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void fetchWorkspaceItems(), 200);
    return () => clearTimeout(t);
  }, [open, fetchWorkspaceItems]);

  const rows = useMemo(() => dedupePostsByPostId(items), [items]);

  const themeTagIds = useMemo(
    () =>
      themesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [themesInput]
  );

  const toggleTag = (tag: string) => {
    setDrawerTagPick((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const togglePost = (postId: string) => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const save = async () => {
    const t = title.trim();
    if (!t) {
      setError("Collection name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        creator_id: creatorId,
        title: t
      };
      if (ceilingTierId) body.access_ceiling_tier_id = ceilingTierId;
      if (themeTagIds.length) body.theme_tag_ids = themeTagIds;

      const col = await relayFetch<Collection>("/api/v1/gallery/collections", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (!col?.collection_id) throw new Error("Missing collection");

      const ids = Array.from(selectedPostIds);
      if (ids.length > 0) {
        const addData = await relayFetch<CollectionAddPostsResult>(
          `/api/v1/gallery/collections/${encodeURIComponent(col.collection_id)}/posts`,
          {
            method: "POST",
            body: JSON.stringify({ post_ids: ids })
          }
        );
        const rejected = addData.rejected_post_ids ?? [];
        if (rejected.length > 0) {
          setError(
            `Some posts were skipped (tier ceiling): ${rejected.map((r) => r.post_id).join(", ")}`
          );
          onComplete();
          return;
        }
      }

      onComplete();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal aria-labelledby="coll-drawer-title">
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[#242424] bg-[#101010] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#242424] px-5 py-4">
          <div>
            <h2 id="coll-drawer-title" className="text-sm font-semibold text-[#f5f5f5]">
              New Collection
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8a8a8a]">
              Curate existing Library Archive work into a profile-ready collection. Nothing is duplicated or removed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#8a8a8a] hover:bg-[#171717] hover:text-[#f5f5f5]"
            aria-label="Close collection builder"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#8a8a8a]">
              Collection name
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f] focus:border-[var(--designer-accent)]"
              placeholder="e.g. Fan favorites"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#8a8a8a]">
              Access ceiling (optional)
            </label>
            <select
              value={ceilingTierId}
              onChange={(e) => setCeilingTierId(e.target.value)}
              className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none focus:border-[var(--designer-accent)]"
            >
              <option value="">No limit</option>
              {facetsData.tiers.map((t) => (
                <option key={t.tier_id} value={t.tier_id}>
                  {tierFacetLabel(t)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#6f6f6f]">
              Only posts at or below this tier can be added. Stricter posts show disabled.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#8a8a8a]">
              Theme tags (comma-separated)
            </label>
            <input
              value={themesInput}
              onChange={(e) => setThemesInput(e.target.value)}
              className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-sm text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f] focus:border-[var(--designer-accent)]"
              placeholder="Love, Exploration"
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-[#242424] bg-[#0c0c0c] p-3">
            <div>
              <p className="text-xs font-semibold text-[#f5f5f5]">Find in Library Archive</p>
              <p className="mt-0.5 text-[11px] text-[#6f6f6f]">Select existing synced posts to include.</p>
            </div>
            <input
              value={drawerQ}
              onChange={(e) => setDrawerQ(e.target.value)}
              placeholder="Search title…"
              className="w-full rounded-xl border border-[#2f2f2f] bg-[#171717] px-3 py-2 text-xs text-[#f5f5f5] outline-none placeholder:text-[#6f6f6f] focus:border-[var(--designer-accent)]"
            />
            <p className="text-[11px] font-medium text-[#8a8a8a]">Filter tags</p>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {facetsData.tag_ids.slice(0, 24).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
                    drawerTagPick.includes(tag)
                      ? "bg-[var(--designer-accent)] text-black"
                      : "bg-[#171717] text-[#b4b4b4] hover:bg-[#242424]"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          ) : null}

          <div className="space-y-1">
            <p className="text-[11px] text-[#8a8a8a]">
              {loading ? "Loading..." : `${rows.length} posts in Library Archive`}
            </p>
            <ul className="max-h-72 overflow-y-auto rounded-2xl border border-[#242424] bg-[#0c0c0c] p-1">
              {rows.map((row) => {
                const fits = postFitsCeilingInUi(facetsData, row, ceilingTierId || null);
                const floor = postTierFloorCentsFromFacets(facetsData, row);
                return (
                  <li key={row.post_id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[#171717]">
                    <input
                      type="checkbox"
                      checked={selectedPostIds.has(row.post_id)}
                      disabled={!fits}
                      onChange={() => togglePost(row.post_id)}
                      className="h-4 w-4 shrink-0 accent-[var(--designer-accent)]"
                    />
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#242424]">
                      {row.has_export && row.mime_type?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${RELAY_API_BASE}${row.content_url_path}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-[#6f6f6f]">
                          {row.mime_type?.split("/")[0] ?? "—"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[#f5f5f5]">{row.title}</p>
                      {!fits ? (
                        <p className="text-[10px] text-[#d4af37]">
                          Requires higher tier than ceiling (floor {floor}¢)
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#242424] px-5 py-4">
          <p className="text-[11px] text-[#6f6f6f]">
            {selectedPostIds.size} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-[#b4b4b4] hover:bg-[#171717]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !title.trim()}
              onClick={() => void save()}
              className="rounded-xl bg-[var(--designer-accent)] px-4 py-1.5 text-[12px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Collection"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
