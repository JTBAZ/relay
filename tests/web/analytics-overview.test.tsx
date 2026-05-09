/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorMembershipSummary = vi.fn();
const fetchCreatorMembershipCohorts = vi.fn();
const fetchCreatorTierStickiness = vi.fn();
const fetchCreatorPostPerformance = vi.fn();
const fetchCreatorUsagePreview = vi.fn();
const uploadPatreonInsightsCsv = vi.fn();

vi.mock("@/lib/relay-api", async () => {
  class StubRelayApiError extends Error {
    public override readonly name = "RelayApiError";
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
    }
  }
  return {
    fetchCreatorMembershipSummary: (...a: unknown[]) => fetchCreatorMembershipSummary(...a),
    fetchCreatorMembershipCohorts: (...a: unknown[]) => fetchCreatorMembershipCohorts(...a),
    fetchCreatorTierStickiness: (...a: unknown[]) => fetchCreatorTierStickiness(...a),
    fetchCreatorPostPerformance: (...a: unknown[]) => fetchCreatorPostPerformance(...a),
    fetchCreatorUsagePreview: (...a: unknown[]) => fetchCreatorUsagePreview(...a),
    uploadPatreonInsightsCsv: (...a: unknown[]) => uploadPatreonInsightsCsv(...a),
    RelayApiError: StubRelayApiError
  };
});

import AnalyticsOverviewClient from "../../web/app/analytics/AnalyticsOverviewClient";

const baseSummary = {
  window: { days: 30, start: "2026-01-01T00:00:00.000Z", end: "2026-01-31T00:00:00.000Z" },
  active_paying_members: 42,
  free_patrons: 3,
  total_patrons: 45,
  events_in_window: { join: 2, rejoin: 0, upgrade: 1, downgrade: 0, cancel: 1 },
  adds_in_window: 2,
  cancels_in_window: 1,
  net_growth_events: 1,
  tier_breakdown: [
    { tier_id: "t_gold", title: "Gold", amount_cents: 500, patron_count: 10 }
  ],
  estimated_from_sync: true
};

const baseCohorts = {
  as_of: "2026-01-15T00:00:00.000Z",
  max_months_since_join: 2,
  cohort_months_included: 1,
  cohorts: [
    {
      cohort_month: "2025-12",
      cohort_size: 5,
      retention: [
        { months_since_join: 0, retained_count: 5, cohort_size: 5, retained_pct: 1 },
        { months_since_join: 1, retained_count: 4, cohort_size: 5, retained_pct: 0.8 }
      ]
    }
  ],
  note: "Cohort note."
};

const baseStickiness = {
  as_of: "2026-01-15T00:00:00.000Z",
  window_days: 30,
  tiers: [
    {
      tier_id: "t_gold",
      title: "Gold",
      amount_cents: 500,
      member_count: 10,
      median_tenure_days: 12,
      churn_proxy: 0.1,
      cancel_events_in_window: 1
    }
  ],
  estimated_from_sync: true,
  note: "Stickiness note."
};

const baseUsagePreview = {
  window: { days: 30, start: "2026-01-01T00:00:00.000Z", end: "2026-01-31T00:00:00.000Z" },
  bars: [
    {
      metric: "export.media.content.bytes",
      label: "Export: full media",
      kind: "bytes" as const,
      quantity: "2048"
    },
    {
      metric: "export.media.thumb.bytes",
      label: "Export: thumbnails",
      kind: "bytes" as const,
      quantity: "512"
    },
    {
      metric: "export.media.preview.bytes",
      label: "Export: previews",
      kind: "bytes" as const,
      quantity: "256"
    },
    {
      metric: "export.library_zip.completed",
      label: "Library ZIP downloads",
      kind: "count" as const,
      quantity: "2"
    },
    {
      metric: "api.rate_limited",
      label: "API rate-limit hits (429)",
      kind: "count" as const,
      quantity: "0"
    }
  ],
  disclaimer: "Beta estimates from Relay usage metering only."
};

