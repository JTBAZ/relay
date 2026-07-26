/**
 * Owner-only Promo Pool membership markers for gallery list rows.
 * Visitor/patron DTOs must never receive these fields.
 */

import type { PrismaClient } from "@prisma/client";
import type { GalleryItem } from "../gallery/types.js";

export type PromoPieceMarker = {
  promo_piece_id: string;
  promo_slot_rank: 1 | 2 | 3 | 4 | 5;
};

/**
 * Load a map of post_id → promo marker for the creator's current Promo Pool.
 * Media targets resolve via MediaAsset.primaryPostId when present.
 */
export async function loadPromoPieceMarkersByPostId(
  prisma: PrismaClient,
  creatorId: string
): Promise<Map<string, PromoPieceMarker>> {
  const rows = await prisma.creatorPromoSlot.findMany({
    where: { creatorId },
    select: {
      id: true,
      slotRank: true,
      targetKind: true,
      targetId: true
    }
  });
  if (rows.length === 0) return new Map();

  const mediaIds = rows.filter((r) => r.targetKind === "media").map((r) => r.targetId);
  const mediaRows =
    mediaIds.length > 0
      ? await prisma.mediaAsset.findMany({
          where: { id: { in: mediaIds }, creatorId },
          select: { id: true, primaryPostId: true }
        })
      : [];
  const mediaPostById = new Map(
    mediaRows
      .filter((m) => Boolean(m.primaryPostId))
      .map((m) => [m.id, m.primaryPostId!] as const)
  );

  const byPost = new Map<string, PromoPieceMarker>();
  for (const row of rows) {
    const postId =
      row.targetKind === "post"
        ? row.targetId
        : mediaPostById.get(row.targetId);
    if (!postId) continue;
    // First (lowest rank) wins if multiple media slots map to same post.
    if (byPost.has(postId)) continue;
    byPost.set(postId, {
      promo_piece_id: row.id,
      promo_slot_rank: row.slotRank as 1 | 2 | 3 | 4 | 5
    });
  }
  return byPost;
}

/** Attach owner-only promo markers; never call for visitor_catalog responses. */
export function applyOwnerPromoPieceMarkers(
  items: GalleryItem[],
  markersByPostId: Map<string, PromoPieceMarker>
): GalleryItem[] {
  if (markersByPostId.size === 0) return items;
  return items.map((item) => {
    const marker = markersByPostId.get(item.post_id);
    if (!marker) {
      return {
        ...item,
        is_promo_piece: false,
        promo_piece_id: undefined,
        promo_slot_rank: undefined
      };
    }
    return {
      ...item,
      is_promo_piece: true,
      promo_piece_id: marker.promo_piece_id,
      promo_slot_rank: marker.promo_slot_rank
    };
  });
}
