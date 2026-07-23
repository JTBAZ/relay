/**
 * EH-050 — Billing provider contract: surface, normalize, entitlement events.
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
  createSiteAdapters,
  createStubAdapters
} from "../template/lib/adapters/index.js";
import {
  applyBillingEntitlementEvent,
  createMemoryBillingEntitlementStore,
  createStripeBillingShell,
  createStubBillingProvider,
  normalizeWebhookEvent,
  reportBillingReadiness,
  unsignedEnvelopeFromParsed,
  verifiedEnvelopeFromParsed
} from "../template/lib/billing/index.js";
import { evaluateAccess } from "../template/lib/entitlements/evaluate.js";
import { grantFromSnapshot } from "../template/lib/entitlements/merge.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");
const SITE = "site_eh_050";
const USER = "user_eh_050";

describe("EH-050 status", () => {
  it("advances slice to EH-061 with next EH-062 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-061");
    expect(status.slice).toBe("EH-061");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-062");
    expect(status.nextSlice.title).toMatch(/appearance|connections|health/i);
    expect(
      status.blockers.some((b) => /EH-062|Milestone 3|Stripe/i.test(b))
    ).toBe(true);
    expect(status.blockers.some((b) => /belongs to EH-050\/051/i.test(b))).toBe(
      false
    );

    const cap = status.capabilities.find((c) => c.id === "billing-adapters");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/EH-051|BillingProvider|Checkout|webhook/i);
    expect(cap?.evidence).toMatch(/EH-053|NOWPayments|Stripe/);
    expect(cap?.nextSlice).toBe("EH-062");
    expect(cap?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/lib/billing/",
        "packages/escape-hatch/tests/escape-hatch-billing-contract.test.ts"
      ])
    );
  });
});

describe("EH-050 BillingProvider contract surface", () => {
  it("stub health is honest and money paths fail closed", async () => {
    const billing = createStubBillingProvider();
    expect(billing.implementation).toBe("stub");
    const health = await billing.health();
    expect(health.ok).toBe(false);
    if (!health.ok) expect(health.reason).toMatch(/stub|EH-050|EH-051/i);

    const checkout = await billing.createCheckoutSession({
      priceId: "price_x",
      successUrl: "https://example.test/ok",
      cancelUrl: "https://example.test/cancel",
      siteId: SITE
    });
    expect(checkout.ok).toBe(false);
    if (!checkout.ok) expect(checkout.reason).toMatch(/stub|EH-051|not_implemented/i);

    const portal = await billing.createCustomerPortalSession({
      customerId: "cus_x",
      returnUrl: "https://example.test/account"
    });
    expect(portal.ok).toBe(false);

    const verify = await billing.verifyWebhookSignature({
      rawBody: "{}",
      signatureHeader: null
    });
    expect(verify.ok).toBe(false);

    expect(billing.isSandboxMode()).toBe(true);
    expect(billing.getCapabilityMatrix().ready).toBe(false);
    expect(billing.getCapabilityMatrix().capabilities.normalizeLifecycle).toBe(
      true
    );
    expect(billing.getPolicyDeclaration().implementation).toBe("stub");
  });

  it("unconfigured stripe adapter fails closed", async () => {
    const billing = createStripeBillingShell();
    expect(billing.implementation).toBe("stripe");
    const health = await billing.health();
    expect(health.ok).toBe(false);
    if (!health.ok) expect(health.reason).toMatch(/not configured|stripe_not_configured|partially configured|fail closed/i);
    const readiness = reportBillingReadiness("stripe");
    expect(readiness.ok).toBe(false);
    expect(readiness.requiredEnvNames).toEqual(
      expect.arrayContaining([
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
      ])
    );
  });

  it("createSiteAdapters defaults to stub billing", async () => {
    const adapters = createSiteAdapters();
    expect(adapters.billing.implementation).toBe("stub");
    const h = await adapters.billing.health();
    expect(h.ok).toBe(false);

    const stubs = createStubAdapters();
    expect(stubs.billing.implementation).toBe("stub");
  });
});

describe("EH-050 normalizeWebhookEvent", () => {
  const fixtureCreated = {
    id: "evt_eh050_created",
    type: "customer.subscription.created",
    created: 1_721_700_000,
    data: {
      object: {
        id: "sub_eh050",
        customer: "cus_eh050",
        status: "active",
        current_period_end: 1_724_400_000,
        cancel_at_period_end: false,
        metadata: {
          site_id: SITE,
          auth_user_id: USER,
          tier_ids: ["tier_gold"]
        }
      }
    }
  };

  it("normalizes verified Stripe-like fixtures to canonical events", () => {
    const envelope = verifiedEnvelopeFromParsed(fixtureCreated);
    const result = normalizeWebhookEvent(envelope, { provider: "stub" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.type).toBe("subscription.created");
    expect(result.event.siteId).toBe(SITE);
    expect(result.event.authUserId).toBe(USER);
    expect(result.event.subscriptionId).toBe("sub_eh050");
    expect(result.event.tierIds).toEqual(["tier_gold"]);
    expect(result.event.status).toBe("active");
  });

  it("maps canceled / past_due aliases", () => {
    const canceled = normalizeWebhookEvent(
      verifiedEnvelopeFromParsed({
        id: "evt_cancel",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_1",
            status: "canceled",
            metadata: { site_id: SITE, auth_user_id: USER, tier_ids: ["t1"] }
          }
        }
      })
    );
    expect(canceled.ok).toBe(true);
    if (canceled.ok) {
      expect(canceled.event.type).toBe("subscription.canceled");
      expect(canceled.event.status).toBe("canceled");
    }

    const pastDue = normalizeWebhookEvent(
      verifiedEnvelopeFromParsed({
        id: "evt_pd",
        type: "invoice.payment_failed",
        data: {
          object: {
            subscription: "sub_1",
            customer: "cus_1",
            metadata: { site_id: SITE, auth_user_id: USER, tier_ids: ["t1"] }
          }
        }
      })
    );
    expect(pastDue.ok).toBe(true);
    if (pastDue.ok) {
      expect(pastDue.event.type).toBe("invoice.payment_failed");
      expect(pastDue.event.status).toBe("past_due");
    }
  });

  it("rejects unsigned and malformed envelopes fail-closed", () => {
    const unsigned = normalizeWebhookEvent(
      unsignedEnvelopeFromParsed(fixtureCreated)
    );
    expect(unsigned.ok).toBe(false);
    if (!unsigned.ok) expect(unsigned.reason).toBe("unsigned_or_unverified");

    const missing = normalizeWebhookEvent(null);
    expect(missing.ok).toBe(false);

    const malformed = normalizeWebhookEvent(
      verifiedEnvelopeFromParsed("not-json-object")
    );
    expect(malformed.ok).toBe(false);

    const noType = normalizeWebhookEvent(
      verifiedEnvelopeFromParsed({ id: "evt_x", data: {} })
    );
    expect(noType.ok).toBe(false);
    if (!noType.ok) expect(noType.reason).toBe("missing_event_type");

    const noSite = normalizeWebhookEvent(
      verifiedEnvelopeFromParsed({
        id: "evt_y",
        type: "subscription.created",
        data: { object: { metadata: {} } }
      })
    );
    expect(noSite.ok).toBe(false);
    if (!noSite.ok) expect(noSite.reason).toBe("missing_site_id");
  });

  it("stub provider normalizeWebhookEvent requires signature", () => {
    const billing = createStubBillingProvider();
    const bad = billing.normalizeWebhookEvent(
      unsignedEnvelopeFromParsed(fixtureCreated)
    );
    expect(bad.ok).toBe(false);
    const good = billing.normalizeWebhookEvent(
      verifiedEnvelopeFromParsed(fixtureCreated)
    );
    expect(good.ok).toBe(true);
  });
});

describe("EH-050 applyBillingEntitlementEvent → evaluateAccess", () => {
  const nowMs = Date.parse("2026-07-23T12:00:00.000Z");

  it("grants merge with source billing and evaluateAccess allows", async () => {
    const store = createMemoryBillingEntitlementStore();
    const normalized = normalizeWebhookEvent(
      verifiedEnvelopeFromParsed({
        id: "evt_grant_1",
        type: "subscription.created",
        occurred_at: "2026-07-23T11:00:00.000Z",
        site_id: SITE,
        auth_user_id: USER,
        tier_ids: ["tier_gold"],
        subscription_id: "sub_g",
        subscription_status: "active"
      })
    );
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const applied = await applyBillingEntitlementEvent({
      store,
      lifecycle: normalized.event,
      seenEventIds: store.seenEventIds,
      nowMs
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.source).toBe("billing");
    expect(applied.snapshot.tierIds).toEqual(["tier_gold"]);
    expect(applied.snapshot.revokedAt).toBeNull();

    const grant = grantFromSnapshot({
      source: applied.snapshot.source,
      tierIds: applied.snapshot.tierIds,
      observedAt: applied.snapshot.observedAt,
      staleAfter: applied.snapshot.staleAfter,
      expiresAt: applied.snapshot.expiresAt,
      revokedAt: applied.snapshot.revokedAt,
      reason: applied.snapshot.reason,
      nowMs
    });
    expect(grant.source).toBe("billing");
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
        tierIds: ["tier_gold"],
        matchMode: "exact",
        publishedAt: "2026-01-01T00:00:00.000Z"
      },
      grants: [grant],
      provider: "portable",
      nowMs
    });
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("entitlement_grant");
    expect(access.grants.some((g) => g.source === "billing")).toBe(true);
  });

  it("revoke clears tiers and evaluateAccess denies", async () => {
    const store = createMemoryBillingEntitlementStore();
    await applyBillingEntitlementEvent({
      store,
      lifecycle: {
        id: "evt_g",
        type: "subscription.created",
        occurredAt: "2026-07-23T11:00:00.000Z",
        siteId: SITE,
        authUserId: USER,
        customerId: "cus_1",
        subscriptionId: "sub_1",
        tierIds: ["tier_gold"],
        status: "active",
        currentPeriodEndIso: null,
        cancelAtPeriodEnd: false,
        currency: "USD",
        amountCents: 1000,
        interval: "month",
        provider: "stub",
        reason: null
      },
      seenEventIds: store.seenEventIds,
      nowMs
    });

    const revoked = await applyBillingEntitlementEvent({
      store,
      lifecycle: {
        id: "evt_r",
        type: "subscription.canceled",
        occurredAt: "2026-07-23T12:00:00.000Z",
        siteId: SITE,
        authUserId: USER,
        customerId: "cus_1",
        subscriptionId: "sub_1",
        tierIds: ["tier_gold"],
        status: "canceled",
        currentPeriodEndIso: null,
        cancelAtPeriodEnd: false,
        currency: "USD",
        amountCents: null,
        interval: "month",
        provider: "stub",
        reason: null
      },
      seenEventIds: store.seenEventIds,
      nowMs
    });
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.snapshot.source).toBe("billing");
    expect(revoked.snapshot.tierIds).toEqual([]);
    expect(revoked.snapshot.revokedAt).toBeTruthy();

    const grant = grantFromSnapshot({
      source: "billing",
      tierIds: revoked.snapshot.tierIds,
      observedAt: revoked.snapshot.observedAt,
      staleAfter: revoked.snapshot.staleAfter,
      expiresAt: revoked.snapshot.expiresAt,
      revokedAt: revoked.snapshot.revokedAt,
      nowMs
    });
    const access = evaluateAccess({
      subject: {
        kind: "member",
        userId: USER,
        provider: "supabase",
        role: "patron",
        siteId: SITE
      },
      resource: {
        type: "post",
        id: "p1",
        siteId: SITE,
        accessLevel: "member_only",
        tierIds: [],
        publishedAt: "2026-01-01T00:00:00.000Z"
      },
      grants: [grant],
      provider: "supabase",
      nowMs
    });
    expect(access.allowed).toBe(false);
  });

  it("rejects non-billing source and missing identity", async () => {
    const store = createMemoryBillingEntitlementStore();
    const badSource = await applyBillingEntitlementEvent({
      store,
      event: {
        kind: "grant",
        source: "billing",
        siteId: SITE,
        authUserId: "",
        tierIds: ["t"],
        observedAt: "2026-07-23T12:00:00.000Z",
        staleAfter: null,
        expiresAt: null,
        revokedAt: null,
        reason: "x",
        lifecycleEventId: "e1",
        customerId: null,
        subscriptionId: null
      }
    });
    expect(badSource.ok).toBe(false);

    const missing = await applyBillingEntitlementEvent({ store });
    expect(missing.ok).toBe(false);
  });

  it("does not trust provider payloads without normalize", async () => {
    // Direct client-shaped object must not be treatable as a grant without
    // going through normalizeWebhookEvent + applyBillingEntitlementEvent.
    const rawClientClaim = {
      entitled: true,
      tier_ids: ["tier_gold"],
      source: "stripe_client"
    };
    const envelope = unsignedEnvelopeFromParsed(rawClientClaim);
    const norm = normalizeWebhookEvent(envelope);
    expect(norm.ok).toBe(false);
  });
});

describe("EH-050 docs + env honesty", () => {
  it("documents contract boundary and EH-051 Stripe adapter", () => {
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    expect(ops).toMatch(/EH-050/);
    expect(ops).toMatch(/BillingProvider|normalizeWebhookEvent|source:\s*"billing"|source: billing/i);
    expect(ops).toMatch(/EH-051/);
    expect(ops).toMatch(/no %|no percentage|takes \*\*no %\*\*/i);

    const envEx = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(envEx).toMatch(/ESCAPE_HATCH_BILLING_PROVIDER/);
    expect(envEx).toMatch(/STRIPE_SECRET_KEY/);
    expect(envEx).toMatch(/EH-051/);

    const manifest = JSON.parse(
      readFileSync(join(TEMPLATE, "escape-hatch.manifest.json"), "utf8")
    );
    expect(manifest.slice).toBe("EH-061");
    expect(manifest.productionSafe).toBe(false);
    expect(manifest.adapters.billing.state).toBe("preview_only");
  });
});
