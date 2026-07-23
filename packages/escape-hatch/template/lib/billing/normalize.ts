/**
 * Provider-agnostic webhook normalization (EH-050).
 *
 * Entitlement service consumes NormalizedBillingLifecycleEvent only.
 * Unsigned / malformed envelopes fail closed — never grant from client payloads.
 */

import type {
  BillingImplementation,
  BillingInterval,
  BillingLifecycleEventType,
  BillingSubscriptionStatus,
  BillingWebhookEnvelope,
  NormalizedBillingLifecycleEvent,
  NormalizeWebhookResult
} from "./types";

const LIFECYCLE_TYPES = new Set<BillingLifecycleEventType>([
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.renewed",
  "subscription.paused",
  "checkout.completed",
  "invoice.paid",
  "invoice.payment_failed"
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asTierIds(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t, i, arr) => arr.indexOf(t) === i);
  }
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mapProviderType(raw: string): BillingLifecycleEventType | null {
  const t = raw.trim().toLowerCase();
  if (LIFECYCLE_TYPES.has(t as BillingLifecycleEventType)) {
    return t as BillingLifecycleEventType;
  }
  // Stripe-like aliases → canonical
  const aliases: Record<string, BillingLifecycleEventType> = {
    "customer.subscription.created": "subscription.created",
    "customer.subscription.updated": "subscription.updated",
    "customer.subscription.deleted": "subscription.canceled",
    "customer.subscription.paused": "subscription.paused",
    "checkout.session.completed": "checkout.completed",
    "invoice.payment_succeeded": "invoice.paid",
    "invoice.paid": "invoice.paid",
    "invoice.payment_failed": "invoice.payment_failed",
    "escape_hatch.billing.subscription.created": "subscription.created",
    "escape_hatch.billing.subscription.updated": "subscription.updated",
    "escape_hatch.billing.subscription.canceled": "subscription.canceled",
    "escape_hatch.billing.subscription.past_due": "subscription.past_due",
    "escape_hatch.billing.subscription.renewed": "subscription.renewed"
  };
  return aliases[t] ?? null;
}

function mapStatus(raw: string | null): BillingSubscriptionStatus {
  if (!raw) return "incomplete";
  const s = raw.toLowerCase();
  if (s === "active" || s === "trialing") return s;
  if (s === "past_due" || s === "unpaid") return s;
  if (s === "canceled" || s === "cancelled") return "canceled";
  if (s === "paused") return "paused";
  if (s === "incomplete" || s === "incomplete_expired") return "incomplete";
  return "incomplete";
}

function mapInterval(raw: string | null): BillingInterval | null {
  if (!raw) return null;
  const i = raw.toLowerCase();
  if (i === "month" || i === "year" || i === "week" || i === "day") return i;
  if (i === "monthly") return "month";
  if (i === "yearly" || i === "annual") return "year";
  return null;
}

function unixToIso(sec: unknown): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

/**
 * Mapper interface — provider adapters may specialize before calling
 * {@link normalizeWebhookEvent}. Default path is provider-agnostic fixtures.
 */
export type BillingWebhookMapper = {
  mapType(rawType: string): BillingLifecycleEventType | null;
  extract(parsed: unknown): Partial<NormalizedBillingLifecycleEvent> | null;
};

export const defaultBillingWebhookMapper: BillingWebhookMapper = {
  mapType: mapProviderType,
  extract(parsed) {
    const root = asRecord(parsed);
    if (!root) return null;
    const data = asRecord(root.data);
    const object = data ? asRecord(data.object) : root;
    const meta = asRecord(object?.metadata) ?? asRecord(root.metadata);

    const siteId =
      str(meta?.site_id) ??
      str(meta?.escape_hatch_site_id) ??
      str(root.site_id);
    const authUserId =
      str(meta?.auth_user_id) ??
      str(meta?.account_id) ??
      str(root.auth_user_id);
    const customerId =
      str(object?.customer) ??
      str(root.customer_id) ??
      (typeof object?.id === "string" && str(root.type)?.includes("customer")
        ? str(object.id)
        : null);
    let subscriptionId =
      str(root.subscription_id) ??
      str(object?.subscription) ??
      null;
    const rawType = str(root.type) ?? "";
    if (
      !subscriptionId &&
      typeof object?.id === "string" &&
      rawType.toLowerCase().includes("subscription")
    ) {
      subscriptionId = object.id;
    }

    const tierIdsFromMeta = asTierIds(meta?.tier_ids);
    const tierIdsFromRoot = asTierIds(root.tier_ids);
    const tierIdsFromAlt = asTierIds(meta?.tierIds);
    const tierIds =
      tierIdsFromMeta.length > 0
        ? tierIdsFromMeta
        : tierIdsFromRoot.length > 0
          ? tierIdsFromRoot
          : tierIdsFromAlt;

    const statusRaw =
      str(object?.status) ??
      str(root.subscription_status) ??
      str(root.status);

    const currentPeriodEndIso =
      unixToIso(object?.current_period_end) ??
      str(object?.current_period_end_iso) ??
      str(root.current_period_end_iso);

    const interval =
      mapInterval(str(object?.interval)) ??
      mapInterval(str(asRecord(object?.items)?.interval)) ??
      mapInterval(str(root.interval));

    const currency =
      str(object?.currency)?.toUpperCase() ??
      str(root.currency)?.toUpperCase() ??
      null;

    const amountCents =
      num(object?.amount_total) ??
      num(object?.unit_amount) ??
      num(root.amount_cents);

    return {
      id: str(root.id) ?? undefined,
      occurredAt:
        unixToIso(root.created) ??
        str(root.occurred_at) ??
        str(root.occurredAt) ??
        undefined,
      siteId: siteId ?? undefined,
      authUserId,
      customerId,
      subscriptionId,
      tierIds,
      status: mapStatus(statusRaw),
      currentPeriodEndIso,
      cancelAtPeriodEnd: bool(object?.cancel_at_period_end, false),
      currency,
      amountCents,
      interval,
      reason: str(root.reason) ?? str(meta?.reason) ?? null
    } as Partial<NormalizedBillingLifecycleEvent>;
  }
};

