/**
 * EH-042 Relay managed-verify billing entitlement — focused unit tests.
 * No live Stripe. productionSafe remains false.
 */

import { describe, expect, it } from "vitest";
import {
  createManagedVerifyBillingService,
  createMemoryManagedVerifyBillingStore,
  MANAGED_VERIFY_ADDON_SKU,
  mintTestWebhookSignature,
  resolveManagedVerifyBillingConfig
} from "../src/escape-hatch/managed-verify-billing/index.js";
import { createManagedVerifyService } from "../src/escape-hatch/managed-verify/index.js";

const SITE = "site_eh042_test";
const ISSUER = "https://relay.example/eh-managed-verify";
const AUD = "aud_eh042";
const ORIGIN = "https://creator.example";
const SECRET = "eh042_webhook_secret_test_key";

function fixtureEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_eh042_1",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "sub_eh042",
        status: "active",
        metadata: {
          sku: MANAGED_VERIFY_ADDON_SKU,
          site_id: SITE,
          relay_creator_id: "creator_eh042"
        },
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400
      }
    },
    ...overrides
  };
}

describe("EH-042 product + feature flag", () => {
  it("exposes separate configurable monthly add-on SKU", () => {
    const cfg = resolveManagedVerifyBillingConfig({
      ESCAPE_HATCH_MANAGED_VERIFY_PRICE_CENTS: "4900",
      ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1"
    });
    expect(cfg.product.sku).toBe(MANAGED_VERIFY_ADDON_SKU);
    expect(cfg.product.monthlyPriceCents).toBe(4900);
    expect(cfg.product.displayName).toMatch(/managed Patreon/i);
    expect(cfg.product.costCoverageNotes.length).toBeGreaterThan(3);
    expect(cfg.enabled).toBe(true);
  });

  it("feature flag off denies connector entitlement", () => {
    const svc = createManagedVerifyBillingService({
      env: { ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "0" }
    });
    svc.putRecord({
      siteId: SITE,
      creatorId: null,
      state: "active",
      subscriptionId: "sub_x",
      lastServiceDateIso: null,
      cancelledAtIso: null,
      updatedAtIso: new Date().toISOString(),
      lastEventId: null
    });
    const gate = svc.assertCanIssue({ siteId: SITE });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("billing_feature_flag_off");
  });
});

describe("EH-042 entitlement state machine + grace", () => {
  it("active and grace allow issuance; cancelled/past_due/none deny", () => {
    const svc = createManagedVerifyBillingService({
      env: {
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1",
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED: "0"
      }
    });
    const now = Date.now();
    svc.putRecord({
      siteId: SITE,
      creatorId: null,
      state: "active",
      subscriptionId: "sub",
      lastServiceDateIso: null,
      cancelledAtIso: null,
      updatedAtIso: new Date(now).toISOString(),
      lastEventId: null
    });
    expect(svc.assertCanIssue({ siteId: SITE, nowMs: now }).ok).toBe(true);

    svc.putRecord({
      siteId: SITE,
      creatorId: null,
      state: "grace",
      subscriptionId: "sub",
      lastServiceDateIso: new Date(now + 86400000).toISOString(),
      cancelledAtIso: new Date(now).toISOString(),
      updatedAtIso: new Date(now).toISOString(),
      lastEventId: null
    });
    expect(svc.assertCanIssue({ siteId: SITE, nowMs: now }).ok).toBe(true);

    // Past grace → cancelled
    const past = svc.assertCanIssue({
      siteId: SITE,
      nowMs: now + 2 * 86400000
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.state).toBe("cancelled");

    svc.putRecord({
      siteId: SITE,
      creatorId: null,
      state: "past_due",
      subscriptionId: "sub",
      lastServiceDateIso: new Date(now + 86400000).toISOString(),
      cancelledAtIso: null,
      updatedAtIso: new Date(now).toISOString(),
      lastEventId: null
    });
    expect(svc.assertCanIssue({ siteId: SITE, nowMs: now }).ok).toBe(false);

    expect(svc.assertCanIssue({ siteId: "never_subscribed" }).ok).toBe(false);
  });

  it("cancellation webhook enters grace with last service date", () => {
    const store = createMemoryManagedVerifyBillingStore();
    const svc = createManagedVerifyBillingService({
      store,
      env: {
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1",
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED: "0",
        ESCAPE_HATCH_MANAGED_VERIFY_GRACE_DAYS: "7"
      }
    });
    const periodEnd = Math.floor(Date.now() / 1000) + 5 * 86400;
    const body = JSON.stringify({
      id: "evt_cancel_1",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "sub_c",
          status: "canceled",
          current_period_end: periodEnd,
          metadata: { sku: MANAGED_VERIFY_ADDON_SKU, site_id: SITE }
        }
      }
    });
    const applied = svc.handleWebhook({
      rawBody: body,
      signatureHeader: undefined
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.record?.state).toBe("grace");
      expect(applied.record?.lastServiceDateIso).toBe(
        new Date(periodEnd * 1000).toISOString()
      );
    }
    const copy = svc.cancellationCopy(SITE);
    expect(copy.lastServiceDateIso).toBeTruthy();
    expect(copy.staleWarning).toMatch(/may go stale after/i);
    expect(copy.migrationSteps.some((s) => /creator_oauth/i.test(s))).toBe(
      true
    );
    expect(copy.patronsPreserved).toBe(true);
    expect(copy.nativeContinuesWorking).toMatch(/Native site accounts/i);
  });
});

