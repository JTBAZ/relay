/**
 * @fileoverview Serialisable payment domain types for Stripe/PayPal tier mappings, preflight, and checkout audit rows.
 * @description Shapes mirror file-store JSON and Prisma `CreatorPaymentConfig.payload` / `PaymentCheckout` columns.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `CreatorPaymentConfig`, `PaymentCheckout`
 */

/** Supported third-party payment processor. */
export type PaymentProvider = "stripe" | "paypal";

/** Recurring billing cadence for mapped prices. */
export type BillingInterval = "month" | "year";

/**
 * Maps a Relay tier to a provider product/price pair.
 * @todo Brittle: `product_id` / `price_id` format rules are enforced in adapters, not here.
 */
export type TierProductMapping = {
  tier_id: string;
  provider: PaymentProvider;
  product_id: string;
  price_id: string;
  currency: string;
  amount_cents: number;
  billing_interval: BillingInterval;
  tax_behavior: "inclusive" | "exclusive";
};

/** Per-creator payment configuration blob (file or `CreatorPaymentConfig.payload`). */
export type PaymentConfig = {
  creator_id: string;
  default_currency: string;
  default_billing_interval: BillingInterval;
  mappings: TierProductMapping[];
  live_mode: boolean;
  created_at: string;
  updated_at: string;
};

/** Single preflight finding from {@link ./preflight.js}. */
export type PreflightIssue = {
  tier_id: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

/** Aggregated preflight outcome for a creator’s payment config vs clone tiers. */
export type PreflightResult = {
  creator_id: string;
  pass: boolean;
  checked_at: string;
  issues: PreflightIssue[];
  mappings_checked: number;
};

/** Record appended after a checkout attempt (file list or `PaymentCheckout` row). */
export type CheckoutResult = {
  checkout_id: string;
  tier_id: string;
  provider: PaymentProvider;
  status: "success" | "failed";
  amount_cents: number;
  currency: string;
  dry_run: boolean;
  processed_at: string;
  error_message?: string;
};

/** Root JSON document for file-backed `FilePaymentStore`. */
export type PaymentStoreRoot = {
  configs: Record<string, PaymentConfig>;
  checkouts: CheckoutResult[];
};
