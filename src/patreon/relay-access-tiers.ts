/**
 * @fileoverview Synthetic Relay tier sentinel ids when Patreon payloads expose `is_public` / default patron scopes without discrete tier ids.
 * @description Used alongside ingest tier maps and entitlement bridging — not Patreon-origin ids.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `Tier`, `TenantMembership.tierIds` (canonical relay tier ids)
 */

/** Sentinel for public-visible content when upstream tier list is empty or unhelpful. */
export const RELAY_TIER_PUBLIC = "relay_tier_public";
/** Sentinel representing “any patron” gating tiers on Patreon. */
export const RELAY_TIER_ALL_PATRONS = "relay_tier_all_patrons";
