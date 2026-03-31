import type { TierRow } from "../ingest/canonical-store.js";
import type { AccessLevel, CloneTierRule } from "./types.js";

export function evaluateTierRules(
  tiers: Record<string, TierRow>
): CloneTierRule[] {
  return Object.values(tiers).map((t) => ({
    tier_id: t.tier_id,
    title: t.title,
    access_level: "tier_gated" as AccessLevel,
    campaign_id: t.campaign_id
  }));
}

export function resolvePostAccessLevel(
  tierIds: string[],
  tierRules: CloneTierRule[]
): { level: AccessLevel; tier_ids: string[] } {
  if (tierIds.length === 0) {
    return { level: "public", tier_ids: [] };
  }
  const known = tierRules.filter((r) => tierIds.includes(r.tier_id));
  if (known.length === 0) {
    return { level: "member_only", tier_ids: [...tierIds] };
  }
  return { level: "tier_gated", tier_ids: known.map((r) => r.tier_id) };
}

export function canAccessPost(
  postAccess: { level: AccessLevel; tier_ids: string[] },
  userTierIds: string[]
): boolean {
  if (postAccess.level === "public") return true;
  if (postAccess.level === "member_only") return userTierIds.length > 0;
  return postAccess.tier_ids.some((t) => userTierIds.includes(t));
}
