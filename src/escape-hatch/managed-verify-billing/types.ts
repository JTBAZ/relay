/**
 * Escape Hatch EH-042 — Relay billing entitlement types for managed Patreon connector.
 * Webhook truth drives state; client claims are never authoritative.
 */

/** Separate line-item identity on the creator's Relay invoice (not Studio Core / fan plans). */
export const MANAGED_VERIFY_ADDON_SKU = "relay_managed_patreon_connector" as const;

export type ManagedVerifyAddonSku = typeof MANAGED_VERIFY_ADDON_SKU;

/**
 * Entitlement state machine (webhook-normalized).
 * Issuance of managed-verify assertions is allowed only for `active` and `grace`.
 */
export type ManagedVerifyBillingState =
  | "active"
  | "grace"
  | "cancelled"
  | "past_due"
  | "none";

export type ManagedVerifyAddonProduct = {
  sku: ManagedVerifyAddonSku;
  /** Human invoice label — separate from other Relay line items. */
  displayName: string;
  /** Monthly price in minor units (cents). Configurable via env. */
  monthlyPriceCents: number;
  currency: "USD";
  /**
   * Optional Stripe Price id for webhook line-item matching.
   * Empty string means match by metadata.sku / product metadata only.
   */
  stripePriceId: string | null;
  /** Covers OAuth/token ops, monitoring, security, support, provider-change risk (ops honesty). */
  costCoverageNotes: string[];
};

export type ManagedVerifyBillingRecord = {
  siteId: string;
  /** Relay creator / billing account id when known. */
  creatorId: string | null;
  state: ManagedVerifyBillingState;
  /** Stripe (or Relay) subscription id — non-secret. */
  subscriptionId: string | null;
  /** Exact last service date (ISO date or datetime) while in grace / after cancel. */
  lastServiceDateIso: string | null;
  /** When grace / cancel started (ISO). */
  cancelledAtIso: string | null;
  updatedAtIso: string;
  /** Last applied webhook event id (idempotency cursor). */
  lastEventId: string | null;
};

export type ManagedVerifyBillingGateResult =
  | { ok: true; state: ManagedVerifyBillingState; record: ManagedVerifyBillingRecord | null }
  | {
      ok: false;
      reason: string;
      state: ManagedVerifyBillingState;
      record: ManagedVerifyBillingRecord | null;
    };

export type ManagedVerifyCancellationCopy = {
  sku: ManagedVerifyAddonSku;
  state: ManagedVerifyBillingState;
  /** Exact last service date when known. */
  lastServiceDateIso: string | null;
  /** Kit/admin honesty: Patreon-derived entitlements may go stale after this date. */
  staleWarning: string;
  /** Native site surfaces that continue after connector cancel. */
  nativeContinuesWorking: string;
  /** Creator-owned OAuth migration steps (no secrets). */
  migrationSteps: string[];
  /** Does not delete linked patrons. */
  patronsPreserved: true;
};

/** Normalized Stripe-like (or Relay billing) webhook event for the add-on. */
export type ManagedVerifyBillingWebhookEvent = {
  id: string;
  type: string;
  createdUnix: number;
  /** Site id from metadata (required for entitlement updates). */
  siteId: string | null;
  creatorId: string | null;
  subscriptionId: string | null;
  /** Stripe subscription status when present. */
  subscriptionStatus: string | null;
  /** Period end / cancel_at as ISO when known. */
  currentPeriodEndIso: string | null;
  /** True when the event references this add-on SKU / price. */
  matchesAddon: boolean;
  rawType: string;
};

export type ManagedVerifyBillingWebhookApplyResult =
  | {
      ok: true;
      duplicate: boolean;
      record: ManagedVerifyBillingRecord | null;
      ignored: boolean;
      reason?: string;
    }
  | { ok: false; reason: string; httpStatus: number };
