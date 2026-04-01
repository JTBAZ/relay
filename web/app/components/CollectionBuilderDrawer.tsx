"use client";

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

      const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as { data?: Collection; error?: { message?: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? res.statusText);
      }
      const col = json.data;
      if (!col?.collection_id) throw new Error("Missing collection");

      const ids = Array.from(selectedPostIds);
      if (ids.length > 0) {
        const addRes = await fetch(
          `${RELAY_API_BASE}/api/v1/gallery/collections/${col.collection_id}/posts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ post_ids: ids })
          }
        );
        const addJson = (await addRes.json()) as {
          data?: CollectionAddPostsResult;
          error?: { message?: string };
        };
        if (!addRes.ok) {
          throw new Error(addJson.error?.message ?? addRes.statusText);
        }
        const rejected = addJson.data?.rejected_post_ids ?? [];
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
        className="absolute inset-0 bg-black/60 border-0 cursor-default"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg h-full bg-[#161210] border-l border-[#3d342b] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[#3d342b] flex items-start justify-between gap-2">
          <div>
            <h2 id="coll-drawer-title" className="font-[family-name:var(--font-display)] text-lg text-[#f5ebe0]">
              Start a collection
            </h2>
            <p className="text-[11px] text-[#8a7f72] mt-1">
              Group pieces for your public gallery. Search your workspace below — nothing is removed from it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8a7f72] hover:text-[#ede5da] text-sm px-2"
          >
            Esc
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#8a7f72] mb-1">
              Collection name
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#2a221c] border border-[#4a3f36] rounded px-3 py-2 text-sm text-[#ede5da]"
              placeholder="e.g. Fan favorites"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#8a7f72] mb-1">
              Access ceiling (optional)
            </label>
            <select
              value={ceilingTierId}
              onChange={(e) => setCeilingTierId(e.target.value)}
              className="w-full bg-[#2a221c] border border-[#4a3f36] rounded px-3 py-2 text-sm text-[#ede5da]"
            >
              <option value="">No limit</option>
              {facetsData.tiers.map((t) => (
                <option key={t.tier_id} value={t.tier_id}>
                  {tierFacetLabel(t)}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[#6b645c] mt-1">
              Only posts at or below this tier can be added. Stricter posts show disabled.
            </p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[#8a7f72] mb-1">
              Theme tags (comma-separated)
            </label>
            <input
              value={themesInput}
              onChange={(e) => setThemesInput(e.target.value)}
              className="w-full bg-[#2a221c] border border-[#4a3f36] rounded px-3 py-2 text-sm text-[#ede5da]"
              placeholder="Love, Exploration"
            />
          </div>

          <div className="rounded border border-[#4a3f36] p-3 space-y-2 bg-[#1a1510]">
            <p className="text-[10px] uppercase tracking-wider text-[#e8a077]">Find in workspace</p>
            <input
              value={drawerQ}
              onChange={(e) => setDrawerQ(e.target.value)}
              placeholder="Search title…"
              className="w-full bg-[#2a221c] border border-[#4a3f36] rounded px-2 py-1.5 text-xs text-[#ede5da]"
            />
            <p className="text-[10px] text-[#8a7f72]">Filter tags</p>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {facetsData.tag_ids.slice(0, 24).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    drawerTagPick.includes(tag)
                      ? "bg-[#c45c2d]/40 border border-[#e8a077] text-[#f0e6d8]"
                      : "bg-[#2a221c] text-[#b8a995]"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <div className="space-y-1">
            <p className="text-[10px] text-[#8a7f72]">
              {loading ? "Loading…" : `${rows.length} posts in workspace`}
            </p>
            <ul className="max-h-64 overflow-y-auto border border-[#3d342b] rounded divide-y divide-[#2a221c]">
              {rows.map((row) => {
                const fits = postFitsCeilingInUi(facetsData, row, ceilingTierId || null);
                const floor = postTierFloorCentsFromFacets(facetsData, row);
                return (
                  <li key={row.post_id} className="flex items-center gap-2 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedPostIds.has(row.post_id)}
                      disabled={!fits}
                      onChange={() => togglePost(row.post_id)}
                      className="shrink-0"
                    />
                    <div className="w-10 h-10 rounded overflow-hidden bg-[#2a221c] shrink-0">
                      {row.has_export && row.mime_type?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${RELAY_API_BASE}${row.content_url_path}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-[#6b645c]">
                          {row.mime_type?.split("/")[0] ?? "—"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#ede5da] truncate">{row.title}</p>
                      {!fits ? (
                        <p className="text-[10px] text-amber-600/90">
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

        <div className="p-4 border-t border-[#3d342b] flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-4 py-2 rounded border border-[#4a3f36] text-[#c9bfb3]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !title.trim()}
            onClick={() => void save()}
            className="text-xs px-4 py-2 rounded bg-[#8b3a1a] text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create & add selected"}
          </button>
        </div>
      </div>
    </div>
  );
}