export type NormalizeWebhookOptions = {
  mapper?: BillingWebhookMapper;
  provider?: BillingImplementation | "unknown";
  /** Clock override for missing occurredAt. */
  nowMs?: number;
  /**
   * When true (default), require envelope.signatureVerified.
   * Unsigned inputs always fail closed — never grant.
   */
  requireSignature?: boolean;
};

/**
 * Normalize a verified webhook envelope into a canonical lifecycle event.
 * Fail closed on unsigned, malformed, or incomplete inputs.
 */
export function normalizeWebhookEvent(
  envelope: BillingWebhookEnvelope | null | undefined,
  opts?: NormalizeWebhookOptions
): NormalizeWebhookResult {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "missing_envelope" };
  }

  const requireSignature = opts?.requireSignature !== false;
  if (requireSignature && envelope.signatureVerified !== true) {
    return { ok: false, reason: "unsigned_or_unverified" };
  }

  if (envelope.parsed === undefined || envelope.parsed === null) {
    return { ok: false, reason: "missing_payload" };
  }

  const root = asRecord(envelope.parsed);
  if (!root) {
    return { ok: false, reason: "malformed_payload" };
  }

  const mapper = opts?.mapper ?? defaultBillingWebhookMapper;
  const rawType = str(root.type);
  if (!rawType) {
    return { ok: false, reason: "missing_event_type" };
  }

  const type = mapper.mapType(rawType);
  if (!type) {
    return { ok: false, reason: "unknown_event_type" };
  }

  const extracted = mapper.extract(envelope.parsed);
  if (!extracted) {
    return { ok: false, reason: "extract_failed" };
  }

  const id = str(extracted.id) ?? str(root.id);
  if (!id) {
    return { ok: false, reason: "missing_event_id" };
  }

  const siteId = str(extracted.siteId);
  if (!siteId) {
    return { ok: false, reason: "missing_site_id" };
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const occurredAt =
    str(extracted.occurredAt) ?? new Date(nowMs).toISOString();

  // Past-due / canceled / payment_failed force status honestly
  let status: BillingSubscriptionStatus = extracted.status ?? "incomplete";
  if (type === "subscription.past_due" || type === "invoice.payment_failed") {
    status = "past_due";
  } else if (type === "subscription.canceled") {
    status = "canceled";
  } else if (
    type === "subscription.created" ||
    type === "subscription.renewed" ||
    type === "checkout.completed" ||
    type === "invoice.paid"
  ) {
    if (status === "incomplete") status = "active";
  } else if (type === "subscription.paused") {
    status = "paused";
  }

  const event: NormalizedBillingLifecycleEvent = {
    id,
    type,
    occurredAt,
    siteId,
    authUserId: str(extracted.authUserId),
    customerId: str(extracted.customerId),
    subscriptionId: str(extracted.subscriptionId),
    tierIds: Array.isArray(extracted.tierIds)
      ? extracted.tierIds.filter((t): t is string => typeof t === "string")
      : [],
    status,
    currentPeriodEndIso: str(extracted.currentPeriodEndIso),
    cancelAtPeriodEnd: Boolean(extracted.cancelAtPeriodEnd),
    currency: str(extracted.currency)?.toUpperCase() ?? null,
    amountCents:
      typeof extracted.amountCents === "number" &&
      Number.isFinite(extracted.amountCents)
        ? extracted.amountCents
        : null,
    interval: extracted.interval ?? null,
    provider: opts?.provider ?? "unknown",
    reason: str(extracted.reason)
  };

  return { ok: true, event };
}

/**
 * Build a verified envelope from a fixture payload (tests / adapters after verify).
 */
export function verifiedEnvelopeFromParsed(
  parsed: unknown,
  opts?: { signatureHeader?: string | null; rawBody?: string }
): BillingWebhookEnvelope {
  const rawBody =
    opts?.rawBody ??
    (typeof parsed === "string" ? parsed : JSON.stringify(parsed ?? null));
  return {
    rawBody,
    signatureHeader: opts?.signatureHeader ?? "test_signature",
    parsed,
    signatureVerified: true
  };
}

/**
 * Build an unsigned envelope (always fails normalize when requireSignature).
 */
export function unsignedEnvelopeFromParsed(
  parsed: unknown
): BillingWebhookEnvelope {
  return {
    rawBody: typeof parsed === "string" ? parsed : JSON.stringify(parsed ?? null),
    signatureHeader: null,
    parsed,
    signatureVerified: false
  };
}
