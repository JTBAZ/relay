/**
 * Creator-owned NOWPayments crypto billing adapter (EH-053).
 *
 * Fail closed without NOWPAYMENTS_API_KEY + NOWPAYMENTS_IPN_SECRET (or injected client).
 * Crypto renewals are not card autopull — patrons must complete each crypto payment.
 * productionSafe remains false. Never route Stripe-prohibited content through Stripe.
 */

import type { AdapterHealth, BillingProvider } from "../adapters/types";
import { loadEnv, type SiteEnv } from "../env";
import type { NowPaymentsBillingClient } from "./nowpayments-client";
import {
  getBillingCapabilityMatrix,
  getBillingPolicyDeclaration,
  isNowPaymentsBillingConfigured,
  reportBillingReadiness
} from "./readiness";
import type {
  BillingAccountConnection,
  BillingCheckoutSession,
  BillingMigrationMapping,
  BillingPortalSession,
  BillingPrice,
  BillingProduct,
  BillingResult,
  BillingWebhookEnvelope,
  NormalizeWebhookResult
} from "./types";

function failClosed<T = never>(reason: string): BillingResult<T> {
  return { ok: false, reason };
}

function ok<T>(value: T): BillingResult<T> {
  return { ok: true, value };
}

function asErrorReason(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return `${fallback}: ${err.message}`;
  }
  return fallback;
}

function intervalToDays(interval: "month" | "year" | "week" | "day"): number {
  switch (interval) {
    case "day":
      return 1;
    case "week":
      return 7;
    case "year":
      return 365;
    case "month":
    default:
      return 30;
  }
}

export type CreateNowPaymentsBillingProviderOptions = {
  env?: SiteEnv;
  client?: NowPaymentsBillingClient;
  nowMs?: () => number;
};

type ProviderState = {
  env: SiteEnv;
  client: NowPaymentsBillingClient | null;
  injected: boolean;
  nowMs: () => number;
  products: Map<string, BillingProduct>;
  prices: Map<string, BillingPrice & { intervalDays: number }>;
  seq: number;
};

function resolveClient(
  state: ProviderState
): BillingResult<NowPaymentsBillingClient> {
  if (state.client) return ok(state.client);
  if (!isNowPaymentsBillingConfigured(state.env)) {
    return failClosed(
      "nowpayments_not_configured — set NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET (non-placeholder) for EH-053"
    );
  }
  return failClosed(
    "nowpayments_live_http_client_not_wired — inject NowPaymentsBillingClient for sandbox, or complete live API client before claiming readiness"
  );
}

/**
 * NOWPayments BillingProvider. Fail closed without credentials unless a client is injected.
 */
