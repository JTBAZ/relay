/**
 * PILOT-015 — Analytics Action Center MVP sign-off: routes, APIs, UI wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

describe("PILOT-015 — Analytics Action Center MVP sign-off", () => {
  it("/studio/analytics and /studio/actions pages render behind StudioRouteGuard", () => {
    const analyticsPage = readFileSync(join(ROOT, "web/app/studio/analytics/page.tsx"), "utf8");
    const actionCenterPage = readFileSync(join(ROOT, "web/app/studio/actions/page.tsx"), "utf8");
    expect(analyticsPage).toContain("AnalyticsOverviewClient");
    expect(analyticsPage).toContain("StudioRouteGuard");
    expect(actionCenterPage).toContain("ActionCenterView");
    expect(actionCenterPage).toContain("StudioRouteGuard");
  });

  it("AnalyticsOverviewClient wires membership KPIs, cohorts, CSV import, and Action Center link", () => {
    const client = readFileSync(
      join(ROOT, "web/app/studio/analytics/AnalyticsOverviewClient.tsx"),
      "utf8"
    );
    expect(client).toContain("fetchCreatorMembershipSummary");
    expect(client).toContain("fetchCreatorMembershipCohorts");
    expect(client).toContain("fetchCreatorTierStickiness");
    expect(client).toContain("fetchCreatorPostPerformance");
    expect(client).toContain("uploadPatreonInsightsCsv");
    expect(client).toContain('href: "/studio/actions"');
    expect(client).toContain("analytics-kpi-paying");
    expect(client).toContain("insights-csv-upload");
  });

  it("ActionCenterView wires insight cards, refresh, and growth sections", () => {
    const view = readFileSync(join(ROOT, "web/app/studio/actions/ActionCenterView.tsx"), "utf8");
    expect(view).toContain("fetchActionCenterCards");
    expect(view).toContain("fetchAnalyticsHealth");
    expect(view).toContain("postAnalyticsGenerate");
    expect(view).toContain("postActionCenterAccept");
    expect(view).toContain("postActionCenterDismiss");
    expect(view).toContain("Refresh insights");
    expect(view).toContain("InsightsSection");
    expect(view).toContain("DiscoverySection");
  });

  it("server exposes creator analytics and action-center routes", () => {
    const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    expect(server).toMatch(/app\.get\("\/api\/v1\/creator\/analytics\/membership-summary"/);
    expect(server).toMatch(/app\.get\("\/api\/v1\/creator\/analytics\/membership-cohorts"/);
    expect(server).toMatch(/app\.get\("\/api\/v1\/creator\/analytics\/tier-stickiness"/);
    expect(server).toMatch(/app\.get\("\/api\/v1\/creator\/analytics\/post-performance"/);
    expect(server).toMatch(/app\.post\("\/api\/v1\/creator\/analytics\/patreon-insights-csv"/);
    expect(server).toMatch(/app\.get\("\/api\/v1\/action-center\/cards"/);
    expect(server).toContain("ActionCenterService");
  });

  it("relay-api exports analytics and action-center helpers", () => {
    const api = readFileSync(join(ROOT, "web/lib/relay-api.ts"), "utf8");
    expect(api).toContain("fetchCreatorMembershipSummary");
    expect(api).toContain("fetchCreatorMembershipCohorts");
    expect(api).toContain("fetchCreatorPostPerformance");
    expect(api).toContain("uploadPatreonInsightsCsv");
    expect(api).toContain("fetchActionCenterCards");
    expect(api).toContain("postAnalyticsGenerate");
  });
});
