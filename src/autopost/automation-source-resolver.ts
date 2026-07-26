/**
 * AUT-VS4-T02 — Latest-eligible Patreon source resolver for scheduled Automations.
 * Pure read: never mutates “last processed” state; eligibility is derived from rule runs.
 */

import type { PrismaClient } from "@prisma/client";
import { PostSource } from "@prisma/client";
import type { AutomationErrorCode } from "./automation-contract.js";

export type AutomationEligibleSource = {
  post_id: string;
  published_at: Date;
  media_ids: string[];
  has_image_media: boolean;
};

export type ResolveLatestEligiblePatreonPostResult =
  | { ok: true; source: AutomationEligibleSource }
  | {
      ok: false;
      code: Extract<
        AutomationErrorCode,
        "AUTOMATION_NO_ELIGIBLE_POST" | "AUTOMATION_SOURCE_MEDIA_REQUIRED"
      >;
      /** Present when the newest unprocessed post exists but lacks media. */
      source?: AutomationEligibleSource;
    };

const BLOCKING_RUN_STATUSES = [
  "pending",
  "materialized",
  "completed",
  "failed",
  "skipped",
  "expired"
] as const;

/**
 * Creator-scoped latest published Patreon post not already represented by a
 * non-cancelled distribution rule run for this owned rule.
 */
export async function resolveLatestEligiblePatreonPost(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    distributionRuleId: string;
    /** Cap candidate scan (newest-first after sort). */
    limit?: number;
  }
): Promise<ResolveLatestEligiblePatreonPostResult> {
  const limit = Math.max(1, Math.min(args.limit ?? 50, 100));

  const blockingRuns = await prisma.creatorDistributionRuleRun.findMany({
    where: {
      ruleId: args.distributionRuleId,
      creatorId: args.creatorId,
      status: { in: [...BLOCKING_RUN_STATUSES] }
    },
    select: { sourcePostId: true }
  });
  const usedPostIds = new Set(blockingRuns.map((r) => r.sourcePostId));

  const posts = await prisma.post.findMany({
    where: {
      creatorId: args.creatorId,
      source: PostSource.PATREON,
      publishState: "published",
      versions: { some: { publishedAt: { not: null } } }
    },
    select: {
      id: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { publishedAt: true, mediaIds: true }
      }
    },
    take: limit * 2
  });

  const candidates = posts
    .map((post) => {
      const version = post.versions[0];
      const publishedAt = version?.publishedAt ?? null;
      if (!publishedAt) return null;
      const mediaIds = Array.isArray(version?.mediaIds)
        ? version.mediaIds.filter((id): id is string => typeof id === "string")
        : [];
      return {
        post_id: post.id,
        published_at: publishedAt,
        media_ids: mediaIds,
        has_image_media: mediaIds.length > 0
      } satisfies AutomationEligibleSource;
    })
    .filter((row): row is AutomationEligibleSource => row != null)
    .sort((a, b) => b.published_at.getTime() - a.published_at.getTime())
    .slice(0, limit);

  for (const candidate of candidates) {
    if (usedPostIds.has(candidate.post_id)) continue;
    if (!candidate.has_image_media) {
      return {
        ok: false,
        code: "AUTOMATION_SOURCE_MEDIA_REQUIRED",
        source: candidate
      };
    }
    return { ok: true, source: candidate };
  }

  return { ok: false, code: "AUTOMATION_NO_ELIGIBLE_POST" };
}
