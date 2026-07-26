/** @vitest-environment happy-dom */

import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorMembershipSummary = vi.fn();
const fetchCreatorMembershipCohorts = vi.fn();
const fetchCreatorTierStickiness = vi.fn();
const fetchCreatorPostPerformance = vi.fn();
const fetchCreatorUsagePreview = vi.fn();
const fetchCreatorTipBetaStats = vi.fn();
const fetchCreatorUnifiedPerformance = vi.fn();
const fetchPerformanceOverview = vi.fn();
const fetchPerformanceCampaignRollups = vi.fn();
const fetchPerformanceTagRollups = vi.fn();
const fetchPerformanceWorks = vi.fn();
const fetchCreativeWorkBundleSuggestions = vi.fn();
const fetchPerformanceInsightActions = vi.fn();
const fetchPerformanceGoals = vi.fn();
const createPerformanceGoal = vi.fn();
const deletePerformanceGoal = vi.fn();
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
    fetchCreatorUnifiedPerformance: (...a: unknown[]) => fetchCreatorUnifiedPerformance(...a),
    fetchCreatorUsagePreview: (...a: unknown[]) => fetchCreatorUsagePreview(...a),
    fetchCreatorTipBetaStats: (...a: unknown[]) => fetchCreatorTipBetaStats(...a),
    fetchPerformanceOverview: (...a: unknown[]) => fetchPerformanceOverview(...a),
    fetchPerformanceCampaignRollups: (...a: unknown[]) => fetchPerformanceCampaignRollups(...a),
    fetchPerformanceTagRollups: (...a: unknown[]) => fetchPerformanceTagRollups(...a),
    fetchPerformanceWorks: (...a: unknown[]) => fetchPerformanceWorks(...a),
    fetchCreativeWorkBundleSuggestions: (...a: unknown[]) => fetchCreativeWorkBundleSuggestions(...a),
    fetchPerformanceInsightActions: (...a: unknown[]) => fetchPerformanceInsightActions(...a),
    fetchPerformanceGoals: (...a: unknown[]) => fetchPerformanceGoals(...a),
    createPerformanceGoal: (...a: unknown[]) => createPerformanceGoal(...a),
    deletePerformanceGoal: (...a: unknown[]) => deletePerformanceGoal(...a),
    uploadPatreonInsightsCsv: (...a: unknown[]) => uploadPatreonInsightsCsv(...a),
    // These are used by AnalyticsOverviewClient but not under test — stub them out.
    fetchPatronSessionIfPresent: vi.fn().mockResolvedValue(null),
    hasRelaySignedInCookie: vi.fn().mockReturnValue(false),
    RELAY_CREATOR_ID_STORAGE_KEY: "relay_creator_id",
    RelayApiError: StubRelayApiError
  };
});

vi.mock("../../web/app/studio/analytics/action-hub/InsightsActionHub", () => ({
  InsightsActionHub: () => <div data-testid="insights-action-hub-stub" />
}));

import AnalyticsOverviewClient from "../../web/app/studio/analytics/AnalyticsOverviewClient";

// Provide a minimal StudioSessionContext so AnalyticsOverviewClient can call useStudioSession()
// without booting the full session provider (which depends on browser cookies/localStorage).
vi.mock("../../web/lib/studio-session-context", () => ({
  useStudioSession: () => ({
    ready: true,
    // Keep hasRelaySession false so the fetchPatronSessionIfPresent telemetry effect
    // doesn't run; none of these tests assert on telemetry, only on analytics data.
    hasRelaySession: false,
    activeRole: null,
    storedRelayCreatorId: "test_creator",
    creatorId: "test_creator"
  }),
  StudioSessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}));

function renderWithSession(ui: React.ReactElement) {
  return render(ui);
}

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

const basePerformance = {
  as_of: "2026-01-15T00:00:00.000Z",
  import_id: null,
  import_uploaded_at: null,
  import_label: null,
  rows: [],
  relay_only_count: 0,
  relay_only_truncated: false,
  note: "Perf note."
};

