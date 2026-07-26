/**
 * Normalize Stripe-like (or Relay billing) webhook payloads → entitlement updates.
 * Idempotent by event id. No live Stripe network.
 */

import {
  computeLastServiceDateIso,
  mapStripeSubscriptionStatus,
  refreshBillingStateForNow
} from "./entitlement.js";
import type { ManagedVerifyAddonProduct } from "./types.js";
import type { ManagedVerifyBillingStore } from "./store.js";
import type {
  ManagedVerifyBillingRecord,
  ManagedVerifyBillingState,
  ManagedVerifyBillingWebhookApplyResult,
  ManagedVerifyBillingWebhookEvent
} from "./types.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function metaString(
  meta: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  if (!meta) return null;
  const v = meta[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function unixToIso(sec: unknown): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

function collectPriceIds(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectPriceIds(item, out);
    return;
  }
  const rec = obj as Record<string, unknown>;
  if (typeof rec.price === "string") out.add(rec.price);
  const priceObj = asRecord(rec.price);
  if (priceObj && typeof priceObj.id === "string") out.add(priceObj.id);
  if (typeof rec.price_id === "string") out.add(rec.price_id);
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") collectPriceIds(v, out);
  }
}

function matchesAddon(
  payload: Record<string, unknown>,
  product: ManagedVerifyAddonProduct
): boolean {
  const data = asRecord(payload.data);
  const object = data ? asRecord(data.object) : null;
  const meta =
    asRecord(object?.metadata) ??
    asRecord((asRecord(object?.subscription_details) as Record<string, unknown> | null)?.metadata);

  const sku =
    metaString(meta, "sku") ??
    metaString(meta, "relay_addon_sku") ??
    metaString(meta, "escape_hatch_addon");
  if (sku === product.sku || sku === "managed_patreon_connector") return true;

  if (metaString(meta, "relay_managed_verify") === "1") return true;
  if (metaString(meta, "product") === product.sku) return true;

  if (product.stripePriceId) {
    const prices = new Set<string>();
    collectPriceIds(object, prices);
    // Also scan items / lines
    collectPriceIds(object?.items, prices);
    collectPriceIds(object?.lines, prices);
    if (prices.has(product.stripePriceId)) return true;
  }

  // Explicit type tags used by Relay billing fixtures
  const type = typeof payload.type === "string" ? payload.type : "";
  if (type.startsWith("escape_hatch.managed_verify.")) return true;

  return false;
}

/**
 * Normalize a parsed JSON webhook body into a billing event.
 * Accepts Stripe Event shape or a slim Relay fixture shape.
 */
export function normalizeManagedVerifyBillingWebhook(
  payload: unknown,
  product: ManagedVerifyAddonProduct
): ManagedVerifyBillingWebhookEvent | { error: string } {
  const root = asRecord(payload);
  if (!root) return { error: "invalid_json" };
  const id = typeof root.id === "string" ? root.id.trim() : "";
  if (!id) return { error: "missing_event_id" };
  const type = typeof root.type === "string" ? root.type.trim() : "";
  if (!type) return { error: "missing_event_type" };
  const createdUnix =
    typeof root.created === "number" && Number.isFinite(root.created)
      ? root.created
      : Math.floor(Date.now() / 1000);

  const data = asRecord(root.data);
  const object = data ? asRecord(data.object) : null;
  const meta = asRecord(object?.metadata);

  const siteId =
    metaString(meta, "site_id") ??
    metaString(meta, "escape_hatch_site_id") ??
    metaString(meta, "relay_site_id");
  const creatorId =
    metaString(meta, "relay_creator_id") ??
    metaString(meta, "creator_id") ??
    metaString(meta, "relay_account_id");

  let subscriptionId: string | null = null;
  let subscriptionStatus: string | null = null;
  let currentPeriodEndIso: string | null = null;

  if (object) {
    if (typeof object.id === "string" && type.includes("subscription")) {
      subscriptionId = object.id;
    }
    if (typeof object.subscription === "string") {
      subscriptionId = object.subscription;
    }
    const subDetails = asRecord(object.subscription_details);
    if (typeof subDetails?.subscription === "string") {
      subscriptionId = subDetails.subscription;
    }
    if (typeof object.status === "string") {
      subscriptionStatus = object.status;
    }
    currentPeriodEndIso =
      unixToIso(object.current_period_end) ??
      unixToIso(object.cancel_at) ??
      (typeof object.current_period_end_iso === "string"
        ? object.current_period_end_iso
        : null);
  }

  // Slim fixture: top-level fields
  if (!siteId && typeof root.site_id === "string") {
    // allow top-level for non-Stripe fixtures
  }
  const siteIdFinal =
    siteId ??
    (typeof root.site_id === "string" ? root.site_id.trim() : null);
  const creatorIdFinal =
    creatorId ??
    (typeof root.creator_id === "string" ? root.creator_id.trim() : null);
  if (!subscriptionId && typeof root.subscription_id === "string") {
    subscriptionId = root.subscription_id.trim();
  }
  if (!subscriptionStatus && typeof root.subscription_status === "string") {
    subscriptionStatus = root.subscription_status.trim();
  }
  if (!currentPeriodEndIso && typeof root.current_period_end_iso === "string") {
    currentPeriodEndIso = root.current_period_end_iso;
  }

  const matches =
    matchesAddon(root, product) ||
    (typeof root.matches_addon === "boolean" && root.matches_addon === true) ||
    // Fixtures that set sku at top level
    (typeof root.sku === "string" && root.sku === product.sku);

  return {
    id,
    type,
    createdUnix,
    siteId: siteIdFinal,
    creatorId: creatorIdFinal,
    subscriptionId,
    subscriptionStatus,
    currentPeriodEndIso,
    matchesAddon: matches,
    rawType: type
  };
}

