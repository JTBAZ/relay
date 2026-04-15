/**
 * MIG-42 — When Patreon’s API is unavailable, Relay continues to enforce access from the last
 * materialized snapshot (`PatronEntitlementSnapshot` + session tier ids). Clients use
 * **`degraded`** + **`messaging`** to explain that data may be stale until refresh succeeds.
 */

export const PATRON_ENTITLEMENT_STALE_MESSAGING =
  "Tier access reflects Relay’s last successful Patreon-linked entitlement snapshot. If Patreon is unreachable, Relay keeps using that snapshot until it becomes stale—then refresh when the API is healthy.";

export const PATRON_ENTITLEMENT_FRESH_MESSAGING =
  "Entitlement snapshot is within its freshness window (see stale_after).";

export type PatronEntitlementHealthRow = {
  as_of: string;
  stale_after: string | null;
};

export type PatronEntitlementHealthPayload = {
  patron_entitlement: PatronEntitlementHealthRow | null;
  storage: "postgres" | "file";
  degraded: boolean;
  degraded_reason: "stale_snapshot" | "missing_snapshot" | null;
  messaging: string;
};

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
