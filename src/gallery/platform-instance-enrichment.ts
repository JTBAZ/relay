/**
 * Performance intelligence Phase 10a — optional gallery list enrichment with platform instances.
 * @see docs/analytics/UNIFIED_READ_V2.md
 */

import type { PrismaClient } from "@prisma/client";
import { platformInstanceRefreshEligibility } from "../analytics/platform-instance-refresh-service.js";
import type { DistributionSummaryWire } from "../distribution/post-distribution-service.js";
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

const PRODUCT_DESTINATIONS = ["patreon", "x", "deviantart", "bluesky"] as const;

type ProductDestination = (typeof PRODUCT_DESTINATIONS)[number];

function isProductDestination(value: string): value is ProductDestination {
  return (PRODUCT_DESTINATIONS as readonly string[]).includes(value);
}

function emptyDistributionSummary(postId: string): DistributionSummaryWire {
  return {
    post_id: postId,
    destinations: PRODUCT_DESTINATIONS.map((destination) => ({
      destination,
      variant_status: null,
      attempt_status: null,
      attempt_id: null,
      external_url: null,
      external_id: null
    }))
  };
}

/**
 * Merge active Platform Instance URLs into a distribution summary for Active Posts pips.
 * Does not fabricate attempt rows: fills `external_url` when no posted attempt URL exists.
 * Returns null when neither distribution variants nor active instance URLs contribute.
 */
export function mergeActivePlatformInstancesIntoDistributionSummary(
  summary: DistributionSummaryWire | undefined,
  instances: GalleryPlatformInstanceSummaryWire[],
  postId: string
): DistributionSummaryWire | null {
  const activeUrlByDest = new Map<ProductDestination, string>();
  for (const instance of instances) {
    if (instance.status !== "active") continue;
    if (!isProductDestination(instance.destination)) continue;
    const url = instance.external_url?.trim();
    if (!url) continue;
    activeUrlByDest.set(instance.destination, url);
  }

  if (!summary && activeUrlByDest.size === 0) {
    return null;
  }

  const base = summary
    ? {
        post_id: summary.post_id,
        destinations: summary.destinations.map((row) => ({ ...row }))
      }
    : emptyDistributionSummary(postId);

  const byDest = new Map(base.destinations.map((row) => [row.destination, row]));
  for (const destination of PRODUCT_DESTINATIONS) {
    if (!byDest.has(destination)) {
      byDest.set(destination, {
        destination,
        variant_status: null,
        attempt_status: null,
        attempt_id: null,
        external_url: null,
        external_id: null
      });
    }
  }

  for (const [destination, instanceUrl] of activeUrlByDest) {
    const row = byDest.get(destination)!;
    const postedUrl =
      row.attempt_status === "posted" ? row.external_url?.trim() || null : null;
    if (postedUrl) {
      continue;
    }
    row.external_url = instanceUrl;
  }

  return {
    post_id: base.post_id,
    destinations: PRODUCT_DESTINATIONS.map(
      (destination) => byDest.get(destination)!
    )
  };
}

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
