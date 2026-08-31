/**
 * Load CommandLibraryItem rows from Prisma for a creator (RC-P2-T04 / RC-P5-T02).
 * Compact records use Gallery-effective title, tags, visibility, and collection themes.
 */
import { PostPublishState, PostUpstreamStatus, type PrismaClient } from "@prisma/client";
import { getDistributionSummariesForPosts } from "../../distribution/post-distribution-service.js";
import type { DistributionSummaryWire } from "../../distribution/post-distribution-service.js";
import { DbCollectionsStore } from "../../gallery/collections-store-db.js";
import {
  mergePostPresentation,
  type PostPresentationOverlay
} from "../../gallery/effective-presentation.js";
import { DbGalleryOverridesStore } from "../../gallery/overrides-store-db.js";
import { loadPostPresentationOverlaysFromDb } from "../../gallery/post-presentation-load.js";
import {
  applyMediaRowTagDelta,
  effectiveTags,
  galleryRowTags,
  resolveGalleryItemVisibility
} from "../../gallery/query.js";
import type { Collection, GalleryOverridesRoot } from "../../gallery/types.js";
import type { CommandPostSource, CommandPublishState } from "./contracts.js";
import type { CommandLibraryItem } from "./selection.js";

function asCommandSource(source: string): CommandPostSource | null {
  if (source === "PATREON" || source === "SUBSCRIBESTAR" || source === "RELAY") return source;
  return null;
}

function asCommandPublishState(value: string | undefined): CommandPublishState {
  if (value === PostPublishState.draft || value === "draft") return "draft";
  return "published";
}

export type CommandLibraryLoadedPost = {
  id: string;
  source: string;
  isPublic: boolean;
  createdAt: Date;
  publishState?: string;
  creativeWorkId?: string | null;
  upstreamStatus?: PostUpstreamStatus | string;
  version: {
    title: string;
    description: string | null;
    publishedAt: Date | null;
    tagIds: string[];
    tierIds: string[];
    mediaIds: string[];
  };
  mediaAssets: Array<{
    id: string;
    currentMimeType: string | null;
    currentRole: string | null;
    currentStorageKey: string | null;
    upstreamStatus?: string | null;
  }>;
};

export type CommandLibraryItemsFromEffectiveInput = {
  creatorId: string;
  posts: readonly CommandLibraryLoadedPost[];
  overlays: Record<string, PostPresentationOverlay>;
  overrides: GalleryOverridesRoot;
  collections: readonly Collection[];
  summaries: ReadonlyMap<string, DistributionSummaryWire>;
};

function distributionSummaryForItem(
  postId: string,
  summary: DistributionSummaryWire | undefined
): CommandLibraryItem["distribution_summary"] {
  if (!summary) return undefined;
  return {
    post_id: postId,
    destinations: summary.destinations.map((d) => ({
      destination: d.destination,
      variant_status: d.variant_status,
      attempt_status: d.attempt_status,
      attempt_id: d.attempt_id,
      external_url: d.external_url,
      external_id: d.external_id ?? null
    }))
  };
}

/**
 * Pure Gallery-parity mapper used by the Prisma loader and unit tests (RC-P5-T02).
 * Empty content/preview/thumb paths are intentional — compact command records never carry media bytes.
 */
