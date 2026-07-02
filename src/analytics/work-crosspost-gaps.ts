/**
 * Performance intelligence Phase 10a — cross-post gap detection for creative works.
 * Powers blank platform cards ("Not on X yet") in studio packaging UI.
 * @see docs/analytics/UNIFIED_READ_V2.md
 */

import { DISTRIBUTION_DESTINATIONS } from "../distribution/platform-destinations.js";

const CANONICAL_ROLES = new Set(["full", "standalone"]);
const PROMO_ROLES = new Set(["teaser", "promo", "repost"]);

export type WorkCrosspostGapInputMember = {
  postId: string;
  variantRole: string;
};

export type WorkCrosspostGapInputInstance = {
  postId: string;
  destination: string;
  status: string;
  externalUrl: string | null;
};

export type PerformanceWorkCrosspostGapsWire = {
  present_destinations: string[];
  missing_destinations: string[];
  missing_teaser_destinations: string[];
  suggested_source_post_id: string | null;
};

function isPostedInstance(instance: WorkCrosspostGapInputInstance): boolean {
  if (instance.status === "unlinked") return false;
  if (instance.destination === "relay") return true;
  return Boolean(instance.externalUrl?.trim());
}

export function computeWorkCrosspostGaps(
  members: WorkCrosspostGapInputMember[],
  instances: WorkCrosspostGapInputInstance[]
): PerformanceWorkCrosspostGapsWire {
  const roleByPost = new Map(members.map((member) => [member.postId, member.variantRole]));
  const presentDestinations = new Set<string>();
  const promoDestinations = new Set<string>();

  for (const instance of instances) {
    if (!isPostedInstance(instance)) continue;
    if (instance.destination === "relay") continue;

    presentDestinations.add(instance.destination);
    const role = roleByPost.get(instance.postId) ?? "standalone";
    if (PROMO_ROLES.has(role)) {
      promoDestinations.add(instance.destination);
    }
  }

  const missing_destinations = DISTRIBUTION_DESTINATIONS.filter(
    (destination) => !presentDestinations.has(destination)
  );

  const hasPromoMembers = members.some((member) => PROMO_ROLES.has(member.variantRole));
  const missing_teaser_destinations =
    hasPromoMembers && presentDestinations.size > 0
      ? DISTRIBUTION_DESTINATIONS.filter((destination) => !promoDestinations.has(destination))
      : [];

  const suggestedSource =
    members.find((member) => CANONICAL_ROLES.has(member.variantRole)) ??
    members[0] ??
    null;

  return {
    present_destinations: [...presentDestinations].sort(),
    missing_destinations,
    missing_teaser_destinations,
    suggested_source_post_id: suggestedSource?.postId ?? null
  };
}