describe("EH-042 webhook idempotency + signature fail-closed", () => {
  it("rejects unsigned by default when signature required (fail closed)", () => {
    const svc = createManagedVerifyBillingService({
      env: {
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1"
        // no secret, no ALLOW_UNSIGNED → signatureRequired true
      }
    });
    const body = JSON.stringify(fixtureEvent({ id: "evt_unsigned_default" }));
    const result = svc.handleWebhook({
      rawBody: body,
      signatureHeader: undefined
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/webhook_secret_required|missing_signature/);
    }
  });

  it("rejects unsigned when signature required / secret missing", () => {
    const svc = createManagedVerifyBillingService({
      env: {
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1",
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED: "1"
        // no secret
      }
    });
    const body = JSON.stringify(fixtureEvent());
    const result = svc.handleWebhook({
      rawBody: body,
      signatureHeader: mintTestWebhookSignature({ rawBody: body, secret: SECRET })
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("webhook_secret_required");
      expect(result.httpStatus).toBe(503);
    }
  });

  it("rejects invalid signature; accepts valid; idempotent on replay", () => {
    const svc = createManagedVerifyBillingService({
      env: {
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1",
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_WEBHOOK_SECRET: SECRET
      }
    });
    const body = JSON.stringify(fixtureEvent({ id: "evt_idem_1" }));
    const bad = svc.handleWebhook({
      rawBody: body,
      signatureHeader: "t=1,v1=deadbeef"
    });
    expect(bad.ok).toBe(false);

    const sig = mintTestWebhookSignature({ rawBody: body, secret: SECRET });
    const first = svc.handleWebhook({ rawBody: body, signatureHeader: sig });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.duplicate).toBe(false);
      expect(first.record?.state).toBe("active");
    }
    const second = svc.handleWebhook({ rawBody: body, signatureHeader: sig });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.duplicate).toBe(true);
    }
  });
});

describe("EH-042 gates managed-verify mint", () => {
  it("blocks assertion mint when billing inactive / past grace", () => {
    const billing = createManagedVerifyBillingService({
      env: {
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "1",
        ESCAPE_HATCH_MANAGED_VERIFY_BILLING_SIGNATURE_REQUIRED: "0"
      }
    });
    const verify = createManagedVerifyService({
      issuer: ISSUER,
      env: { ESCAPE_HATCH_RELAY_MANAGED_VERIFY_ENABLED: "1" },
      billingGate: billing
    });
    verify.registerSite({
      siteId: SITE,
      audience: AUD,
      callbackOrigins: [ORIGIN]
    });

    const denied = verify.issueAssertion({
      siteId: SITE,
      accountId: "acct",
      patreonUserId: "pat",
      nonce: "n1",
      entitlement: {
        tierIds: ["t1"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/billing_/);

    billing.putRecord({
      siteId: SITE,
      creatorId: null,
      state: "active",
      subscriptionId: "sub",
      lastServiceDateIso: null,
      cancelledAtIso: null,
      updatedAtIso: new Date().toISOString(),
      lastEventId: null
    });
    const allowed = verify.issueAssertion({
      siteId: SITE,
      accountId: "acct",
      patreonUserId: "pat",
      nonce: "n2",
      entitlement: {
        tierIds: ["t1"],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(allowed.ok).toBe(true);
    // Link metadata still recorded — cancellation must not delete patrons
    const exportMeta = verify.exportMigrationMetadata(SITE);
    expect(exportMeta.ok).toBe(true);
  });

  it("feature flag off on billing denies mint even with active record", () => {
    const billing = createManagedVerifyBillingService({
      env: { ESCAPE_HATCH_MANAGED_VERIFY_BILLING_ENABLED: "0" }
    });
    billing.putRecord({
      siteId: SITE,
      creatorId: null,
      state: "active",
      subscriptionId: "sub",
      lastServiceDateIso: null,
      cancelledAtIso: null,
      updatedAtIso: new Date().toISOString(),
      lastEventId: null
    });
    const verify = createManagedVerifyService({
      issuer: ISSUER,
      env: { ESCAPE_HATCH_RELAY_MANAGED_VERIFY_ENABLED: "1" },
      billingGate: billing
    });
    verify.registerSite({
      siteId: SITE,
      audience: AUD,
      callbackOrigins: [ORIGIN]
    });
    const r = verify.issueAssertion({
      siteId: SITE,
      accountId: "a",
      patreonUserId: "p",
      nonce: "n",
      entitlement: {
        tierIds: [],
        observedAtIso: new Date().toISOString(),
        patronStatus: "active_patron"
      }
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("billing_feature_flag_off");
  });
});
