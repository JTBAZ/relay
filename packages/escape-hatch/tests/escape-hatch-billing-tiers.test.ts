/**
 * EH-054 — Tier map, conversion CTAs, duplicate-billing safeguards.
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
  assertNoDuplicateBilling,
  buildConversionSubjectFromSummary,
  buildTierCatalogCards,
  emptyContentUseAttestation,
  loadBillingTierMap,
  resolveTierConversionAction,
  routeProviderPolicy,
  runBillingTierPreflight,
  saveBillingTierMap,
  saveContentUseAttestation
} from "../template/lib/billing/index.js";

const SITE = "site_eh_054";

const CATALOG = [
  {
    tier_id: "tier_basic",
    title: "Basic",
    access_level: "tier_gated" as const,
    amount_cents: 500
  },
  {
    tier_id: "tier_pro",
    title: "Pro",
    access_level: "tier_gated" as const,
    amount_cents: 1500
  }
];

describe("EH-054 status", () => {
  it("advances slice to EH-054 with next EH-060 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-054");
    expect(status.slice).toBe("EH-054");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-060");
  });
});

describe("EH-054 tier map + conversion", () => {
  it("persists tier→price map and builds catalog cards", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh054-"));
    try {
      const saved = saveBillingTierMap({
        siteId: SITE,
        kitDir,
        entries: [
          {
            tierId: "tier_basic",
            priceId: "price_basic",
            productId: "prod_basic",
            currency: "usd",
            unitAmountCents: 500,
            interval: "month",
            benefitCopy: "Basic benefits",
            patreonContinuityNote: "Matches Patreon Basic"
          }
        ]
      });
      expect(saved.ok).toBe(true);
      const map = loadBillingTierMap(SITE, kitDir);
      expect(map.entries[0]?.priceId).toBe("price_basic");

      saveContentUseAttestation({
        siteId: SITE,
        category: "creative_non_adult",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        kitDir
      });
      const policy = routeProviderPolicy({
        ...emptyContentUseAttestation(SITE),
        category: "creative_non_adult",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        attestedAt: "2026-07-23T12:00:00.000Z"
      });

      const anon = buildConversionSubjectFromSummary({
        signedIn: false,
        tierIds: [],
        source: null
      });
      const cards = buildTierCatalogCards({
        catalog: CATALOG,
        map,
        subject: anon,
        policy
      });
      expect(cards[0]?.action.kind).toBe("choose_tier");
      expect(cards[0]?.mapped).toBe(true);
      expect(cards[1]?.action.kind).toBe("choose_tier");
      expect(cards[1]?.mapped).toBe(false);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("blocks duplicate billing when Patreon already covers the tier", () => {
    const subject = buildConversionSubjectFromSummary({
      signedIn: true,
      tierIds: ["tier_basic"],
      source: "patreon"
    });
    const dup = assertNoDuplicateBilling({
      tier: CATALOG[0]!,
      catalog: CATALOG,
      subject
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe("duplicate_billing_prevented");

    const action = resolveTierConversionAction({
      tier: CATALOG[0]!,
      map: {
        contract_version: "eh-billing-tier-map/1.0.0",
        site_id: SITE,
        production_safe: false,
        entries: [
          {
            tierId: "tier_basic",
            productId: "prod_basic",
            priceId: "price_basic",
            currency: "USD",
            unitAmountCents: 500,
            interval: "month",
            patreonContinuityNote: null,
            benefitCopy: null,
            updatedAt: "2026-07-23T12:00:00.000Z"
          }
        ],
        updatedAt: "2026-07-23T12:00:00.000Z"
      },
      subject,
      policy: routeProviderPolicy({
        ...emptyContentUseAttestation(SITE),
        category: "creative_non_adult",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        attestedAt: "2026-07-23T12:00:00.000Z"
      }),
      catalog: CATALOG
    });
    expect(action.kind).toBe("already_included");
    expect(action.blocksCheckout).toBe(true);
  });

  it("offers manage_billing when independent sub covers the tier", () => {
    const subject = buildConversionSubjectFromSummary({
      signedIn: true,
      tierIds: ["tier_basic"],
      source: "billing"
    });
    const action = resolveTierConversionAction({
      tier: CATALOG[0]!,
      map: {
        contract_version: "eh-billing-tier-map/1.0.0",
        site_id: SITE,
        production_safe: false,
        entries: [
          {
            tierId: "tier_basic",
            productId: "prod_basic",
            priceId: "price_basic",
            currency: "USD",
            unitAmountCents: 500,
            interval: "month",
            patreonContinuityNote: null,
            benefitCopy: null,
            updatedAt: "2026-07-23T12:00:00.000Z"
          }
        ],
        updatedAt: "2026-07-23T12:00:00.000Z"
      },
      subject,
      policy: routeProviderPolicy({
        ...emptyContentUseAttestation(SITE),
        category: "creative_non_adult",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        attestedAt: "2026-07-23T12:00:00.000Z"
      }),
      catalog: CATALOG
    });
    expect(action.kind).toBe("manage_billing");
  });

  it("runs preflight report without claiming productionSafe", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh054-pf-"));
    try {
      saveContentUseAttestation({
        siteId: SITE,
        category: "creative_non_adult",
        acceptedProviderTerms: true,
        affirmedAccurate: true,
        kitDir
      });
      saveBillingTierMap({
        siteId: SITE,
        kitDir,
        entries: [
          { tierId: "tier_basic", priceId: "price_basic", interval: "month" }
        ]
      });
      const report = runBillingTierPreflight({
        siteId: SITE,
        catalog: CATALOG,
        kitDir
      });
      expect(report.production_safe).toBe(false);
      expect(report.mappedTier).toBe(1);
      expect(report.checks.some((c) => c.id === "duplicate_billing_rule")).toBe(
        true
      );
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
