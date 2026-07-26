"use client";

import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import BulkActionBar from "@/app/components/BulkActionBar";
import GalleryGrid from "@/app/components/GalleryGrid";
import type { MediaTypeValue } from "@/app/components/MediaTypeMultiSelect";
import { DistributionSheet } from "@/app/components/distribution/DistributionSheet";
import LibraryEmptyState from "@/app/components/studio/LibraryEmptyState";
import {
  LabGalleryFilterBar
} from "@/app/components/studio/LabGalleryFilterBar";
import HeroInspectOverlay, {
  galleryItemsToHeroMediaStrip
} from "@/app/components/studio/HeroInspectOverlay";
import LinkConfirmSheet, {
  type LinkConfirmMemberDraft
} from "@/app/components/studio/LinkConfirmSheet";
import LinkedSetDrilldown from "@/app/components/studio/LinkedSetDrilldown";
import {
  collapsePostGroupsToGridCards
} from "@/lib/active-post-linked-sets";
import { galleryItemKey, groupGalleryItemsByPost } from "@/lib/gallery-group";
import {
  HERO_DEFAULT_RANGE,
  type HeroInspectKey
} from "@/lib/hero-inspect-data";
import {
  buildGalleryQuery,
  createPostDistributionPlan,
  galleryItemImageGridSrc,
  linkCreativeWorkPosts,
  relayFetchWithoutAuthRedirect,
  relayNativeDeletePost,
  RELAY_API_BASE,
  syncHealthBlocksStudioWrites,
  type Collection,
  type DistributionDestination,
  type FacetsData,
  type GalleryItem,
  type GalleryListData,
  type PatreonSyncStateData
} from "@/lib/relay-api";
import { subscribeRelayDistributionRefresh } from "@/lib/relay-distribution-refresh";
import { useStudioSession } from "@/lib/studio-session-context";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const GALLERY_SEARCH_DEBOUNCE_MS = 320;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#404a44]">
      {children}
    </span>
  );
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

/**
 * Phase 2 Active Posts panel: v0 section chrome + live library media,
 * presence chips, selection toolkit, and drilldowns.
 */
