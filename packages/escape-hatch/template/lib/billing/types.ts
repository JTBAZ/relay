/**
 * Escape Hatch EH-050 — Billing provider contract types.
 *
 * Normalized lifecycle / capability / policy shapes. Entitlement service
 * consumes these events — never provider-specific client payloads as grants.
 * Live Stripe Checkout/Portal/webhooks are EH-051.
 */

/** Canonical subscription lifecycle events (provider-agnostic). */
export type BillingLifecycleEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.past_due"
  | "subscription.renewed"
  | "subscription.paused"
  | "checkout.completed"
  | "invoice.paid"
  | "invoice.payment_failed";

/** Normalized subscription status after mapping. */
export type BillingSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing"
  | "unpaid"
  | "paused";

export type BillingInterval = "month" | "year" | "week" | "day";

export type BillingImplementation = "stub" | "stripe" | "nowpayments";

/**
 * Provider-agnostic lifecycle event. No raw Stripe/client bodies here —
 * adapters normalize into this shape after signature verification.
 */
export type NormalizedBillingLifecycleEvent = {
  /** Provider event id (idempotency key). */
  id: string;
  type: BillingLifecycleEventType;
  occurredAt: string;
  siteId: string;
  /** Site account / auth user when known. */
  authUserId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  /** Destination site tier ids granted by this subscription. */
  tierIds: readonly string[];
  status: BillingSubscriptionStatus;
  currentPeriodEndIso: string | null;
  cancelAtPeriodEnd: boolean;
  currency: string | null;
  /** Amount in minor units when known. */
  amountCents: number | null;
  interval: BillingInterval | null;
  provider: BillingImplementation | "unknown";
  /** Non-secret reason / mapping note. */
  reason: string | null;
};

/**
 * Entitlement grant/revoke event for EH-032 `source: billing`.
 * Compatible with EntitlementSnapshot upsert paths.
 */
export type BillingEntitlementEventKind = "grant" | "revoke" | "update";

export type BillingEntitlementEvent = {
  kind: BillingEntitlementEventKind;
  /** Always billing — never elevate via client claims. */
  source: "billing";
  siteId: string;
  authUserId: string;
  tierIds: readonly string[];
  observedAt: string;
  staleAfter: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string;
  /** Idempotency / audit link to normalized lifecycle event. */
  lifecycleEventId: string;
  customerId: string | null;
  subscriptionId: string | null;
};

export type BillingCapabilityFlags = {
  connectAccount: boolean;
  listProducts: boolean;
  mutateProducts: boolean;
  createCheckout: boolean;
  customerPortal: boolean;
  verifyWebhooks: boolean;
  normalizeLifecycle: boolean;
  sandboxMode: boolean;
  tax: boolean;
  migrationExport: boolean;
};

export type BillingCapabilityMatrix = {
  implementation: BillingImplementation;
  /** Honest readiness — stub is never "ready for live checkout". */
  ready: boolean;
  sandbox: boolean;
  capabilities: BillingCapabilityFlags;
  /** Human-readable honesty note (no secrets). */
  detail: string;
};

/**
 * Declared provider policy surface (EH-050 shape; EH-052 fills dated matrix).
 */
export type BillingPolicyDeclaration = {
  implementation: BillingImplementation;
  supportedCurrencies: readonly string[];
  supportedIntervals: readonly BillingInterval[];
  taxFeatures: readonly string[];
  /** Content categories the adapter claims to support (routing only). */
  contentCategories: readonly string[];
  regions: readonly string[];
  /** Official policy URL when known (Stripe restricted businesses, etc.). */
  policyUrl: string | null;
  /** ISO date string when policy was last checked — null until EH-052. */
  policyCheckedAt: string | null;
  notes: readonly string[];
};

export type BillingReadinessReport = {
  implementation: BillingImplementation;
  ok: boolean;
  reason: string;
  sandbox: boolean;
  capability: BillingCapabilityMatrix;
  policy: BillingPolicyDeclaration;
  /** Env names expected for a live Stripe adapter (EH-051) — never values. */
  requiredEnvNames: readonly string[];
  configuredEnvNames: readonly string[];
};

export type BillingProduct = {
  id: string;
  name: string;
  active: boolean;
  /** Site tier id this product maps to, when known. */
  tierId: string | null;
};

export type BillingPrice = {
  id: string;
  productId: string;
  currency: string;
  unitAmountCents: number;
  interval: BillingInterval;
  active: boolean;
};

export type BillingCheckoutSession = {
  id: string;
  url: string | null;
  mode: "hosted" | "embedded";
};

export type BillingPortalSession = {
  id: string;
  url: string | null;
};

export type BillingAccountConnection = {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  reason: string | null;
};

export type BillingMigrationMapping = {
  customers: ReadonlyArray<{
    customerId: string;
    authUserId: string | null;
    emailHint: string | null;
  }>;
  subscriptions: ReadonlyArray<{
    subscriptionId: string;
    customerId: string;
    tierIds: readonly string[];
    status: BillingSubscriptionStatus;
  }>;
  exportedAt: string;
};

export type BillingResultOk<T> = { ok: true; value: T };
export type BillingResultFail = { ok: false; reason: string };
export type BillingResult<T> = BillingResultOk<T> | BillingResultFail;

/** Fail-closed not-implemented reason used by stub / incomplete Stripe shell. */
export const BILLING_NOT_IMPLEMENTED = "not_implemented" as const;

/**
 * Verified webhook envelope. Signature must be checked before normalize.
 * Raw provider body is retained only for adapters — never treated as a grant.
 */
export type BillingWebhookEnvelope = {
  /** Raw body bytes or string used for signature verification. */
  rawBody: string | Buffer;
  /** Signature header value (e.g. Stripe-Signature). */
  signatureHeader: string | null;
  /** Parsed JSON after verify — still not a grant until normalize. */
  parsed: unknown;
  /** True only after adapter verifyWebhookSignature succeeds. */
  signatureVerified: boolean;
};

export type NormalizeWebhookResult =
  | { ok: true; event: NormalizedBillingLifecycleEvent }
  | { ok: false; reason: string };
