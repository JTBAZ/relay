import { describe, expect, it } from "vitest";
import { derivePerformanceInsightActions } from "../src/analytics/performance-insight-actions.js";

function sampleOverview(overrides: Record<string, unknown> = {}) {
  return {
    creator_id: "creator_a",
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d" as const,
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    source: "rollup" as const,
    hierarchy: { creative_work_count: 2, post_count: 4, platform_instance_count: 3 },
    posting_goal: {
      goal: {
        monthly_post_target: 4,
        bonus_nudges_enabled: true,
        timezone: "UTC",
        enabled: true
      },
      period: {
        key: "2026-06",
        start: "2026-06-01T00:00:00.000Z",
        end: "2026-07-01T00:00:00.000Z"
      },
      posts_this_month: 1,
      remaining: 3,
      staged_media_count: 0,
      pace_status: "behind" as const,
      active_nudge: null
    },
    performance: {
      creator_id: "creator_a",
      as_of: "2026-06-30T12:00:00.000Z",
      range: "30d" as const,
      time_range: {
        start: "2026-05-31T00:00:00.000Z",
        end: "2026-06-30T12:00:00.000Z"
      },
      source: "rollup" as const,
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      totals: { impressions: 5000, seen: 1200, likes: 40, comments: 8, views: 100 },
      by_destination: [
        {
          destination: "patreon",
          impressions: 5000,
          seen: 1200,
          likes: 40,
          comments: 8,
          views: 0
        }
      ],
      top_posts: [
        {
          post_id: "post_alpha",
          title: "Alpha Post",
          total_reach: 6200,
          destinations: [
            {
              destination: "patreon",
              impressions: 5000,
              seen: 1200,
              likes: 2,
              comments: 1,
              views: 0
            }
          ]
        }
      ],
      daily_series: []
    },
    freshness: {
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      stale: false,
      stale_after_hours: 48
    },
    source_summary: [],
    ...overrides
  };
}

describe("derivePerformanceInsightActions", () => {
  it("includes posting goal and improve-offer actions from performance signals", () => {
    const actions = derivePerformanceInsightActions({
      overview: sampleOverview() as never,
      works: {
        creator_id: "creator_a",
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
            tags: [],
            is_default_bundle: false,
            member_count: 1,
            total_reach: 6200,
            totals: {
              impressions: 5000,
              seen: 1200,
              likes: 40,
              comments: 8,
              views: 0
            },
            by_destination: [
              {
                destination: "patreon",
                impressions: 5000,
                seen: 1200,
                likes: 40,
                comments: 8,
                views: 0
              }
            ]
          },
          {
            creative_work_id: "work_beta",
            title: "Beta Bundle",
            analytics_campaign_label: null,
            tags: [],
            is_default_bundle: true,
            member_count: 1,
            total_reach: 900,
            totals: {
              impressions: 900,
              seen: 200,
              likes: 4,
              comments: 1,
              views: 0
            },
            by_destination: [
              {
                destination: "patreon",
                impressions: 900,
                seen: 200,
                likes: 4,
                comments: 1,
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
      },
      campaigns: {
        creator_id: "creator_a",
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
            creative_work_count: 1,
            post_count: 1,
            total_reach: 6200,
            totals: {
              impressions: 5000,
              seen: 1200,
              likes: 40,
              comments: 8,
              views: 0
            },
            by_destination: []
          }
        ],
        freshness: {
          rollup_computed_at: "2026-06-30T10:00:00.000Z",
          stale: false,
          stale_after_hours: 48
        }
      },
      bundleSuggestions: {
        creator_id: "creator_a",
        as_of: "2026-06-30T12:00:00.000Z",
        suggestions: [],
        dismissed_count: 0
      }
    });

    expect(actions.some((action) => action.id === "perf-posting-goal-behind")).toBe(true);
    expect(actions.some((action) => action.id === "perf-improve-offer")).toBe(true);
    expect(actions.some((action) => action.id === "perf-double-down-work")).toBe(true);
  });
});
