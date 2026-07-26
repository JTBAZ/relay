/**
 * Local kit CMS mutations for tiers (EH-061).
 * Writes data/site.json only — productionSafe remains false.
 */

import type { AccessLevel, ClonePostEntry, CloneTierRule, SiteBundle } from "../contracts";
import { loadSiteBundleFromKit, saveSiteBundle } from "./posts";

export type UpsertTierInput = {
  tier_id: string;
  title?: string;
  access_level?: AccessLevel;
  amount_cents?: number | null;
  benefit_copy?: string | null;
  retired?: boolean;
};

export type UpsertTierResult =
  | { ok: true; tier: CloneTierRule; created: boolean; affected_posts: number }
  | { ok: false; reason: string };

const SAFE_ID_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

export function countPostsGatedByTier(
  posts: readonly ClonePostEntry[],
  tierId: string
): number {
  let n = 0;
  for (const p of posts) {
    if (p.access.level !== "tier_gated") continue;
    if (p.access.tier_ids.includes(tierId)) n += 1;
  }
  return n;
}

export function listActiveCatalogTiers(
  tiers: readonly CloneTierRule[]
): CloneTierRule[] {
  return tiers.filter((t) => t.retired !== true);
}

export function upsertTier(
  input: UpsertTierInput,
  kitDir = process.cwd()
): UpsertTierResult {
  const tierId = input.tier_id?.trim() ?? "";
  if (!SAFE_ID_RE.test(tierId)) {
    return { ok: false, reason: "invalid_tier_id" };
  }

  const bundle = loadSiteBundleFromKit(kitDir);
  const idx = bundle.tiers.findIndex((t) => t.tier_id === tierId);
  const existing = idx >= 0 ? bundle.tiers[idx] : null;

  const title =
    typeof input.title === "string" && input.title.trim().length > 0
      ? input.title.trim().slice(0, 200)
      : existing?.title;
  if (!title) {
    return { ok: false, reason: "title_required" };
  }

  const access_level =
    input.access_level ?? existing?.access_level ?? "tier_gated";
  if (
    access_level !== "public" &&
    access_level !== "member_only" &&
    access_level !== "tier_gated"
  ) {
    return { ok: false, reason: "invalid_access_level" };
  }

  const next: CloneTierRule = {
    tier_id: tierId,
    title,
    access_level
  };
  if (existing?.campaign_id) next.campaign_id = existing.campaign_id;

  const amount =
    input.amount_cents !== undefined
      ? input.amount_cents
      : existing?.amount_cents;
  if (amount !== undefined) next.amount_cents = amount;

  const benefit =
    input.benefit_copy !== undefined
      ? input.benefit_copy
      : existing?.benefit_copy;
  if (benefit !== undefined) {
    next.benefit_copy =
      benefit == null ? null : String(benefit).slice(0, 2_000);
  }

  const retired =
    input.retired !== undefined ? input.retired : existing?.retired;
  if (retired !== undefined) next.retired = retired;

  const tiers = [...bundle.tiers];
  if (idx >= 0) tiers[idx] = next;
  else tiers.push(next);

  const updated: SiteBundle = { ...bundle, tiers };
  saveSiteBundle(updated, kitDir);

  return {
    ok: true,
    tier: next,
    created: idx < 0,
    affected_posts: countPostsGatedByTier(bundle.posts, tierId)
  };
}

export function retireTier(
  tierId: string,
  retired: boolean,
  kitDir = process.cwd()
): UpsertTierResult {
  return upsertTier({ tier_id: tierId, retired }, kitDir);
}
