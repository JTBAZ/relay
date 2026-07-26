/**
 * @fileoverview Owner collection detail — entitlement-aware entry hydration for gallery tiles.
 * @description Thumbnail URLs are included only when viewer_entitlement.state === "visible".
 */

import type { PrismaClient } from "@prisma/client";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type {
  PatronCollectionEntryWithViewerEntitlement,
  PatronCollectionRecord,
} from "../gallery/types.js";

const CREATOR_AVATAR_PLACEHOLDER = "/placeholder.svg?height=40&width=40";

export type PatronCollectionCreatorProfileInput = {
  username?: string | null;
  publicSlug?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type PatronCollectionDetailEntry = PatronCollectionEntryWithViewerEntitlement & {
  /** Source post title when available in canonical catalog. */
  source_post_title?: string;
  /** Source post description when available in canonical catalog. */
  source_post_description?: string;
  /** Media mime type when available in canonical catalog. */
  mime_type?: string;
  /** Thumbnail export path — only present when viewer may see the source post. */
  thumb_url_path?: string;
  /** Full export path — only present when viewer may see the source post. */
  content_url_path?: string;
  /** 1-based index of this media within its source post gallery. */
  source_media_index?: number;
  /** Total media count on the source post. */
  source_media_count?: number;
  /** Public creator handle for profile links. */
  creator_handle?: string;
  creator_display_name?: string;
  creator_avatar_url?: string;
};

export type PatronOwnerCollectionDetail = PatronCollectionRecord & {
  entry_count: number;
  entries: PatronCollectionDetailEntry[];
};

export type PatronCollectionMediaPosition = {
  source_media_index: number;
  source_media_count: number;
};

export function resolveMediaPositionInPost(
  mediaIds: ReadonlyArray<string> | undefined,
  mediaId: string
): PatronCollectionMediaPosition | null {
  if (!mediaIds?.length) {
    return null;
  }
  const idx = mediaIds.indexOf(mediaId);
  if (idx < 0) {
    return null;
  }
  return {
    source_media_index: idx + 1,
    source_media_count: mediaIds.length,
  };
}

export function creatorIdentityForCollectionEntry(
  relayCreatorId: string,
  profile?: PatronCollectionCreatorProfileInput | null
): { handle: string; displayName: string; avatarUrl: string } {
  const fallbackHandle = relayCreatorId.slice(0, 12) || "creator";
  const handle =
    profile?.username?.trim() ||
    profile?.publicSlug?.trim() ||
    fallbackHandle;
  const displayName =
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    profile?.publicSlug?.trim() ||
    fallbackHandle;
  const avatarUrl = profile?.avatarUrl?.trim() || CREATOR_AVATAR_PLACEHOLDER;
  return { handle, displayName, avatarUrl };
}

export async function loadCreatorProfilesForPatronCollection(
  prisma: PrismaClient,
  creatorIds: ReadonlyArray<string>
): Promise<Map<string, PatronCollectionCreatorProfileInput>> {
  const uniqueIds = [...new Set(creatorIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.creatorProfile.findMany({
    where: { tenant: { relayCreatorId: { in: uniqueIds } } },
    select: {
      username: true,
      publicSlug: true,
      displayName: true,
      avatarUrl: true,
      tenant: { select: { relayCreatorId: true } },
    },
  });
  const out = new Map<string, PatronCollectionCreatorProfileInput>();
  for (const row of rows) {
    const relayCreatorId = row.tenant.relayCreatorId?.trim();
    if (!relayCreatorId) continue;
    out.set(relayCreatorId, {
      username: row.username,
      publicSlug: row.publicSlug,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    });
  }
  return out;
}

function thumbUrlPathForMedia(
  creatorId: string,
  mediaId: string,
  mimeType: string | undefined
): string {
  if (!mimeType?.startsWith("image/")) {
    return "";
  }
  return `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/thumb`;
}

function contentUrlPathForMedia(creatorId: string, mediaId: string): string {
  return `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;
}

/**
 * Hydrates collection entries with canonical post/media metadata and thumbnail paths.
 * Locked entries never receive export paths even when mime type is known.
 */
export function hydratePatronCollectionDetailEntries(
  snapshot: CanonicalSnapshot,
  entries: ReadonlyArray<PatronCollectionEntryWithViewerEntitlement>,
  profileByCreator: ReadonlyMap<string, PatronCollectionCreatorProfileInput> = new Map()
): PatronCollectionDetailEntry[] {
  return entries.map((entry) => {
    const post = snapshot.posts[entry.creator_id]?.[entry.post_id];
    const media = snapshot.media[entry.creator_id]?.[entry.media_id];
    const mimeType = media?.current?.mime_type;
    const sourcePostTitle = post?.current?.title?.trim();
    const sourcePostDescription = post?.current?.description?.trim();
    const visible = entry.viewer_entitlement.state === "visible";
    const thumb = visible ? thumbUrlPathForMedia(entry.creator_id, entry.media_id, mimeType) : "";
    const position = resolveMediaPositionInPost(post?.current?.media_ids, entry.media_id);
    const creatorIdentity = creatorIdentityForCollectionEntry(
      entry.creator_id,
      profileByCreator.get(entry.creator_id)
    );

    const hydrated: PatronCollectionDetailEntry = { ...entry };
    if (sourcePostTitle) {
      hydrated.source_post_title = sourcePostTitle;
    }
    if (sourcePostDescription) {
      hydrated.source_post_description = sourcePostDescription;
    }
    if (mimeType) {
      hydrated.mime_type = mimeType;
    }
    if (thumb) {
      hydrated.thumb_url_path = thumb;
    }
    if (visible) {
      hydrated.content_url_path = contentUrlPathForMedia(entry.creator_id, entry.media_id);
    }
    if (position) {
      hydrated.source_media_index = position.source_media_index;
      hydrated.source_media_count = position.source_media_count;
    }
    hydrated.creator_handle = creatorIdentity.handle;
    hydrated.creator_display_name = creatorIdentity.displayName;
    hydrated.creator_avatar_url = creatorIdentity.avatarUrl;
    return hydrated;
  });
}

export function toPatronOwnerCollectionDetail(
  collection: PatronCollectionRecord & {
    entries: ReadonlyArray<PatronCollectionEntryWithViewerEntitlement>;
  },
  hydratedEntries: PatronCollectionDetailEntry[]
): PatronOwnerCollectionDetail {
  return {
    collection_id: collection.collection_id,
    user_id: collection.user_id,
    creator_id: collection.creator_id,
    title: collection.title,
    sort_order: collection.sort_order,
    created_at: collection.created_at,
    updated_at: collection.updated_at,
    is_public: collection.is_public,
    entry_count: hydratedEntries.length,
    entries: hydratedEntries,
  };
}
