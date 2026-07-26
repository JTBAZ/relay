/**
 * Billing tier wizard preflight + sandbox readiness (EH-054).
 */

import { createSiteAdapters } from "../adapters";
import type { CloneTierRule } from "../contracts";
import { evaluateSiteProviderPolicy } from "./policy";
import {
  loadBillingTierMap,
  type BillingTierMapDocument
} from "./tier-map";

export type BillingPreflightCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type BillingPreflightReport = {
  production_safe: false;
  siteId: string;
  checkedAt: string;
  ok: boolean;
  checks: BillingPreflightCheck[];
  mappedTier: number;
  catalogTiers: number;
  checkoutProviders: string[];
  sandbox: boolean;
  adapterImplementation: string;
};

export function runBillingTierPreflight(args: {
  siteId: string;
  catalog: readonly CloneTierRule[];
  kitDir?: string;
  map?: BillingTierMapDocument;
  nowIso?: string;
}): BillingPreflightReport {
  const kitDir = args.kitDir ?? process.cwd();
  const map = args.map ?? loadBillingTierMap(args.siteId, kitDir);
  const policy = evaluateSiteProviderPolicy(args.siteId, kitDir);
  const billing = createSiteAdapters().billing;
  const readiness = billing.getReadiness();
  const checks: BillingPreflightCheck[] = [];

  checks.push({
    id: "attestation",
    ok: policy.attestationComplete,
    detail: policy.attestationComplete
      ? `Attestation complete (${policy.category}).`
      : "Content/use attestation incomplete — Checkout stays blocked."
  });

  checks.push({
    id: "checkout_recipe",
    ok: policy.paidLaunchAllowed,
    detail: policy.paidLaunchAllowed
      ? `Checkout allowed via: ${policy.checkoutProviders.join(", ")}.`
      : policy.detail
  });

  const mappedWithPrice = map.entries.filter((e) => e.priceId?.trim());
  const catalogIds = new Set(args.catalog.map((t) => t.tier_id));
  const orphanMaps = mappedWithPrice.filter((e) => !catalogIds.has(e.tierId));
  const unmappedCatalog = args.catalog.filter(
    (t) => !mappedWithPrice.some((e) => e.tierId === t.tier_id)
  );

  checks.push({
    id: "tier_price_map",
    ok: args.catalog.length === 0 || mappedWithPrice.length > 0,
    detail:
      args.catalog.length === 0
        ? "No catalog tiers — mapping optional until tiers exist."
        : `${mappedWithPrice.length}/${args.catalog.length} tiers mapped to a priceId.${
            unmappedCatalog.length
              ? ` Unmapped: ${unmappedCatalog.map((t) => t.tier_id).join(", ")}.`
              : ""
          }${
            orphanMaps.length
              ? ` Orphan map entries: ${orphanMaps.map((e) => e.tierId).join(", ")}.`
              : ""
          }`
  });

  checks.push({
    id: "duplicate_billing_rule",
    ok: true,
    detail:
      "Checkout must call assertNoDuplicateBilling — equivalent Patreon/billing access never starts a second Checkout."
  });

  const adapterOk =
    billing.implementation === "stub"
      ? false
      : readiness.ok || billing.isSandboxMode();

  checks.push({
    id: "adapter",
    ok: billing.implementation !== "stub",
    detail:
      billing.implementation === "stub"
        ? "Billing adapter is stub — set ESCAPE_HATCH_BILLING_PROVIDER=stripe or nowpayments."
        : readiness.ok
          ? `Adapter ${billing.implementation} readiness ok (sandbox=${billing.isSandboxMode()}).`
          : `Adapter ${billing.implementation} selected but not fully ready: ${readiness.reason}`
  });

  checks.push({
    id: "sandbox_honesty",
    ok: true,
    detail: billing.isSandboxMode()
      ? "Sandbox/test mode — do not claim productionSafe."
      : "Live-key mode still keeps Escape Hatch productionSafe=false until Milestone 3."
  });

  void adapterOk;
  const ok = checks
    .filter((c) => c.id !== "sandbox_honesty" && c.id !== "duplicate_billing_rule")
    .every((c) => c.ok);

  return {
    production_safe: false,
    siteId: args.siteId,
    checkedAt: args.nowIso ?? new Date().toISOString(),
    ok,
    checks,
    mappedTier: mappedWithPrice.length,
    catalogTiers: args.catalog.length,
    checkoutProviders: [...policy.checkoutProviders],
    sandbox: billing.isSandboxMode(),
    adapterImplementation: billing.implementation
  };
}