describe("<AnalyticsOverviewClient />", () => {
  beforeEach(() => {
    fetchCreatorMembershipSummary.mockReset();
    fetchCreatorMembershipCohorts.mockReset();
    fetchCreatorTierStickiness.mockReset();
    fetchCreatorPostPerformance.mockReset();
    fetchCreatorUsagePreview.mockReset();
    uploadPatreonInsightsCsv.mockReset();

    fetchCreatorMembershipSummary.mockImplementation((p?: { days?: number }) => {
      const days = p?.days ?? 30;
      if (days === 7) {
        return Promise.resolve({
          ...baseSummary,
          window: { days: 7, start: "2026-01-08T00:00:00.000Z", end: "2026-01-15T00:00:00.000Z" },
          net_growth_events: 3,
          adds_in_window: 5,
          cancels_in_window: 2
        });
      }
      return Promise.resolve(baseSummary);
    });
    fetchCreatorMembershipCohorts.mockResolvedValue(baseCohorts);
    fetchCreatorTierStickiness.mockResolvedValue(baseStickiness);
    fetchCreatorPostPerformance.mockResolvedValue({
      as_of: "2026-01-15T00:00:00.000Z",
      import_id: null,
      import_uploaded_at: null,
      import_label: null,
      rows: [],
      relay_only_count: 0,
      relay_only_truncated: false,
      note: "Perf note."
    });
    fetchCreatorUsagePreview.mockResolvedValue(baseUsagePreview);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders KPIs after membership summary loads", async () => {
    render(<AnalyticsOverviewClient />);
    await waitFor(() => expect(fetchCreatorMembershipSummary).toHaveBeenCalled());
    expect((await screen.findByTestId("analytics-kpi-paying")).textContent).toBe("42");
    expect(screen.getByTestId("analytics-kpi-net-growth").textContent).toContain("+1");
  });

  it("renders Pulse 7-day momentum from membership summary", async () => {
    render(<AnalyticsOverviewClient />);
    await waitFor(() => expect(fetchCreatorMembershipSummary).toHaveBeenCalled());
    expect(fetchCreatorMembershipSummary).toHaveBeenCalledWith({ days: 7 });
    const pulse = await screen.findByTestId("pulse-momentum");
    expect(pulse.textContent).toContain("+3 net");
    expect(pulse.textContent).toContain("5");
    expect(pulse.textContent).toContain("2");
  });

  it("shows CSV empty state when no Insights import exists", async () => {
    render(<AnalyticsOverviewClient />);
    expect(await screen.findByTestId("analytics-csv-empty")).toBeTruthy();
  });

  it("shows stale Insights warning when last CSV import is older than the threshold", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-01T12:00:00.000Z").getTime());
    fetchCreatorPostPerformance.mockResolvedValue({
      as_of: "2026-06-01T12:00:00.000Z",
      import_id: "imp_stale",
      import_uploaded_at: "2026-05-01T00:00:00.000Z",
      import_label: "May export",
      rows: [],
      relay_only_count: 0,
      relay_only_truncated: false,
      note: null
    });
    render(<AnalyticsOverviewClient />);
    expect(await screen.findByTestId("analytics-insights-stale-warning")).toBeTruthy();
  });

  it("does not show stale Insights warning when import is within the threshold", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-01T12:00:00.000Z").getTime());
    fetchCreatorPostPerformance.mockResolvedValue({
      as_of: "2026-06-01T12:00:00.000Z",
      import_id: "imp_fresh",
      import_uploaded_at: "2026-05-25T00:00:00.000Z",
      import_label: null,
      rows: [],
      relay_only_count: 0,
      relay_only_truncated: false,
      note: null
    });
    render(<AnalyticsOverviewClient />);
    await waitFor(() => expect(fetchCreatorPostPerformance).toHaveBeenCalled());
    expect(screen.queryByTestId("analytics-insights-stale-warning")).toBeNull();
  });
});
