/**
 * @fileoverview Stripe and PayPal checkout adapters with stubbed live charge paths and lightweight validation.
 * @description `processCheckout` returns synthetic success in non-dry-run paths (real gateway calls not implemented here). Webhook signature checks are partial stubs.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Checkout rows written via `PaymentStore.appendCheckout`, not this module
 */
import type { CheckoutResult, PaymentProvider, TierProductMapping } from "./types.js";
import { randomUUID } from "node:crypto";

/** Input bundle for a single checkout attempt through an adapter. */
export type ProviderCheckoutInput = {
  mapping: TierProductMapping;
  user_id: string;
  email: string;
  dry_run: boolean;
};

/**
 * Processor plugin for a payment backend.
 * @todo Brittle: Stripe/PayPal live paths and signature verification are placeholders.
 */
export type ProviderAdapter = {
  provider: PaymentProvider;
  validateMapping(mapping: TierProductMapping): string | null;
  /** @throws {Error} Rarely from crypto/network when live integration is added. */
  processCheckout(input: ProviderCheckoutInput): Promise<CheckoutResult>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
};

/** Stripe-flavored adapter (keys held for future real API use). */
export class StripeAdapter implements ProviderAdapter {
  public readonly provider: PaymentProvider = "stripe";
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  /** @param secretKey API secret (not used in stub checkout). @param webhookSecret Stripe webhook signing secret. */
  public constructor(secretKey: string, webhookSecret: string) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Validates Stripe id prefixes and positive amounts.
   * @returns Human-readable error or `null` when valid.
   */
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

  /**
   * Stub checkout: dry-run returns synthetic id; “live” path does not call Stripe yet.
   * @async
   */
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

  /**
   * Very loose signature probe — not production-grade Stripe signature verification.
   * @todo Brittle: replace with Stripe SDK `constructEvent` when webhooks ship.
   */
  public verifyWebhookSignature(payload: string, signature: string): boolean {
    void payload;
    return signature.startsWith("whsec_") || this.webhookSecret.length > 0;
  }
}

/** PayPal-flavored adapter (stub live path). */
export class PayPalAdapter implements ProviderAdapter {
  public readonly provider: PaymentProvider = "paypal";
  private readonly clientId: string;
  private readonly clientSecret: string;

  public constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /** Validates non-empty product/plan ids and positive amount. */
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

  /**
   * Stub checkout for PayPal.
   * @async
   */
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

  /** @todo Brittle: always true — replace with PayPal webhook verification. */
  public verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true;
  }
}
