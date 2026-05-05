"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChevronDown, Grid3X3, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { galleryItemKey, groupGalleryItemsByPost } from "@/lib/gallery-group";
import {
  buildGalleryQuery,
  buildGalleryVisibilityBody,
  fetchGalleryPostDetail,
  fetchPatreonSyncState,
  formatSyncHealthBanner,
  getCreatorProfile,
  relayFetch,
  relayNativeCreatePost,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  putRelayNativeUpload,
  syncStateNeedsAttention,
  type Collection,
  type CreatorProfileIdentity,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type GalleryPostDetail,
  type PatreonSyncStateData,
  type PostVisibility
} from "@/lib/relay-api";
import GallerySidebar from "./components/GallerySidebar";
import GalleryGrid from "./components/GalleryGrid";
import PostBatchModal from "./components/PostBatchModal";
import InspectModal from "./components/InspectModal";
import LibraryTopBar from "./components/LibraryTopBar";
import PatreonSyncMenu from "./components/PatreonSyncMenu";
import GalleryStatsDrawer from "./components/GalleryStatsDrawer";
import LibraryPowerPanel, { type LibraryMode } from "./components/LibraryPowerPanel";
import LibraryImportBay from "./components/LibraryImportBay";
import type { ImportBinItem } from "./components/LibraryImportBay";
import LibraryCreatePostModal, {
  LIBRARY_CREATE_POST_PUBLIC_TIER,
  type PostDraft
} from "./components/LibraryCreatePostModal";
import LibrarySectionEyebrow from "./components/LibrarySectionEyebrow";
import type { MediaTypeValue } from "./components/MediaTypeMultiSelect";
import { freePublicTierIdsFromFacets } from "@/lib/tier-access";
import { readGalleryVideoLoop, writeGalleryVideoLoop } from "@/lib/gallery-video-loop";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useStudioSession } from "@/lib/studio-session-context";

/** Align with visitor gallery — avoids one `/gallery/items` request per keystroke. */
const GALLERY_SEARCH_DEBOUNCE_MS = 320;

const patreonCampaignIdEnv = process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() || undefined;

function guessRelayUploadContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const n = file.name.toLowerCase();
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}

async function uploadImportBinDataUrlToRelay(creatorId: string, item: ImportBinItem): Promise<string> {
  if (!item.src?.startsWith("data:")) {
    throw new Error("Upload item is missing an inline data URL.");
  }
  const blob = await fetch(item.src).then((r) => r.blob());
  const file = new File([blob], item.filename || "upload.bin", {
    type: item.mimeType || blob.type || "application/octet-stream"
  });
  const contentType = guessRelayUploadContentType(file);
  if (contentType === "application/octet-stream") {
    throw new Error(
      `Could not determine media type for “${item.filename}”. Use a recognizable extension (.png, .jpg, .mp4, …).`
    );
  }
  const init = await relayNativeUploadInit({
    creator_id: creatorId.trim(),
    content_type: contentType,
    byte_size: file.size
  });
  const putCt = init.upload.headers["Content-Type"] ?? contentType;
  await putRelayNativeUpload(init.upload.url, file, putCt);
  await relayNativeUploadCommit({
    creator_id: creatorId.trim(),
    media_id: init.media_id,
    content_type: contentType,
    byte_size: file.size
  });
  return init.media_id;
}

type ViewMode = "dense" | "normal" | "list";
type VisibilityState = { hidden: boolean; mature: boolean };

