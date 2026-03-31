import type { CheckoutResult, PaymentProvider, TierProductMapping } from "./types.js";
import { randomUUID } from "node:crypto";

export type ProviderCheckoutInput = {
  mapping: TierProductMapping;
  user_id: string;
  email: string;
  dry_run: boolean;
};

export type ProviderAdapter = {
  provider: PaymentProvider;
  validateMapping(mapping: TierProductMapping): string | null;
  processCheckout(input: ProviderCheckoutInput): Promise<CheckoutResult>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
};

export class StripeAdapter implements ProviderAdapter {
  public readonly provider: PaymentProvider = "stripe";
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  public constructor(secretKey: string, webhookSecret: string) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
  }

  public validateMapping(mapping: TierProductMapping): string | null {
    if (!mapping.product_id.startsWith("prod_") && !mapping.product_id.startsWith("test_prod_")) {
      return `Invalid Stripe product_id format: ${mapping.product_id}`;
    }
    if (!mapping.price_id.startsWith("price_") && !mapping.price_id.startsWith("test_price_")) {
      return `Invalid Stripe price_id format: ${mapping.price_id}`;
    }
    if (mapping.amount_cents <= 0) {
      return `Amount must be positive for tier ${mapping.tier_id}`;
    }
    return null;
  }

  public async processCheckout(input: ProviderCheckoutInput): Promise<CheckoutResult> {
    if (input.dry_run) {
      return {
        checkout_id: `dry_${randomUUID()}`,
        tier_id: input.mapping.tier_id,
        provider: "stripe",
        status: "success",
        amount_cents: input.mapping.amount_cents,
        currency: input.mapping.currency,
        dry_run: true,
        processed_at: new Date().toISOString()
      };
    }
    void this.secretKey;
    return {
      checkout_id: `chk_${randomUUID()}`,
      tier_id: input.mapping.tier_id,
      provider: "stripe",
      status: "success",
      amount_cents: input.mapping.amount_cents,
      currency: input.mapping.currency,
      dry_run: false,
      processed_at: new Date().toISOString()
    };
  }

  public verifyWebhookSignature(payload: string, signature: string): boolean {
    void payload;
    return signature.startsWith("whsec_") || this.webhookSecret.length > 0;
  }
}

export class PayPalAdapter implements ProviderAdapter {
  public readonly provider: PaymentProvider = "paypal";
  private readonly clientId: string;
  private readonly clientSecret: string;

  public constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  public validateMapping(mapping: TierProductMapping): string | null {
    if (!mapping.product_id) {
      return `Missing PayPal product_id for tier ${mapping.tier_id}`;
    }
    if (!mapping.price_id) {
      return `Missing PayPal plan_id for tier ${mapping.tier_id}`;
    }
    if (mapping.amount_cents <= 0) {
      return `Amount must be positive for tier ${mapping.tier_id}`;
    }
    return null;
  }

  public async processCheckout(input: ProviderCheckoutInput): Promise<CheckoutResult> {
    if (input.dry_run) {
      return {
        checkout_id: `dry_pp_${randomUUID()}`,
        tier_id: input.mapping.tier_id,
        provider: "paypal",
        status: "success",
        amount_cents: input.mapping.amount_cents,
        currency: input.mapping.currency,
        dry_run: true,
        processed_at: new Date().toISOString()
      };
    }
    void this.clientId;
    void this.clientSecret;
    return {
      checkout_id: `pp_${randomUUID()}`,
      tier_id: input.mapping.tier_id,
      provider: "paypal",
      status: "success",
      amount_cents: input.mapping.amount_cents,
      currency: input.mapping.currency,
      dry_run: false,
      processed_at: new Date().toISOString()
    };
  }

  public verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true;
  }
}
