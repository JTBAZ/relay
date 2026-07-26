/**
 * Creator-owned Stripe Billing adapter (EH-051).
 *
 * Uses creator Stripe secret/restricted keys on the generated site.
 * Money paths fail closed until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are
 * real/non-placeholder (or a test client is injected).
 *
 * Entitlement grants still flow: verify → normalize → applyBillingEntitlementEvent.
 * productionSafe remains false at the Escape Hatch status layer.
 */

import type { AdapterHealth, BillingProvider } from "../adapters/types";
import {
  isPlaceholderSecret,
  loadEnv,
  type SiteEnv
} from "../env";
import { normalizeWebhookEvent } from "./normalize";
import {
  getBillingCapabilityMatrix,
  getBillingPolicyDeclaration,
  isStripeBillingConfigured,
  reportBillingReadiness,
  resolveStripeSecretKey,
  resolveStripeWebhookSecret
} from "./readiness";
import {
  createLiveStripeBillingClient,
  type StripeBillingClient
} from "./stripe-client";
import { verifyStripeWebhookSignature } from "./stripe-signature";
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
    // Never echo secrets if somehow present
    const msg = err.message.replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[redacted]");
    return `${fallback}: ${msg}`;
  }
  return fallback;
}

function tierIdsCsv(tierIds: readonly string[] | undefined): string {
  if (!tierIds || tierIds.length === 0) return "";
  return tierIds.filter((t) => typeof t === "string" && t.trim()).join(",");
}

function parseTierFromCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export type CreateStripeBillingProviderOptions = {
  env?: SiteEnv;
  /** Injected client (memory mock or wrapped SDK). When omitted, live SDK is lazy-loaded. */
  client?: StripeBillingClient;
  nowMs?: () => number;
};

type StripeProviderState = {
  env: SiteEnv;
  client: StripeBillingClient | null;
  clientPromise: Promise<StripeBillingClient | null> | null;
  injected: boolean;
  nowMs: () => number;
};

async function resolveClient(
  state: StripeProviderState
): Promise<BillingResult<StripeBillingClient>> {
  if (state.client) return ok(state.client);

  if (!isStripeBillingConfigured(state.env)) {
    return failClosed(
      "stripe_not_configured — set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (non-placeholder) for EH-051"
    );
  }

  if (!state.clientPromise) {
    const secret = resolveStripeSecretKey(state.env)!;
    state.clientPromise = createLiveStripeBillingClient(secret).then((c) => {
      state.client = c;
      return c;
    });
  }

  const client = await state.clientPromise;
  if (!client) {
    return failClosed(
      "stripe_sdk_unavailable — install the stripe package or inject a StripeBillingClient"
    );
  }
  return ok(client);
}

function isTestModeKey(env: SiteEnv): boolean {
  const key = resolveStripeSecretKey(env) ?? "";
  return (
    key.startsWith("sk_test_") ||
    key.startsWith("rk_test_") ||
    key.includes("_test_")
  );
}

/**
 * Live Stripe BillingProvider. Fail closed without credentials unless a client is injected.
 */
