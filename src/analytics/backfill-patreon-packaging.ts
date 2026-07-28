/**
 * One-shot backfill: Creative Work membership + Patreon Platform Instance for ingested Patreon posts.
 * @see docs/analytics/CREATIVE_WORK_SCHEMA.md
 */

import { PostSource, type PrismaClient } from "@prisma/client";
import { ensureDefaultCreativeWorkForPost } from "./creative-work-service.js";
import { ensurePatreonPlatformInstanceForIngestedPost } from "./platform-instance-service.js";

export type BackfillPatreonPackagingResult = {
  scanned: number;
  creative_works_created: number;
  platform_instances_created: number;
  platform_instances_updated: number;
  skipped_non_patreon_id: number;
};

/**
 * Ensures packaging identity for every `source=PATREON` post (or `patreon_post_%` id).
 */
export async function backfillPatreonPackaging(
  prisma: PrismaClient,
  opts?: { creatorId?: string; batchSize?: number }
): Promise<BackfillPatreonPackagingResult> {
  const batchSize = Math.max(1, Math.min(opts?.batchSize ?? 100, 500));
  const creatorId = opts?.creatorId?.trim() || undefined;

  const result: BackfillPatreonPackagingResult = {
    scanned: 0,
    creative_works_created: 0,
    platform_instances_created: 0,
    platform_instances_updated: 0,
    skipped_non_patreon_id: 0
  };

  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.post.findMany({
      where: {
        ...(creatorId ? { creatorId } : {}),
        OR: [{ source: PostSource.PATREON }, { id: { startsWith: "patreon_post_" } }]
      },
      select: {
        id: true,
        creatorId: true,
        createdAt: true,
        versions: {
          orderBy: { versionSeq: "asc" },
          take: 1,
          select: { title: true, publishedAt: true }
        }
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      result.scanned += 1;
      const title = row.versions[0]?.title?.trim() || row.id;
      const linkedAt = row.versions[0]?.publishedAt ?? row.createdAt;

      const cw = await ensureDefaultCreativeWorkForPost(prisma, {
        postId: row.id,
        creatorId: row.creatorId,
        title,
        createdAt: linkedAt
      });
      if (cw.created) result.creative_works_created += 1;

      const pi = await ensurePatreonPlatformInstanceForIngestedPost(prisma, {
        postId: row.id,
        creatorId: row.creatorId,
        linkedAt
      });
      if (!pi) {
        result.skipped_non_patreon_id += 1;
      } else if (pi.created) {
        result.platform_instances_created += 1;
      } else {
        result.platform_instances_updated += 1;
      }
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < batchSize) break;
  }

  return result;
}
