"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  loadLibraryOnboarding,
  saveLibraryOnboarding,
  type LibraryOnboardingStep
} from "@/lib/library-onboarding";
import {
  RELAY_API_BASE,
  buildGalleryQuery,
  buildGalleryVisibilityBody,
  fetchGalleryPostDetail,
  relayFetch,
  type Collection,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type GalleryPostDetail,
  type GallerySortMode,
  type PostVisibility
} from "@/lib/relay-api";
import GallerySidebar from "./components/GallerySidebar";
import GalleryListRow from "./components/GalleryListRow";
import GalleryGrid from "./components/GalleryGrid";
import CollectionBuilderDrawer from "./components/CollectionBuilderDrawer";
import InspectModal from "./components/InspectModal";
import PostBatchModal from "./components/PostBatchModal";
import BulkActionBar from "./components/BulkActionBar";
import type { MediaTypeValue } from "./components/MediaTypeMultiSelect";

function itemKey(i: GalleryItem): string {
  return `${i.post_id}::${i.media_id}`;
}

const defaultCreatorId =
  process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";

export default function GalleryView() {
  const creatorId = defaultCreatorId;
  const [q, setQ] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);
  const [mediaTypes, setMediaTypes] = useState<MediaTypeValue[]>([]);
  const [publishedAfter, setPublishedAfter] = useState("");
  const [publishedBefore, setPublishedBefore] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<PostVisibility | "all">("visible");
  const [sortMode, setSortMode] = useState<GallerySortMode>("published");
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [facets, setFacets] = useState<FacetsData>({
    tag_ids: [],
    tier_ids: [],
    tiers: []
  });
  const [bulkTags, setBulkTags] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [previewDetail, setPreviewDetail] = useState<GalleryPostDetail | null>(null);
  const [postBatchModal, setPostBatchModal] = useState<{
    items: GalleryItem[];
    startFlatIndex: number;
  } | null>(null);
  const [batchModalDetail, setBatchModalDetail] = useState<GalleryPostDetail | null>(null);
  const [batchModalDetailLoading, setBatchModalDetailLoading] = useState(false);
  const [batchModalCollections, setBatchModalCollections] = useState<Collection[]>([]);

  const [viewMode, setViewMode] = useState<"grid" | "list">(() =>
    typeof window !== "undefined" && window.localStorage.getItem("relay.galleryViewMode") === "list"
      ? "list"
      : "grid"
  );
  const [onboardingStep, setOnboardingStep] = useState<
    LibraryOnboardingStep | "pending"
  >("pending");
  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(false);
  const [collectionsReloadToken, setCollectionsReloadToken] = useState(0);
  const onboardingHydratedRef = useRef(false);
  const autoImageFilterAppliedRef = useRef(false);

  const listRef = useRef<HTMLDivElement>(null);

  const persistViewMode = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("relay.galleryViewMode", mode);
    }
  }, []);

  const tierTitleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of facets.tiers) {
      m[t.tier_id] = t.title;
    }
    return m;
  }, [facets.tiers]);

  const mediaTypeQuery = useMemo(() => {
    // Current backend query accepts a single media_type prefix. Keep using one prefix for server-side
    // filtering and apply any additional selected types client-side until dynamic MIME facets land.
    return mediaTypes.length ? `${mediaTypes[0]}/` : undefined;
  }, [mediaTypes]);

  const filterPayload = useMemo(
    () => ({
      creator_id: creatorId,
      q: q || undefined,
      tag_ids: tagPick.length ? tagPick : undefined,
      tier_ids: tierPick.length ? tierPick : undefined,
      media_type: mediaTypeQuery,
      published_after: publishedAfter || undefined,
      published_before: publishedBefore || undefined,
      visibility: visibilityFilter !== "all" ? visibilityFilter : undefined,
      sort: sortMode
    }),
    [
      creatorId,
      q,
      tagPick,
      tierPick,
      mediaTypeQuery,
      publishedAfter,
      publishedBefore,
      visibilityFilter,
      sortMode
    ]
  );

  const refreshFacets = useCallback(async () => {
    const u = new URLSearchParams();
    u.set("creator_id", creatorId);
    const f = await relayFetch<FacetsData>(
      `/api/v1/gallery/facets?${u}`
    );
    setFacets(f);
  }, [creatorId]);

  const openPreview = useCallback(async (it: GalleryItem) => {
    setPreview(it);
    setPreviewDetail(null);
    try {
      const detail = await fetchGalleryPostDetail(creatorId, it.post_id);
      setPreviewDetail(detail);
    } catch {
      setPreviewDetail(null);
    }
  }, [creatorId]);

  useEffect(() => {
    if (!postBatchModal) {
      setBatchModalDetail(null);
      setBatchModalDetailLoading(false);
      return;
    }
    const postId = postBatchModal.items[0]?.post_id;
    if (!postId) return;
    let cancelled = false;
    setBatchModalDetail(null);
    setBatchModalDetailLoading(true);
    void (async () => {
      try {
        const d = await fetchGalleryPostDetail(creatorId, postId);
        if (!cancelled) setBatchModalDetail(d);
      } catch {
        if (!cancelled) setBatchModalDetail(null);
      } finally {
        if (!cancelled) setBatchModalDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postBatchModal, creatorId]);

  useEffect(() => {
    if (!postBatchModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [postBatchModal]);

  useEffect(() => {
    if (!postBatchModal) {
      setBatchModalCollections([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const u = new URLSearchParams();
        u.set("creator_id", creatorId);
        const res = await relayFetch<{ items: Collection[] }>(
          `/api/v1/gallery/collections?${u}`
        );
        if (!cancelled) setBatchModalCollections(res.items);
      } catch {
        if (!cancelled) setBatchModalCollections([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postBatchModal, creatorId, collectionsReloadToken]);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true);
      setListError(null);
      try {
        const path = buildGalleryQuery({
          ...filterPayload,
          cursor,
          limit: 80
        });
        const data = await relayFetch<GalleryListData>(path);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setNextCursor(data.next_cursor);
        if (!append) {
          setFocusIndex(0);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setListError(msg);
        if (!append) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [filterPayload]
  );

  useEffect(() => {
    void refreshFacets();
  }, [refreshFacets]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void fetchPage(null, false);
  }, [fetchPage]);

  const displayItems = useMemo(
    () => {
      const collectionFiltered = activeCollectionId
        ? items.filter((it) => (it.collection_ids ?? []).includes(activeCollectionId))
        : items;
      if (!mediaTypes.length) return collectionFiltered;
      return collectionFiltered.filter((it) => {
        const topLevelType = it.mime_type?.split("/")[0];
        return topLevelType ? mediaTypes.includes(topLevelType as MediaTypeValue) : false;
      });
    },
    [items, activeCollectionId, mediaTypes]
  );

  useEffect(() => {
    if (onboardingHydratedRef.current) return;
    if (displayItems.length === 0) return;
    onboardingHydratedRef.current = true;
    const stored = loadLibraryOnboarding(creatorId);
    if (!stored) {
      saveLibraryOnboarding({ creator_id: creatorId, step: "welcome" });
      setOnboardingStep("welcome");
    } else {
      setOnboardingStep(stored.step);
    }
  }, [creatorId, displayItems.length]);

  const rowVirtualizer = useVirtualizer({
    count: viewMode === "list" ? displayItems.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: (): number => 88,
    overscan: 6
  });

  const toggleTag = (t: string) => {
    setTagPick((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  };

  const toggleTier = (t: string) => {
    setTierPick((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  };

  const toggleSelect = (it: GalleryItem) => {
    const k = itemKey(it);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const selectedPostIds = useMemo(
    () =>
      Array.from(
        new Set(
          Array.from(selected)
            .map((k) => k.split("::")[0])
            .filter((x): x is string => Boolean(x))
        )
      ),
    [selected]
  );

  const selectedItems = useMemo(
    () => displayItems.filter((it) => selected.has(itemKey(it))),
    [displayItems, selected]
  );

  const refreshList = useCallback(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const handleBatchModalMetadataUpdated = useCallback(async () => {
    await refreshFacets();
    await fetchPage(null, false);
    const pid = postBatchModal?.items[0]?.post_id;
    if (!pid) return;
    try {
      const d = await fetchGalleryPostDetail(creatorId, pid);
      setBatchModalDetail(d);
    } catch {
      setBatchModalDetail(null);
    }
  }, [refreshFacets, fetchPage, postBatchModal, creatorId]);

  const setItemVisibility = useCallback(
    async (items: GalleryItem[], visibility: PostVisibility) => {
      const body = buildGalleryVisibilityBody(creatorId, items, visibility);
      const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/visibility`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? res.statusText);
      }
    },
    [creatorId]
  );

  const applyBulkTags = async () => {
    const add = bulkTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!add.length || selected.size === 0) return;
    await fetch(`${RELAY_API_BASE}/api/v1/gallery/media/bulk-tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creator_id: creatorId,
        post_ids: selectedPostIds,
        add_tag_ids: add,
        remove_tag_ids: []
      })
    });
    setBulkTags("");
    await refreshFacets();
    await fetchPage(null, false);
  };

  const onListKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      if (preview) {
        e.preventDefault();
        setPreview(null);
        setPreviewDetail(null);
        return;
      }
      if (postBatchModal) {
        e.preventDefault();
        setPostBatchModal(null);
        return;
      }
    }
    if (preview) {
      return;
    }
    if (viewMode === "grid") return;
    if (displayItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => Math.min(displayItems.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = displayItems[focusIndex];
      if (it) void openPreview(it);
    }
  };

  useEffect(() => {
    if (viewMode !== "list") return;
    rowVirtualizer.scrollToIndex(focusIndex, { align: "auto" });
  }, [focusIndex, rowVirtualizer, viewMode]);

  const handleTriageComplete = () => {
    void fetchPage(null, false);
    void refreshFacets();
    const stored = loadLibraryOnboarding(creatorId);
    if (stored?.step === "welcome") {
      saveLibraryOnboarding({ creator_id: creatorId, step: "after_clean" });
      setOnboardingStep("after_clean");
      if (!autoImageFilterAppliedRef.current) {
        setMediaTypes(["image"]);
        autoImageFilterAppliedRef.current = true;
      }
    }
  };

  const dismissOnboarding = () => {
    saveLibraryOnboarding({ creator_id: creatorId, step: "completed" });
    setOnboardingStep("completed");
  };

  const triggerHeroAutoClean = () => {
    document.getElementById("sidebar-run-auto-cleaner")?.click();
  };

  const handleBulkActionDone = () => {
    setSelected(new Set());
    void fetchPage(null, false);
  };

  const handleSelectAll = () => {
    setSelected(new Set(displayItems.map(itemKey)));
  };

  const handleDeselectAll = () => {
    setSelected(new Set());
  };

  return (
    <div
      className="min-h-screen bg-[#100c0a] text-[#ede5da]"
      onKeyDown={onListKeyDown}
      tabIndex={0}
    >
      <header className="border-b border-[#3d342b] px-6 py-4 flex flex-wrap gap-4 items-end bg-[#1a1410]/90 backdrop-blur sticky top-0 z-20">
        <div className="bg-[#2a221c]/80 border border-[#4a3f36] rounded px-3 py-2 min-w-56">
          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">
            Creator
          </label>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-[#4a3728] text-[#f0e6d8] text-xs flex items-center justify-center uppercase">
              {creatorId.slice(0, 2)}
            </div>
            <div>
              <p className="text-sm text-[#ede5da]">{creatorId}</p>
              <p className="text-[10px] text-[#8a7f72]">Patreon branding placeholder</p>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">
            After
          </label>
          <input
            type="date"
            value={publishedAfter.slice(0, 10)}
            onChange={(e) => setPublishedAfter(e.target.value ? `${e.target.value}T00:00:00Z` : "")}
            className="bg-[#2a221c] border border-[#4a3f36] px-2 py-1.5 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">
            Before
          </label>
          <input
            type="date"
            value={publishedBefore.slice(0, 10)}
            onChange={(e) =>
              setPublishedBefore(e.target.value ? `${e.target.value}T23:59:59Z` : "")
            }
            className="bg-[#2a221c] border border-[#4a3f36] px-2 py-1.5 rounded text-sm"
          />
        </div>
      </header>

      <div className="grid lg:grid-cols-[220px_1fr] gap-0 min-h-[calc(100vh-88px)]">
        <GallerySidebar
          creatorId={creatorId}
          facets={facets}
          q={q}
          onSetQ={setQ}
          mediaTypes={mediaTypes}
          onSetMediaTypes={setMediaTypes}
          tagPick={tagPick}
          tierPick={tierPick}
          visibilityFilter={visibilityFilter}
          onToggleTag={toggleTag}
          onToggleTier={toggleTier}
          onSetVisibility={setVisibilityFilter}
          bulkTags={bulkTags}
          onBulkTagsChange={setBulkTags}
          onApplyBulkTags={() => void applyBulkTags()}
          selectedCount={selected.size}
          selectedPostIds={selectedPostIds}
          activeCollectionId={activeCollectionId}
          onSelectCollection={setActiveCollectionId}
          onTriageComplete={handleTriageComplete}
          collectionsReloadToken={collectionsReloadToken}
        />

        <main className="flex flex-col min-w-0">
          {onboardingStep === "welcome" ? (
            <section
              className="mx-4 mt-4 mb-2 px-5 py-6 rounded-xl border border-[#4a3f36] bg-[#1a1510] motion-safe:transition-[margin,padding] duration-300"
              aria-labelledby="onb-welcome-title"
            >
              <h2
                id="onb-welcome-title"
                className="font-[family-name:var(--font-display)] text-xl md:text-2xl text-[#f5ebe0] text-center"
              >
                Your Patreon library is here
              </h2>
              <p className="text-sm text-[#b8a995] text-center max-w-xl mx-auto mt-2">
                Everything is in your workspace — including text posts and extras. Run Auto Cleaner once
                to flag clutter (duplicates, covers, text-only rows) so your gallery stays focused on
                real art.
              </p>
              <div className="flex flex-wrap justify-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={triggerHeroAutoClean}
                  className="text-sm px-5 py-2.5 rounded-lg bg-[#c45c2d] text-white hover:bg-[#d66d3d] font-medium"
                >
                  Run Auto Cleaner
                </button>
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  className="text-sm px-4 py-2.5 rounded-lg border border-[#4a3f36] text-[#c9bfb3] hover:border-[#6b5a3e]"
                >
                  Skip tips
                </button>
              </div>
            </section>
          ) : null}

          {onboardingStep === "after_clean" ? (
            <section
              className="mx-4 mt-2 mb-2 px-5 py-6 rounded-xl border border-[#5c4f44] bg-[#1f1915] motion-safe:transition-all duration-300"
              aria-labelledby="onb-collections-title"
            >
              <h2
                id="onb-collections-title"
                className="font-[family-name:var(--font-display)] text-lg md:text-xl text-[#f5ebe0] text-center"
              >
                Your gallery is in — now organize it
              </h2>
              <p className="text-xs text-[#8a7f72] text-center max-w-lg mx-auto mt-2">
                Collections group pieces for fans (favorites, series, themes). Click a slot to build one
                from your workspace without removing anything from the grid.
              </p>
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mt-5">
                {[0, 1, 2].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setCollectionDrawerOpen(true)}
                    className="aspect-square rounded-xl border-2 border-dashed border-[#6b5a3e] bg-[#2a221c]/50 hover:bg-[#322a22] hover:border-[#e8a077] flex items-center justify-center text-4xl text-[#8a7f72] hover:text-[#e8d4b0] motion-safe:transition-colors"
                    aria-label={`Start collection ${slot + 1}`}
                  >
                    +
                  </button>
                ))}
              </div>
              <p className="text-center mt-3">
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  className="text-[11px] text-[#6b645c] hover:text-[#b8a995] underline"
                >
                  Dismiss tips
                </button>
              </p>
            </section>
          ) : null}

          {listError ? (
            <div
              className="mx-4 mt-2 px-3 py-2 rounded border border-[#8b3a1a] bg-[#2a1810] text-sm text-[#f0c4b8]"
              role="alert"
            >
              <strong className="block text-xs uppercase tracking-wide text-[#e8a077] mb-1">
                Gallery request failed
              </strong>
              {listError}
              <p className="mt-2 text-[11px] text-[#b8a995]">
                Check that the relay API is running (e.g.{" "}
                <code className="text-[#ede5da]">{RELAY_API_BASE}</code>) and the Creator id matches
                your scrape (<code className="text-[#ede5da]">dev_creator</code>).
              </p>
            </div>
          ) : null}
          <div className="px-4 py-2 text-xs text-[#8a7f72] flex justify-between items-center border-b border-[#3d342b] flex-wrap gap-2">
            <span>
              {displayItems.length} assets{activeCollectionId ? " (filtered by collection)" : ""}
              {viewMode === "list"
                ? " · ↑↓ focus · Enter preview · Esc close"
                : " · Grid · See All opens post set · Esc closes overlays"}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide text-[#c9bfb3]">View</span>
              <div className="flex rounded border border-[#4a3f36] overflow-hidden">
                <button
                  type="button"
                  onClick={() => persistViewMode("grid")}
                  className={`text-[10px] px-2 py-1 ${
                    viewMode === "grid" ? "bg-[#4a3728] text-[#f0e6d8]" : "text-[#8a7f72]"
                  }`}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => persistViewMode("list")}
                  className={`text-[10px] px-2 py-1 ${
                    viewMode === "list" ? "bg-[#4a3728] text-[#f0e6d8]" : "text-[#8a7f72]"
                  }`}
                >
                  List
                </button>
              </div>
              <label className="flex items-center gap-2 text-[#c9bfb3]">
                <span className="text-[10px] uppercase tracking-wide">Sort</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as GallerySortMode)}
                  className="bg-[#2a221c] border border-[#4a3f36] rounded px-2 py-0.5 text-[#ede5da]"
                >
                  <option value="published">Published</option>
                  <option value="visibility">Visibility</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={selected.size === displayItems.length || displayItems.length === 0}
                  className="text-[#c9bfb3] hover:text-[#ede5da] disabled:opacity-40"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={selected.size === 0}
                  className="text-[#c9bfb3] hover:text-[#ede5da] disabled:opacity-40"
                >
                  Deselect All
                </button>
              </div>
              {nextCursor ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void fetchPage(nextCursor, true)}
                  className="text-[#e8a077] disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </div>
          </div>
          {viewMode === "grid" ? (
            <div
              className="flex-1 overflow-auto outline-none"
              style={{ maxHeight: "calc(100vh - 140px)" }}
            >
              <GalleryGrid
                items={displayItems}
                tierTitleById={tierTitleById}
                selectedKeys={selected}
                focusIndex={focusIndex}
                onToggleSelect={toggleSelect}
                onFocusIndex={setFocusIndex}
                onInspect={(it) => void openPreview(it)}
                onOpenPostBatch={(items, startFlatIndex) =>
                  setPostBatchModal({ items, startFlatIndex })
                }
              />
            </div>
          ) : (
            <div
              ref={listRef}
              className="flex-1 overflow-auto outline-none focus:ring-1 focus:ring-[#c45c2d]"
              style={{ maxHeight: "calc(100vh - 140px)" }}
              tabIndex={-1}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: "relative",
                  width: "100%"
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const it = displayItems[virtualRow.index];
                  if (!it) return null;
                  const k = itemKey(it);
                  return (
                    <div
                      key={k}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <GalleryListRow
                        item={it}
                        tierTitleById={tierTitleById}
                        isFocused={virtualRow.index === focusIndex}
                        isSelected={selected.has(k)}
                        onSelect={() => toggleSelect(it)}
                        onFocus={() => setFocusIndex(virtualRow.index)}
                        onInspect={() => void openPreview(it)}
                        onRestoreToWorkspace={
                          it.visibility !== "visible"
                            ? () => {
                                void (async () => {
                                  try {
                                    await setItemVisibility([it], "visible");
                                    await refreshFacets();
                                    refreshList();
                                  } catch (e) {
                                    setListError(e instanceof Error ? e.message : String(e));
                                  }
                                })();
                              }
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <BulkActionBar
            selectedCount={selected.size}
            creatorId={creatorId}
            selectedItems={selectedItems}
            onDone={handleBulkActionDone}
            onVisibilityError={(msg) => setListError(msg)}
          />
        </main>
      </div>

      <CollectionBuilderDrawer
        creatorId={creatorId}
        open={collectionDrawerOpen}
        onClose={() => setCollectionDrawerOpen(false)}
        facets={facets}
        onComplete={() => {
          setCollectionsReloadToken((n) => n + 1);
          void refreshFacets();
          refreshList();
        }}
      />

      {postBatchModal ? (
        <PostBatchModal
          items={postBatchModal.items}
          startFlatIndex={postBatchModal.startFlatIndex}
          tierTitleById={tierTitleById}
          selectedKeys={selected}
          focusIndex={focusIndex}
          postDetail={batchModalDetail}
          postDetailLoading={batchModalDetailLoading}
          creatorId={creatorId}
          facets={facets}
          collections={batchModalCollections}
          onClose={() => setPostBatchModal(null)}
          onToggleSelect={toggleSelect}
          onInspect={(it) => void openPreview(it)}
          onFocusIndex={setFocusIndex}
          onPostMetadataUpdated={handleBatchModalMetadataUpdated}
        />
      ) : null}

      {preview ? (
        <InspectModal
          preview={preview}
          previewDetail={previewDetail}
          onClose={() => {
            setPreview(null);
            setPreviewDetail(null);
          }}
          onVisibilityApplied={() => {
            void refreshFacets();
            refreshList();
          }}
          onVisibilityError={(msg) => setListError(msg)}
          setItemVisibility={setItemVisibility}
        />
      ) : null}
    </div>
  );
}
