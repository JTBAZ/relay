/**
 * EH-052 — Provider policy router: matrix, attestation, launch blocking.
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
  createMemoryStripeBillingClient,
  createStripeBillingProvider,
  emptyContentUseAttestation,
  evaluateSiteProviderPolicy,
  getBillingPolicyRow,
  loadContentUseAttestation,
  PROVIDER_POLICY_MATRIX,
  routeProviderPolicy,
  saveContentUseAttestation,
  startIndependentCheckout
} from "../template/lib/billing/index.js";

const SITE = "site_eh_052";

describe("EH-052 status", () => {
  it("advances slice to EH-060 with next EH-061 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-060");
    expect(status.slice).toBe("EH-060");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-061");
    expect(status.nextSlice.title).toMatch(/tiers|patrons|CMS/i);
    expect(
      status.blockers.some((b) => /EH-061|Milestone 3|Stripe/i.test(b))
    ).toBe(true);

    const cap = status.capabilities.find((c) => c.id === "provider-policy");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/EH-052|attestation|matrix/i);
    expect(cap?.nextSlice).toBe("EH-061");
  });
});

describe("EH-052 provider policy matrix + router", () => {
  it("exposes dated Stripe matrix row", () => {
    const row = getBillingPolicyRow();
    expect(row.policyUrl).toMatch(/stripe\.com.*restricted-businesses/);
    expect(row.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      row.eligibilityByCategory.adult_sexual_gratification
    ).toBe("prohibited");
    expect(row.eligibilityByCategory.general_eligible_business).toBe(
      "allowed"
    );
    expect(PROVIDER_POLICY_MATRIX.production_safe).toBe(false);
  });

  it("blocks Stripe for undeclared and adult_sexual categories", () => {
    const undeclared = routeProviderPolicy(emptyContentUseAttestation(SITE));
    expect(undeclared.paidLaunchAllowed).toBe(false);
    expect(undeclared.stripeOffered).toBe(false);
    expect(
      undeclared.recipes.find((r) => r.id === "archive_free_patreon_only")
        ?.offered
    ).toBe(true);

    const adult = routeProviderPolicy({
      ...emptyContentUseAttestation(SITE),
      category: "adult_sexual_gratification",
      acceptedProviderTerms: true,
      affirmedAccurate: true,
      attestedAt: "2026-07-23T12:00:00.000Z"
    });
    expect(adult.stripeEligibility).toBe("prohibited");
    expect(adult.stripeOffered).toBe(false);
    // EH-053: NOWPayments may unlock paid launch; Stripe still blocked
    expect(adult.nowpaymentsOffered).toBe(true);
    expect(adult.paidLaunchAllowed).toBe(true);
    expect(adult.checkoutProviders).toEqual(["nowpayments"]);
  });

  it("offers Stripe only for eligible attested categories", () => {
    const ok = routeProviderPolicy({
      ...emptyContentUseAttestation(SITE),
      category: "creative_non_adult",
      acceptedProviderTerms: true,
      affirmedAccurate: true,
      attestedAt: "2026-07-23T12:00:00.000Z"
    });
    expect(ok.stripeOffered).toBe(true);
    expect(ok.paidLaunchAllowed).toBe(true);
  });

  it("persists attestation and gates checkout hooks", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh052-"));
    try {
      const blocked = assertIndependentCheckoutAllowed({
        siteId: SITE,
        kitDir
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.reason).toBe("provider_policy_attestation_required");
      }

      const saved = saveContentUseAttestation({
        siteId: SITE,
        category: "general_eligible_business",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        kitDir,
        nowIso: "2026-07-23T15:00:00.000Z"
      });
      expect(saved.ok).toBe(true);

      const loaded = loadContentUseAttestation(SITE, kitDir);
      expect(loaded.category).toBe("general_eligible_business");
      expect(evaluateSiteProviderPolicy(SITE, kitDir).paidLaunchAllowed).toBe(
        true
      );

      const adultSave = saveContentUseAttestation({
        siteId: SITE,
        category: "adult_sexual_gratification",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        kitDir
      });
      expect(adultSave.ok).toBe(true);
      const adultGate = assertIndependentCheckoutAllowed({
        siteId: SITE,
        kitDir
      });
      expect(adultGate.ok).toBe(false);
      if (!adultGate.ok) {
        expect(adultGate.reason).toBe("provider_policy_blocks_stripe");
      }

      const client = createMemoryStripeBillingClient();
      const billing = createStripeBillingProvider({
        env: {
          STRIPE_SECRET_KEY: "sk_test_eh052",
          STRIPE_WEBHOOK_SECRET: "whsec_eh052",
          ESCAPE_HATCH_BILLING_PROVIDER: "stripe"
        } as import("../template/lib/env.js").SiteEnv,
        client
      });

      const checkoutBlocked = await startIndependentCheckout({
        billing,
        priceId: "price_x",
        siteId: SITE,
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/cancel",
        kitDir
      });
      expect(checkoutBlocked.ok).toBe(false);
      if (!checkoutBlocked.ok) {
        expect(checkoutBlocked.reason).toBe("provider_policy_blocks_stripe");
      }
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
