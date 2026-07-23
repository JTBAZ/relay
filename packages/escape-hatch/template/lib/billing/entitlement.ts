/**
 * Apply normalized billing lifecycle → EH-032 entitlement snapshots (EH-050).
 *
 * Grants always use `source: "billing"`. Provider client payloads are never
 * accepted as grants — only NormalizedBillingLifecycleEvent / BillingEntitlementEvent.
 */

import { computeDefaultStaleAfter } from "../entitlements/freshness";
import type { EntitlementSnapshot } from "../identity/types";
import type {
  BillingEntitlementEvent,
  NormalizedBillingLifecycleEvent
} from "./types";

export type BillingEntitlementStore = {
  upsertEntitlementSnapshot(snapshot: EntitlementSnapshot): Promise<void>;
  getEntitlementSnapshot(
    siteId: string,
    authUserId: string
  ): Promise<EntitlementSnapshot | null>;
};

export type ApplyBillingEntitlementResult =
  | {
      ok: true;
      event: BillingEntitlementEvent;
      snapshot: EntitlementSnapshot;
      applied: boolean;
      duplicate: boolean;
    }
  | { ok: false; reason: string };

/** In-memory idempotency + snapshot store for unit tests / preview. */
export function createMemoryBillingEntitlementStore(): BillingEntitlementStore & {
  seenEventIds: Set<string>;
  snapshots: Map<string, EntitlementSnapshot>;
} {
  const snaps = new Map<string, EntitlementSnapshot>();
  const seenEventIds = new Set<string>();
  const key = (siteId: string, authUserId: string) => `${siteId}::${authUserId}`;
  return {
    seenEventIds,
    snapshots: snaps,
    async upsertEntitlementSnapshot(snapshot) {
      snaps.set(key(snapshot.siteId, snapshot.authUserId), {
        ...snapshot,
        tierIds: [...snapshot.tierIds]
      });
    },
    async getEntitlementSnapshot(siteId, authUserId) {
      const s = snaps.get(key(siteId, authUserId));
      return s ? { ...s, tierIds: [...s.tierIds] } : null;
    }
  };
}

