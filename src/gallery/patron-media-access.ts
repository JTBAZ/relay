import { evaluateTierRules, resolvePostAccessLevel } from "../clone/tier-rules.js";
import type { ClonePostEntry, CloneTierRule } from "../clone/types.js";
import { checkPostAccess } from "../identity/access-guard.js";
import type { SessionToken } from "../identity/types.js";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { GalleryItem } from "./types.js";

export function patronMayViewGalleryExport(
  item: GalleryItem,
  creatorId: string,
  session: SessionToken | null,
  tierRules: CloneTierRule[]
): boolean {
  const access = resolvePostAccessLevel(item.tier_ids, tierRules);
  const post: ClonePostEntry = {
    post_id: item.post_id,
    slug: "",
    title: item.title,
    published_at: item.published_at,
    tag_ids: item.tag_ids,
    access,
    media: []
  };
  return checkPostAccess(post, session, creatorId).allowed;
}

export function redactGalleryItemExportIfLocked(
  item: GalleryItem,
  creatorId: string,
  session: SessionToken | null,
  tierRules: CloneTierRule[]
): GalleryItem {
  if (patronMayViewGalleryExport(item, creatorId, session, tierRules)) {
    return item;
  }
  return {
    ...item,
    has_export: false,
    export_status: "missing",
    content_url_path: "",
    export_error: undefined
  };
}

export function findPostIdForExportedMedia(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  mediaId: string
): string | null {
  const posts = snapshot.posts[creatorId] ?? {};
  for (const [postId, row] of Object.entries(posts)) {
    if (row.upstream_status === "deleted") {
      continue;
    }
    if (row.current.media_ids.includes(mediaId)) {
      return postId;
    }
  }
  return null;
}

export function patronMayFetchMediaExport(args: {
  snapshot: CanonicalSnapshot;
  creatorId: string;
  mediaId: string;
  session: SessionToken | null;
}): { allowed: true } | { allowed: false; reason: string } {
  const { snapshot, creatorId, mediaId, session } = args;
  const postId = findPostIdForExportedMedia(snapshot, creatorId, mediaId);
  if (!postId) {
    return { allowed: false, reason: "Media not found in catalog." };
  }
  const post = snapshot.posts[creatorId]?.[postId];
  if (!post || post.upstream_status === "deleted") {
    return { allowed: false, reason: "Post not found." };
  }
  const tiers = snapshot.tiers[creatorId] ?? {};
  const tierRules = evaluateTierRules(tiers);
  const access = resolvePostAccessLevel(post.current.tier_ids, tierRules);
  const clonePost: ClonePostEntry = {
    post_id: postId,
    slug: "",
    title: post.current.title,
    published_at: post.current.published_at,
    tag_ids: [...post.current.tag_ids],
    access,
    media: []
  };
  const check = checkPostAccess(clonePost, session, creatorId);
  return check.allowed ? { allowed: true } : { allowed: false, reason: check.reason };
}
