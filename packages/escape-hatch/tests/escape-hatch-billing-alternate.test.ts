/**
 * EH-053 — Lawful alternate billing: NOWPayments + CCBill/Segpay guidance.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  assertIndependentCheckoutAllowed,
  createMemoryNowPaymentsClient,
  createNowPaymentsBillingProvider,
  createMemoryStripeBillingClient,
  createStripeBillingProvider,
  emptyContentUseAttestation,
  getProviderPolicyRow,
  PROVIDER_POLICY_MATRIX,
  routeProviderPolicy,
  saveContentUseAttestation,
  startIndependentCheckout
} from "../template/lib/billing/index.js";

const SITE = "site_eh_053";

describe("EH-053 status", () => {
  it("advances slice to EH-074 with next EH-080 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-074");
    expect(status.slice).toBe("EH-074");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-080");
    expect(status.nextSlice.title).toMatch(/ownership/i);

    const billing = status.capabilities.find((c) => c.id === "billing-adapters");
    expect(billing?.evidence).toMatch(/NOWPayments|EH-053/i);
    expect(billing?.nextSlice).toBe("EH-080");
  });
});

describe("EH-053 alternate recipes", () => {
  it("documents NOWPayments, CCBill, and Segpay matrix rows", () => {
    expect(getProviderPolicyRow("nowpayments")?.checkedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
    expect(getProviderPolicyRow("ccbill")?.accountApprovalNotes).toMatch(
      /LLC|merchant|approved/i
    );
    expect(getProviderPolicyRow("segpay")?.accountApprovalNotes).toMatch(
      /LLC|merchant|approved/i
    );
    expect(PROVIDER_POLICY_MATRIX.production_safe).toBe(false);
  });

  it("offers NOWPayments + CCBill/Segpay guidance for adult; never Stripe Checkout", () => {
    const adult = routeProviderPolicy({
      ...emptyContentUseAttestation(SITE),
      category: "adult_sexual_gratification",
      acceptedProviderTerms: true,
      affirmedAccurate: true,
      attestedAt: "2026-07-23T12:00:00.000Z"
    });
    expect(adult.stripeOffered).toBe(false);
    expect(adult.nowpaymentsOffered).toBe(true);
    expect(adult.paidLaunchAllowed).toBe(true);
    expect(adult.checkoutProviders).toEqual(["nowpayments"]);

    const ccbill = adult.recipes.find((r) => r.id === "ccbill_merchant_card");
    const segpay = adult.recipes.find((r) => r.id === "segpay_merchant_card");
    expect(ccbill?.offered).toBe(true);
    expect(ccbill?.requiresMerchantApproval).toBe(true);
    expect(ccbill?.checkoutProvider).toBeNull();
    expect(segpay?.offered).toBe(true);
    expect(segpay?.requiresMerchantApproval).toBe(true);
    expect(segpay?.checkoutProvider).toBeNull();
  });

  it("blocks Stripe checkout and allows NOWPayments for adult attestation", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh053-"));
    try {
      const saved = saveContentUseAttestation({
        siteId: SITE,
        category: "adult_sexual_gratification",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        attestedByHint: "test",
        kitDir
      });
      expect(saved.ok).toBe(true);

      const stripeBlocked = assertIndependentCheckoutAllowed({
        siteId: SITE,
        kitDir,
        implementation: "stripe"
      });
      expect(stripeBlocked.ok).toBe(false);
      if (!stripeBlocked.ok) {
        expect(stripeBlocked.reason).toBe("provider_policy_blocks_stripe");
      }

      const npAllowed = assertIndependentCheckoutAllowed({
        siteId: SITE,
        kitDir,
        implementation: "nowpayments"
      });
      expect(npAllowed.ok).toBe(true);

      const stripe = createStripeBillingProvider({
        client: createMemoryStripeBillingClient()
      });
      const stripeCheckout = await startIndependentCheckout({
        billing: stripe,
        priceId: "price_x",
        siteId: SITE,
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/cancel",
        kitDir
      });
      expect(stripeCheckout.ok).toBe(false);

      const np = createNowPaymentsBillingProvider({
        client: createMemoryNowPaymentsClient()
      });
      const product = await np.createProduct({ name: "Adult tier" });
      expect(product.ok).toBe(true);
      if (!product.ok) return;
      const price = await np.createPrice({
        productId: product.value.id,
        currency: "usd",
        unitAmountCents: 999,
        interval: "month"
      });
      expect(price.ok).toBe(true);
      if (!price.ok) return;

      const npCheckout = await startIndependentCheckout({
        billing: np,
        priceId: price.value.id,
        siteId: SITE,
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/cancel",
        kitDir
      });
      expect(npCheckout.ok).toBe(true);
      if (npCheckout.ok) {
        expect(npCheckout.value.url).toMatch(/nowpayments|payment/i);
        expect(npCheckout.value.mode).toBe("hosted");
      }
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("fails closed NOWPayments health without injected client or secrets", async () => {
    const bare = createNowPaymentsBillingProvider();
    const health = await bare.health();
    expect(health.ok).toBe(false);
    expect(health.reason ?? "").toMatch(/nowpayments|not_configured|not_wired/i);
  });
});
