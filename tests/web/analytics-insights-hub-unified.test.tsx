/** @vitest-environment happy-dom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsInsightsHub } from "../../web/app/studio/analytics/AnalyticsInsightsHub";
import type {
  CreatorPostPerformanceData,
  CreatorUnifiedPerformanceData,
  PerformanceCampaignRollupsData,
  PerformanceOverviewData,
  PerformanceTagRollupsData,
  PerformanceWorksListData
} from "@/lib/relay-api";

const noop = () => {};

const emptyPerformance: CreatorPostPerformanceData = {
  as_of: "2026-06-30T12:00:00.000Z",
  import_id: null,
  import_uploaded_at: null,
  import_label: null,
  rows: [],
  relay_only_count: 0,
  relay_only_truncated: false,
  note: null
};

function baseHubProps(
  overrides: Partial<React.ComponentProps<typeof AnalyticsInsightsHub>> = {}
) {
  return {
    performance: emptyPerformance,
    unifiedPerformance: null,
    performanceRange: "30d" as const,
    onPerformanceRangeChange: noop,
    summary: null,
    summary7d: null,
    stickiness: null,
    usagePreview: null,
    actionCards: [],
    performanceOverview: null,
    performanceCampaigns: null,
    performanceTags: null,
    performanceWorks: null,
    bundleSuggestions: null,
    hierarchyDestination: null,
    onHierarchyDestinationChange: noop,
    performanceGoals: null,
    goalsBusySuggestionId: null,
    onAdoptPerformanceGoalSuggestion: noop,
    onRemovePerformanceGoal: noop,
    ...overrides
  };
}

function rollupUnified(overrides: Partial<CreatorUnifiedPerformanceData> = {}): CreatorUnifiedPerformanceData {
  return {
    creator_id: "test_creator",
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    source: "rollup",
    rollup_computed_at: "2026-06-30T10:00:00.000Z",
    totals: {
      impressions: 4200,
      seen: 1800,
      likes: 120,
      comments: 18,
      views: 240
    },
    by_destination: [
      {
        destination: "patreon",
        impressions: 3000,
        seen: 1200,
        likes: 80,
        comments: 10,
        views: 0
      },
      {
        destination: "relay",
        impressions: 0,
        seen: 0,
        likes: 0,
        comments: 0,
        views: 240
      }
    ],
    top_posts: [
      {
        post_id: "post_alpha",
        title: "Alpha Post",
        total_reach: 3000,
        destinations: [
          {
            destination: "patreon",
            impressions: 3000,
            seen: 1200,
            likes: 80,
            comments: 10,
            views: 0
          }
        ]
      }
    ],
    daily_series: [],
    ...overrides
  };
}

function hierarchyOverview(
  overrides: Partial<PerformanceOverviewData> = {}
): PerformanceOverviewData {
  return {
    creator_id: "test_creator",
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    source: "rollup",
    hierarchy: {
      creative_work_count: 4,
      post_count: 9,
      platform_instance_count: 6
    },
    posting_goal: {
      goal: {
        monthly_post_target: 8,
        bonus_nudges_enabled: true,
        timezone: "UTC",
        enabled: true
      },
      period: {
        key: "2026-06",
        start: "2026-06-01T00:00:00.000Z",
        end: "2026-07-01T00:00:00.000Z"
      },
      posts_this_month: 5,
      remaining: 3,
      staged_media_count: 1,
      pace_status: "on_track",
      active_nudge: null
    },
    performance: rollupUnified(),
    freshness: {
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      stale: false,
      stale_after_hours: 48
    },
    source_summary: [
      { destination: "patreon", source: "rollup", confidence: "high" },
      { destination: "relay", source: "rollup", confidence: "medium" }
    ],
    ...overrides
  };
}

function hierarchyCampaigns(): PerformanceCampaignRollupsData {
  return {
    creator_id: "test_creator",
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    groups: [
      {
        campaign_label: "launch",
        campaign_label_display: "Launch",
        creative_work_count: 2,
        post_count: 4,
        total_reach: 2500,
        totals: {
          impressions: 2500,
          seen: 900,
          likes: 40,
          comments: 6,
          views: 0
        },
        by_destination: [
          {
            destination: "patreon",
            impressions: 2500,
            seen: 900,
            likes: 40,
            comments: 6,
            views: 0
          }
        ]
      }
    ],
    freshness: {
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      stale: false,
      stale_after_hours: 48
    }
  };
}

function hierarchyTags(): PerformanceTagRollupsData {
  return {
    creator_id: "test_creator",
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    tag_filter: null,
    groups: [
      {
        tag: "fantasy",
        creative_work_count: 1,
        post_count: 2,
        total_reach: 1800,
        totals: {
          impressions: 1800,
          seen: 600,
          likes: 30,
          comments: 4,
          views: 0
        },
        by_destination: [
          {
            destination: "patreon",
            impressions: 1800,
            seen: 600,
            likes: 30,
            comments: 4,
            views: 0
          }
        ]
      }
    ],
    freshness: {
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      stale: false,
      stale_after_hours: 48
    }
  };
}

function hierarchyWorks(): PerformanceWorksListData {
  return {
    creator_id: "test_creator",
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    works: [
      {
        creative_work_id: "work_alpha",
        title: "Alpha Bundle",
        analytics_campaign_label: "Launch",
        tags: ["fantasy"],
        is_default_bundle: false,
        member_count: 2,
        total_reach: 2200,
        totals: {
          impressions: 2200,
          seen: 700,
          likes: 35,
          comments: 5,
          views: 0
        },
        by_destination: [
          {
            destination: "patreon",
            impressions: 2200,
            seen: 700,
            likes: 35,
            comments: 5,
            views: 0
          }
        ]
      }
    ],
    freshness: {
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      stale: false,
      stale_after_hours: 48
    }
  };
}

describe("<AnalyticsInsightsHub /> unified performance states (Slice 2d-8)", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-30T12:00:00.000Z").getTime());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders without live unified posts and uses CSV import labeling", () => {
    render(<AnalyticsInsightsHub {...baseHubProps()} />);
    expect(screen.queryByText(/Live rollups/i)).toBeNull();
    expect(screen.getByText(/CSV import/i)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Post reach radial chart with/i })).toBeTruthy();
  });

  it("renders partial CSV fallback with stale unified warning", () => {
    render(
      <AnalyticsInsightsHub
        {...baseHubProps({
          unifiedPerformance: rollupUnified({
            source: "csv_fallback",
            rollup_computed_at: null,
            top_posts: [],
            by_destination: [
              {
                destination: "patreon",
                impressions: 500,
                seen: 300,
                likes: 12,
                comments: 2,
                views: 0
              }
            ]
          })
        })}
      />
    );

    expect(screen.getByText(/CSV import/i)).toBeTruthy();
    expect(screen.getByTestId("analytics-unified-stale-warning")).toBeTruthy();
  });

  it("renders full rollup data with platform breakdown and no stale warning", () => {
    render(
      <AnalyticsInsightsHub
        {...baseHubProps({
          unifiedPerformance: rollupUnified()
        })}
      />
    );

    expect(screen.getByText(/Live rollups/i)).toBeTruthy();
    expect(screen.queryByTestId("analytics-unified-stale-warning")).toBeNull();
    expect(
      screen.getByRole("img", { name: /Post reach radial chart with 1 posts/i })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Trends/i }));
    expect(screen.getByTestId("analytics-platform-breakdown")).toBeTruthy();
    expect(screen.getByText("Patreon")).toBeTruthy();
    expect(screen.getByText("Relay")).toBeTruthy();
  });

  it("shows stale warning when rollup computed_at is older than 48 hours", () => {
    render(
      <AnalyticsInsightsHub
        {...baseHubProps({
          unifiedPerformance: rollupUnified({
            rollup_computed_at: "2026-06-27T10:00:00.000Z"
          })
        })}
      />
    );

    expect(screen.getByTestId("analytics-unified-stale-warning")).toBeTruthy();
  });

  it("renders performance hierarchy on Trends tab with campaign, tag, and work rows", () => {
    render(
      <AnalyticsInsightsHub
        {...baseHubProps({
          unifiedPerformance: rollupUnified(),
          performanceOverview: hierarchyOverview(),
          performanceCampaigns: hierarchyCampaigns(),
          performanceTags: hierarchyTags(),
          performanceWorks: hierarchyWorks()
        })}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /Trends/i }));

    expect(screen.getByTestId("analytics-performance-hierarchy")).toBeTruthy();
    expect(screen.getByTestId("analytics-hierarchy-breadcrumb").textContent).toContain("Creator-wide");
    expect(screen.getByTestId("analytics-hierarchy-posting-goal")).toBeTruthy();
    expect(screen.getByTestId("analytics-hierarchy-campaigns").textContent).toContain("Launch");
    expect(screen.getByTestId("analytics-hierarchy-tags").textContent).toContain("fantasy");
    expect(screen.getByTestId("analytics-hierarchy-works").textContent).toContain("Alpha Bundle");
    expect(screen.getByTestId("analytics-hierarchy-platform-filters")).toBeTruthy();
  });

  it("renders performance goals panel on Actions tab", () => {
    render(
      <AnalyticsInsightsHub
        {...baseHubProps({
          performanceGoals: {
            creator_id: "test_creator",
            as_of: "2026-06-30T12:00:00.000Z",
            range: "30d",
            goals: [
              {
                id: "goal_1",
                scope: "work",
                scope_ref: "work_alpha",
                scope_label: "Alpha Bundle",
                metric: "reach",
                target_value: 5000,
                range: "30d",
                label: "Alpha reach",
                enabled: true,
                current_value: 2200,
                progress_ratio: 0.44,
                pace_status: "behind",
                created_at: "2026-06-01T00:00:00.000Z",
                updated_at: "2026-06-30T12:00:00.000Z"
              }
            ],
            suggested_goals: []
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: /Actions/i }));
    expect(screen.getByTestId("analytics-performance-goals")).toBeTruthy();
    expect(screen.getByTestId("analytics-performance-goal-goal_1").textContent).toContain("Alpha reach");
  });
});
