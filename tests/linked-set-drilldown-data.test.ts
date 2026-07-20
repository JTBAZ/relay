import { describe, expect, it } from "vitest";
import {
  buildDrilldownAggregate,
  buildDrilldownMembers,
  type DrilldownMemberInput
} from "../web/lib/linked-set-drilldown-data";
import type {
  PerformanceWorkBundleData,
  PerformanceWorkInstancesData
} from "../web/lib/relay-api";

function totals(n: number) {
  return { impressions: n, seen: 0, likes: Math.floor(n / 10), comments: 1, views: 0 };
}

function fixtureMembers(): DrilldownMemberInput[] {
  return [
    {
      post_id: "post_a",
      member_label: "Page 1",
      variant_role: "full",
      sort_order: 0,
      thumb_src: "/a.png",
      present: [{ destination: "patreon", external_url: "https://patreon.com/a" }],
      missing: ["x", "deviantart", "bluesky"]
    },
    {
      post_id: "post_b",
      member_label: "Page 2",
      variant_role: "teaser",
      sort_order: 1,
      thumb_src: "/b.png",
      present: [{ destination: "x", external_url: "https://x.com/b" }],
      missing: ["patreon", "deviantart", "bluesky"]
    }
  ];
}

function fixtureBundle(): PerformanceWorkBundleData {
  return {
    creative_work_id: "work_1",
    title: "Comic Set",
    description: null,
    analytics_campaign_label: null,
    tags: [],
    is_default_bundle: false,
    as_of: "2026-07-13T00:00:00.000Z",
    range: "30d",
    time_range: { start: "2026-06-13", end: "2026-07-13" },
    totals: totals(130),
    by_destination: [
      { destination: "patreon", ...totals(50) },
      { destination: "x", ...totals(80) }
    ],
    daily_series: [],
    total_reach: 130,
    variants: [
      {
        post_id: "post_a",
        title: "Post A",
        variant_role: "full",
        total_reach: 50,
        totals: totals(50),
        by_destination: [{ destination: "patreon", ...totals(50) }],
        platform_instances: []
      },
      {
        post_id: "post_b",
        title: "Post B",
        variant_role: "teaser",
        total_reach: 80,
        totals: totals(80),
        by_destination: [{ destination: "x", ...totals(80) }],
        platform_instances: []
      }
    ],
    role_breakdown: {
      full: {
        member_count: 1,
        post_ids: ["post_a"],
        total_reach: 50,
        totals: totals(50),
        by_destination: [{ destination: "patreon", ...totals(50) }]
      },
      teaser: {
        member_count: 1,
        post_ids: ["post_b"],
        total_reach: 80,
        totals: totals(80),
        by_destination: [{ destination: "x", ...totals(80) }]
      }
    },
    crosspost_gaps: {
      present_destinations: ["patreon", "x"],
      missing_destinations: ["deviantart", "bluesky"],
      missing_teaser_destinations: [],
      suggested_source_post_id: "post_a"
    },
    freshness: {
      rollup_computed_at: null,
      stale: false,
      stale_after_hours: 24
    },
    source_summary: []
  };
}

function fixtureInstances(): PerformanceWorkInstancesData {
  return {
    creative_work_id: "work_1",
    title: "Comic Set",
    as_of: "2026-07-13T00:00:00.000Z",
    posts: [
      {
        post_id: "post_a",
        title: "Post A",
        variant_role: "full",
        platform_instances: [
          {
            platform_instance_id: "pi_a_patreon",
            destination: "patreon",
            external_url: "https://patreon.com/a",
            external_id: null,
            attempt_id: null,
            link_source: "manual",
            status: "linked",
            refresh_policy: "manual",
            linked_at: "2026-07-01T00:00:00.000Z",
            last_refreshed_at: null,
            refresh_eligible: true,
            can_refresh_manually: true,
            cooldown_active: false,
            retry_after_seconds: 0,
            next_allowed_at: null,
            stale: false,
            recommended_method: "extension_handoff"
          }
        ]
      },
      {
        post_id: "post_b",
        title: "Post B",
        variant_role: "teaser",
        platform_instances: [
          {
            platform_instance_id: "pi_b_x",
            destination: "x",
            external_url: "https://x.com/b",
            external_id: null,
            attempt_id: null,
            link_source: "manual",
            status: "linked",
            refresh_policy: "manual",
            linked_at: "2026-07-01T00:00:00.000Z",
            last_refreshed_at: null,
            refresh_eligible: false,
            can_refresh_manually: false,
            cooldown_active: true,
            retry_after_seconds: 60,
            next_allowed_at: null,
            stale: true,
            recommended_method: "none"
          }
        ]
      }
    ],
    crosspost_gaps: {
      present_destinations: ["patreon", "x"],
      missing_destinations: ["deviantart", "bluesky"],
      missing_teaser_destinations: [],
      suggested_source_post_id: "post_a"
    }
  };
}

describe("linked-set-drilldown-data", () => {
  it("maps reach and cover per member without cross-wiring A/B", () => {
    const views = buildDrilldownMembers({
      members: fixtureMembers(),
      coverPostId: "post_a",
      bundle: fixtureBundle(),
      instances: fixtureInstances()
    });
    expect(views).toHaveLength(2);
    expect(views[0]!.is_cover).toBe(true);
    expect(views[0]!.total_reach).toBe(50);
    expect(views[1]!.total_reach).toBe(80);
    expect(views[0]!.present_short).toEqual(["PA"]);
    expect(views[1]!.present_short).toEqual(["X"]);
  });

  it("builds present leaves with variant stats and gap leaves from missing", () => {
    const views = buildDrilldownMembers({
      members: fixtureMembers(),
      coverPostId: "post_a",
      bundle: fixtureBundle(),
      instances: fixtureInstances()
    });
    const aLeaves = views[0]!.leaves;
    const present = aLeaves.filter((l) => l.kind === "present");
    const gaps = aLeaves.filter((l) => l.kind === "gap");
    expect(present).toHaveLength(1);
    expect(present[0]!.destination).toBe("patreon");
    if (present[0]!.kind === "present") {
      expect(present[0]!.stats.impressions).toBe(50);
      expect(present[0]!.stale).toBe(false);
    }
    expect(gaps.map((g) => g.destination).sort()).toEqual(
      ["bluesky", "deviantart", "x"].sort()
    );

    const bPresent = views[1]!.leaves.find((l) => l.kind === "present");
    expect(bPresent?.kind === "present" && bPresent.stale).toBe(true);
    expect(bPresent?.kind === "present" && bPresent.stats.impressions).toBe(80);
  });

  it("aggregate uses live bundle totals and teaser member rows", () => {
    const views = buildDrilldownMembers({
      members: fixtureMembers(),
      coverPostId: "post_a",
      bundle: fixtureBundle(),
      instances: fixtureInstances()
    });
    const agg = buildDrilldownAggregate({ members: views, bundle: fixtureBundle() });
    expect(agg.total_reach).toBe(130);
    expect(agg.impressions).toBe(130);
    expect(agg.teaser_rows).toEqual([
      { post_id: "post_b", label: "Page 2", total_reach: 80 }
    ]);
  });

  it("without bundle still paints gallery presence chips and zero reach", () => {
    const views = buildDrilldownMembers({
      members: fixtureMembers(),
      coverPostId: "post_a",
      bundle: null,
      instances: null
    });
    expect(views[0]!.total_reach).toBe(0);
    expect(views[0]!.leaves.some((l) => l.kind === "present" && l.destination === "patreon")).toBe(
      true
    );
  });
});
