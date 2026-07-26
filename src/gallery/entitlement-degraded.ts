/**
 * @fileoverview Patreon entitlement snapshot freshness messaging for degraded patron UX (MIG-42).
 * @description Builds wire payloads explaining stale vs fresh `PatronEntitlementSnapshot` rows.
 * @see prisma/schema.prisma Patron entitlement snapshot storage (conceptual)
 * @see src/jsdoc-core-entities.ts SyncStatus mapping notes
 */

/**
 * @description User-facing copy when tier data may be stale due to Patreon/API outage windows.
 */
export const PATRON_ENTITLEMENT_STALE_MESSAGING =
  "Tier access reflects Relay’s last successful Patreon-linked entitlement snapshot. If Patreon is unreachable, Relay keeps using that snapshot until it becomes stale—then refresh when the API is healthy.";

/**
 * @description Copy used when snapshot is within freshness window.
 */
export const PATRON_ENTITLEMENT_FRESH_MESSAGING =
  "Entitlement snapshot is within its freshness window (see stale_after).";

/**
 * @description Normalized health row for API wiring.
 */
export type PatronEntitlementHealthRow = {
  as_of: string;
  stale_after: string | null;
};

/**
 * @description Client payload combining snapshot metadata + degraded flags + messaging.
 */
export type PatronEntitlementHealthPayload = {
  patron_entitlement: PatronEntitlementHealthRow | null;
  storage: "postgres" | "file";
  degraded: boolean;
  degraded_reason: "stale_snapshot" | "missing_snapshot" | null;
  messaging: string;
};

/**
 * @description Computes patron entitlement health view from storage mode + optional DB row.
 * @param args.storage Persistence backend discriminator.
 * @param args.row Snapshot timestamps or null.
 * @param args.now Clock injection for tests.
 * @returns Payload for HTTP serializers.
 */
export function buildPatronEntitlementHealthPayload(args: {
  storage: "postgres" | "file";
  row: { asOf: Date; staleAfter: Date | null } | null;
  now?: Date;
}): PatronEntitlementHealthPayload {
  const now = args.now ?? new Date();
  if (args.storage === "file") {
    return {
      patron_entitlement: null,
      storage: "file",
      degraded: false,
      degraded_reason: null,
      messaging:
        "File-backed identity has no PatronEntitlementSnapshot rows; tier access follows the patron session only."
    };
  }
  if (!args.row) {
    return {
      patron_entitlement: null,
      storage: "postgres",
      degraded: true,
      degraded_reason: "missing_snapshot",
      messaging: PATRON_ENTITLEMENT_STALE_MESSAGING
    };
  }
  const stale =
    args.row.staleAfter != null && args.row.staleAfter.getTime() < now.getTime();
  return {
    patron_entitlement: {
      as_of: args.row.asOf.toISOString(),
      stale_after: args.row.staleAfter?.toISOString() ?? null
    },
    storage: "postgres",
    degraded: stale,
    degraded_reason: stale ? "stale_snapshot" : null,
    messaging: stale ? PATRON_ENTITLEMENT_STALE_MESSAGING : PATRON_ENTITLEMENT_FRESH_MESSAGING
  };
}