export function createStripeBillingProvider(
  opts?: CreateStripeBillingProviderOptions
): BillingProvider {
  const env = opts?.env ?? loadEnv();
  const state: StripeProviderState = {
    env,
    client: opts?.client ?? null,
    clientPromise: null,
    injected: Boolean(opts?.client),
    nowMs: opts?.nowMs ?? (() => Date.now())
  };

  return {
    id: "billing",
    implementation: "stripe",

    async health(): Promise<AdapterHealth> {
      const r = reportBillingReadiness("stripe", env, {
        clientInjected: state.injected
      });
      if (!r.ok) return { ok: false, reason: r.reason };
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return { ok: false, reason: clientRes.reason };
      try {
        const acct = await clientRes.value.retrieveAccount();
        if (!acct.chargesEnabled) {
          return {
            ok: false,
            reason:
              "Stripe account charges are not enabled — complete Stripe Dashboard onboarding."
          };
        }
        const sandbox = state.injected || isTestModeKey(env);
        return {
          ok: true,
          detail: `Stripe billing adapter ready (sandbox=${sandbox}; account=${acct.id}). productionSafe remains false.`
        };
      } catch (err) {
        return {
          ok: false,
          reason: asErrorReason(err, "stripe_account_retrieve_failed")
        };
      }
    },

    isSandboxMode() {
      if (state.injected) return true;
      if (!isStripeBillingConfigured(env)) return true;
      return isTestModeKey(env);
    },

    getCapabilityMatrix() {
      return getBillingCapabilityMatrix("stripe", env, {
        clientInjected: state.injected
      });
    },

    getReadiness() {
      return reportBillingReadiness("stripe", env, {
        clientInjected: state.injected
      });
    },

    getPolicyDeclaration() {
      return getBillingPolicyDeclaration("stripe");
    },

    async connectAccount() {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) {
        return failClosed<BillingAccountConnection>(clientRes.reason);
      }
      try {
        const acct = await clientRes.value.retrieveAccount();
        return ok<BillingAccountConnection>({
          connected: acct.detailsSubmitted && acct.chargesEnabled,
          accountId: acct.id,
          chargesEnabled: acct.chargesEnabled,
          detailsSubmitted: acct.detailsSubmitted,
          reason: acct.chargesEnabled
            ? "Creator-owned Stripe account validated via API key (not Connect marketplace)."
            : "Complete Stripe Dashboard setup so charges_enabled is true."
        });
      } catch (err) {
        return failClosed<BillingAccountConnection>(
          asErrorReason(err, "stripe_connect_account_failed")
        );
      }
    },

    async validateAccount() {
      return this.connectAccount();
    },

    async listProducts() {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return failClosed<BillingProduct[]>(clientRes.reason);
      try {
        const products = await clientRes.value.listProducts();
        return ok(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            active: p.active,
            tierId: p.metadata.tier_id || p.metadata.escape_hatch_tier_id || null
          }))
        );
      } catch (err) {
        return failClosed<BillingProduct[]>(
          asErrorReason(err, "stripe_list_products_failed")
        );
      }
    },

    async createProduct(input) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return failClosed<BillingProduct>(clientRes.reason);
      try {
        const metadata: Record<string, string> = {};
        if (input.tierId) metadata.tier_id = input.tierId;
        const p = await clientRes.value.createProduct({
          name: input.name,
          metadata
        });
        return ok({
          id: p.id,
          name: p.name,
          active: p.active,
          tierId: p.metadata.tier_id || null
        });
      } catch (err) {
        return failClosed<BillingProduct>(
          asErrorReason(err, "stripe_create_product_failed")
        );
      }
    },

    async updateProduct(input) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return failClosed<BillingProduct>(clientRes.reason);
      try {
        const metadata: Record<string, string> | undefined =
          input.tierId !== undefined
            ? { tier_id: input.tierId ?? "" }
            : undefined;
        const p = await clientRes.value.updateProduct({
          productId: input.productId,
          name: input.name,
          active: input.active,
          metadata
        });
        return ok({
          id: p.id,
          name: p.name,
          active: p.active,
          tierId: p.metadata.tier_id || null
        });
      } catch (err) {
        return failClosed<BillingProduct>(
          asErrorReason(err, "stripe_update_product_failed")
        );
      }
    },

    async listPrices(productId) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return failClosed<BillingPrice[]>(clientRes.reason);
      try {
        const prices = await clientRes.value.listPrices(productId);
        return ok(
          prices.map((pr) => ({
            id: pr.id,
            productId: pr.productId,
            currency: pr.currency.toUpperCase(),
            unitAmountCents: pr.unitAmountCents,
            interval: pr.interval,
            active: pr.active
          }))
        );
      } catch (err) {
        return failClosed<BillingPrice[]>(
          asErrorReason(err, "stripe_list_prices_failed")
        );
      }
    },

    async createPrice(input) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return failClosed<BillingPrice>(clientRes.reason);
      try {
        const pr = await clientRes.value.createPrice({
          productId: input.productId,
          currency: input.currency,
          unitAmountCents: input.unitAmountCents,
          interval: input.interval
        });
        return ok({
          id: pr.id,
          productId: pr.productId,
          currency: pr.currency.toUpperCase(),
          unitAmountCents: pr.unitAmountCents,
          interval: pr.interval,
          active: pr.active
        });
      } catch (err) {
        return failClosed<BillingPrice>(
          asErrorReason(err, "stripe_create_price_failed")
        );
      }
    },

    async updatePrice(input) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) return failClosed<BillingPrice>(clientRes.reason);
      try {
        const pr = await clientRes.value.updatePrice({
          priceId: input.priceId,
          active: input.active
        });
        return ok({
          id: pr.id,
          productId: pr.productId,
          currency: pr.currency.toUpperCase(),
          unitAmountCents: pr.unitAmountCents,
          interval: pr.interval,
          active: pr.active
        });
      } catch (err) {
        return failClosed<BillingPrice>(
          asErrorReason(err, "stripe_update_price_failed")
        );
      }
    },

    async createCheckoutSession(input) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) {
        return failClosed<BillingCheckoutSession>(clientRes.reason);
      }
      if (!input.siteId?.trim()) {
        return failClosed<BillingCheckoutSession>("missing_site_id");
      }
      if (!input.priceId?.trim()) {
        return failClosed<BillingCheckoutSession>("missing_price_id");
      }
      if (!input.successUrl?.trim() || !input.cancelUrl?.trim()) {
        return failClosed<BillingCheckoutSession>("missing_return_urls");
      }

      const metadata: Record<string, string> = {
        site_id: input.siteId.trim(),
        escape_hatch_site_id: input.siteId.trim()
      };
      if (input.authUserId) {
        metadata.auth_user_id = input.authUserId;
        metadata.account_id = input.authUserId;
      }
      const tiers = tierIdsCsv(input.tierIds);
      if (tiers) {
        metadata.tier_ids = tiers;
      }

      try {
        const session = await clientRes.value.createCheckoutSession({
          priceId: input.priceId,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          customerId: input.customerId,
          clientReferenceId: input.authUserId ?? null,
          metadata,
          mode: input.mode ?? "hosted"
        });
        return ok<BillingCheckoutSession>({
          id: session.id,
          url: session.url,
          mode: session.mode
        });
      } catch (err) {
        return failClosed<BillingCheckoutSession>(
          asErrorReason(err, "stripe_create_checkout_failed")
        );
      }
    },

    async createCustomerPortalSession(input) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) {
        return failClosed<BillingPortalSession>(clientRes.reason);
      }
      if (!input.customerId?.trim()) {
        return failClosed<BillingPortalSession>("missing_customer_id");
      }
      if (!input.returnUrl?.trim()) {
        return failClosed<BillingPortalSession>("missing_return_url");
      }
      try {
        const session = await clientRes.value.createPortalSession({
          customerId: input.customerId,
          returnUrl: input.returnUrl
        });
        return ok<BillingPortalSession>({
          id: session.id,
          url: session.url
        });
      } catch (err) {
        return failClosed<BillingPortalSession>(
          asErrorReason(err, "stripe_create_portal_failed")
        );
      }
    },

    async verifyWebhookSignature(input) {
      const secret = resolveStripeWebhookSecret(env);
      // Injected client (CI) still requires a webhook secret from env or
      // ESCAPE_HATCH_BILLING_TEST_WEBHOOK_SECRET — never accept unsigned.
      const testSecret = env.ESCAPE_HATCH_BILLING_TEST_WEBHOOK_SECRET?.trim();
      const effective =
        secret ??
        (state.injected && testSecret && !isPlaceholderSecret(testSecret)
          ? testSecret
          : null);

      const verified = verifyStripeWebhookSignature({
        rawBody: input.rawBody,
        signatureHeader: input.signatureHeader,
        secret: effective,
        nowMs: state.nowMs()
      });
      if (!verified.ok) {
        return failClosed<{ verified: true }>(verified.reason);
      }
      return ok({ verified: true as const });
    },

    normalizeWebhookEvent(envelope: BillingWebhookEnvelope): NormalizeWebhookResult {
      const result = normalizeWebhookEvent(envelope, {
        provider: "stripe",
        requireSignature: true,
        nowMs: state.nowMs()
      });
      if (!result.ok) return result;

      // Expand comma-separated tier_ids from Stripe metadata if needed
      if (result.event.tierIds.length === 0) {
        const root = envelope.parsed as { data?: { object?: { metadata?: Record<string, string> } } };
        const meta = root?.data?.object?.metadata;
        const fromCsv = parseTierFromCsv(meta?.tier_ids);
        if (fromCsv.length > 0) {
          return {
            ok: true,
            event: { ...result.event, tierIds: fromCsv }
          };
        }
      }
      return result;
    },

    async exportMigrationMapping(siteId: string) {
      const clientRes = await resolveClient(state);
      if (!clientRes.ok) {
        return failClosed<BillingMigrationMapping>(clientRes.reason);
      }
      try {
        const [customers, subscriptions] = await Promise.all([
          clientRes.value.listCustomers(100),
          clientRes.value.listSubscriptions(100)
        ]);
        const site = siteId.trim();
        const filteredCustomers = customers.filter((c) => {
          const sid =
            c.metadata.site_id ?? c.metadata.escape_hatch_site_id ?? "";
          return !site || !sid || sid === site;
        });
        const filteredSubs = subscriptions.filter((s) => {
          const sid =
            s.metadata.site_id ?? s.metadata.escape_hatch_site_id ?? "";
          return !site || !sid || sid === site;
        });
        return ok<BillingMigrationMapping>({
          customers: filteredCustomers.map((c) => ({
            customerId: c.id,
            authUserId:
              c.metadata.auth_user_id ?? c.metadata.account_id ?? null,
            emailHint: c.email
          })),
          subscriptions: filteredSubs.map((s) => ({
            subscriptionId: s.id,
            customerId: s.customerId,
            tierIds: parseTierFromCsv(s.metadata.tier_ids),
            status: s.status
          })),
          exportedAt: new Date(state.nowMs()).toISOString()
        });
      } catch (err) {
        return failClosed<BillingMigrationMapping>(
          asErrorReason(err, "stripe_migration_export_failed")
        );
      }
    }
  };
}

/**
 * @deprecated Use {@link createStripeBillingProvider}. Kept for EH-050 call sites.
 * Without credentials this still fails closed.
 */
export function createStripeBillingShell(
  opts?: CreateStripeBillingProviderOptions
): BillingProvider {
  return createStripeBillingProvider(opts);
}

export type { StripeBillingClient };
export {
  createMemoryStripeBillingClient,
  wrapStripeSdk
} from "./stripe-client";
export {
  mintStripeWebhookSignature,
  verifyStripeWebhookSignature
} from "./stripe-signature";
