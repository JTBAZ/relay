/**
 * @fileoverview Patron experience module comment-types.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 */
/**
 * PE-E (BO-P2-03) — shared types for the comment / moderation services. Kept in a tiny
 * leaf module so test stubs (`InMemoryGalleryOverridesStore`) can import only this without
 * pulling the prisma client.
 */

import type {
  CommentReactionKind,
  CommentVisibility,
  ContentReportStatus,
  ContentReportTargetKind,
  ModerationActionKind,
  ModerationActorKind,
  ModerationTargetKind
} from "@prisma/client";

import type { GalleryOverridesRoot } from "../gallery/types.js";

/**
 * Subset of `GalleryOverridesStore` (`src/gallery/overrides-store.ts`) that the comment-tag
 * service needs. We re-declare here so tests can stub without importing the file-system store.
 */
export interface GalleryOverridesStore {
  load(): Promise<GalleryOverridesRoot>;
  save(root: GalleryOverridesRoot): Promise<void>;
  mergePostTagDelta(
    creatorId: string,
    postId: string,
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void>;
  mergeBulkMediaTagDelta(
    creatorId: string,
    targets: { post_id: string; media_id: string }[],
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void>;
}

export interface CreateCommentInput {
  relayCreatorId: string;
  postId: string;
  patronUserId: string;
  body: string;
  mediaId?: string | null;
  /** 0-100 percentage; required when mediaId is set. */
  anchorX?: number | null;
  anchorY?: number | null;
  parentCommentId?: string | null;
  tagIds?: string[];
  requiredTierId?: string | null;
  visibility?: CommentVisibility;
}

export interface PatchCommentInput {
  body?: string;
  /** Adds tag ids; ignored if comment is no longer in the edit window. */
  tagIds?: string[];
}

export interface CommentRecord {
  id: string;
  relayCreatorId: string;
  postId: string;
  mediaId: string | null;
  anchorX: number | null;
  anchorY: number | null;
  patronUserId: string;
  body: string;
  parentCommentId: string | null;
  tagIds: string[];
  tagsRevokedByOwner: string[];
  creatorPinnedAt: Date | null;
  requiredTierId: string | null;
  visibility: CommentVisibility;
  autoModFlagsJson: unknown;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  modState: "visible" | "hidden" | "removed";
}

export interface ListCommentsOptions {
  /** When set, only return comments coordinate-anchored to this media id (non-null media_id rows). */
  mediaId?: string;
  /** When true, only return post-level rows (`media_id` IS NULL). Mutually exclusive with {@link mediaId} — enforced in HTTP handlers. */
  postLevelOnly?: boolean;
  /** When true, include hidden / removed comments (creator-only call sites). */
  includeModerated?: boolean;
  /**
   * Viewer's TenantMembership.tierIds for the relay_creator_id scope. Used to filter comments
   * that have a `requiredTierId`. When undefined, comments with a tier requirement are excluded.
   */
  viewerTierIds?: string[];
  /** Account ids the caller has blocked; their comments (and replies) are filtered out. */
  blockedAccountIds?: string[];
  /**
   * D14 - the AccountBlock semantics are FUTURE-only: we suppress comments authored AFTER
   * the block timestamp. Provide block records to get exact filtering; otherwise the cheaper
   * `blockedAccountIds` path treats all of their content as hidden.
   */
  blockEdges?: { blockedAccountId: string; createdAt: Date }[];
}

export type {
  CommentReactionKind,
  CommentVisibility,
  ContentReportStatus,
  ContentReportTargetKind,
  ModerationActionKind,
  ModerationActorKind,
  ModerationTargetKind
};