const baseUnifiedPerformance = {
  creator_id: "test_creator",
  as_of: "2026-01-15T00:00:00.000Z",
  range: "30d" as const,
  time_range: {
    start: "2025-12-16T00:00:00.000Z",
    end: "2026-01-15T00:00:00.000Z"
  },
  source: "csv_fallback" as const,
  rollup_computed_at: null,
  totals: {
    impressions: 0,
    seen: 0,
    likes: 0,
    comments: 0,
    views: 0
  },
  by_destination: [],
  top_posts: [],
  daily_series: []
};

const emptyPerformanceHierarchy = {
  creator_id: "test_creator",
  as_of: "2026-01-15T00:00:00.000Z",
  range: "30d" as const,
  time_range: {
    start: "2025-12-16T00:00:00.000Z",
    end: "2026-01-15T00:00:00.000Z"
  },
  freshness: {
    rollup_computed_at: null,
    stale: false,
    stale_after_hours: 48
  }
};

describe("<AnalyticsOverviewClient />", () => {
  beforeEach(() => {
    fetchCreatorMembershipSummary.mockReset();
    fetchCreatorMembershipCohorts.mockReset();
    fetchCreatorTierStickiness.mockReset();
    fetchCreatorPostPerformance.mockReset();
    fetchCreatorUsagePreview.mockReset();
    fetchCreatorTipBetaStats.mockReset();
    fetchCreatorUnifiedPerformance.mockReset();
    fetchPerformanceOverview.mockReset();
    fetchPerformanceCampaignRollups.mockReset();
    fetchPerformanceTagRollups.mockReset();
    fetchPerformanceWorks.mockReset();
    fetchCreativeWorkBundleSuggestions.mockReset();
    fetchPerformanceInsightActions.mockReset();
    fetchPerformanceGoals.mockReset();
    createPerformanceGoal.mockReset();
    deletePerformanceGoal.mockReset();
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
    fetchCreatorPostPerformance.mockResolvedValue(basePerformance);
    fetchCreatorUnifiedPerformance.mockResolvedValue(baseUnifiedPerformance);
    fetchCreatorUsagePreview.mockResolvedValue(baseUsagePreview);
    fetchCreatorTipBetaStats.mockResolvedValue({
      period_key: "2026-07",
      reveals: 0,
      offer_clicks: 0,
      offer_ctr: 0
    });
    fetchPerformanceOverview.mockResolvedValue({
      ...emptyPerformanceHierarchy,
      source: "csv_fallback",
      hierarchy: { creative_work_count: 0, post_count: 0, platform_instance_count: 0 },
      posting_goal: {
        goal: {
          monthly_post_target: 4,
          bonus_nudges_enabled: false,
          timezone: "UTC",
          enabled: true
        },
        period: {
          key: "2026-01",
          start: "2026-01-01T00:00:00.000Z",
          end: "2026-02-01T00:00:00.000Z"
        },
        posts_this_month: 2,
        remaining: 2,
        staged_media_count: 0,
        pace_status: "on_track",
        active_nudge: null
      },
      performance: baseUnifiedPerformance,
      source_summary: []
    });
    fetchPerformanceCampaignRollups.mockResolvedValue({
      ...emptyPerformanceHierarchy,
      groups: []
    });
    fetchPerformanceTagRollups.mockResolvedValue({
      ...emptyPerformanceHierarchy,
      tag_filter: null,
      groups: []
    });
    fetchPerformanceWorks.mockResolvedValue({
      ...emptyPerformanceHierarchy,
      works: []
    });
    fetchCreativeWorkBundleSuggestions.mockResolvedValue({
      creator_id: "test_creator",
      as_of: "2026-01-15T00:00:00.000Z",
      suggestions: [],
      dismissed_count: 0
    });
    fetchPerformanceInsightActions.mockResolvedValue({
      creator_id: "test_creator",
      as_of: "2026-01-15T00:00:00.000Z",
      range: "30d",
      actions: []
    });
    fetchPerformanceGoals.mockResolvedValue({
      creator_id: "test_creator",
      as_of: "2026-01-15T00:00:00.000Z",
      range: "30d",
      goals: [],
      suggested_goals: []
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders KPIs after membership summary loads", async () => {
    renderWithSession(<AnalyticsOverviewClient />);
    await waitFor(() => expect(fetchCreatorMembershipSummary).toHaveBeenCalled());
    expect((await screen.findByTestId("analytics-kpi-paying")).textContent).toBe("42");
    expect(screen.getByTestId("analytics-kpi-net-growth").textContent).toContain("+1");
  });

  it("renders the canonical post engagement controls", async () => {
    renderWithSession(<AnalyticsOverviewClient />);
    await waitFor(() => expect(fetchCreatorMembershipSummary).toHaveBeenCalled());
    expect(fetchCreatorMembershipSummary).toHaveBeenCalledWith({ days: 7 });
    expect(await screen.findByText("Post Engagement")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Insights/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Exposure/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Income/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reach/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Views/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Engage/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Conv\./i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tips/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Month/i })).toBeTruthy();
    expect(screen.getByText(/Metrics are estimates/i)).toBeTruthy();
  });

  it("shows CSV empty state when no Insights import exists", async () => {
    renderWithSession(<AnalyticsOverviewClient />);
    expect(await screen.findByTestId("analytics-csv-empty")).toBeTruthy();
  });

  it("renders recommended creator action prompts", async () => {
    renderWithSession(<AnalyticsOverviewClient />);
    await screen.findByTestId("analytics-insights-hub");
    fireEvent.click(screen.getByRole("tab", { name: /Actions/i }));
    expect(await screen.findByTestId("analytics-action-cards")).toBeTruthy();
    expect(screen.getByText("Create post from media storage")).toBeTruthy();
    expect(screen.getByText("Make another post like this")).toBeTruthy();
    expect(screen.getByText("Post a supporter update")).toBeTruthy();
    expect(screen.getByText("Improve supporter offer")).toBeTruthy();
    expect(screen.getByText("Turn into promo post")).toBeTruthy();
    expect(screen.getByText("Tier health warning")).toBeTruthy();
  });

  it("uses imported post performance and tier signals in action prompts", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-01-15T00:00:00.000Z").getTime());
    fetchCreatorPostPerformance.mockResolvedValue({
      ...basePerformance,
      import_id: "imp_hot",
      import_uploaded_at: "2026-01-15T00:00:00.000Z",
      rows: [
        {
          patreon_post_id: "pat_hot",
          post_id: "post_hot",
          insights: {
            impressions: 5000,
            seen: 1200,
            likes: 50,
            comments: 12,
            as_of: "2026-01-15T00:00:00.000Z"
          },
          relay: {
            title: "Autumn Series No. 4",
            published_at: "2026-01-14T00:00:00.000Z",
            source: "relay",
            upstream_status: "published",
            is_public: true
          },
          gap: "none" as const
        }
      ]
    });
    fetchCreatorTierStickiness.mockResolvedValue({
      ...baseStickiness,
      tiers: [
        {
          ...baseStickiness.tiers[0],
          churn_proxy: 0.35,
          cancel_events_in_window: 3
        }
      ]
    });

    renderWithSession(<AnalyticsOverviewClient />);
    fireEvent.click(await screen.findByRole("tab", { name: /Actions/i }));
    expect((await screen.findAllByText(/Autumn Series No\. 4/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Gold shows 3 cancel events/)).toBeTruthy();
    expect(screen.getByText(/Review price, content cadence, and reward timing in Patreon/)).toBeTruthy();
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
    renderWithSession(<AnalyticsOverviewClient />);
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
    renderWithSession(<AnalyticsOverviewClient />);
    await waitFor(() => expect(fetchCreatorPostPerformance).toHaveBeenCalled());
    expect(screen.queryByTestId("analytics-insights-stale-warning")).toBeNull();
  });
});