export default function GalleryView() {
  const { creatorId } = useStudioSession();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, GALLERY_SEARCH_DEBOUNCE_MS);
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
  const libraryCreatePostCollections = useMemo(
    () => collections.map((c) => ({ collection_id: c.collection_id, title: c.title })),
    [collections]
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [collectionAddTargetId, setCollectionAddTargetId] = useState<string | null>(null);
  const [collectionAddBusy, setCollectionAddBusy] = useState(false);
  const [collectionAddError, setCollectionAddError] = useState<string | null>(null);
  const [, setFocusIndex] = useState(-1);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("media");
  const [powerPanelOpen, setPowerPanelOpen] = useState(false);
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
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileIdentity | null>(null);
  const prevLibrarySyncPhase = useRef(librarySyncPhase);

  /**
   * Fullscreen-feel for creator library: keep viewport scroll enabled but hide
   * browser scrollbar chrome so width never jitters while interacting in-page.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("library-viewport-scroll-hidden");
    body.classList.add("library-viewport-scroll-hidden");
    return () => {
      html.classList.remove("library-viewport-scroll-hidden");
      body.classList.remove("library-viewport-scroll-hidden");
    };
  }, []);

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

  const loadCreatorProfile = useCallback(async () => {
    if (!creatorId?.trim()) {
      setCreatorProfile(null);
      return;
    }
    try {
      const profile = await getCreatorProfile();
      setCreatorProfile(profile);
    } catch {
      setCreatorProfile(null);
    }
  }, [creatorId]);

  useEffect(() => {
    void loadCreatorProfile();
  }, [loadCreatorProfile]);

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
        const wantsSearchFocus = Boolean(debouncedQ.trim());
        const path = buildGalleryQuery({
          creator_id: creatorId,
          q: debouncedQ || undefined,
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
    [creatorId, debouncedQ, mediaTypeQuery, showTextOnlyPosts, tagPick, tierPick]
  );

  useEffect(() => {
    void Promise.all([fetchFacets(), fetchCollections()]);
  }, [fetchFacets, fetchCollections, collectionsReloadToken]);

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

  const emptyLibrary = !loading && !listError && items.length === 0;
  const emptyAfterFilters =
    !loading &&
    !listError &&
    items.length > 0 &&
    displayItems.length === 0;

  const selectedItems = useMemo(() => items.filter((item) => selectedKeys.has(galleryItemKey(item))), [items, selectedKeys]);

  const selectedPostMediaItems = useMemo(() => {
    const postId = selectedItems[0]?.post_id;
    if (!postId) return [];
    return postGroups.find((group) => group.post_id === postId)?.items ?? [];
  }, [postGroups, selectedItems]);

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

  const collectionAddTarget = useMemo(
    () => collections.find((collection) => collection.collection_id === collectionAddTargetId) ?? null,
    [collectionAddTargetId, collections]
  );

  const collectionAddPostIds = useMemo(() => {
    if (!collectionAddTarget) return [];
    return selectedPostIds.filter((postId) => !collectionAddTarget.post_ids.includes(postId));
  }, [collectionAddTarget, selectedPostIds]);

  const requestAddSelectionToCollection = useCallback(
    (collectionId: string) => {
      if (selectedPostIds.length === 0) return;
      setCollectionAddTargetId(collectionId);
      setCollectionAddError(null);
    },
    [selectedPostIds.length]
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

  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectPreview, setInspectPreview] = useState<GalleryItem | null>(null);
  const [inspectDetail, setInspectDetail] = useState<GalleryPostDetail | null>(null);

  const closeInspectModal = useCallback(() => {
    setInspectModalOpen(false);
    setInspectPreview(null);
    setInspectDetail(null);
  }, []);

  const [libraryCreatePostOpen, setLibraryCreatePostOpen] = useState(false);
  const [libraryCreatePostMedia, setLibraryCreatePostMedia] = useState<ImportBinItem[]>([]);

  const handleImportBayAddToNewPost = useCallback((items: ImportBinItem[]) => {
    setLibraryCreatePostMedia(items);
    setLibraryCreatePostOpen(true);
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

  const refreshList = useCallback(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const handleLibraryCreatePostPublish = useCallback(
    async (draft: PostDraft) => {
      if (!creatorId.trim()) {
        setListError("Missing creator session.");
        return false;
      }
      if (!draft.title.trim()) {
        setListError("Add a title before publishing.");
        return false;
      }
      const blocked = draft.media.filter(
        (m) =>
          m.source === "url" || (m.source === "upload" && typeof m.src === "string" && !m.src.startsWith("data:"))
      );
      if (blocked.length > 0) {
        setListError(
          "Remove URL-only staged items (paste upload or Discord capture only). URLs can’t be published from this dialog yet."
        );
        return false;
      }

      const discordIds = draft.media.filter((m) => m.source === "discord").map((m) => m.id);
      const uploadItems = draft.media.filter(
        (m) => m.source === "upload" && typeof m.src === "string" && m.src.startsWith("data:")
      );
      if (discordIds.length === 0 && uploadItems.length === 0) {
        setListError("Add at least one Discord-staged asset or an uploaded file.");
        return false;
      }

      const isPublic = draft.tierId === LIBRARY_CREATE_POST_PUBLIC_TIER;
      const tierIds = isPublic ? [] : [draft.tierId];
      if (!isPublic && tierIds.length === 0) {
        setListError("Select a tier, or choose Everyone for a public post.");
        return false;
      }

      try {
        setListError(null);
        const uploadedIds: string[] = [];
        for (const row of uploadItems) {
          uploadedIds.push(await uploadImportBinDataUrlToRelay(creatorId, row));
        }
        const mediaIds = [...discordIds, ...uploadedIds];
        const created = await relayNativeCreatePost({
          creator_id: creatorId.trim(),
          title: draft.title.trim(),
          description: null,
          is_public: isPublic,
          required_tier_id: null,
          tier_ids: tierIds,
          tag_ids: draft.tags,
          media_ids: mediaIds,
          publish: true
        });
        const newPostId = created.post.id;
        let collectionNotice: string | null = null;
        for (const cid of draft.collectionIds) {
          try {
            await relayFetch<unknown>(
              `/api/v1/gallery/collections/${encodeURIComponent(cid)}/posts`,
              {
                method: "POST",
                body: JSON.stringify({ post_ids: [newPostId] })
              }
            );
          } catch (ce) {
            collectionNotice =
              `Post published (${newPostId}), but adding it to a collection failed: ${ce instanceof Error ? ce.message : String(ce)}`;
          }
        }
        setLibraryCreatePostOpen(false);
        void fetchFacets();
        setCollectionsReloadToken((n) => n + 1);
        refreshList();
        if (collectionNotice) setListError(collectionNotice);
      } catch (e) {
        setListError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [creatorId, fetchFacets, refreshList]
  );

  const confirmAddSelectionToCollection = useCallback(async () => {
    if (!collectionAddTarget || collectionAddPostIds.length === 0) return;
    setCollectionAddBusy(true);
    setCollectionAddError(null);
    try {
      await relayFetch<unknown>(
        `/api/v1/gallery/collections/${encodeURIComponent(collectionAddTarget.collection_id)}/posts`,
        {
          method: "POST",
          body: JSON.stringify({ post_ids: collectionAddPostIds })
        }
      );
      setCollectionAddTargetId(null);
      setCollectionsReloadToken((n) => n + 1);
      refreshList();
    } catch (error) {
      setCollectionAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setCollectionAddBusy(false);
    }
  }, [collectionAddPostIds, collectionAddTarget, refreshList]);

  const afterPatreonScrape = useCallback(async () => {
    await fetchFacets();
    refreshList();
    void loadCreatorProfile();
  }, [fetchFacets, refreshList, loadCreatorProfile]);

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

  const setInspectItemVisibility = useCallback(
    async (items: GalleryItem[], visibility: PostVisibility) => {
      const body = buildGalleryVisibilityBody(creatorId, items, visibility);
      await relayFetch<unknown>("/api/v1/gallery/visibility", {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify(body)
      });
    },
    [creatorId]
  );

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

    if (g.items.length === 1) {
      closePostBatch();
      setSelectedKeys(new Set([galleryItemKey(keep)]));
      setInspectPreview(keep);
      setInspectDetail(null);
      setInspectModalOpen(true);
      try {
        const detail = await fetchGalleryPostDetail(creatorId, first.post_id);
        setInspectDetail(detail);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setListError(msg);
        closeInspectModal();
      }
      return;
    }

    closeInspectModal();
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
  }, [
    selectedItems,
    postGroups,
    creatorId,
    closePostBatch,
    closeInspectModal
  ]);

  const toggleSelectGroup = useCallback((groupItems: GalleryItem[]) => {
    const keys = groupItems.map(galleryItemKey);
    let clearedFocus = false;
    let shouldOpenPowerPanel = false;
    setSelectedKeys((prev) => {
      const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        for (const k of keys) next.delete(k);
        clearedFocus = true;
      } else {
        for (const k of keys) next.add(k);
        shouldOpenPowerPanel = true;
      }
      return next;
    });
    if (shouldOpenPowerPanel) setPowerPanelOpen(true);
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
      if (n.closest?.("[data-library-import-bay]")) return;
      if (n.hasAttribute("data-gallery-tile")) return;
      if (n.hasAttribute("data-bulk-action-bar")) return;
      if (n.getAttribute("role") === "dialog") return;
      if (n.closest?.("[data-gallery-stats-drawer]")) return;
      if (n.closest?.("[data-library-active-posts]")) return;
      if (n.closest?.("[data-library-toolbar]")) return;
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

      await relayFetch<unknown>("/api/v1/gallery/media/bulk-tags", {
        method: "POST",
        body: JSON.stringify(body)
      });
      await fetchFacets();
      refreshList();
    },
    [creatorId, fetchFacets, refreshList, selectedItems, selectedPostIds]
  );

  const rowVirtualizer = useVirtualizer({
    count: viewMode === "list" ? postGroups.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    /** Extra rows above/below viewport — smoother scroll when many posts (list mode is the scale path). */
    overscan: 10
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

  /** Relay creator profile (`/api/v1/creator/profile`) merged with Patreon sync snapshot (`campaign_display`). */
  const libraryDisplayName = useMemo(() => {
    const profile = creatorProfile;
    const fromRelay = profile?.display_name?.trim() || profile?.username?.trim();
    if (fromRelay) return fromRelay;
    const fromEnv = process.env.NEXT_PUBLIC_RELAY_CREATOR_DISPLAY_NAME?.trim();
    if (fromEnv) return fromEnv;
    const vanity = syncHealth?.campaign_display?.patreon_name?.trim();
    if (vanity) return vanity;
    const slug = profile?.public_slug?.trim();
    if (slug) return slug.replace(/-/g, " ");
    return undefined;
  }, [creatorProfile, syncHealth]);

  const patreonVanitySlug = useMemo(() => {
    const fromCampaign = syncHealth?.campaign_display?.patreon_name?.trim().toLowerCase();
    if (fromCampaign) return fromCampaign;
    const profile = creatorProfile;
    return profile?.username_norm?.trim().toLowerCase() || profile?.username?.trim().toLowerCase() || undefined;
  }, [syncHealth, creatorProfile]);

  const campaignAvatarUrl = syncHealth?.campaign_display?.image_small_url || creatorProfile?.avatar_url || undefined;
  const campaignBannerRemote = syncHealth?.campaign_display?.image_url || creatorProfile?.banner_url || undefined;
  return (
    <div className="library-shell library-hide-scrollbars flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--lib-bg)] text-[var(--lib-fg)]">
      <LibraryTopBar
        syncStatus={derivedLibrarySyncStatus}
        syncIssueDetail={librarySyncIssueDetail}
        creatorDisplayName={libraryDisplayName}
        patreonName={patreonVanitySlug}
        campaignImageSmallUrl={campaignAvatarUrl}
        campaignBannerUrl={campaignBannerRemote}
        trailingActions={
          <PatreonSyncMenu
            creatorId={creatorId}
            campaignId={patreonCampaignIdEnv}
            onAfterScrape={afterPatreonScrape}
            onSyncActivity={setLibrarySyncPhase}
          />
        }
      />

      <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {powerPanelOpen ? (
          <div
            role="presentation"
            tabIndex={-1}
            className="absolute inset-0 z-[82] bg-black/[0.55]"
            onClick={() => setPowerPanelOpen(false)}
          />
        ) : null}

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
          collections={collections}
          activeCollectionId={activeCollectionId}
          onSelectCollection={setActiveCollectionId}
          selectedPostCount={selectedPostIds.length}
          onRequestAddSelectionToCollection={requestAddSelectionToCollection}
          assetsInView={displayItems.length}
          collectionCount={collections.length}
        />

        {collectionAddTarget ? (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal
            aria-label="Add selections to collection"
            onClick={() => {
              if (!collectionAddBusy) setCollectionAddTargetId(null);
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-[var(--lib-border)] bg-[var(--lib-card)] p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
                Collections
              </p>
              <h2 className="mt-1 text-base font-semibold text-[var(--lib-fg)]">
                Add selections to Collection?
              </h2>
              <p className="mt-2 text-xs leading-5 text-[var(--lib-fg-muted)]">
                Add {collectionAddPostIds.length} selected post
                {collectionAddPostIds.length === 1 ? "" : "s"} to{" "}
                <span className="font-medium text-[var(--lib-fg)]">{collectionAddTarget.title}</span>.
                {selectedPostIds.length - collectionAddPostIds.length > 0
                  ? ` ${selectedPostIds.length - collectionAddPostIds.length} already in this collection will be skipped.`
                  : ""}
              </p>
              {collectionAddError ? (
                <p className="mt-3 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                  {collectionAddError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={collectionAddBusy}
                  onClick={() => setCollectionAddTargetId(null)}
                  className="rounded-lg border border-[var(--lib-border)] px-3 py-2 text-xs text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-50"
                >
                  No
                </button>
                <button
                  type="button"
                  disabled={collectionAddBusy || collectionAddPostIds.length === 0}
                  onClick={() => void confirmAddSelectionToCollection()}
                  className="rounded-lg border border-[var(--lib-primary)]/55 bg-[var(--lib-primary)]/20 px-3 py-2 text-xs font-medium text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-50"
                >
                  {collectionAddBusy ? "Adding..." : "Yes, add"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <main
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          onPointerDownCapture={onMainPointerDownCapture}
        >
          <LibraryImportBay
            creatorId={creatorId}
            onError={setListError}
            onAddToNewPost={handleImportBayAddToNewPost}
          />

          {listError ? (
            <div
              className="mx-4 mt-2 rounded-md border border-[var(--lib-destructive)]/45 bg-[var(--lib-destructive)]/10 px-3 py-2.5 text-sm text-[var(--lib-fg)]"
              role="alert"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-destructive)]">
                Could not load library
              </span>
              <span className="mt-1 block text-[var(--lib-fg-muted)]">{listError}</span>
            </div>
          ) : null}

          {emptyLibrary ? (
            <div className="mx-4 mt-3 rounded-lg border border-dashed border-[var(--lib-border)] bg-[var(--lib-muted)]/25 px-4 py-8 text-center">
              <p className="text-sm font-medium text-[var(--lib-fg)]">No posts in your library yet</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[var(--lib-fg-muted)]">
                Connect Patreon (creator OAuth), then use <strong>Patreon → Live scrape</strong> to
                pull posts into Relay. Nothing here is shown to visitors until you curate visibility
                and layout.
              </p>
            </div>
          ) : null}

          {emptyAfterFilters ? (
            <div className="mx-4 mt-3 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-6 text-center">
              <p className="text-sm font-medium text-[var(--lib-fg)]">
                {activeCollectionId ? "No assets in this collection for current filters" : "No assets match your filters"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs text-[var(--lib-fg-muted)]">
                {activeCollectionId
                  ? "Try clearing the sidebar filters or pick another collection."
                  : "Adjust Find Assets, tags, tiers, visibility toggles, or media types — or clear search."}
              </p>
            </div>
          ) : null}

          {!emptyLibrary ? (
            <>
          <div
            data-library-active-posts
            className="shrink-0 border-b border-white/[0.06] bg-black px-4 pb-2 pt-6 text-center lg:pt-8"
          >
            <LibrarySectionEyebrow label="Published content" />

            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Active Posts</h2>
          </div>

          <div
            data-library-toolbar
            className="relative z-10 flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] bg-black px-4"
          >
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
                onClick={() => setPowerPanelOpen((open) => !open)}
                aria-expanded={powerPanelOpen}
                className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
                  powerPanelOpen
                    ? "border-[var(--lib-primary)]/50 bg-[var(--lib-primary)]/15 text-[var(--lib-fg)]"
                    : "border-transparent text-[var(--lib-fg-muted)] hover:border-[var(--lib-border)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Power</span>
              </button>
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
            <div ref={listRef} className="min-h-0 flex-1 overflow-auto bg-black">
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
            <div className="min-h-0 flex-1 overflow-auto bg-black pb-10">
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
            <div className="flex shrink-0 justify-center border-t border-white/[0.06] bg-black py-3">
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

            </>
          ) : null}

          {inspectModalOpen && inspectPreview ? (
            <InspectModal
              preview={inspectPreview}
              previewDetail={inspectDetail}
              creatorId={creatorId}
              onPresentationUpdated={async () => {
                await fetchFacets();
                refreshList();
                if (inspectPreview) {
                  try {
                    const detail = await fetchGalleryPostDetail(creatorId, inspectPreview.post_id);
                    setInspectDetail(detail);
                  } catch {
                    /* ignore refresh errors */
                  }
                }
              }}
              onClose={closeInspectModal}
            />
          ) : null}

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

        <LibraryPowerPanel
          isOpen={powerPanelOpen}
          onClose={() => setPowerPanelOpen(false)}
          mode={libraryMode}
          onModeChange={setLibraryMode}
          selectedItems={selectedItems}
          selectedPostMediaItems={selectedPostMediaItems}
          onSelectMediaItem={(item) => {
            setSelectedKeys(new Set([galleryItemKey(item)]));
            setFocusIndex(-1);
          }}
          selectedPostIds={selectedPostIds}
          collections={collections}
          activeCollectionId={activeCollectionId}
          facets={facets}
          tierTitleById={tierTitleById}
          creatorId={creatorId}
          onClearSelection={() => setSelectedKeys(new Set())}
          onListRefresh={refreshList}
          onCollectionsReload={() => setCollectionsReloadToken((n) => n + 1)}
          onSelectCollection={setActiveCollectionId}
          onInspectPost={() => void openInspectPost()}
          onApplyBulkTagDelta={applyBulkTagDelta}
          setItemVisibility={setInspectItemVisibility}
          onError={(msg) => setListError(msg)}
        />
      </div>

      <LibraryCreatePostModal
        open={libraryCreatePostOpen}
        initialMedia={libraryCreatePostMedia}
        tierFacets={facets.tiers}
        collections={libraryCreatePostCollections}
        tagSuggestions={facets.tag_ids}
        onClose={() => setLibraryCreatePostOpen(false)}
        onPublish={handleLibraryCreatePostPublish}
      />
    </div>
  );
}
