import { describe, expect, it } from "vitest";
import {
  buildPlatformMetricDetailContext,
  buildPlatformMetricOwnerNotes,
  buildPlatformMetricWiringDependency,
  extractPlatformMetricWorkItemIds,
  resolvePlatformMetricSourceDocs
} from "./platform-metric-detail";

const sampleMetric = {
  key: "revenue.gross",
  label: "Gross revenue",
  section: "revenue",
  phase: "2",
  status: "collecting",
  scope: "platform",
  definition: "Sum of successful checkout totals.",
  formula: "SUM(checkout_completed.amount)",
  source: "Platform revenue telemetry (PMD-060, PMD-061)",
  value: 1200,
  displayValue: "$1,200",
  freshnessState: "fresh",
  lastUpdatedAt: "2026-05-24T12:00:00.000Z",
  priority: "P0" as const
};

describe("platform metric detail (PMD-013)", () => {
  it("extracts work item ids from source strings", () => {
    expect(extractPlatformMetricWorkItemIds(sampleMetric.source)).toEqual(["PMD-060", "PMD-061"]);
  });

  it("resolves source docs for known work items", () => {
    const docs = resolvePlatformMetricSourceDocs(["PMD-060", "PMD-061"]);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.path).toBe("docs/platform-revenue-telemetry-contract.md");
  });

  it("builds owner notes from weekly review when present", () => {
    const notes = buildPlatformMetricOwnerNotes(sampleMetric, {
      metricKey: sampleMetric.key,
      label: sampleMetric.label,
      section: sampleMetric.section,
      status: sampleMetric.status,
      freshnessState: sampleMetric.freshnessState,
      phase: sampleMetric.phase,
      priority: sampleMetric.priority,
      recommendedAction: "wire",
      reason: "Checkout events exist; wire rollups next."
    });
    expect(notes).toContain("wire rollups");
  });

  it("builds wiring dependency from review triage", () => {
    const wiring = buildPlatformMetricWiringDependency(sampleMetric, {
      metricKey: sampleMetric.key,
      label: sampleMetric.label,
      section: sampleMetric.section,
      status: sampleMetric.status,
      freshnessState: sampleMetric.freshnessState,
      phase: sampleMetric.phase,
      priority: sampleMetric.priority,
      recommendedAction: "monitor",
      reason: "Collecting checkout events."
    });
    expect(wiring).toContain("Monitor");
  });

  it("assembles drawer context with related alerts", () => {
    const context = buildPlatformMetricDetailContext({
      metric: sampleMetric,
      alerts: [
        {
          key: "alert.revenue.drop",
          title: "Revenue drop",
          message: "Gross revenue fell week over week.",
          severity: "warning",
          relatedMetricKey: "revenue.gross",
          sourceContext: "WoW trend"
        },
        {
          key: "alert.other",
          title: "Other",
          message: "Unrelated",
          severity: "warning",
          relatedMetricKey: "activity.dau",
          sourceContext: "DoD trend"
        }
      ]
    });

    expect(context.workItemIds).toEqual(["PMD-060", "PMD-061"]);
    expect(context.alerts).toHaveLength(1);
    expect(context.sourceDocs[0]?.path).toContain("platform-revenue-telemetry-contract");
  });
});
