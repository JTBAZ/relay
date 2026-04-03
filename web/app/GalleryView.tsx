"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChevronDown, Grid3X3, LayoutGrid, List } from "lucide-react";
import { galleryItemKey, groupGalleryItemsByPost } from "@/lib/gallery-group";
import {
  RELAY_API_BASE,
  buildGalleryQuery,
  fetchGalleryPostDetail,
  fetchPatreonSyncState,
  formatSyncHealthBanner,
  relayFetch,
  syncStateNeedsAttention,
  type Collection,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type GalleryPostDetail,
  type PatreonSyncStateData
} from "@/lib/relay-api";
import GallerySidebar from "./components/GallerySidebar";
import GalleryGrid from "./components/GalleryGrid";
import BulkActionBar from "./components/BulkActionBar";
import PostBatchModal from "./components/PostBatchModal";
import LibraryTopBar from "./components/LibraryTopBar";
import PatreonSyncMenu from "./components/PatreonSyncMenu";
import GalleryStatsDrawer from "./components/GalleryStatsDrawer";
import type { MediaTypeValue } from "./components/MediaTypeMultiSelect";
import { freePublicTierIdsFromFacets } from "@/lib/tier-access";
import { readGalleryVideoLoop, writeGalleryVideoLoop } from "@/lib/gallery-video-loop";

const defaultCreatorId = process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";
const patreonCampaignIdEnv = process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() || undefined;

type ViewMode = "dense" | "normal" | "list";
type VisibilityState = { hidden: boolean; mature: boolean };

