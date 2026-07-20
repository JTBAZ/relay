import { describe, expect, it } from "vitest";
import {
  buildHeroInspectModel,
  heroKeysEqual,
  heroKeyToken,
  reachFromTotals,
  type HeroInspectKey
} from "../web/lib/hero-inspect-data";
import type {
  PerformanceWorkBundleData,
  PerformanceWorkInstancesData
} from "../web/lib/relay-api";

function totals(n: number) {
  return { impressions: n, seen: 0, likes: Math.floor(n / 10), comments: 1, views: 0 };
}

function fixtureBundle(overrides?: Partial<PerformanceWorkBundleData>): PerformanceWorkBundleData {
  return {
    creative_work_id: "work_1",
    title: "Work One",
    description: null,
    analytics_campaign_label: null,
    tags: [],
    is_default_bundle: false,
    as_of: "2026-07-13T00:00:00.000Z",
    range: "30d",
    time_range: { start: "2026-06-13", end: "2026-07-13" },
    totals: totals(100),
    by_destination: [{ destination: "patreon", ...totals(100) }],
    daily_series: [],
    total_reach: 100,
    variants: [
      {
        post_id: "post_a",
        title: "Post A",
        variant_role: "full",
        total_reach: 50,
        totals: totals(50),
        by_destination: [{ destination: "patreon", ...totals(50) }],
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
            last_refreshed_at: null
          }
        ]
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
    source_summary: [],
    ...overrides
  };
}

function fixtureInstances(): PerformanceWorkInstancesData {
  return {
    creative_work_id: "work_1",
    title: "Work One",
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
      }
    ],
    crosspost_gaps: {
      present_destinations: ["patreon"],
      missing_destinations: ["x", "deviantart", "bluesky"],
      missing_teaser_destinations: [],
      suggested_source_post_id: "post_a"
    }
  };
}

describe("hero-inspect-data", () => {
  it("computes reach like drilldown", () => {
    expect(reachFromTotals({ impressions: 10, seen: 2, views: 3 })).toBe(15);
  });

  it("keys distinguish post A vs B", () => {
    const a: HeroInspectKey = { creative_work_id: "w", post_id: "post_a" };
    const b: HeroInspectKey = { creative_work_id: "w", post_id: "post_b" };
    expect(heroKeyToken(a)).not.toBe(heroKeyToken(b));
    expect(heroKeysEqual(a, b)).toBe(false);
  });

  it("null creative_work_id → no_work empty (never foreign stats)", () => {
    const model = buildHeroInspectModel({
      key: { creative_work_id: null, post_id: "post_a" },
      bundle: fixtureBundle(),
      instances: fixtureInstances(),
      instancesOk: true,
      hints: { title: "Local title" }
    });
    expect(model.empty_reason).toBe("no_work");
    expect(model.rows).toEqual([]);
    expect(model.relay).toBeNull();
    expect(model.title).toBe("Local title");
  });

  it("post A vs post B never share rows", () => {
    const bundle = fixtureBundle();
    const instances = fixtureInstances();
    const a = buildHeroInspectModel({
      key: { creative_work_id: "work_1", post_id: "post_a" },
      bundle,
      instances,
      instancesOk: true
    });
    const b = buildHeroInspectModel({
      key: { creative_work_id: "work_1", post_id: "post_b" },
      bundle,
      instances,
      instancesOk: true
    });
    expect(a.rows.map((r) => r.destination)).toEqual(["patreon"]);
    expect(a.rows[0]?.stats.reach).toBe(50);
    expect(b.rows.map((r) => r.destination)).toEqual(["x"]);
    expect(b.rows[0]?.stats.reach).toBe(80);
    expect(a.rows[0]?.refresh_eligible).toBe(true);
  });

  it("unknown member → not_in_work", () => {
    const model = buildHeroInspectModel({
      key: { creative_work_id: "work_1", post_id: "post_z" },
      bundle: fixtureBundle(),
      instances: null,
      instancesOk: false
    });
    expect(model.empty_reason).toBe("not_in_work");
    expect(model.rows).toEqual([]);
  });

  it("relay only when instancesOk and role_breakdown present", () => {
    const bundle = fixtureBundle();
    const without = buildHeroInspectModel({
      key: { creative_work_id: "work_1", post_id: "post_a" },
      bundle,
      instances: fixtureInstances(),
      instancesOk: false
    });
    expect(without.relay).toBeNull();

    const withRelay = buildHeroInspectModel({
      key: { creative_work_id: "work_1", post_id: "post_a" },
      bundle,
      instances: fixtureInstances(),
      instancesOk: true
    });
    expect(withRelay.relay?.merged.label).toBe("All platforms");
    expect(withRelay.relay?.canonical.total_reach).toBe(50);
    expect(withRelay.relay?.ads_teasers.total_reach).toBe(80);
  });

  it("instance-only present rows zero-fill missing metrics; relay stays out of per-platform", () => {
    const bundle = fixtureBundle();
    bundle.variants[0]!.by_destination = [];
    const instances = fixtureInstances();
    instances.posts[0]!.platform_instances.push(
      {
        platform_instance_id: "pi_a_da",
        destination: "deviantart",
        external_url: "https://www.deviantart.com/example",
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
        recommended_method: "extension"
      },
      {
        platform_instance_id: "pi_a_relay",
        destination: "relay",
        external_url: "https://relay.example/a",
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
        recommended_method: "relay_rollup"
      }
    );
    const model = buildHeroInspectModel({
      key: { creative_work_id: "work_1", post_id: "post_a" },
      bundle,
      instances,
      instancesOk: true
    });
    expect(model.rows.find((r) => r.destination === "relay")).toBeUndefined();
    const daRow = model.rows.find((r) => r.destination === "deviantart");
    expect(daRow?.stats).toEqual({
      reach: 0,
      impressions: 0,
      likes: 0,
      comments: 0
    });
  });
});
