import type { CloneTierRule } from "../clone/types.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type { PaymentConfig, PreflightIssue, PreflightResult } from "./types.js";

export function runPreflight(
  config: PaymentConfig,
  cloneTiers: CloneTierRule[],
  adapters: Map<string, ProviderAdapter>
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const cloneTierIds = new Set(cloneTiers.map((t) => t.tier_id));

  for (const m of config.mappings) {
    if (!cloneTierIds.has(m.tier_id)) {
      issues.push({
        tier_id: m.tier_id,
        code: "UNMAPPED_TIER",
        message: `Tier ${m.tier_id} exists in payment config but not in clone site.`,
        severity: "error"
      });
    }

    if (m.currency !== config.default_currency) {
      issues.push({
        tier_id: m.tier_id,
        code: "CURRENCY_MISMATCH",
        message: `Tier ${m.tier_id} uses ${m.currency} but default is ${config.default_currency}.`,
        severity: "error"
      });
    }

    if (m.billing_interval !== config.default_billing_interval) {
      issues.push({
        tier_id: m.tier_id,
        code: "INTERVAL_MISMATCH",
        message: `Tier ${m.tier_id} uses ${m.billing_interval} but default is ${config.default_billing_interval}.`,
        severity: "warning"
      });
    }

    const adapter = adapters.get(m.provider);
    if (!adapter) {
      issues.push({
        tier_id: m.tier_id,
        code: "UNKNOWN_PROVIDER",
        message: `Provider ${m.provider} not configured.`,
        severity: "error"
      });
      continue;
    }
    const adapterErr = adapter.validateMapping(m);
    if (adapterErr) {
      issues.push({
        tier_id: m.tier_id,
        code: "PROVIDER_VALIDATION",
        message: adapterErr,
        severity: "error"
      });
    }
  }

  for (const ct of cloneTiers) {
    const hasMapping = config.mappings.some((m) => m.tier_id === ct.tier_id);
    if (!hasMapping) {
      issues.push({
        tier_id: ct.tier_id,
        code: "MISSING_MAPPING",
        message: `Clone tier ${ct.tier_id} has no payment mapping.`,
        severity: "error"
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    creator_id: config.creator_id,
    pass: !hasErrors,
    checked_at: new Date().toISOString(),
    issues,
    mappings_checked: config.mappings.length
  };
}