export default function GalleryView() {
  const creatorId = defaultCreatorId;
  const [q, setQ] = useState("");
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);
  const [mediaTypes, setMediaTypes] = useState<MediaTypeValue[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<VisibilityState>({
    hidden: true,
    mature: true
  });
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [facets, setFacets] = useState<FacetsData>({
    tag_ids: [],
    tier_ids: [],
    tiers: [],
    tag_counts: {},
    export_total_bytes: 0,
    export_media_count: 0
  });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsReloadToken, setCollectionsReloadToken] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [, setFocusIndex] = useState(-1);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "dense";
    const v = window.localStorage.getItem("relay.galleryViewMode");
    return v === "list" || v === "normal" ? v : "dense";
  });
  const [statsOpen, setStatsOpen] = useState(false);
  const [showShadowCovers, setShowShadowCovers] = useState(false);
  /** When true, request `text_only_posts=include` so polls / text-only posts appear in the list. */
  const [showTextOnlyPosts, setShowTextOnlyPosts] = useState(false);
  const [videoLoop, setVideoLoop] = useState(() => {
    if (typeof window === "undefined") return false;
    return readGalleryVideoLoop();
  });
  const statsButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [librarySyncPhase, setLibrarySyncPhase] = useState<"idle" | "syncing" | "error">(
    "idle"
  );
  const [syncHealth, setSyncHealth] = useState<PatreonSyncStateData | null>(null);
  const prevLibrarySyncPhase = useRef(librarySyncPhase);

  const refreshSyncHealth = useCallback(async () => {
    try {
      const s = await fetchPatreonSyncState(creatorId, {
        campaignId: patreonCampaignIdEnv,
        probeUpstream: false
      });
      setSyncHealth(s);
    } catch {
      setSyncHealth(null);
    }
  }, [creatorId]);

  useEffect(() => {
    void refreshSyncHealth();
  }, [refreshSyncHealth]);

  useEffect(() => {
    if (prevLibrarySyncPhase.current === "syncing" && librarySyncPhase !== "syncing") {
      void refreshSyncHealth();
    }
    prevLibrarySyncPhase.current = librarySyncPhase;
  }, [librarySyncPhase, refreshSyncHealth]);

  const tierTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tier of facets.tiers) map[tier.tier_id] = tier.title;
    return map;
  }, [facets.tiers]);

  const freePublicTierIds = useMemo(() => freePublicTierIdsFromFacets(facets.tiers), [facets.tiers]);

  const mediaTypeQuery = useMemo(
    () => (mediaTypes.length > 0 ? `${mediaTypes[0]}/` : undefined),
    [mediaTypes]
  );

  const fetchCollections = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("creator_id", creatorId);
    const res = await relayFetch<{ items: Collection[] }>(
      `/api/v1/gallery/collections?${params.toString()}`
    );
    setCollections(res.items);
  }, [creatorId]);

  const fetchFacets = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("creator_id", creatorId);
    const res = await relayFetch<FacetsData>(`/api/v1/gallery/facets?${params.toString()}`);
    setFacets({
      ...res,
      export_total_bytes: res.export_total_bytes ?? 0,
      export_media_count: res.export_media_count ?? 0
    });
  }, [creatorId]);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true);
      setListError(null);
      try {
        const wantsSearchFocus = Boolean(q.trim());
        const path = buildGalleryQuery({
          creator_id: creatorId,
          q: q || undefined,
          tag_ids: tagPick.length ? tagPick : undefined,
          tier_ids: tierPick.length ? tierPick : undefined,
          media_type: mediaTypeQuery,
          display: wantsSearchFocus ? "post_primary" : "all_media",
          text_only_posts: showTextOnlyPosts ? "include" : undefined,
          cursor,
          limit: 120
        });
        const data = await relayFetch<GalleryListData>(path);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setNextCursor(data.next_cursor);
        if (!append) setFocusIndex(-1);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setListError(msg);
        if (!append) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [creatorId, mediaTypeQuery, q, showTextOnlyPosts, tagPick, tierPick]
  );

  useEffect(() => {
    void fetchFacets();
  }, [fetchFacets]);

  useEffect(() => {
    void fetchCollections();
  }, [fetchCollections, collectionsReloadToken]);

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const displayItems = useMemo(() => {
    let list = activeCollectionId
      ? items.filter((item) => (item.collection_ids ?? []).includes(activeCollectionId))
      : items;
    if (mediaTypes.length) {
      list = list.filter((item) => {
        const top = item.mime_type?.split("/")[0];
        return top ? mediaTypes.includes(top as MediaTypeValue) : false;
      });
    }
    return list.filter((item) => {
      if (item.visibility === "hidden" && !visibility.hidden) return false;
      if (item.visibility === "review" && !visibility.mature) return false;
      if (item.shadow_cover && !showShadowCovers) return false;
      return true;
    });
  }, [
    activeCollectionId,
    items,
    mediaTypes,
    showShadowCovers,
    visibility.hidden,
    visibility.mature
  ]);

  const postGroups = useMemo(() => groupGalleryItemsByPost(displayItems), [displayItems]);

  const selectedItems = useMemo(() => items.filter((item) => selectedKeys.has(galleryItemKey(item))), [items, selectedKeys]);

  const selectedPostIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedItems
            .map((item) => item.post_id)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [selectedItems]
  );

  const [postBatchOpen, setPostBatchOpen] = useState(false);
  const [postBatchPostId, setPostBatchPostId] = useState<string | null>(null);
  const [postDetail, setPostDetail] = useState<GalleryPostDetail | null>(null);
  const [postDetailLoading, setPostDetailLoading] = useState(false);

  const postBatchGroupIndex = useMemo(
    () => (postBatchPostId ? postGroups.findIndex((g) => g.post_id === postBatchPostId) : -1),
    [postGroups, postBatchPostId]
  );

  const postBatchItems = useMemo(() => {
    if (!postBatchPostId) return [];
    if (postDetail?.post_id === postBatchPostId && postDetail.media.length > 0) {
      return postDetail.media;
    }
    const g = postGroups.find((x) => x.post_id === postBatchPostId);
    return g?.items ?? [];
  }, [postBatchPostId, postDetail, postGroups]);

  const closePostBatch = useCallback(() => {
    setPostBatchOpen(false);
    setPostBatchPostId(null);
    setPostDetail(null);
    setPostDetailLoading(false);
  }, []);

  /** Replace selection with a single asset (carousel / inspect / fullscreen). */
  const isolateSelectionToItem = useCallback((item: GalleryItem) => {
    setSelectedKeys(new Set([galleryItemKey(item)]));
    setFocusIndex(-1);
    queueMicrotask(() => {
      if (typeof document === "undefined") return;
      const ae = document.activeElement;
      if (ae instanceof HTMLElement && ae.closest("[data-gallery-tile]")) {
        ae.blur();
      }
    });
  }, []);

  /** Post batch modal: one asset at a time; click again to clear. */
  const selectAssetInPostModal = useCallback((item: GalleryItem) => {
    const k = galleryItemKey(item);
    setSelectedKeys((prev) => {
      if (prev.size === 1 && prev.has(k)) {
        return new Set();
      }
      return new Set([k]);
    });
    setFocusIndex(-1);
  }, []);

  const refreshList = useCallback(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const afterPatreonScrape = useCallback(async () => {
    await fetchFacets();
    refreshList();
  }, [fetchFacets, refreshList]);

  const persistViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.localStorage.setItem("relay.galleryViewMode", mode);
  };

  const toggleTag = (tag: string) => {
    setTagPick((prev) => (prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]));
  };

  const toggleTier = (tierId: string) => {
    setTierPick((prev) => (prev.includes(tierId) ? prev.filter((value) => value !== tierId) : [...prev, tierId]));
  };

  const toggleFreePublicTierGroup = useCallback(() => {
    if (freePublicTierIds.length === 0) return;
    setTierPick((prev) => {
      const allOn = freePublicTierIds.every((id) => prev.includes(id));
      if (allOn) return prev.filter((id) => !freePublicTierIds.includes(id));
      const next = new Set(prev);
      for (const id of freePublicTierIds) next.add(id);
      return Array.from(next);
    });
  }, [freePublicTierIds]);

  const openInspectPost = useCallback(async () => {
    if (selectedItems.length === 0) return;
    const first = selectedItems[0]!;
    const g = postGroups.find((x) => x.post_id === first.post_id);
    if (!g?.items.length) {
      setListError("That post isn’t in the current view.");
      return;
    }
    const keySet = new Set(selectedItems.map(galleryItemKey));
    const keep =
      g.items.find((it) => keySet.has(galleryItemKey(it))) ?? g.items[0]!;
    setSelectedKeys(new Set([galleryItemKey(keep)]));
    setPostBatchPostId(first.post_id);
    setPostBatchOpen(true);
    setPostDetail(null);
    setPostDetailLoading(true);
    try {
      const detail = await fetchGalleryPostDetail(creatorId, first.post_id);
      setPostDetail(detail);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setListError(msg);
      closePostBatch();
    } finally {
      setPostDetailLoading(false);
    }
  }, [selectedItems, postGroups, creatorId, closePostBatch]);

  const toggleSelectGroup = useCallback((groupItems: GalleryItem[]) => {
    const keys = groupItems.map(galleryItemKey);
    let clearedFocus = false;
    setSelectedKeys((prev) => {
      const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        for (const k of keys) next.delete(k);
        clearedFocus = true;
      } else {
        for (const k of keys) next.add(k);
      }
      return next;
    });
    if (clearedFocus) {
      // After deselect, avoid the grid tile stealing focus; blur after the click completes.
      queueMicrotask(() => {
        setFocusIndex(-1);
        if (typeof document !== "undefined") {
          const ae = document.activeElement;
          if (ae instanceof HTMLElement && ae.closest("[data-gallery-tile]")) {
            ae.blur();
          }
        }
      });
    }
  }, []);

  /**
   * Clear selection when the pointer goes down outside tiles (grid gaps/padding, toolbar, etc.).
   * Uses composedPath so we don't rely on a stretched hit-box on each cell (keeps tiles uniform).
   */
  const onMainPointerDownCapture = useCallback((e: PointerEvent<HTMLElement>) => {
    const path = e.nativeEvent.composedPath();
    for (const n of path) {
      if (!(n instanceof Element)) continue;
      if (n.hasAttribute("data-gallery-tile")) return;
      if (n.hasAttribute("data-bulk-action-bar")) return;
      if (n.getAttribute("role") === "dialog") return;
      if (n.hasAttribute("data-gallery-stats-drawer")) return;
    }
    let cleared = false;
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      cleared = true;
      return new Set();
    });
    if (cleared) {
      setFocusIndex(-1);
      if (typeof document !== "undefined") {
        const ae = document.activeElement;
        if (ae instanceof HTMLElement && ae.closest("[data-gallery-tile]")) {
          ae.blur();
        }
      }
    }
  }, []);

  const applyBulkTagDelta = useCallback(
    async (delta: { add: string[]; remove: string[]; perAsset?: boolean }) => {
      const add = Array.from(new Set(delta.add.map((t) => t.trim()).filter(Boolean)));
      const remove = Array.from(new Set(delta.remove.map((t) => t.trim()).filter(Boolean)));
      if (add.length === 0 && remove.length === 0) return;

      const body: Record<string, unknown> = {
        creator_id: creatorId,
        add_tag_ids: add,
        remove_tag_ids: remove
      };
      if (delta.perAsset) {
        const media_targets = selectedItems
          .filter((i) => !i.media_id.startsWith("post_only_"))
          .map((i) => ({ post_id: i.post_id, media_id: i.media_id }));
        if (media_targets.length === 0) return;
        body.media_targets = media_targets;
      } else {
        if (selectedPostIds.length === 0) return;
        body.post_ids = selectedPostIds;
      }

      const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/media/bulk-tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message ?? res.statusText);
      }
      await fetchFacets();
      refreshList();
    },
    [creatorId, fetchFacets, refreshList, selectedItems, selectedPostIds]
  );

  const rowVirtualizer = useVirtualizer({
    count: viewMode === "list" ? postGroups.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    overscan: 6
  });

  const derivedLibrarySyncStatus =
    librarySyncPhase === "syncing"
      ? "syncing"
      : librarySyncPhase === "error"
        ? "error"
        : syncHealth && syncStateNeedsAttention(syncHealth)
          ? "error"
          : "synced";

  const librarySyncIssueDetail =
    derivedLibrarySyncStatus === "error" && syncHealth
      ? formatSyncHealthBanner(syncHealth) ?? undefined
      : undefined;

  return (
    <div className="library-shell flex max-h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      <LibraryTopBar
        syncStatus={derivedLibrarySyncStatus}
        syncIssueDetail={librarySyncIssueDetail}
        creatorDisplayName={process.env.NEXT_PUBLIC_RELAY_CREATOR_DISPLAY_NAME}
        patreonName={syncHealth?.campaign_display?.patreon_name}
        patronCount={syncHealth?.campaign_display?.patron_count ?? 0}
        campaignImageSmallUrl={syncHealth?.campaign_display?.image_small_url}
        campaignBannerUrl={syncHealth?.campaign_display?.image_url}
        revenueLabel="1235"
        trailingActions={
          <PatreonSyncMenu
            creatorId={creatorId}
            campaignId={patreonCampaignIdEnv}
            onAfterScrape={afterPatreonScrape}
            onSyncActivity={setLibrarySyncPhase}
          />
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <GallerySidebar
          creatorId={creatorId}
          facets={facets}
          q={q}
          onSetQ={setQ}
          mediaTypes={mediaTypes}
          onSetMediaTypes={setMediaTypes}
          tagPick={tagPick}
          tierPick={tierPick}
          visibility={visibility}
          onSetVisibility={setVisibility}
          showTextOnlyPosts={showTextOnlyPosts}
          onSetShowTextOnlyPosts={setShowTextOnlyPosts}
          showShadowCovers={showShadowCovers}
          onSetShowShadowCovers={setShowShadowCovers}
          videoLoop={videoLoop}
          onSetVideoLoop={(v: boolean) => {
            setVideoLoop(v);
            writeGalleryVideoLoop(v);
          }}
          onToggleTag={toggleTag}
          onToggleTier={toggleTier}
          freePublicTierIds={freePublicTierIds}
          onToggleFreePublicTierGroup={toggleFreePublicTierGroup}
          activeCollectionId={activeCollectionId}
          onSelectCollection={setActiveCollectionId}
          onCollectionChange={() => {
            setCollectionsReloadToken((n) => n + 1);
            refreshList();
          }}
          collectionsReloadToken={collectionsReloadToken}
          assetsInView={displayItems.length}
          collectionCount={collections.length}
        />

        <main
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          onPointerDownCapture={onMainPointerDownCapture}
        >
          {listError ? (
            <div className="mx-4 mt-2 rounded border border-red-800/50 bg-red-950/35 px-3 py-2 text-sm text-red-200">
              {listError}
            </div>
          ) : null}

          <div className="relative flex h-10 shrink-0 items-center justify-between border-b border-[var(--lib-border)] px-4">
            <div className="flex items-center gap-3">
              <button
                ref={statsButtonRef}
                type="button"
                onClick={() => setStatsOpen((open) => !open)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  statsOpen
                    ? "border-[var(--lib-border)] bg-[var(--lib-muted)] text-[var(--lib-fg)]"
                    : "border-transparent text-[var(--lib-fg-muted)] hover:border-[var(--lib-border)] hover:bg-[var(--lib-muted)]"
                }`}
              >
                <span className="tabular-nums">
                  {postGroups.length.toLocaleString()} posts · {displayItems.length.toLocaleString()} assets
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${statsOpen ? "rotate-180" : ""}`} />
              </button>
              {selectedKeys.size > 0 ? (
                <span className="text-xs tabular-nums text-[var(--lib-selection)]">{selectedKeys.size} selected</span>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`flex h-7 w-7 items-center justify-center rounded ${
                  viewMode === "dense" ? "bg-[var(--lib-muted)] text-[var(--lib-fg)]" : "text-[var(--lib-fg-muted)]"
                }`}
                onClick={() => persistViewMode("dense")}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={`flex h-7 w-7 items-center justify-center rounded ${
                  viewMode === "normal" ? "bg-[var(--lib-muted)] text-[var(--lib-fg)]" : "text-[var(--lib-fg-muted)]"
                }`}
                onClick={() => persistViewMode("normal")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={`flex h-7 w-7 items-center justify-center rounded ${
                  viewMode === "list" ? "bg-[var(--lib-muted)] text-[var(--lib-fg)]" : "text-[var(--lib-fg-muted)]"
                }`}
                onClick={() => persistViewMode("list")}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            <GalleryStatsDrawer
              isOpen={statsOpen}
              onClose={() => setStatsOpen(false)}
              items={displayItems}
              anchorRef={statsButtonRef}
              tierTitleById={tierTitleById}
              tierFacets={facets.tiers}
            />
          </div>

          {viewMode === "list" ? (
            <div ref={listRef} className="min-h-0 flex-1 overflow-auto bg-[var(--lib-grid-bg)]">
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const group = postGroups[virtualRow.index];
                  if (!group) return null;
                  const primary = group.items[0];
                  if (!primary) return null;
                  const rowSelected =
                    group.items.length > 0 &&
                    group.items.every((i) => selectedKeys.has(galleryItemKey(i)));
                  return (
                    <div
                      key={group.post_id}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <button
                        type="button"
                        data-gallery-tile
                        role="listitem"
                        onFocus={() => setFocusIndex(virtualRow.index)}
                        onClick={() => toggleSelectGroup(group.items)}
                        className={`flex w-full items-center gap-3 border-b border-[var(--lib-border)] px-3 py-2 text-left transition-colors ${
                          rowSelected ? "bg-[var(--lib-primary)]/10" : "hover:bg-[var(--lib-muted)]/40"
                        }`}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full border border-[var(--lib-border)] bg-[var(--lib-card)]">
                          {rowSelected ? (
                            <span className="block h-full w-full rounded-full bg-[var(--lib-primary)]" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--lib-fg)]">{primary.title}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-[var(--lib-fg-muted)]">
                          {group.items.length > 1 ? `${group.items.length} assets · ` : null}
                          {primary.published_at.slice(0, 10)}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto bg-[var(--lib-grid-bg)]">
              <GalleryGrid
                groups={postGroups}
                tierTitleById={tierTitleById}
                tierFacets={facets.tiers}
                selectedKeys={selectedKeys}
                gridDensity={viewMode === "dense" ? "dense" : "normal"}
                onToggleSelectGroup={toggleSelectGroup}
                onFocusIndex={setFocusIndex}
                onIsolateAssetSelection={isolateSelectionToItem}
                creatorId={creatorId}
                onExportRetryComplete={refreshList}
              />
            </div>
          )}

          {nextCursor ? (
            <div className="flex shrink-0 justify-center border-t border-[var(--lib-border)] py-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => void fetchPage(nextCursor, true)}
                className="text-xs text-[var(--lib-primary)] disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          ) : null}

          <BulkActionBar
            selectedCount={selectedKeys.size}
            creatorId={creatorId}
            selectedItems={selectedItems}
            selectedPostIds={selectedPostIds}
            collections={collections}
            onClearSelection={() => setSelectedKeys(new Set())}
            onListRefresh={refreshList}
            onCollectionsReload={() => setCollectionsReloadToken((n) => n + 1)}
            onApplyBulkTagDelta={applyBulkTagDelta}
            suggestedTags={facets.tag_ids}
            onInspectPost={() => void openInspectPost()}
            onError={(msg) => setListError(msg)}
          />

          {postBatchOpen && postBatchItems.length > 0 ? (
            <PostBatchModal
              items={postBatchItems}
              startFlatIndex={postBatchGroupIndex >= 0 ? postBatchGroupIndex : 0}
              tierTitleById={tierTitleById}
              selectedKeys={selectedKeys}
              postDetail={postDetail}
              postDetailLoading={postDetailLoading}
              creatorId={creatorId}
              facets={facets}
              collections={collections}
              videoLoop={videoLoop}
              onClose={closePostBatch}
              onIsolateSelectionForAsset={isolateSelectionToItem}
              onToggleSelect={selectAssetInPostModal}
              onFocusIndex={setFocusIndex}
              onPostMetadataUpdated={async () => {
                await fetchFacets();
                setCollectionsReloadToken((n) => n + 1);
                refreshList();
                if (postBatchPostId) {
                  try {
                    const d = await fetchGalleryPostDetail(creatorId, postBatchPostId);
                    setPostDetail(d);
                  } catch {
                    /* ignore refresh errors */
                  }
                }
              }}
              onMediaExportRetryComplete={() => {
                refreshList();
                if (postBatchPostId) {
                  void fetchGalleryPostDetail(creatorId, postBatchPostId)
                    .then(setPostDetail)
                    .catch(() => {});
                }
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