export default function Lab2ActivePostsLive({
  reloadToken = 0
}: {
  /** Bump after Patreon scrape / external library refresh. */
  reloadToken?: number;
}) {
  const router = useRouter();
  const { creatorId } = useStudioSession();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, GALLERY_SEARCH_DEBOUNCE_MS);
  const [tagPick, setTagPick] = useState<string[]>([]);
  const [tierPick, setTierPick] = useState<string[]>([]);
  const [mediaTypes, setMediaTypes] = useState<MediaTypeValue[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
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
  const [studioWriteBlocked, setStudioWriteBlocked] = useState(false);

  const [crossPostTargetId, setCrossPostTargetId] = useState<string | null>(null);
  const [crossPostInitialPreviewMediaId, setCrossPostInitialPreviewMediaId] = useState<
    string | null
  >(null);
  const [crossPostInitialDestinations, setCrossPostInitialDestinations] = useState<
    DistributionDestination[]
  >([]);

  const [heroOpen, setHeroOpen] = useState(false);
  const [heroKey, setHeroKey] = useState<HeroInspectKey | null>(null);
  const [heroPreview, setHeroPreview] = useState<GalleryItem | null>(null);
  const [heroDeleteBusy, setHeroDeleteBusy] = useState(false);

  const [linkConfirmOpen, setLinkConfirmOpen] = useState(false);
  const [linkConfirmPosts, setLinkConfirmPosts] = useState<GalleryItem[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkedSetSummaryId, setLinkedSetSummaryId] = useState<string | null>(null);
  const [linkExpandHint, setLinkExpandHint] = useState<string | null>(null);

  const tierTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tier of facets.tiers) {
      map[tier.tier_id] = tier.title;
    }
    return map;
  }, [facets.tiers]);

  const mediaTypeQuery = useMemo(
    () => (mediaTypes.length > 0 ? `${mediaTypes[0]}/` : undefined),
    [mediaTypes]
  );

  const fetchPage = useCallback(async () => {
    const id = creatorId?.trim();
    if (!id) {
      setItems([]);
      return;
    }
    setLoading(true);
    setListError(null);
    try {
      const wantsSearchFocus = Boolean(debouncedQ.trim());
      const path = buildGalleryQuery({
        creator_id: id,
        q: debouncedQ || undefined,
        tag_ids: tagPick.length ? tagPick : undefined,
        tier_ids: tierPick.length ? tierPick : undefined,
        media_type: mediaTypeQuery,
        display: wantsSearchFocus ? "post_primary" : "all_media",
        limit: 120
      });
      const data = await relayFetchWithoutAuthRedirect<GalleryListData>(path);
      setItems(data.items);
      setFocusIndex(-1);
    } catch (error) {
      setListError(error instanceof Error ? error.message : String(error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId, debouncedQ, mediaTypeQuery, tagPick, tierPick]);

  const fetchFacets = useCallback(async () => {
    const id = creatorId?.trim();
    if (!id) return;
    try {
      const data = await relayFetchWithoutAuthRedirect<FacetsData>(
        `/api/v1/gallery/facets?creator_id=${encodeURIComponent(id)}`
      );
      setFacets(data);
    } catch {
      /* facets optional for panel */
    }
  }, [creatorId]);

  const fetchCollections = useCallback(async () => {
    const id = creatorId?.trim();
    if (!id) return;
    try {
      const data = await relayFetchWithoutAuthRedirect<{ collections: Collection[] }>(
        `/api/v1/gallery/collections?creator_id=${encodeURIComponent(id)}`
      );
      setCollections(data.collections ?? []);
    } catch {
      setCollections([]);
    }
  }, [creatorId]);

  const refreshList = useCallback(() => {
    void fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage, reloadToken]);

  useEffect(() => {
    void Promise.all([fetchFacets(), fetchCollections()]);
  }, [fetchFacets, fetchCollections, collectionsReloadToken]);

  useEffect(() => {
    return subscribeRelayDistributionRefresh(refreshList);
  }, [refreshList]);

  useEffect(() => {
    const id = creatorId?.trim();
    if (!id) {
      setStudioWriteBlocked(false);
      return;
    }
    void relayFetchWithoutAuthRedirect<PatreonSyncStateData>(
      `/api/v1/patreon/sync-state?creator_id=${encodeURIComponent(id)}`
    )
      .then((s) => setStudioWriteBlocked(syncHealthBlocksStudioWrites(s)))
      .catch(() => setStudioWriteBlocked(false));
  }, [creatorId]);

  const displayItems = useMemo(() => {
    let list = items.filter((item) => !item.shadow_cover);
    if (mediaTypes.length) {
      list = list.filter((item) => {
        const top = item.mime_type?.split("/")[0];
        return top ? mediaTypes.includes(top as MediaTypeValue) : false;
      });
    }
    return list;
  }, [items, mediaTypes]);

  const postGroups = useMemo(
    () => groupGalleryItemsByPost(displayItems),
    [displayItems]
  );

  const filteredCount = useMemo(() => {
    const cards = collapsePostGroupsToGridCards(postGroups);
    return cards.length;
  }, [postGroups]);

  const toggleTag = useCallback((tag: string) => {
    setTagPick((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  const toggleTier = useCallback((tierId: string) => {
    setTierPick((prev) =>
      prev.includes(tierId) ? prev.filter((id) => id !== tierId) : [...prev, tierId]
    );
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(galleryItemKey(item))),
    [items, selectedKeys]
  );

  const selectedPostIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedItems.map((item) => item.post_id).filter((id): id is string => Boolean(id))
        )
      ),
    [selectedItems]
  );

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

  const crossPostMediaItems = useMemo(() => {
    if (!crossPostTargetId) return [];
    const group = postGroups.find((g) => g.post_id === crossPostTargetId);
    return galleryItemsToDistributionMedia(group?.items ?? []);
  }, [crossPostTargetId, postGroups]);

  const crossPostTitle = useMemo(() => {
    if (!crossPostTargetId) return undefined;
    return postGroups.find((g) => g.post_id === crossPostTargetId)?.items[0]?.title;
  }, [crossPostTargetId, postGroups]);

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
    (destination: string, itemsForPost: GalleryItem[]) => {
      const postId = itemsForPost[0]?.post_id?.trim();
      if (!postId) {
        router.push("/studio/autopost");
        return;
      }
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

      await relayFetchWithoutAuthRedirect<unknown>("/api/v1/gallery/media/bulk-tags", {
        method: "POST",
        body: JSON.stringify(body)
      });
      await fetchFacets();
      refreshList();
    },
    [creatorId, fetchFacets, refreshList, selectedItems, selectedPostIds]
  );

  const onPanelPointerDownCapture = useCallback((e: PointerEvent<HTMLElement>) => {
    const path = e.nativeEvent.composedPath();
    for (const n of path) {
      if (!(n instanceof Element)) continue;
      if (n.hasAttribute("data-gallery-tile")) return;
      if (n.hasAttribute("data-bulk-action-bar")) return;
      if (n.getAttribute("role") === "dialog") return;
      if (n.closest?.("[data-library-active-posts]")) return;
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

  const emptyLibrary = !loading && !listError && items.length === 0;
  const emptyAfterFilters =
    !loading && !listError && items.length > 0 && postGroups.length === 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onPointerDownCapture={onPanelPointerDownCapture}
    >
      <div
        data-library-active-posts
        className="flex flex-shrink-0 items-center gap-3 border-b border-[#0d0d0d] px-5 py-3"
      >
        <SectionLabel>Active Posts</SectionLabel>
        <span className="text-[10px] tabular-nums text-[#2e3a32]">{filteredCount}</span>
      </div>

      <LabGalleryFilterBar
        variant="lab2"
        q={q}
        onSetQ={setQ}
        mediaTypes={mediaTypes}
        onSetMediaTypes={setMediaTypes}
        tagPick={tagPick}
        onToggleTag={toggleTag}
        tierPick={tierPick}
        onToggleTier={toggleTier}
        facets={facets}
      />

      {listError ? (
        <div
          className="mx-5 mt-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-sm text-[#e8e8e8]"
          role="alert"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-red-300">
            Could not load library
          </span>
          <span className="mt-1 block text-[#9ca3af]">{listError}</span>
        </div>
      ) : null}

      {linkExpandHint ? (
        <p className="mx-5 mt-2 text-[11px] text-[#6aaa7a]">{linkExpandHint}</p>
      ) : null}

      {emptyLibrary ? (
        <LibraryEmptyState variant="no_posts" dashed className="mx-5 mt-3 py-8" />
      ) : null}

      {emptyAfterFilters ? (
        <LibraryEmptyState
          variant="no_results"
          className="mx-5 mt-3"
          title="No posts match"
          description="Try clearing search or filters."
        />
      ) : null}

      {!emptyLibrary && !emptyAfterFilters ? (
        <GalleryGrid
          groups={postGroups}
          tierTitleById={tierTitleById}
          tierFacets={facets.tiers}
          selectedKeys={selectedKeys}
          gridDensity="lab2"
          onToggleSelectGroup={toggleSelectGroup}
          onFocusIndex={setFocusIndex}
          creatorId={creatorId}
          onPresentClick={handleActivePostPresentClick}
          onGhostClick={handleActivePostGhostClick}
          onOpenLinkedSet={(creativeWorkId) => setLinkedSetSummaryId(creativeWorkId)}
          onOpenPost={(groupItems) => {
            const primary =
              groupItems.find((it) => !it.shadow_cover) ?? groupItems[0];
            if (primary) openHeroForItem(primary);
          }}
        />
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[12px] text-[#3a4a3e]">
          Loading posts…
        </div>
      ) : null}

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

      {selectedPostIds.length >= 1 && !heroOpen && !linkedSetSummaryId ? (
        <BulkActionBar
          creatorId={creatorId}
          selectedItems={selectedItems}
          selectedPostIds={selectedPostIds}
          collections={collections}
          tiers={facets.tiers}
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
            await fetchPage();
          }}
          onClose={closeHero}
          onGapFill={(destination, sourcePostId) => {
            const dest =
              destination === "patreon" ||
              destination === "x" ||
              destination === "deviantart" ||
              destination === "bluesky"
                ? ([destination] as DistributionDestination[])
                : [];
            closeHero();
            const open = () => openCrossPostForPost(sourcePostId, dest);
            if (dest.length === 0) {
              open();
              return;
            }
            void createPostDistributionPlan(sourcePostId, { destinations: dest })
              .then(open)
              .catch(open);
          }}
          onOpenDistribute={() => {
            const postId = heroKey.post_id;
            closeHero();
            openCrossPostForPost(postId, []);
          }}
          onDeletePost={
            heroKey.post_id.startsWith("relay_p_") && !studioWriteBlocked
              ? () => {
                  void (async () => {
                    const postId = heroKey.post_id.trim();
                    if (!postId.startsWith("relay_p_") || studioWriteBlocked || heroDeleteBusy) {
                      return;
                    }
                    setHeroDeleteBusy(true);
                    try {
                      await relayNativeDeletePost(postId, creatorId);
                      closeHero();
                      setSelectedKeys((prev) => {
                        const next = new Set(prev);
                        for (const key of [...next]) {
                          const group = postGroups.find((g) =>
                            g.items.some((it) => galleryItemKey(it) === key)
                          );
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
                  })();
                }
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
