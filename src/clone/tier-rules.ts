import type { TierRow } from "../ingest/canonical-store.js";
import {
  RELAY_TIER_ALL_PATRONS,
  RELAY_TIER_PUBLIC
} from "../patreon/relay-access-tiers.js";
import type { AccessLevel, CloneTierRule } from "./types.js";

export function evaluateTierRules(
  tiers: Record<string, TierRow>
): CloneTierRule[] {
  return Object.values(tiers)
    .filter((t) => !t.tier_id.startsWith("relay_tier_"))
    .map((t) => ({
      tier_id: t.tier_id,
      title: t.title,
      access_level: "tier_gated" as AccessLevel,
      campaign_id: t.campaign_id
    }));
}

/**
 * Patron-Experience tier-rules: distinguishes Patreon's three "free" concepts so the
 * `member_only` / `tier_gated` gates don't conflate them. See
 * `docs/Patron_Experience_*.md` for the canonical audience-mode mapping.
 *
 * - **Public** posts (`relay_tier_public`) — anyone, including non-followers.
 * - **Free Tier members** — Patreon members at a $0 tier; per Patreon's UI ("All Tiers"
 *   under "Paid access" intentionally excludes Free Tiers, see image 2 in the design doc),
 *   they are NOT considered "patrons" for `member_only` / `all_patrons` purposes.
 * - **Free followers** — `patron_status === null`; entitled tier list is empty.
 *
 * `amount_cents` is the source of truth when present (`> 0` ⇒ paid). When the catalog
 * still has the legacy null amount (P1 ingest gap), fall back to a tier-title heuristic
 * to avoid letting Free Tier members through. Defaults to *paid* on ambiguity so a real
 * paying patron whose `amount_cents` was never synced doesn't get locked out.
 */
const FREE_TIER_TITLE_RE = /^\s*(free(\s*tier|\s*member|\s*access|\s*follower)?)\s*$/i;

export function isFreeTier(row: TierRow | undefined): boolean {
  if (!row) return false;
  const amt = row.amount_cents;
  if (typeof amt === "number" && Number.isFinite(amt)) {
    return amt <= 0;
  }
  // amount_cents unknown — only treat as free when the title is unambiguous.
  return typeof row.title === "string" && FREE_TIER_TITLE_RE.test(row.title);
}

/**
 * Filter a user's entitled tier ids down to ones that count as a *paid pledge*. Drops:
 * - Synthetic markers (`relay_tier_*` should never appear on a user, but defensive).
 * - Patreon Free Tier ids (per {@link isFreeTier}).
 * - Tier ids absent from the catalog (creator hasn't synced that tier yet — conservative
 *   default is to **keep** them so a paying patron isn't denied due to catalog lag).
 */
export function paidUserTierIds(
  userTierIds: readonly string[],
  tierCatalog: Record<string, TierRow>
): string[] {
  const out: string[] = [];
  for (const id of userTierIds) {
    if (id === RELAY_TIER_PUBLIC || id === RELAY_TIER_ALL_PATRONS) continue;
    const row = tierCatalog[id];
    if (row && isFreeTier(row)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Pledge floor for ordering (cents). Synthetic tiers: public = 0, all_patrons = 1.
 * Unknown Patreon tier rows return `null` (fall back to id match in gate checks).
 */
export function tierFloorCents(
  tiers: Record<string, TierRow>,
  tierId: string
): number | null {
  if (tierId === RELAY_TIER_PUBLIC) return 0;
  if (tierId === RELAY_TIER_ALL_PATRONS) return 1;
  const row = tiers[tierId];
  const n = row?.amount_cents;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return null;
}

/**
 * “Tier or higher” semantics: for each required tier, the patron qualifies if they hold
 * **that** tier id **or** any tier whose pledge floor is **≥** the required floor (when both floors are known).
 */
export function userMeetsTierGatesWithOrdering(
  requiredTierIds: string[],
  userTierIds: string[],
  tiers: Record<string, TierRow>
): boolean {
  if (requiredTierIds.length === 0) return false;
  for (const req of requiredTierIds) {
    const reqFloor = tierFloorCents(tiers, req);
    for (const uid of userTierIds) {
      if (uid === req) return true;
      const uFloor = tierFloorCents(tiers, uid);
      if (reqFloor !== null && uFloor !== null && uFloor >= reqFloor) return true;
    }
  }
  return false;
}

export function resolvePostAccessLevel(
  tierIds: string[],
  tierRules: CloneTierRule[]
): { level: AccessLevel; tier_ids: string[] } {
  const synthPublic = tierIds.includes(RELAY_TIER_PUBLIC);
  const synthPatrons = tierIds.includes(RELAY_TIER_ALL_PATRONS);
  const patreonOnly = tierIds.filter(
    (t) => t !== RELAY_TIER_PUBLIC && t !== RELAY_TIER_ALL_PATRONS
  );

  if (patreonOnly.length === 0) {
    if (synthPublic && !synthPatrons) {
      return { level: "public", tier_ids: [] };
    }
    if (synthPatrons && !synthPublic) {
      return { level: "member_only", tier_ids: [] };
    }
  }

  if (tierIds.length === 0) {
    return { level: "member_only", tier_ids: [] };
  }
  const known = tierRules.filter((r) => tierIds.includes(r.tier_id));
  if (known.length === 0) {
    return { level: "member_only", tier_ids: [...tierIds] };
  }
  return { level: "tier_gated", tier_ids: known.map((r) => r.tier_id) };
}

export function canAccessPost(
  postAccess: { level: AccessLevel; tier_ids: string[] },
  userTierIds: string[],
  tierCatalog?: Record<string, TierRow>
): boolean {
  if (postAccess.level === "public") return true;
  // Per Patreon UI semantics ("All Tiers" excludes Free Tiers), `member_only` and
  // `tier_gated` both require the user to hold a *paid* tier. Without a catalog we
  // fall back to the raw user tier list (catalog absence == we can't safely filter,
  // so behave like the pre-PE-C check).
  const paid = tierCatalog
    ? paidUserTierIds(userTierIds, tierCatalog)
    : [...userTierIds];

  if (postAccess.level === "member_only") return paid.length > 0;
  if (
    tierCatalog &&
    Object.keys(tierCatalog).length > 0 &&
    postAccess.tier_ids.length > 0
  ) {
    // Special case: when the post requires a Free Tier explicitly (creator selected it
    // in Patreon's UI), Free Tier members of that exact tier should still be granted
    // access — fall back to a direct id-match check that uses the *raw* userTierIds.
    if (postAccess.tier_ids.some((t) => isFreeTier(tierCatalog[t]))) {
      if (postAccess.tier_ids.some((t) => userTierIds.includes(t))) return true;
    }
    return userMeetsTierGatesWithOrdering(
      postAccess.tier_ids,
      paid,
      tierCatalog
    );
  }
  // No catalog or no required tier ids — direct id-match against the raw list so that
  // explicit Free-Tier-required posts still work, but `member_only` (handled above) does
  // not.
  return postAccess.tier_ids.some((t) => userTierIds.includes(t));
}
