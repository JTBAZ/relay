"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Grid3X3, LayoutGrid, SlidersHorizontal } from "lucide-react";
import {
  GALLERY_VIEW_MODE_KEY,
  galleryViewModeNeedsRewrite,
  readGalleryViewMode,
  type GalleryViewMode
} from "@/lib/gallery-view-mode";
import LibraryEmptyState from "@/app/components/studio/LibraryEmptyState";
import { galleryItemKey, groupGalleryItemsByPost } from "@/lib/gallery-group";
import { collapsePostGroupsToGridCards } from "@/lib/active-post-linked-sets";
import {
  buildGalleryQuery,
  buildGalleryVisibilityBody,
  createPostDistributionPlan,
  fetchCreatorOnboarding,
  fetchPatreonSyncState,
  fetchRelayComposeTiers,
  formatSyncHealthBanner,
  galleryItemImageGridSrc,
  getCreatorProfile,
  linkCreativeWorkPosts,
  patchCreatorOnboarding,
  relayFetch,
  relayNativeCreatePost,
  relayNativeDeletePost,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  putRelayNativeUpload,
  RELAY_API_BASE,
  resolveRelayComposeCampaignId,
  syncHealthBlocksStudioWrites,
  syncStateNeedsAttention,
  type Collection,
  type CreatorProfileIdentity,
  type DistributionDestination,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type PatreonSyncStateData,
  type PostVisibility,
  type TierFacet
} from "@/lib/relay-api";
import GallerySidebar from "@/app/components/GallerySidebar";
import StudioScheduleRail, {
  type StudioScheduleRailHandle
} from "@/app/components/schedule-rail/StudioScheduleRail";
import GalleryGrid from "@/app/components/GalleryGrid";
import BulkActionBar from "@/app/components/BulkActionBar";
import { DistributionSheet } from "@/app/components/distribution/DistributionSheet";
import HeroInspectOverlay, {
  galleryItemsToHeroMediaStrip
} from "@/app/components/studio/HeroInspectOverlay";
import LinkConfirmSheet, {
  type LinkConfirmMemberDraft
} from "@/app/components/studio/LinkConfirmSheet";
import LinkedSetDrilldown from "@/app/components/studio/LinkedSetDrilldown";
import {
  HERO_DEFAULT_RANGE,
  type HeroInspectKey
} from "@/lib/hero-inspect-data";
import LibraryTopBar from "@/app/components/LibraryTopBar";
import PatreonSyncMenu from "@/app/components/PatreonSyncMenu";
import SyncHealthBanner from "@/app/components/SyncHealthBanner";
import GalleryStatsDrawer from "@/app/components/GalleryStatsDrawer";
import LibraryPowerPanel, { type LibraryMode } from "@/app/components/LibraryPowerPanel";
import LibraryImportBay from "@/app/components/LibraryImportBay";
import type { ImportBinItem } from "@/app/components/LibraryImportBay";
import LibraryCreatePostModal, {
  LIBRARY_CREATE_POST_PUBLIC_TIER,
  type PostDraft
} from "@/app/components/LibraryCreatePostModal";
import LibrarySectionEyebrow from "@/app/components/LibrarySectionEyebrow";
import { GoalCycleLauncher } from "@/app/components/goal-cycle/GoalCycleLauncher";
import { collectRailEventIds } from "@/app/components/goal-cycle/goal-cycle-rail-handoff";
import type { MediaTypeValue } from "@/app/components/MediaTypeMultiSelect";
import { freePublicTierIdsFromFacets } from "@/lib/tier-access";
import { guessRelayUploadContentType } from "@/lib/guess-relay-upload-content-type";
import {
  isImportBinServerMedia,
  isLibraryPublishBlockedRow,
  libraryPublishDataUrlUploads
} from "@/lib/library-create-post-media";
import { readGalleryVideoLoop, writeGalleryVideoLoop } from "@/lib/gallery-video-loop";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { subscribeRelayDistributionRefresh } from "@/lib/relay-distribution-refresh";
import { useStudioSession } from "@/lib/studio-session-context";