export function createNowPaymentsBillingProvider(
  opts?: CreateNowPaymentsBillingProviderOptions
): BillingProvider {
  const env = opts?.env ?? loadEnv();
  const state: ProviderState = {
    env,
    client: opts?.client ?? null,
    injected: Boolean(opts?.client),
    nowMs: opts?.nowMs ?? (() => Date.now()),
    products: new Map(),
    prices: new Map(),
    seq: 1
  };

  return {
    id: "billing",
    implementation: "nowpayments",

    async health(): Promise<AdapterHealth> {
      const r = reportBillingReadiness("nowpayments", env, {
        clientInjected: state.injected
      });
      if (!r.ok) return { ok: false, reason: r.reason };
      const clientRes = resolveClient(state);
      if (!clientRes.ok) return { ok: false, reason: clientRes.reason };
      try {
        await clientRes.value.status();
        return {
          ok: true,
          detail:
            "NOWPayments crypto billing adapter ready (sandbox/prototype). Crypto renewals require patron payment each cycle. productionSafe remains false."
        };
      } catch (err) {
        return {
          ok: false,
          reason: asErrorReason(err, "nowpayments_status_failed")
        };
      }
    },

    isSandboxMode() {
      return true;
    },

    getCapabilityMatrix() {
      return getBillingCapabilityMatrix("nowpayments", env, {
        clientInjected: state.injected
      });
    },

    getPolicyDeclaration() {
      return getBillingPolicyDeclaration("nowpayments");
    },

    getReadiness() {
      return reportBillingReadiness("nowpayments", env, {
        clientInjected: state.injected
      });
    },

    async connectAccount() {
      const clientRes = resolveClient(state);
      if (!clientRes.ok) return failClosed(clientRes.reason);
      try {
        await clientRes.value.status();
        return ok<BillingAccountConnection>({
          connected: true,
          accountId: "nowpayments_creator",
          chargesEnabled: true,
          detailsSubmitted: true,
          reason:
            "Creator-owned NOWPayments account credentials present. Confirm wallet + IPN in NOWPayments dashboard."
        });
      } catch (err) {
        return failClosed(asErrorReason(err, "nowpayments_connect_failed"));
      }
    },

    async validateAccount() {
      return this.connectAccount();
    },

    async listProducts() {
      return ok([...state.products.values()]);
    },

    async createProduct(input) {
      const id = `np_prod_${state.seq++}`;
      const product: BillingProduct = {
        id,
        name: input.name,
        active: true,
        tierId: input.tierId ?? null
      };
      state.products.set(id, product);
      return ok(product);
    },

    async updateProduct(input) {
      const existing = state.products.get(input.productId);
      if (!existing) return failClosed("nowpayments_product_not_found");
      const next: BillingProduct = {
        ...existing,
        name: input.name ?? existing.name,
        active: input.active ?? existing.active,
        tierId:
          input.tierId === undefined ? existing.tierId : input.tierId ?? null
      };
      state.products.set(input.productId, next);
      return ok(next);
    },

    async listPrices(productId) {
      const all = [...state.prices.values()].map(
        ({ intervalDays: _d, ...price }) => price
      );
      if (!productId) return ok(all);
      return ok(all.filter((p) => p.productId === productId));
    },

    async createPrice(input) {
      if (!state.products.has(input.productId)) {
        return failClosed("nowpayments_product_not_found");
      }
      const id = `np_price_${state.seq++}`;
      const days = intervalToDays(input.interval);
      const price: BillingPrice & { intervalDays: number } = {
        id,
        productId: input.productId,
        currency: input.currency.toUpperCase(),
        unitAmountCents: input.unitAmountCents,
        interval: input.interval,
        active: true,
        intervalDays: days
      };
      state.prices.set(id, price);
      const clientRes = resolveClient(state);
      if (!clientRes.ok) return failClosed(clientRes.reason);
      try {
        const product = state.products.get(input.productId)!;
        await clientRes.value.createPlan({
          title: product.name,
          intervalDay: days,
          amount: input.unitAmountCents / 100,
          currency: input.currency
        });
      } catch (err) {
        return failClosed(asErrorReason(err, "nowpayments_create_plan_failed"));
      }
      const { intervalDays: _d, ...publicPrice } = price;
      return ok(publicPrice);
    },

    async updatePrice(input) {
      const existing = state.prices.get(input.priceId);
      if (!existing) return failClosed("nowpayments_price_not_found");
      const next = {
        ...existing,
        active: input.active ?? existing.active
      };
      state.prices.set(input.priceId, next);
      const { intervalDays: _d, ...publicPrice } = next;
      return ok(publicPrice);
    },

    async createCheckoutSession(input) {
      const price = state.prices.get(input.priceId);
      if (!price || !price.active) {
        return failClosed("nowpayments_price_not_found_or_inactive");
      }
      const clientRes = resolveClient(state);
      if (!clientRes.ok) return failClosed(clientRes.reason);
      try {
        const product = state.products.get(price.productId);
        const plan = await clientRes.value.createPlan({
          title: product?.name ?? "Subscription",
          intervalDay: price.intervalDays,
          amount: price.unitAmountCents / 100,
          currency: price.currency
        });
        const sub = await clientRes.value.createSubscription({
          planId: plan.id,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl
        });
        if (!sub.invoiceUrl) {
          return failClosed("nowpayments_checkout_url_missing");
        }
        return ok<BillingCheckoutSession>({
          id: sub.id,
          url: sub.invoiceUrl,
          mode: "hosted"
        });
      } catch (err) {
        return failClosed(asErrorReason(err, "nowpayments_checkout_failed"));
      }
    },

    async createCustomerPortalSession() {
      return failClosed<BillingPortalSession>(
        "nowpayments_portal_unavailable — NOWPayments has no Stripe-style customer portal; patrons manage renewals via invoice links / creator dashboard cancel flows"
      );
    },

    async verifyWebhookSignature(_args: {
      rawBody: string | Buffer;
      signatureHeader: string | null;
    }): Promise<BillingResult<{ verified: true }>> {
      if (!isNowPaymentsBillingConfigured(env) && !state.injected) {
        return failClosed("nowpayments_webhook_not_configured");
      }
      return failClosed(
        "nowpayments_webhook_verify_not_wired — use injected test path or complete live IPN verification before production"
      );
    },

    normalizeWebhookEvent(
      _envelope: BillingWebhookEnvelope
    ): NormalizeWebhookResult {
      return {
        ok: false,
        reason: "nowpayments_normalize_requires_verified_envelope"
      };
    },

    async exportMigrationMapping(_siteId: string) {
      return ok<BillingMigrationMapping>({
        customers: [],
        subscriptions: [],
        exportedAt: new Date(state.nowMs()).toISOString()
      });
    }
  };
}

export type { NowPaymentsBillingClient };
export { createMemoryNowPaymentsClient } from "./nowpayments-client";
