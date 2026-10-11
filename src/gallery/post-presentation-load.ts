/**
 * @fileoverview Loads `PostPresentation` rows from Postgres for gallery merge.
 * @see prisma/schema.prisma `PostPresentation`
 * @see ./effective-presentation.js Overlay wire shape
 */

import { namingWorkSelect, scopedNamingWork, type NamingDb } from "../gallery-editor/naming.js";

import type { PostPresentationOverlay } from "./effective-presentation.js";

/**
 * @description Reads all presentation overlays for a creator as a `post_id → overlay` map.
 * @param prisma Shared Prisma client.
 * @param creatorId Creator partition key (`creatorId` column).
 * @returns Map suitable for `buildGalleryItems` merge step.
 * @async
 * @throws Rejects when Prisma query fails (DB unavailable, permission).
 * @security-audit-required Caller must ensure route authorized this `creatorId`; no separate `tenant_id` argument.
 */
export async function loadPostPresentationOverlaysFromDb(
  prisma: NamingDb,
  creatorId: string
): Promise<Record<string, PostPresentationOverlay>> {
  const rows = await prisma.postPresentation.findMany({
    where: { creatorId },
    select: {
      postId: true,
      titleMode: true,
      post: { select: { creatorId: true, creativeWorkMember: { select: { creatorId: true, creativeWork: { select: namingWorkSelect } } } } },
      relayTitle: true,
      relayDescription: true,
      mediaOrder: true,
      tierPreviewSettings: true,
      promoPreviewMediaId: true
    }
  });
  const out: Record<string, PostPresentationOverlay> = {};
  for (const r of rows) {
    if (r.post.creatorId !== creatorId) continue;
    out[r.postId] = {
      title_mode: r.titleMode,
      naming_work: scopedNamingWork(creatorId, r.post.creativeWorkMember),
      relay_title: r.relayTitle,
      relay_description: r.relayDescription,
      media_order: r.mediaOrder ?? [],
      tier_preview_settings: r.tierPreviewSettings ?? null,
      promo_preview_media_id: r.promoPreviewMediaId ?? null
    };
  }
  return out;
}