/** Align with visitor gallery — avoids one `/gallery/items` request per keystroke. */
const GALLERY_SEARCH_DEBOUNCE_MS = 320;

/** P4-onb-005: one-time auto “organize” ack per creator+device after Library load. */
function libraryOrganizeAckStorageKey(creatorId: string): string {
  return `relay.library.organize_ack.v1:${creatorId.trim()}`;
}

function galleryItemsToDistributionMedia(
  items: GalleryItem[]
): Array<{ id: string; preview: string; filename: string; type: "image" | "video" | "audio" }> {
  return items.map((item) => {
    const preview =
      galleryItemImageGridSrc(item) ??
      (item.content_url_path?.trim() ? `${RELAY_API_BASE}${item.content_url_path}` : "");
    const mime = (item.mime_type ?? "").toLowerCase();
    let type: "image" | "video" | "audio" = "image";
    if (mime.startsWith("video/")) type = "video";
    else if (mime.startsWith("audio/")) type = "audio";
    return {
      id: item.media_id,
      preview,
      filename: item.media_id,
      type
    };
  });
}

const patreonCampaignIdEnv = process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() || undefined;

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

type VisibilityState = { hidden: boolean; mature: boolean };

export default function GalleryView() {
  const router = useRouter();
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
  /** Prisma tier ids for Library create-post modal / `POST /relay/posts` (not gallery facet relay keys). */
  const [libraryComposeTierFacets, setLibraryComposeTierFacets] = useState<TierFacet[]>([]);
  const [libraryComposeTiersLoading, setLibraryComposeTiersLoading] = useState(false);
  const [libraryComposeTiersError, setLibraryComposeTiersError] = useState<string | null>(null);
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
  const [viewMode, setViewMode] = useState<GalleryViewMode>(() => {
    if (typeof window === "undefined") return "dense";
    const v = window.localStorage.getItem(GALLERY_VIEW_MODE_KEY);
    if (galleryViewModeNeedsRewrite(v)) {
      window.localStorage.setItem(GALLERY_VIEW_MODE_KEY, "normal");
    }
    return readGalleryViewMode(v);
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
  const [librarySyncPhase, setLibrarySyncPhase] = useState<"idle" | "syncing" | "error">(
    "idle"
  );
  const [syncHealth, setSyncHealth] = useState<PatreonSyncStateData | null>(null);
  const [patreonDetailsSignal, setPatreonDetailsSignal] = useState(0);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfileIdentity | null>(null);
  const prevLibrarySyncPhase = useRef(librarySyncPhase);
  const scheduleRailRef = useRef<StudioScheduleRailHandle>(null);

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

  /**
   * First successful Library visit after import: advance onboarding `import_started` → `organized` (P4-onb-005).
   * Uses PATCH (same as explicit ack). Skips when DB unavailable (503) or step is not `import_started`.
   */
  useEffect(() => {
    const id = creatorId?.trim();
    if (!id) return;

    let cancelled = false;
    if (typeof window !== "undefined") {
      try {
        if (window.localStorage.getItem(libraryOrganizeAckStorageKey(id)) === "1") {
          return;
        }
      } catch {
        /* ignore quota / private mode */
      }
    }

    void (async () => {
      try {
        const onboarding = await fetchCreatorOnboarding();
        if (cancelled) return;
        if (onboarding.step === "organized" || onboarding.step === "published") {
          try {
            window.localStorage.setItem(libraryOrganizeAckStorageKey(id), "1");
          } catch {
            /* ignore */
          }
          return;
        }
        if (onboarding.step !== "import_started") {
          return;
        }
        await patchCreatorOnboarding({ step: "organized" });
        if (!cancelled) {
          try {
            window.localStorage.setItem(libraryOrganizeAckStorageKey(id), "1");
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* 401/403/404/503 — not fatal for Library */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creatorId]);

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

  const fetchLibraryComposeTiers = useCallback(async () => {
    if (!creatorId?.trim()) {
      setLibraryComposeTierFacets([]);
      setLibraryComposeTiersError(null);
      setLibraryComposeTiersLoading(false);
      return;
    }
    setLibraryComposeTiersLoading(true);
    setLibraryComposeTiersError(null);
    try {
      const { tiers } = await fetchRelayComposeTiers(creatorId.trim());
      setLibraryComposeTierFacets(
        tiers.map((t) => ({
          tier_id: t.tier_id,
          title: t.title,
          relay_tier_id: t.relay_tier_id,
          campaign_id: t.campaign_id,
          ...(t.amount_cents != null ? { amount_cents: t.amount_cents } : {})
        }))
      );
    } catch (e) {
      setLibraryComposeTierFacets([]);
      setLibraryComposeTiersError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryComposeTiersLoading(false);
    }
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
    void fetchLibraryComposeTiers();
  }, [fetchLibraryComposeTiers]);

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

  const [crossPostTargetId, setCrossPostTargetId] = useState<string | null>(null);
  const [crossPostInitialPreviewMediaId, setCrossPostInitialPreviewMediaId] = useState<
    string | null
  >(null);
  const [crossPostInitialDestinations, setCrossPostInitialDestinations] = useState<
    DistributionDestination[]
  >([]);

  const crossPostMediaItems = useMemo(() => {
    if (!crossPostTargetId) return [];
    const group = postGroups.find((g) => g.post_id === crossPostTargetId);
    return galleryItemsToDistributionMedia(group?.items ?? []);
  }, [crossPostTargetId, postGroups]);

  const crossPostTitle = useMemo(() => {
    if (!crossPostTargetId) return undefined;
    return postGroups.find((g) => g.post_id === crossPostTargetId)?.items[0]?.title;
  }, [crossPostTargetId, postGroups]);

  const [heroOpen, setHeroOpen] = useState(false);
  const [heroKey, setHeroKey] = useState<HeroInspectKey | null>(null);
  const [heroPreview, setHeroPreview] = useState<GalleryItem | null>(null);

  const heroPostItems = useMemo(() => {
    if (!heroKey?.post_id) return [];
    return postGroups.find((g) => g.post_id === heroKey.post_id)?.items ?? [];
  }, [heroKey?.post_id, postGroups]);

  const heroMediaStrip = useMemo(
    () => galleryItemsToHeroMediaStrip(heroPostItems),
    [heroPostItems]
  );

  const closeHero = useCallback(() => {
    setHeroOpen(false);
    setHeroKey(null);
    setHeroPreview(null);
  }, []);

  const [heroDeleteBusy, setHeroDeleteBusy] = useState(false);

  const openHeroForItem = useCallback(
    (item: GalleryItem, creativeWorkId?: string | null) => {
      const workId =
        (creativeWorkId?.trim() || item.creative_work_id?.trim() || null) as string | null;
      setHeroPreview(item);
      setHeroKey({
        creative_work_id: workId,
        post_id: item.post_id,
        range: HERO_DEFAULT_RANGE
      });
      setHeroOpen(true);
    },
    []
  );

  const [libraryCreatePostOpen, setLibraryCreatePostOpen] = useState(false);
  const [libraryCreatePostMedia, setLibraryCreatePostMedia] = useState<ImportBinItem[]>([]);

  useEffect(() => {
    if (libraryCreatePostOpen && creatorId?.trim()) {
      void fetchLibraryComposeTiers();
    }
  }, [libraryCreatePostOpen, creatorId, fetchLibraryComposeTiers]);

  const handleImportBayAddToNewPost = useCallback((items: ImportBinItem[]) => {
    setLibraryCreatePostMedia(items);
    setLibraryCreatePostOpen(true);
  }, []);

  const handleImportBayAutopost = useCallback(
    (items: ImportBinItem[]) => {
      const ids = items
        .filter((item) => item.serverStaged)
        .map((item) => item.id)
        .join(",");
      if (!ids) return;
      router.push(`/studio/autopost?media_ids=${encodeURIComponent(ids)}`);
    },
    [router]
  );

  const handleScheduleRailAutopost = useCallback(
    (mediaIds: string[]) => {
      const ids = mediaIds.map((id) => id.trim()).filter(Boolean).join(",");
      if (!ids) return;
      router.push(`/studio/autopost?media_ids=${encodeURIComponent(ids)}`);
    },
    [router]
  );

  const openCrossPostForPost = useCallback(
    (
      postId: string,
      destinations: DistributionDestination[] = [],
      options?: { initialPreviewMediaId?: string | null }
    ) => {
      setCrossPostInitialDestinations(destinations);
      setCrossPostInitialPreviewMediaId(options?.initialPreviewMediaId?.trim() || null);
      setCrossPostTargetId(postId);
    },
    []
  );

  const handleActivePostPresentClick = useCallback(
    (_destination: string, externalUrl: string) => {
      const url = externalUrl.trim();
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    []
  );

  const handleActivePostGhostClick = useCallback(
    (destination: string, items: GalleryItem[]) => {
      const postId = items[0]?.post_id?.trim();
      if (!postId) {
        // No Relay post context — Autopost staging bin is the right surface.
        router.push("/studio/autopost");
        return;
      }
      // Existing Relay Post media is not staging-bin media; cross-post the post.
      const dest =
        destination === "patreon" ||
        destination === "x" ||
        destination === "deviantart" ||
        destination === "bluesky"
          ? ([destination] as DistributionDestination[])
          : [];
      openCrossPostForPost(postId, dest);
    },
    [router, openCrossPostForPost]
  );

  const [linkConfirmOpen, setLinkConfirmOpen] = useState(false);
  const [linkConfirmPosts, setLinkConfirmPosts] = useState<GalleryItem[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkedSetSummaryId, setLinkedSetSummaryId] = useState<string | null>(null);
  const [linkExpandHint, setLinkExpandHint] = useState<string | null>(null);

  const linkedSetCards = useMemo(
    () => collapsePostGroupsToGridCards(postGroups),
    [postGroups]
  );
  const openLinkedSetCard = useMemo(() => {
    if (!linkedSetSummaryId) return null;
    return (
      linkedSetCards.find(
        (card) => card.kind === "linked_set" && card.creative_work_id === linkedSetSummaryId
      ) ?? null
    );
  }, [linkedSetCards, linkedSetSummaryId]);

  const handleLinkPosts = useCallback(
    (postIds: string[]) => {
      const unique = [...new Set(postIds)];
      if (unique.length < 2) return;
      const posts = unique
        .map((id) => postGroups.find((g) => g.post_id === id)?.items[0])
        .filter((item): item is GalleryItem => Boolean(item));
      if (posts.length < 2) {
        setListError("Select at least two posts to create a Linked Set.");
        return;
      }
      setLinkError(null);
      setLinkExpandHint(null);
      setLinkConfirmPosts(posts);
      setLinkConfirmOpen(true);
    },
    [postGroups]
  );

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

  const handleConfirmLinkPosts = useCallback(
    async (members: LinkConfirmMemberDraft[], title: string) => {
      setLinkBusy(true);
      setLinkError(null);
      try {
        await linkCreativeWorkPosts({
          title: title || undefined,
          members: members.map((m) => ({
            post_id: m.post_id,
            variant_role: m.variant_role,
            member_label: m.member_label.trim() || null,
            is_cover: m.is_cover
          }))
        });
        setLinkConfirmOpen(false);
        setLinkConfirmPosts([]);
        setSelectedKeys(new Set());
        setLinkExpandHint(null);
        refreshList();
      } catch (error) {
        setLinkError(error instanceof Error ? error.message : String(error));
      } finally {
        setLinkBusy(false);
      }
    },
    [refreshList]
  );

  useEffect(() => {
    return subscribeRelayDistributionRefresh(refreshList);
  }, [refreshList]);

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
      const blocked = draft.media.filter(isLibraryPublishBlockedRow);
      if (blocked.length > 0) {
        setListError(
          "Remove URL-only previews or invalid upload rows. Use Discord captures, Import Bay uploads, or add files in this dialog."
        );
        return false;
      }

      const serverMediaIds = draft.media.filter(isImportBinServerMedia).map((m) => m.id);
      const uploadItems = libraryPublishDataUrlUploads(draft.media);
      if (serverMediaIds.length === 0 && uploadItems.length === 0) {
        setListError("Add at least one media asset (staged capture/upload or file in this dialog).");
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
        const seen = new Set<string>();
        const mediaIds: string[] = [];
        for (const id of [...serverMediaIds, ...uploadedIds]) {
          if (!seen.has(id)) {
            seen.add(id);
            mediaIds.push(id);
          }
        }
        const campaignId = resolveRelayComposeCampaignId(
          libraryComposeTierFacets,
          isPublic ? null : draft.tierId,
          isPublic
        );
        const created = await relayNativeCreatePost({
          creator_id: creatorId.trim(),
          title: draft.title.trim(),
          description: null,
          is_public: isPublic,
          required_tier_id: null,
          tier_ids: tierIds,
          tag_ids: draft.tags,
          media_ids: mediaIds,
          publish: true,
          ...(campaignId ? { campaign_id: campaignId } : {})
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
        void fetchLibraryComposeTiers();
        setCollectionsReloadToken((n) => n + 1);
        refreshList();
        if (collectionNotice) setListError(collectionNotice);
      } catch (e) {
        setListError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [creatorId, fetchFacets, fetchLibraryComposeTiers, libraryComposeTierFacets, refreshList]
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
    void fetchLibraryComposeTiers();
    refreshList();
    void loadCreatorProfile();
  }, [fetchFacets, fetchLibraryComposeTiers, refreshList, loadCreatorProfile]);

  const persistViewMode = (mode: GalleryViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GALLERY_VIEW_MODE_KEY, mode);
    }
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

  const openInspectPost = useCallback(() => {
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
    openHeroForItem(keep);
  }, [selectedItems, postGroups, openHeroForItem]);

  const handleHeroGapFill = useCallback(
    (destination: string, sourcePostId: string) => {
      const dest =
        destination === "patreon" ||
        destination === "x" ||
        destination === "deviantart" ||
        destination === "bluesky"
          ? ([destination] as DistributionDestination[])
          : [];
      closeHero();
      // Prefer cross-post sheet for existing Relay posts — Autopost staging requires
      // unattached bin media (primaryPostId null), which post-attached assets are not.
      const open = () => openCrossPostForPost(sourcePostId, dest);
      if (dest.length === 0) {
        open();
        return;
      }
      void createPostDistributionPlan(sourcePostId, { destinations: dest })
        .then(open)
        .catch(open);
    },
    [closeHero, openCrossPostForPost]
  );

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
  const studioWriteBlocked = useMemo(
    () => (syncHealth ? syncHealthBlocksStudioWrites(syncHealth) : false),
    [syncHealth]
  );

  const handleHeroDeletePost = useCallback(async () => {
    const postId = heroKey?.post_id?.trim();
    if (!postId?.startsWith("relay_p_") || studioWriteBlocked || heroDeleteBusy) return;
    setHeroDeleteBusy(true);
    try {
      await relayNativeDeletePost(postId, creatorId);
      closeHero();
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const key of [...next]) {
          const group = postGroups.find((g) => g.items.some((it) => galleryItemKey(it) === key));
          if (group?.post_id === postId) next.delete(key);
        }
        return next;
      });
      refreshList();
    } catch (error) {
      setListError(error instanceof Error ? error.message : String(error));
    } finally {
      setHeroDeleteBusy(false);
    }
  }, [
    heroKey?.post_id,
    studioWriteBlocked,
    heroDeleteBusy,
    creatorId,
    closeHero,
    postGroups,
    refreshList
  ]);

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
            detailsSignal={patreonDetailsSignal}
            onAfterScrape={afterPatreonScrape}
            onSyncActivity={setLibrarySyncPhase}
          />
        }
      />

      <SyncHealthBanner
        syncState={syncHealth}
        onViewDetails={() => setPatreonDetailsSignal((n) => n + 1)}
      />

      <GoalCycleLauncher
        onMaterialized={(receipt) => {
          const ids = collectRailEventIds(receipt);
          void scheduleRailRef.current?.refreshAndHighlight({
            focusEventId: ids[0] ?? null,
            highlightEventIds: ids
          });
        }}
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
            onAutopost={handleImportBayAutopost}
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
            <LibraryEmptyState variant="no_posts" dashed className="mx-4 mt-3 py-8" />
          ) : null}

          {emptyAfterFilters ? (
            <LibraryEmptyState
              variant="no_results"
              className="mx-4 mt-3"
              title={
                activeCollectionId
                  ? "No assets in this collection for current filters"
                  : undefined
              }
              description={
                activeCollectionId
                  ? "Try clearing the sidebar filters or pick another collection."
                  : undefined
              }
            />
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
              {linkExpandHint ? (
                <span className="max-w-md truncate text-[11px] text-[#9bf0c4]/90" title={linkExpandHint}>
                  {linkExpandHint}
                </span>
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
                aria-label="Dense grid density"
                title="Dense grid"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={`flex h-7 w-7 items-center justify-center rounded ${
                  viewMode === "normal" ? "bg-[var(--lib-muted)] text-[var(--lib-fg)]" : "text-[var(--lib-fg-muted)]"
                }`}
                onClick={() => persistViewMode("normal")}
                aria-label="Normal grid density"
                title="Normal grid"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
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

          <GalleryGrid
            groups={postGroups}
            tierTitleById={tierTitleById}
            tierFacets={facets.tiers}
            selectedKeys={selectedKeys}
            gridDensity={viewMode}
            onToggleSelectGroup={toggleSelectGroup}
            onFocusIndex={setFocusIndex}
            onIsolateAssetSelection={isolateSelectionToItem}
            creatorId={creatorId}
            onExportRetryComplete={refreshList}
            onPresentClick={handleActivePostPresentClick}
            onGhostClick={handleActivePostGhostClick}
            onOpenLinkedSet={(creativeWorkId) => setLinkedSetSummaryId(creativeWorkId)}
            onOpenPost={(items) => {
              const primary =
                items.find((it) => !it.shadow_cover) ?? items[0];
              if (!primary) return;
              openHeroForItem(primary);
            }}
          />

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
        </main>

        <StudioScheduleRail
          ref={scheduleRailRef}
          onCommitMedia={handleScheduleRailAutopost}
        />

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
          onClearSelection={() => {
            setSelectedKeys(new Set());
          }}
          onListRefresh={refreshList}
          onCollectionsReload={() => setCollectionsReloadToken((n) => n + 1)}
          onSelectCollection={setActiveCollectionId}
          onInspectPost={() => void openInspectPost()}
          onApplyBulkTagDelta={applyBulkTagDelta}
          setItemVisibility={setInspectItemVisibility}
          onError={(msg) => setListError(msg)}
          studioWriteBlocked={studioWriteBlocked}
        />
      </div>

      <LibraryCreatePostModal
        open={libraryCreatePostOpen}
        initialMedia={libraryCreatePostMedia}
        tierFacets={libraryComposeTierFacets}
        composeTiersLoading={libraryComposeTiersLoading}
        composeTiersError={libraryComposeTiersError}
        collections={libraryCreatePostCollections}
        tagSuggestions={facets.tag_ids}
        onClose={() => setLibraryCreatePostOpen(false)}
        onPublish={handleLibraryCreatePostPublish}
      />

      {crossPostTargetId ? (
        <DistributionSheet
          postId={crossPostTargetId}
          mediaItems={crossPostMediaItems}
          postTitle={crossPostTitle}
          initialSelectedDestinations={crossPostInitialDestinations}
          initialPreviewMediaId={crossPostInitialPreviewMediaId}
          onClose={() => {
            setCrossPostTargetId(null);
            setCrossPostInitialDestinations([]);
            setCrossPostInitialPreviewMediaId(null);
            refreshList();
          }}
        />
      ) : null}

      <LinkConfirmSheet
        open={linkConfirmOpen}
        posts={linkConfirmPosts}
        busy={linkBusy}
        error={linkError}
        onClose={() => {
          if (linkBusy) return;
          setLinkConfirmOpen(false);
          setLinkError(null);
        }}
        onConfirm={(members, title) => {
          void handleConfirmLinkPosts(members, title);
        }}
      />

      {openLinkedSetCard && openLinkedSetCard.kind === "linked_set" ? (
        <LinkedSetDrilldown
          open
          creativeWorkId={openLinkedSetCard.creative_work_id}
          title={openLinkedSetCard.title}
          coverPostId={openLinkedSetCard.cover_post_id}
          members={openLinkedSetCard.members}
          onClose={() => setLinkedSetSummaryId(null)}
          onChanged={() => {
            refreshList();
          }}
          onOpenHero={(postId) => {
            const group = postGroups.find((g) => g.post_id === postId);
            if (!group?.items[0]) return;
            const keep = group.items[0];
            setSelectedKeys(new Set([galleryItemKey(keep)]));
            openHeroForItem(keep, openLinkedSetCard.creative_work_id);
          }}
          onGapFill={(postId, destination) => {
            const dest =
              destination === "patreon" ||
              destination === "x" ||
              destination === "deviantart" ||
              destination === "bluesky"
                ? ([destination] as DistributionDestination[])
                : [];
            const open = () => openCrossPostForPost(postId, dest);
            if (dest.length === 0) {
              open();
              return;
            }
            void createPostDistributionPlan(postId, { destinations: dest })
              .then(open)
              .catch(open);
          }}
          onAddPosts={() => {
            const keys = new Set<string>();
            for (const member of openLinkedSetCard.members) {
              const item =
                member.group.items.find((it) => !it.shadow_cover) ?? member.group.items[0];
              if (item) keys.add(galleryItemKey(item));
            }
            setSelectedKeys(keys);
            setLinkedSetSummaryId(null);
            setLinkExpandHint(
              "Select additional posts, then Link posts to expand this Linked Set."
            );
          }}
        />
      ) : null}

      {selectedPostIds.length >= 2 && !heroOpen && !linkedSetSummaryId ? (
        <BulkActionBar
          creatorId={creatorId}
          selectedItems={selectedItems}
          selectedPostIds={selectedPostIds}
          collections={collections}
          suggestedTags={facets.tag_ids}
          onClearSelection={() => {
            setSelectedKeys(new Set());
            setLinkExpandHint(null);
          }}
          onListRefresh={refreshList}
          onCollectionsReload={() => setCollectionsReloadToken((n) => n + 1)}
          onApplyBulkTagDelta={applyBulkTagDelta}
          onError={(msg) => setListError(msg)}
          studioWriteBlocked={studioWriteBlocked}
          onLinkPosts={handleLinkPosts}
        />
      ) : null}

      {heroOpen && heroKey ? (
        <HeroInspectOverlay
          open={heroOpen}
          heroKey={heroKey}
          preview={heroPreview}
          mediaStrip={heroMediaStrip}
          postItems={heroPostItems}
          creatorId={creatorId}
          tiers={facets.tiers}
          studioWriteBlocked={studioWriteBlocked}
          onRefresh={async () => {
            await fetchPage(null, false);
          }}
          onClose={closeHero}
          onGapFill={handleHeroGapFill}
          onOpenDistribute={() => {
            const postId = heroKey.post_id;
            closeHero();
            openCrossPostForPost(postId, []);
          }}
          onDeletePost={
            heroKey.post_id.startsWith("relay_p_") && !studioWriteBlocked
              ? () => void handleHeroDeletePost()
              : null
          }
          deleteBusy={heroDeleteBusy}
          deleteBlockedReason={
            !heroKey.post_id.startsWith("relay_p_")
              ? "Relay-native only"
              : studioWriteBlocked
                ? "Sync blocked"
                : null
          }
        />
      ) : null}
    </div>
  );
}