function nextStateFromEvent(
  event: ManagedVerifyBillingWebhookEvent,
  graceDays: number,
  nowMs: number
): {
  state: ManagedVerifyBillingState;
  lastServiceDateIso: string | null;
  cancelledAtIso: string | null;
} {
  const t = event.type.toLowerCase();

  if (
    t === "customer.subscription.deleted" ||
    t === "escape_hatch.managed_verify.cancelled" ||
    t.endsWith(".cancelled")
  ) {
    const last = computeLastServiceDateIso({
      currentPeriodEndIso: event.currentPeriodEndIso,
      graceDays,
      nowMs
    });
    return {
      state: "grace",
      lastServiceDateIso: last,
      cancelledAtIso: new Date(nowMs).toISOString()
    };
  }

  if (
    t === "invoice.payment_failed" ||
    t === "escape_hatch.managed_verify.past_due"
  ) {
    const last = computeLastServiceDateIso({
      currentPeriodEndIso: event.currentPeriodEndIso,
      graceDays,
      nowMs
    });
    return {
      state: "past_due",
      lastServiceDateIso: last,
      cancelledAtIso: null
    };
  }

  if (
    t === "invoice.paid" ||
    t === "checkout.session.completed" ||
    t === "customer.subscription.created" ||
    t === "escape_hatch.managed_verify.activated"
  ) {
    return { state: "active", lastServiceDateIso: null, cancelledAtIso: null };
  }

  if (t === "customer.subscription.updated") {
    const mapped = mapStripeSubscriptionStatus(event.subscriptionStatus);
    if (mapped === "cancelled") {
      const last = computeLastServiceDateIso({
        currentPeriodEndIso: event.currentPeriodEndIso,
        graceDays,
        nowMs
      });
      return {
        state: "grace",
        lastServiceDateIso: last,
        cancelledAtIso: new Date(nowMs).toISOString()
      };
    }
    if (mapped === "past_due") {
      const last = computeLastServiceDateIso({
        currentPeriodEndIso: event.currentPeriodEndIso,
        graceDays,
        nowMs
      });
      return { state: "past_due", lastServiceDateIso: last, cancelledAtIso: null };
    }
    if (mapped === "active") {
      return { state: "active", lastServiceDateIso: null, cancelledAtIso: null };
    }
    return { state: mapped, lastServiceDateIso: null, cancelledAtIso: null };
  }

  // Unknown but matching addon — ignore state change
  return {
    state: mapStripeSubscriptionStatus(event.subscriptionStatus),
    lastServiceDateIso: null,
    cancelledAtIso: null
  };
}

export type ApplyWebhookArgs = {
  store: ManagedVerifyBillingStore;
  product: ManagedVerifyAddonProduct;
  graceDays: number;
  payload: unknown;
  nowMs?: number;
};

/**
 * Idempotent entitlement update from a verified webhook payload.
 */
export function applyManagedVerifyBillingWebhook(
  args: ApplyWebhookArgs
): ManagedVerifyBillingWebhookApplyResult {
  const normalized = normalizeManagedVerifyBillingWebhook(
    args.payload,
    args.product
  );
  if ("error" in normalized) {
    return { ok: false, reason: normalized.error, httpStatus: 400 };
  }

  if (!args.store.claimEvent(normalized.id)) {
    const existing = normalized.siteId
      ? args.store.get(normalized.siteId)
      : null;
    return {
      ok: true,
      duplicate: true,
      record: existing,
      ignored: false,
      reason: "duplicate_event"
    };
  }

  if (!normalized.matchesAddon) {
    return {
      ok: true,
      duplicate: false,
      record: null,
      ignored: true,
      reason: "not_managed_verify_addon"
    };
  }

  if (!normalized.siteId) {
    return {
      ok: false,
      reason: "missing_site_id_metadata",
      httpStatus: 400
    };
  }

  const nowMs = args.nowMs ?? Date.now();
  const prev = args.store.get(normalized.siteId);
  const transition = nextStateFromEvent(normalized, args.graceDays, nowMs);

  // Preserve lastServiceDate when re-activating clears it; when unknown event keeps none
  let state = transition.state;
  let lastServiceDateIso = transition.lastServiceDateIso;
  let cancelledAtIso = transition.cancelledAtIso;

  if (
    transition.state === "none" &&
    !normalized.subscriptionStatus &&
    prev
  ) {
    // Unrecognized addon event type — keep previous state
    const refreshed = refreshBillingStateForNow(prev, nowMs);
    return {
      ok: true,
      duplicate: false,
      record: refreshed,
      ignored: true,
      reason: "unhandled_event_type"
    };
  }

  if (state === "active") {
    lastServiceDateIso = null;
    cancelledAtIso = null;
  }

  const record: ManagedVerifyBillingRecord = {
    siteId: normalized.siteId,
    creatorId: normalized.creatorId ?? prev?.creatorId ?? null,
    state,
    subscriptionId: normalized.subscriptionId ?? prev?.subscriptionId ?? null,
    lastServiceDateIso:
      lastServiceDateIso ??
      (state === "grace" || state === "past_due"
        ? prev?.lastServiceDateIso ?? null
        : null),
    cancelledAtIso:
      cancelledAtIso ?? (state === "grace" ? prev?.cancelledAtIso ?? null : null),
    updatedAtIso: new Date(nowMs).toISOString(),
    lastEventId: normalized.id
  };

  const stored = args.store.upsert(
    refreshBillingStateForNow(record, nowMs)
  );
  return {
    ok: true,
    duplicate: false,
    record: stored,
    ignored: false
  };
}
