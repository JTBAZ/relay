/**
 * @fileoverview Patron/session gates for gallery export URLs and tier-redacted item shaping.
 * @description Bridges clone tier rules + session identity to gallery rows and media export fetches.
 * @see ../identity/access-guard.js Post/session access checks
 * @see src/jsdoc-core-entities.ts Artist/Gallery/SyncStatus mapping notes
 */

import { evaluateTierRules, resolvePostAccessLevel } from "../clone/tier-rules.js";
import type { ClonePostEntry, CloneTierRule } from "../clone/types.js";
import { checkPostAccess } from "../identity/access-guard.js";
import type { SessionToken } from "../identity/types.js";
import type { CanonicalSnapshot, TierRow } from "../ingest/canonical-store.js";
import type { GalleryItem } from "./types.js";

/**
 * @description Whether the viewer may see full export paths for this gallery row (tier + session rules).
 * @param item Built gallery row.
 * @param creatorId Owning creator id for catalog partition.
 * @param session Patron/session token or null.
 * @param tierRules Evaluated tier ordering rules for this creator.
 * @param tierMap Canonical tier rows by id.
 * @returns True when export URLs should remain populated.
 * @security-audit-required No `tenant_id` parameter—callers must ensure `creatorId` and session binding match intended Relay tenant scope.
 */
export function patronMayViewGalleryExport(
  item: GalleryItem,
  creatorId: string,
  session: SessionToken | null,
  tierRules: CloneTierRule[],
  tierMap: Record<string, TierRow>
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
  return checkPostAccess(post, session, creatorId, tierMap).allowed;
}

/**
 * @description Returns the item unchanged when allowed; otherwise strips export URLs while retaining teaser metadata policy.
 * @param item Built gallery row.
 * @param creatorId Owning creator id.
 * @param session Patron/session token or null.
 * @param tierRules Tier ordering rules.
 * @param tierMap Canonical tier rows.
 * @returns Possibly redacted gallery item.
 * @security-audit-required Caller must enforce creator/session scope; tier map must correspond to same creator partition.
 */
export function redactGalleryItemExportIfLocked(
  item: GalleryItem,
  creatorId: string,
  session: SessionToken | null,
  tierRules: CloneTierRule[],
  tierMap: Record<string, TierRow>
): GalleryItem {
  if (patronMayViewGalleryExport(item, creatorId, session, tierRules, tierMap)) {
    return item;
  }
  return {
    ...item,
    has_export: false,
    export_status: "missing",
    content_url_path: "",
    thumb_url_path: "",
    export_error: undefined
  };
}

/**
 * @description Locates the canonical post id that owns `mediaId` for a creator (skips deleted posts).
 * @param snapshot Canonical snapshot.
 * @param creatorId Creator partition.
 * @param mediaId Media asset id.
 * @returns Post id or null when not attached.
 * @security-audit-required Caller supplies snapshot slice; ensure it matches authorized creator context.
 */
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

/**
 * @description Authorization decision for streaming an exported media blob (owner bypass via `isContentOwner`).
 * @param args.snapshot Canonical snapshot.
 * @param args.creatorId Content owner creator id.
 * @param args.mediaId Media id.
 * @param args.session Session token or null.
 * @param args.isContentOwner When true and session present, skips tier gate for creator preview.
 * @returns Allowed flag or denial reason string.
 * @security-audit-required `isContentOwner` must be set only after DB-verified account→creator binding; misuse leaks paid assets.
 */
export function patronMayFetchMediaExport(args: {
  snapshot: CanonicalSnapshot;
  creatorId: string;
  mediaId: string;
  session: SessionToken | null;
  /** Set by route when DB confirms session.account.primaryRelayCreatorId === creatorId. */
  isContentOwner?: boolean;
}): { allowed: true } | { allowed: false; reason: string } {
  const { snapshot, creatorId, mediaId, session, isContentOwner } = args;

  // Content owner: always allow — the creator must be able to load their own
  // full-resolution exports even when RELAY_EXPORT_REQUIRE_TIER_ACCESS=1.
  if (isContentOwner && session) {
    return { allowed: true };
  }

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
  const check = checkPostAccess(clonePost, session, creatorId, tiers);
  return check.allowed ? { allowed: true } : { allowed: false, reason: check.reason };
}