export function commandLibraryItemsFromEffectivePosts(
  input: CommandLibraryItemsFromEffectiveInput
): CommandLibraryItem[] {
  const postCollectionMap = new Map<string, string[]>();
  const postThemeTags = new Map<string, Set<string>>();
  for (const col of input.collections) {
    for (const pid of col.post_ids) {
      const arr = postCollectionMap.get(pid) ?? [];
      arr.push(col.collection_id);
      postCollectionMap.set(pid, arr);
      const themes = col.theme_tag_ids ?? [];
      if (themes.length === 0) continue;
      let set = postThemeTags.get(pid);
      if (!set) {
        set = new Set<string>();
        postThemeTags.set(pid, set);
      }
      for (const th of themes) {
        if (th.trim()) set.add(th.trim());
      }
    }
  }

  const items: CommandLibraryItem[] = [];
  for (const post of input.posts) {
    if (post.upstreamStatus === PostUpstreamStatus.deleted || post.upstreamStatus === "deleted") {
      continue;
    }
    const version = post.version;
    const overlay = input.overlays[post.id];
    const merged = mergePostPresentation(
      {
        title: version.title,
        description: version.description ?? undefined,
        media_ids: version.mediaIds.length > 0 ? version.mediaIds : post.mediaAssets.map((m) => m.id)
      },
      overlay ?? undefined
    );
    const baseTags = effectiveTags(version.tagIds, input.creatorId, post.id, input.overrides);
    const colIds = postCollectionMap.get(post.id) ?? [];
    const themeTagList = [...(postThemeTags.get(post.id) ?? [])];
    const summary = distributionSummaryForItem(post.id, input.summaries.get(post.id));
    const mediaById = new Map(post.mediaAssets.map((m) => [m.id, m]));
    const publish_state = asCommandPublishState(post.publishState);
    const creative_work_id = post.creativeWorkId?.trim() || undefined;

    let addedMedia = false;
    for (const mediaId of merged.media_ids_ordered) {
      const media = mediaById.get(mediaId);
      if (!media || media.upstreamStatus === "deleted") continue;
      const rowTags = galleryRowTags(baseTags, media.currentRole ?? undefined, media.id, false);
      const tags = applyMediaRowTagDelta(rowTags, input.creatorId, post.id, media.id, input.overrides);
      items.push({
        media_id: media.id,
        post_id: post.id,
        title: merged.title,
        description: merged.description,
        published_at: (version.publishedAt ?? post.createdAt).toISOString(),
        tag_ids: tags,
        tier_ids: [...version.tierIds],
        is_public: post.isPublic,
        mime_type: media.currentMimeType ?? undefined,
        media_role: media.currentRole ?? undefined,
        has_export: Boolean(media.currentStorageKey),
        processing_status: "READY",
        export_status: media.currentStorageKey ? "ready" : "missing",
        content_url_path: "",
        preview_url_path: "",
        thumb_url_path: "",
        visibility: resolveGalleryItemVisibility(input.creatorId, post.id, media.id, input.overrides),
        collection_ids: colIds,
        collection_theme_tag_ids: themeTagList,
        source: asCommandSource(post.source),
        publish_state,
        creative_work_id,
        distribution_summary: summary
      });
      addedMedia = true;
    }

    if (!addedMedia) {
      const syntheticId = `post_only_${post.id}`;
      items.push({
        media_id: syntheticId,
        post_id: post.id,
        title: merged.title,
        description: merged.description,
        published_at: (version.publishedAt ?? post.createdAt).toISOString(),
        tag_ids: applyMediaRowTagDelta(
          galleryRowTags(baseTags, undefined, syntheticId, true),
          input.creatorId,
          post.id,
          syntheticId,
          input.overrides
        ),
        tier_ids: [...version.tierIds],
        is_public: post.isPublic,
        mime_type: undefined,
        has_export: false,
        processing_status: "READY",
        export_status: "missing",
        content_url_path: "",
        preview_url_path: "",
        thumb_url_path: "",
        visibility: resolveGalleryItemVisibility(input.creatorId, post.id, syntheticId, input.overrides),
        collection_ids: colIds,
        collection_theme_tag_ids: themeTagList,
        source: asCommandSource(post.source),
        publish_state,
        creative_work_id,
        distribution_summary: summary
      });
    }
  }
  return items;
}

export type LoadCommandLibraryItemsOptions = {
  /** Default published-only. Drafts load only when a query explicitly asks for them. */
  includeDrafts?: boolean;
};

export async function loadCommandLibraryItemsFromDb(
  prisma: PrismaClient,
  creatorId: string,
  options: LoadCommandLibraryItemsOptions = {}
): Promise<CommandLibraryItem[]> {
  const includeDrafts = Boolean(options.includeDrafts);
  const posts = await prisma.post.findMany({
    where: {
      creatorId,
      publishState: includeDrafts
        ? { in: [PostPublishState.published, PostPublishState.draft] }
        : PostPublishState.published,
      upstreamStatus: { not: PostUpstreamStatus.deleted }
    },
    include: {
      versions: { orderBy: { versionSeq: "desc" }, take: 1 },
      mediaAssets: true,
      creativeWorkMember: { select: { creativeWorkId: true } }
    }
  });
  const [collections, overlays, overridesRoot] = await Promise.all([
    new DbCollectionsStore(prisma).listForCreator(creatorId),
    loadPostPresentationOverlaysFromDb(
      prisma,
      creatorId,
      posts.map((p) => p.id)
    ),
    new DbGalleryOverridesStore(prisma).loadForCreator(creatorId)
  ]);
  const summaries = await getDistributionSummariesForPosts(
    prisma,
    creatorId,
    posts.map((p) => p.id)
  );

  return commandLibraryItemsFromEffectivePosts({
    creatorId,
    posts: posts.flatMap((post) => {
      const version = post.versions[0];
      if (!version) return [];
      return [
        {
          id: post.id,
          source: post.source,
          isPublic: post.isPublic,
          createdAt: post.createdAt,
          publishState: post.publishState,
          creativeWorkId: post.creativeWorkMember?.creativeWorkId ?? null,
          upstreamStatus: post.upstreamStatus,
          version: {
            title: version.title,
            description: version.description,
            publishedAt: version.publishedAt,
            tagIds: version.tagIds,
            tierIds: version.tierIds,
            mediaIds: version.mediaIds
          },
          mediaAssets: post.mediaAssets.map((m) => ({
            id: m.id,
            currentMimeType: m.currentMimeType,
            currentRole: m.currentRole,
            currentStorageKey: m.currentStorageKey,
            upstreamStatus: m.upstreamStatus
          }))
        }
      ];
    }),
    overlays,
    overrides: overridesRoot,
    collections,
    summaries
  });
}
