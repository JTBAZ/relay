/**
 * Performance intelligence Phase 10a — optional gallery list enrichment with platform instances.
 * @see docs/analytics/UNIFIED_READ_V2.md
 */

import type { PrismaClient } from "@prisma/client";
import { platformInstanceRefreshEligibility } from "../analytics/platform-instance-refresh-service.js";
import { effectiveVariantRole } from "../analytics/work-crosspost-gaps.js";

export type GalleryPlatformInstanceSummaryWire = {
  platform_instance_id: string;
  destination: string;
  external_url: string | null;
  status: string;
  last_refreshed_at: string | null;
  variant_role: string;
  refresh_eligible: boolean;
};

export async function getGalleryPlatformInstanceSummariesForPosts(
  prisma: PrismaClient,
  creatorId: string,
  postIds: string[],
  asOf: Date = new Date()
): Promise<Map<string, GalleryPlatformInstanceSummaryWire[]>> {
  const normalizedCreatorId = creatorId.trim();
  const normalizedPostIds = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, GalleryPlatformInstanceSummaryWire[]>();
  if (!normalizedCreatorId || normalizedPostIds.length === 0) {
    return out;
  }

  const [instances, members] = await Promise.all([
    prisma.platformInstance.findMany({
      where: { creatorId: normalizedCreatorId, postId: { in: normalizedPostIds } },
      orderBy: [{ postId: "asc" }, { destination: "asc" }]
    }),
    prisma.creativeWorkMember.findMany({
      where: { creatorId: normalizedCreatorId, postId: { in: normalizedPostIds } },
      select: { postId: true, variantRole: true }
    })
  ]);

  const roleByPost = new Map(members.map((member) => [member.postId, member.variantRole]));

  for (const instance of instances) {
    const eligibility = platformInstanceRefreshEligibility(instance, asOf);
    const memberRole = roleByPost.get(instance.postId) ?? "standalone";
    const row: GalleryPlatformInstanceSummaryWire = {
      platform_instance_id: instance.id,
      destination: instance.destination,
      external_url: instance.externalUrl,
      status: instance.status,
      last_refreshed_at: instance.lastRefreshedAt?.toISOString() ?? null,
      variant_role: effectiveVariantRole(memberRole, instance.contentVariantRole),
      refresh_eligible: eligibility.refresh_eligible
    };
    const bucket = out.get(instance.postId) ?? [];
    bucket.push(row);
    out.set(instance.postId, bucket);
  }

  return out;
}
