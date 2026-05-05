import type { PrismaClient } from "@prisma/client";

import type { PostPresentationOverlay } from "./effective-presentation.js";

/**
 * Load all `PostPresentation` rows for a creator as a post_id → overlay map for gallery merge.
 */
export async function loadPostPresentationOverlaysFromDb(
  prisma: PrismaClient,
  creatorId: string
): Promise<Record<string, PostPresentationOverlay>> {
  const rows = await prisma.postPresentation.findMany({
    where: { creatorId },
    select: {
      postId: true,
      relayTitle: true,
      relayDescription: true,
      mediaOrder: true,
      tierPreviewSettings: true
    }
  });
  const out: Record<string, PostPresentationOverlay> = {};
  for (const r of rows) {
    out[r.postId] = {
      relay_title: r.relayTitle,
      relay_description: r.relayDescription,
      media_order: r.mediaOrder ?? [],
      tier_preview_settings: r.tierPreviewSettings ?? null
    };
  }
  return out;
}
