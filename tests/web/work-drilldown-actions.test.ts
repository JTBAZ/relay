import { describe, expect, it } from "vitest";
import type { PerformanceWorkBundleData } from "@/lib/relay-api";
import { deriveWorkDrilldownActions } from "../../web/lib/work-drilldown-actions";

function sampleBundle(
  overrides: Partial<PerformanceWorkBundleData> = {}
): PerformanceWorkBundleData {
  return {
    creative_work_id: "work_alpha",
    title: "Alpha Bundle",
    description: null,
    analytics_campaign_label: "Launch",
    tags: ["fantasy"],
    is_default_bundle: false,
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    totals: {
      impressions: 3000,
      seen: 900,
      likes: 40,
      comments: 6,
      views: 0
    },
    by_destination: [
      {
        destination: "patreon",
        impressions: 3000,
        seen: 900,
        likes: 40,
        comments: 6,
        views: 0
      }
    ],
    daily_series: [{ day: "2026-06-29", impressions: 1000, seen: 300, likes: 10, comments: 2, views: 0 }],
    total_reach: 3900,
    variants: [
      {
        post_id: "post_teaser",
        title: "Teaser",
        variant_role: "teaser",
        total_reach: 2500,
        totals: {
          impressions: 2500,
          seen: 700,
          likes: 30,
          comments: 4,
          views: 0
        },
        by_destination: [
          {
            destination: "patreon",
            impressions: 2500,
            seen: 700,
            likes: 30,
            comments: 4,
            views: 0
          }
        ],
        platform_instances: [
          {
            platform_instance_id: "pi_teaser",
            destination: "patreon",
            external_url: "https://patreon.com/posts/1",
            external_id: "1",
            attempt_id: "att_1",
            link_source: "distribution",
            status: "stale",
            refresh_policy: "conservative",
            linked_at: "2026-06-01T00:00:00.000Z",
            last_refreshed_at: null
          }
        ]
      },
      {
        post_id: "post_full",
        title: "Full piece",
        variant_role: "primary",
        total_reach: 1400,
        totals: {
          impressions: 500,
          seen: 200,
          likes: 10,
          comments: 2,
          views: 0
        },
        by_destination: [
          {
            destination: "patreon",
            impressions: 500,
            seen: 200,
            likes: 10,
            comments: 2,
            views: 0
          }
        ],
        platform_instances: []
      }
    ],
    freshness: {
      rollup_computed_at: "2026-06-27T10:00:00.000Z",
      stale: true,
      stale_after_hours: 48
    },
    source_summary: [{ destination: "patreon", source: "rollup", confidence: "high" }],
    crosspost_gaps: {
      present_destinations: ["patreon"],
      missing_destinations: ["x", "deviantart", "bluesky"],
      missing_teaser_destinations: ["x", "deviantart", "bluesky"],
      suggested_source_post_id: "post_full"
    },
    ...overrides
  };
}

describe("deriveWorkDrilldownActions", () => {
  it("suggests stale rollup refresh and stale instance refresh", () => {
    const actions = deriveWorkDrilldownActions(sampleBundle());
    expect(actions.some((action) => action.id === "refresh-stale-rollups")).toBe(true);
    expect(actions.some((action) => action.id === "refresh-stale-instances")).toBe(true);
  });

  it("suggests double-down when one variant dominates", () => {
    const actions = deriveWorkDrilldownActions(sampleBundle());
    expect(actions.some((action) => action.id === "double-down-top-variant")).toBe(true);
  });

  it("suggests single-platform expansion when only one destination has reach", () => {
    const actions = deriveWorkDrilldownActions(sampleBundle());
    expect(actions.some((action) => action.id === "expand-platform-mix")).toBe(true);
  });
});
