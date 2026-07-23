/**
 * EH-051 — Creator-owned Stripe eligible-business adapter (mocked CI sandbox).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  createMemoryBillingCustomerMap,
  createMemoryBillingEntitlementStore,
  createMemoryStripeBillingClient,
  createStripeBillingProvider,
  createStubBillingProvider,
  mintStripeWebhookSignature,
  processVerifiedBillingWebhook,
  resolveCheckoutCustomerId,
  resolvePortalCustomerId,
  startCustomerPortal,
  startIndependentCheckout
} from "../template/lib/billing/index.js";
import { evaluateAccess } from "../template/lib/entitlements/evaluate.js";
import { grantFromSnapshot } from "../template/lib/entitlements/merge.js";
import type { SiteEnv } from "../template/lib/env.js";
import {
  isSafeReturnPath,
  normalizeReturnPath
} from "../template/lib/patreon/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");
const SITE = "site_eh_051";
const USER = "user_eh_051";
const WH_SECRET = "whsec_test_eh051_not_a_real_secret";

function testEnv(partial: Partial<SiteEnv> = {}): SiteEnv {
  return {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
    NEXT_PUBLIC_SITE_NAME: "EH051",
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    ESCAPE_HATCH_IDENTITY_PROVIDER: undefined,
    DATABASE_URL: undefined,
    ESCAPE_HATCH_SESSION_SECRET: undefined,
    SUPABASE_URL: undefined,
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    ESCAPE_HATCH_MEDIA_MODE: undefined,
    ESCAPE_HATCH_MEDIA_SIGNED_URL_TTL_SEC: undefined,
    R2_ENDPOINT: undefined,
    R2_BUCKET: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_PUBLIC_BASE_URL: undefined,
    R2_REGION: undefined,
    STRIPE_SECRET_KEY: "sk_test_eh051_fake_key_for_unit_tests_only",
    STRIPE_WEBHOOK_SECRET: WH_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_eh051",
    ESCAPE_HATCH_BILLING_PROVIDER: "stripe",
    ESCAPE_HATCH_BILLING_TEST_WEBHOOK_SECRET: undefined,
    ESCAPE_HATCH_PATREON_MODE: undefined,
    PATREON_CLIENT_ID: undefined,
    PATREON_CLIENT_SECRET: undefined,
    PATREON_REDIRECT_URI: undefined,
    PATREON_CAMPAIGN_ID: undefined,
    ESCAPE_HATCH_PATREON_TOKEN_KEY: undefined,
    ESCAPE_HATCH_PATREON_OAUTH_STATE_SECRET: undefined,
    ESCAPE_HATCH_PATREON_AUTHORIZE_URL: undefined,
    ESCAPE_HATCH_PATREON_TOKEN_URL: undefined,
    ESCAPE_HATCH_PATREON_IDENTITY_URL: undefined,
    ESCAPE_HATCH_RELAY_VERIFY_BASE_URL: undefined,
    ESCAPE_HATCH_RELAY_SITE_ID: undefined,
    ESCAPE_HATCH_RELAY_ASSERTION_AUDIENCE: undefined,
    ESCAPE_HATCH_RELAY_ASSERTION_ISSUER: undefined,
    ESCAPE_HATCH_RELAY_ASSERTION_JWKS_URL: undefined,
    ESCAPE_HATCH_RELAY_ASSERTION_KEYS_JSON: undefined,
    ESCAPE_HATCH_RELAY_VERIFY_STATE_SECRET: undefined,
    ESCAPE_HATCH_RELAY_VERIFY_ENABLED: undefined,
    ESCAPE_HATCH_RELAY_CONNECTOR_BILLING_ENABLED: undefined,
    ESCAPE_HATCH_RELAY_CONNECTOR_ENTITLEMENT_STATUS: undefined,
    ESCAPE_HATCH_RELAY_CONNECTOR_LAST_SERVICE_DATE: undefined,
    ...partial
  };
}

describe("EH-051 status", () => {
  it("advances slice to EH-053 with next EH-054 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-053");
    expect(status.slice).toBe("EH-053");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-054");
    expect(status.nextSlice.title).toMatch(/tier|billing|wizard/i);
    expect(
      status.blockers.some((b) => /EH-054|tier|Milestone 3|Stripe/i.test(b))
    ).toBe(true);

    const cap = status.capabilities.find((c) => c.id === "billing-adapters");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/EH-051|Checkout|Portal|webhook/i);
    expect(cap?.nextSlice).toBe("EH-054");
    expect(cap?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/lib/billing/",
        "packages/escape-hatch/template/app/api/billing/",
        "packages/escape-hatch/tests/escape-hatch-billing-stripe.test.ts"
      ])
    );
  });
});

describe("EH-051 Stripe adapter sandbox lifecycle", () => {
  it("fails closed without credentials", async () => {
    const billing = createStripeBillingProvider({
      env: testEnv({
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined
      })
    });
    const health = await billing.health();
    expect(health.ok).toBe(false);
    const checkout = await billing.createCheckoutSession({
      priceId: "price_x",
      successUrl: "https://example.test/ok",
      cancelUrl: "https://example.test/cancel",
      siteId: SITE
    });
    expect(checkout.ok).toBe(false);
  });

  it("runs product/price/checkout/portal with injected memory client", async () => {
    const client = createMemoryStripeBillingClient();
    const billing = createStripeBillingProvider({
      env: testEnv(),
      client
    });

    const health = await billing.health();
    expect(health.ok).toBe(true);
    expect(billing.isSandboxMode()).toBe(true);
    expect(billing.getReadiness().ok).toBe(true);
    expect(billing.getCapabilityMatrix().capabilities.createCheckout).toBe(
      true
    );

    const account = await billing.validateAccount();
    expect(account.ok).toBe(true);
    if (account.ok) {
      expect(account.value.chargesEnabled).toBe(true);
      expect(account.value.accountId).toBeTruthy();
    }

    const product = await billing.createProduct({
      name: "Patron",
      tierId: "tier_patron"
    });
    expect(product.ok).toBe(true);
    if (!product.ok) return;

    const price = await billing.createPrice({
      productId: product.value.id,
      currency: "usd",
      unitAmountCents: 900,
      interval: "month"
    });
    expect(price.ok).toBe(true);
    if (!price.ok) return;

    const checkout = await startIndependentCheckout({
      billing,
      priceId: price.value.id,
      siteId: SITE,
      successUrl: "https://example.test/account?ok=1",
      cancelUrl: "https://example.test/tiers",
      authUserId: USER,
      tierIds: ["tier_patron"],
      enforceProviderPolicy: false
    });
    expect(checkout.ok).toBe(true);
    if (checkout.ok) {
      expect(checkout.value.url).toMatch(/^https:\/\//);
      expect(checkout.value.mode).toBe("hosted");
    }

    client.customers.set("cus_eh051", {
      id: "cus_eh051",
      email: "patron@example.test",
      metadata: { site_id: SITE, auth_user_id: USER }
    });

    const portal = await startCustomerPortal({
      billing,
      customerId: "cus_eh051",
      returnUrl: "https://example.test/account"
    });
    expect(portal.ok).toBe(true);
    if (portal.ok) expect(portal.value.url).toMatch(/^https:\/\//);

    const stubHooks = await startIndependentCheckout({
      billing: createStubBillingProvider(),
      priceId: price.value.id,
      siteId: SITE,
      successUrl: "https://example.test/ok",
      cancelUrl: "https://example.test/cancel",
      enforceProviderPolicy: false
    });
    expect(stubHooks.ok).toBe(false);
  });

  it("verifies webhook signatures and grants billing entitlements", async () => {
    const nowMs = Date.parse("2026-07-23T12:00:00.000Z");
    const client = createMemoryStripeBillingClient();
    const billing = createStripeBillingProvider({
      env: testEnv(),
      client,
      nowMs: () => nowMs
    });
    const store = createMemoryBillingEntitlementStore();

    const payload = {
      id: "evt_eh051_sub_created",
      type: "customer.subscription.created",
      created: Math.floor(nowMs / 1000),
      data: {
        object: {
          id: "sub_eh051",
          customer: "cus_eh051",
          status: "active",
          current_period_end: Math.floor(nowMs / 1000) + 86400 * 30,
          cancel_at_period_end: false,
          metadata: {
            site_id: SITE,
            auth_user_id: USER,
            tier_ids: "tier_patron"
          }
        }
      }
    };
    const rawBody = JSON.stringify(payload);
    const signature = mintStripeWebhookSignature({
      rawBody,
      secret: WH_SECRET,
      timestampSec: Math.floor(nowMs / 1000)
    });

    const bad = await billing.verifyWebhookSignature({
      rawBody,
      signatureHeader: null
    });
    expect(bad.ok).toBe(false);

    const good = await billing.verifyWebhookSignature({
      rawBody,
      signatureHeader: signature
    });
    expect(good.ok).toBe(true);

    const processed = await processVerifiedBillingWebhook({
      billing,
      rawBody,
      signatureHeader: signature,
      store
    });
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;
    expect(processed.event.type).toBe("subscription.created");
    expect(processed.event.tierIds).toContain("tier_patron");
    expect(processed.entitlement?.ok).toBe(true);
    if (!processed.entitlement || !processed.entitlement.ok) return;
    expect(processed.entitlement.applied).toBe(true);
    expect(processed.entitlement.snapshot.source).toBe("billing");
    expect(processed.entitlement.snapshot.tierIds).toContain("tier_patron");

    const grant = grantFromSnapshot({
      source: processed.entitlement.snapshot.source,
      tierIds: processed.entitlement.snapshot.tierIds,
      observedAt: processed.entitlement.snapshot.observedAt,
      staleAfter: processed.entitlement.snapshot.staleAfter,
      expiresAt: processed.entitlement.snapshot.expiresAt,
      revokedAt: processed.entitlement.snapshot.revokedAt,
      reason: processed.entitlement.snapshot.reason,
      nowMs
    });
    expect(grant.status).toBe("active");

    const access = evaluateAccess({
      subject: {
        kind: "member",
        userId: USER,
        provider: "portable",
        role: "patron",
        siteId: SITE
      },
      resource: {
        type: "post",
        id: "p1",
        siteId: SITE,
        accessLevel: "tier_gated",
        tierIds: ["tier_patron"],
        matchMode: "exact",
        publishedAt: "2026-01-01T00:00:00.000Z"
      },
      grants: [grant],
      provider: "portable",
      nowMs
    });
    expect(access.allowed).toBe(true);

    const replay = await processVerifiedBillingWebhook({
      billing,
      rawBody,
      signatureHeader: signature,
      store
    });
    expect(replay.ok).toBe(true);
    if (replay.ok && replay.entitlement?.ok) {
      expect(replay.entitlement.duplicate).toBe(true);
      expect(replay.entitlement.applied).toBe(false);
    }

    const cancelPayload = {
      id: "evt_eh051_sub_canceled",
      type: "customer.subscription.deleted",
      created: Math.floor(nowMs / 1000),
      data: {
        object: {
          id: "sub_eh051",
          customer: "cus_eh051",
          status: "canceled",
          metadata: {
            site_id: SITE,
            auth_user_id: USER,
            tier_ids: "tier_patron"
          }
        }
      }
    };
    const cancelRaw = JSON.stringify(cancelPayload);
    const cancelSig = mintStripeWebhookSignature({
      rawBody: cancelRaw,
      secret: WH_SECRET,
      timestampSec: Math.floor(nowMs / 1000)
    });
    const canceled = await processVerifiedBillingWebhook({
      billing,
      rawBody: cancelRaw,
      signatureHeader: cancelSig,
      store
    });
    expect(canceled.ok).toBe(true);
    if (canceled.ok && canceled.entitlement?.ok) {
      expect(canceled.entitlement.snapshot.revokedAt).toBeTruthy();
    }

    const mapping = await billing.exportMigrationMapping(SITE);
    expect(mapping.ok).toBe(true);
  });

  it("never grants from unsigned envelopes", () => {
    const billing = createStripeBillingProvider({
      env: testEnv(),
      client: createMemoryStripeBillingClient()
    });
    const result = billing.normalizeWebhookEvent({
      rawBody: "{}",
      signatureHeader: null,
      parsed: {
        id: "evt_x",
        type: "customer.subscription.created",
        data: {
          object: {
            metadata: { site_id: SITE, auth_user_id: USER, tier_ids: "t1" }
          }
        }
      },
      signatureVerified: false
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsigned_or_unverified");
  });
});

describe("EH-051 docs + routes", () => {
  it("ships webhook/checkout/portal routes and operations notes", () => {
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    expect(ops).toMatch(/EH-051/);
    expect(ops).toMatch(/\/api\/billing\/webhook/);
    expect(ops).toMatch(/Checkout|Customer Portal/i);

    for (const rel of [
      "app/api/billing/webhook/route.ts",
      "app/api/billing/checkout/route.ts",
      "app/api/billing/portal/route.ts"
    ]) {
      const src = readFileSync(join(TEMPLATE, rel), "utf8");
      expect(src).toMatch(/production_safe:\s*false/);
      expect(src.length).toBeGreaterThan(100);
    }

    const checkoutSrc = readFileSync(
      join(TEMPLATE, "app/api/billing/checkout/route.ts"),
      "utf8"
    );
    const portalSrc = readFileSync(
      join(TEMPLATE, "app/api/billing/portal/route.ts"),
      "utf8"
    );
    expect(checkoutSrc).toMatch(/resolveCheckoutCustomerId/);
    expect(checkoutSrc).toMatch(/isSafeReturnPath/);
    expect(portalSrc).toMatch(/resolvePortalCustomerId/);
    expect(portalSrc).toMatch(/isSafeReturnPath/);
    expect(portalSrc).toMatch(/billing_customer_link_missing/);

    const manifest = JSON.parse(
      readFileSync(join(TEMPLATE, "escape-hatch.manifest.json"), "utf8")
    ) as { slice: string; feature_flags: { stripe_billing: boolean } };
    expect(manifest.slice).toBe("EH-053");
    expect(manifest.feature_flags.stripe_billing).toBe(true);

    const envEx = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(envEx).toMatch(/STRIPE_SECRET_KEY/);
    expect(envEx).toMatch(/\/api\/billing\/webhook/);
  });
});

describe("EH-051 customer binding + return path hardening", () => {
  it("ignores client customerId when identity is configured (checkout)", async () => {
    const store = createMemoryBillingCustomerMap();
    await store.set(SITE, USER, "cus_owned_eh051");

    const resolved = await resolveCheckoutCustomerId({
      identityConfigured: true,
      siteId: SITE,
      authUserId: USER,
      clientCustomerId: "cus_attacker_injected",
      store
    });
    expect(resolved.discardedClientCustomerId).toBe(true);
    expect(resolved.customerId).toBe("cus_owned_eh051");

    const noLink = await resolveCheckoutCustomerId({
      identityConfigured: true,
      siteId: SITE,
      authUserId: USER,
      clientCustomerId: "cus_attacker_injected",
      store: createMemoryBillingCustomerMap()
    });
    expect(noLink.customerId).toBeNull();
    expect(noLink.discardedClientCustomerId).toBe(true);
  });

  it("portal without owned mapping fails closed under identity", async () => {
    const store = createMemoryBillingCustomerMap();
    const missing = await resolvePortalCustomerId({
      identityConfigured: true,
      siteId: SITE,
      authUserId: USER,
      clientCustomerId: "cus_anyone",
      store
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.reason).toBe("billing_customer_link_missing");
    }

    await store.set(SITE, USER, "cus_owned_portal");
    const owned = await resolvePortalCustomerId({
      identityConfigured: true,
      siteId: SITE,
      authUserId: USER,
      clientCustomerId: "cus_attacker",
      store
    });
    expect(owned.ok).toBe(true);
    if (owned.ok) {
      expect(owned.customerId).toBe("cus_owned_portal");
      expect(owned.source).toBe("map");
    }
  });

  it("rejects protocol-relative // return paths (Patreon helpers)", () => {
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("/account")).toBe(true);
    expect(normalizeReturnPath("//evil.example", "/account")).toBe("/account");
    expect(normalizeReturnPath("/billing/ok", "/account")).toBe("/billing/ok");
  });

  it("webhook remembers customer link for portal ownership", async () => {
    const nowMs = Date.parse("2026-07-23T12:00:00.000Z");
    const client = createMemoryStripeBillingClient();
    const billing = createStripeBillingProvider({
      env: testEnv(),
      client,
      nowMs: () => nowMs
    });
    const entitlementStore = createMemoryBillingEntitlementStore();
    const customerMap = createMemoryBillingCustomerMap();

    const payload = {
      id: "evt_eh051_link_customer",
      type: "customer.subscription.created",
      created: Math.floor(nowMs / 1000),
      data: {
        object: {
          id: "sub_eh051_link",
          customer: "cus_eh051_linked",
          status: "active",
          current_period_end: Math.floor(nowMs / 1000) + 86400,
          cancel_at_period_end: false,
          metadata: {
            site_id: SITE,
            auth_user_id: USER,
            tier_ids: "tier_patron"
          }
        }
      }
    };
    const rawBody = JSON.stringify(payload);
    const signature = mintStripeWebhookSignature({
      rawBody,
      secret: WH_SECRET,
      timestampSec: Math.floor(nowMs / 1000)
    });

    const processed = await processVerifiedBillingWebhook({
      billing,
      rawBody,
      signatureHeader: signature,
      store: entitlementStore,
      customerMap
    });
    expect(processed.ok).toBe(true);
    expect(await customerMap.get(SITE, USER)).toBe("cus_eh051_linked");

    const portal = await resolvePortalCustomerId({
      identityConfigured: true,
      siteId: SITE,
      authUserId: USER,
      clientCustomerId: "cus_other",
      store: customerMap
    });
    expect(portal.ok).toBe(true);
    if (portal.ok) expect(portal.customerId).toBe("cus_eh051_linked");
  });
});
