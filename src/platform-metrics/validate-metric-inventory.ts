import { getMetricRegistrySeed } from "./metric-registry-seed.js";
import { REQUIRED_INVENTORY_FIELDS } from "./metric-inventory-scope.js";
import { PLATFORM_METRIC_STATUSES } from "./metric-status-taxonomy.js";

export type MetricInventoryValidationResult = {
  valid: boolean;
  metricCount: number;
  p0Count: number;
  p1Count: number;
  errors: string[];
};

/**
 * PMD-002 — Validates canonical registry seed satisfies inventory contract.
 */
export function validateMetricInventorySeed(): MetricInventoryValidationResult {
  const seed = getMetricRegistrySeed();
  const errors: string[] = [];
  const keys = new Set<string>();

  for (const entry of seed) {
    for (const field of REQUIRED_INVENTORY_FIELDS) {
      const value = entry[field as keyof typeof entry];
      if (value === undefined || value === null || value === "") {
        errors.push(`${entry.key ?? "?"}: missing ${field}`);
      }
    }

    if (keys.has(entry.key)) {
      errors.push(`duplicate key: ${entry.key}`);
    }
    keys.add(entry.key);

    if (!(PLATFORM_METRIC_STATUSES as readonly string[]).includes(entry.initialStatus)) {
      errors.push(`${entry.key}: invalid initialStatus ${entry.initialStatus}`);
    }

    if (entry.priority !== "P0" && entry.priority !== "P1") {
      errors.push(`${entry.key}: invalid priority ${entry.priority}`);
    }
  }

  const p0Count = seed.filter((entry) => entry.priority === "P0").length;
  const p1Count = seed.filter((entry) => entry.priority === "P1").length;

  if (p0Count < 40) {
    errors.push(`expected at least 40 P0 metrics, found ${p0Count}`);
  }
  if (p1Count < 10) {
    errors.push(`expected at least 10 P1 metrics, found ${p1Count}`);
  }

  return {
    valid: errors.length === 0,
    metricCount: seed.length,
    p0Count,
    p1Count,
    errors
  };
}