function uniqueTiers(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Map a normalized lifecycle event into a billing entitlement event.
 * Fail closed when auth user or site is missing for grant-bearing events.
 */
export function lifecycleToEntitlementEvent(
  lifecycle: NormalizedBillingLifecycleEvent,
  opts?: { nowMs?: number }
): BillingEntitlementEvent | { error: string } {
  if (!lifecycle || typeof lifecycle !== "object") {
    return { error: "missing_lifecycle_event" };
  }
  if (!lifecycle.siteId || typeof lifecycle.siteId !== "string") {
    return { error: "missing_site_id" };
  }
  if (!lifecycle.authUserId || typeof lifecycle.authUserId !== "string") {
    return { error: "missing_auth_user_id" };
  }
  if (!lifecycle.id || typeof lifecycle.id !== "string") {
    return { error: "missing_lifecycle_event_id" };
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const observedAt = lifecycle.occurredAt || new Date(nowMs).toISOString();
  const tierIds = uniqueTiers(lifecycle.tierIds);

  const revokeTypes = new Set([
    "subscription.canceled",
    "subscription.past_due",
    "invoice.payment_failed",
    "subscription.paused"
  ]);

  const isRevoke =
    revokeTypes.has(lifecycle.type) ||
    lifecycle.status === "canceled" ||
    lifecycle.status === "past_due" ||
    lifecycle.status === "unpaid" ||
    lifecycle.status === "paused";

  if (isRevoke) {
    return {
      kind: "revoke",
      source: "billing",
      siteId: lifecycle.siteId,
      authUserId: lifecycle.authUserId,
      tierIds,
      observedAt,
      staleAfter: computeDefaultStaleAfter("billing", observedAt),
      expiresAt: lifecycle.currentPeriodEndIso,
      revokedAt: observedAt,
      reason:
        lifecycle.reason ??
        `Billing lifecycle ${lifecycle.type} → revoke (status=${lifecycle.status})`,
      lifecycleEventId: lifecycle.id,
      customerId: lifecycle.customerId,
      subscriptionId: lifecycle.subscriptionId
    };
  }

  return {
    kind: tierIds.length > 0 ? "grant" : "update",
    source: "billing",
    siteId: lifecycle.siteId,
    authUserId: lifecycle.authUserId,
    tierIds,
    observedAt,
    staleAfter: computeDefaultStaleAfter("billing", observedAt),
    expiresAt: lifecycle.currentPeriodEndIso,
    revokedAt: null,
    reason:
      lifecycle.reason ??
      `Billing lifecycle ${lifecycle.type} → grant (status=${lifecycle.status})`,
    lifecycleEventId: lifecycle.id,
    customerId: lifecycle.customerId,
    subscriptionId: lifecycle.subscriptionId
  };
}

export function entitlementEventToSnapshot(
  event: BillingEntitlementEvent
): EntitlementSnapshot {
  const revoked = event.kind === "revoke" || Boolean(event.revokedAt);
  return {
    siteId: event.siteId,
    authUserId: event.authUserId,
    tierIds: revoked ? [] : uniqueTiers(event.tierIds),
    source: "billing",
    reason: event.reason,
    observedAt: event.observedAt,
    staleAfter: event.staleAfter,
    expiresAt: event.expiresAt,
    revokedAt: revoked ? event.revokedAt ?? event.observedAt : null
  };
}

export type ApplyBillingEntitlementArgs = {
  store: BillingEntitlementStore;
  /** Prefer normalized lifecycle; alternatively pass a pre-built entitlement event. */
  lifecycle?: NormalizedBillingLifecycleEvent;
  event?: BillingEntitlementEvent;
  /** Optional process-local idempotency set (tests). */
  seenEventIds?: Set<string>;
  nowMs?: number;
};

/**
 * Upsert entitlement snapshot from a normalized billing event.
 * Idempotent by lifecycleEventId when seenEventIds is provided.
 */
export async function applyBillingEntitlementEvent(
  args: ApplyBillingEntitlementArgs
): Promise<ApplyBillingEntitlementResult> {
  let event = args.event;
  if (!event && args.lifecycle) {
    const mapped = lifecycleToEntitlementEvent(args.lifecycle, {
      nowMs: args.nowMs
    });
    if ("error" in mapped) {
      return { ok: false, reason: mapped.error };
    }
    event = mapped;
  }
  if (!event) {
    return { ok: false, reason: "missing_event" };
  }
  if (event.source !== "billing") {
    return { ok: false, reason: "invalid_source" };
  }
  if (!event.authUserId || !event.siteId) {
    return { ok: false, reason: "missing_identity" };
  }

  const seen = args.seenEventIds;
  if (seen) {
    if (seen.has(event.lifecycleEventId)) {
      const existing = await args.store.getEntitlementSnapshot(
        event.siteId,
        event.authUserId
      );
      if (!existing) {
        return { ok: false, reason: "duplicate_without_snapshot" };
      }
      return {
        ok: true,
        event,
        snapshot: existing,
        applied: false,
        duplicate: true
      };
    }
    seen.add(event.lifecycleEventId);
  }

  const snapshot = entitlementEventToSnapshot(event);
  await args.store.upsertEntitlementSnapshot(snapshot);
  return {
    ok: true,
    event,
    snapshot,
    applied: true,
    duplicate: false
  };
}

/**
 * Build a billing-sourced EntitlementSnapshot helper (mirrors Patreon helper).
 */
export function buildBillingEntitlementSnapshot(args: {
  siteId: string;
  authUserId: string;
  tierIds: readonly string[];
  observedAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  reason?: string;
}): EntitlementSnapshot {
  const observedAt = args.observedAt ?? new Date().toISOString();
  return {
    siteId: args.siteId,
    authUserId: args.authUserId,
    tierIds: uniqueTiers(args.tierIds),
    source: "billing",
    reason: args.reason ?? "Independent site billing entitlement (normalized).",
    observedAt,
    staleAfter: computeDefaultStaleAfter("billing", observedAt),
    expiresAt: args.expiresAt ?? null,
    revokedAt: args.revokedAt ?? null
  };
}
