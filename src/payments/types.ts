export type PaymentProvider = "stripe" | "paypal";

export type BillingInterval = "month" | "year";

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

export type PaymentConfig = {
  creator_id: string;
  default_currency: string;
  default_billing_interval: BillingInterval;
  mappings: TierProductMapping[];
  live_mode: boolean;
  created_at: string;
  updated_at: string;
};

export type PreflightIssue = {
  tier_id: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type PreflightResult = {
  creator_id: string;
  pass: boolean;
  checked_at: string;
  issues: PreflightIssue[];
  mappings_checked: number;
};

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

export type PaymentStoreRoot = {
  configs: Record<string, PaymentConfig>;
  checkouts: CheckoutResult[];
};
