/**
 * Phase B Coach Fact Pack — allowlist, coverage honesty, timing gate, chip mapping.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { CanonicalPostCopy } from "../src/distribution/platform-formatters.js";

vi.mock("../src/analytics/performance-intelligence-read.js", () => ({
  getPerformanceOverview: vi.fn(),
  getPerformancePostVariant: vi.fn(),
  getPerformanceTagRollups: vi.fn(),
  getPerformanceWorkBundle: vi.fn(),
  listPerformanceWorks: vi.fn()
}));

vi.mock("../src/analytics/performance-insight-actions.js", () => ({
  getPerformanceInsightActions: vi.fn()
}));

vi.mock("../src/analytics/performance-insight-goals-service.js", () => ({
  listCreatorPerformanceGoals: vi.fn()
}));

import {
  getPerformanceOverview,
  getPerformancePostVariant,
  getPerformanceTagRollups,
  getPerformanceWorkBundle,
  listPerformanceWorks
} from "../src/analytics/performance-intelligence-read.js";
import { getPerformanceInsightActions } from "../src/analytics/performance-insight-actions.js";
import { listCreatorPerformanceGoals } from "../src/analytics/performance-insight-goals-service.js";
import {
  buildCoachFactPack,
  cadenceToPostingAssistantFacts,
  computePostedAttemptHour,
  mapInsightActionToCode,
  type CoachFactPack
} from "../src/distribution/coach-fact-pack.js";
import { buildCoachFindings } from "../src/distribution/coach-propose-service.js";

const FACT_PACK_KEYS = [
  "coverage",
  "this_post",
  "destination_mix",
  "tags",
  "contrast",
  "structure",
  "insight_codes",
  "goals",
  "cadence",
  "reason_codes"
] as const;

const COVERAGE_KEYS = [
  "as_of",
  "range",
  "stale",
  "with_metrics",
  "without_metrics",
  "sources"
] as const;

const CADENCE_KEYS = [
  "monthly_post_target",
  "posts_this_month",
  "historical_hour_of_day",
  "sample_size",
  "timing_confidence",
  "timezone"
] as const;

function emptyTotals() {
  return { impressions: 0, seen: 0, likes: 0, comments: 0, views: 0 };
}

function sampleOverview(opts?: {
  byDestination?: Array<{
    destination: string;
    impressions: number;
    seen?: number;
    likes?: number;
    comments?: number;
    views?: number;
  }>;
  stale?: boolean;
  sourceSummary?: Array<{ destination: string; source: string; confidence: string }>;
}) {
  const by_destination = (opts?.byDestination ?? [
    {
      destination: "patreon",
      impressions: 5000,
      seen: 0,
      likes: 40,
      comments: 8,
      views: 0
    }
  ]).map((row) => ({
    seen: 0,
    likes: 0,
    comments: 0,
    views: 0,
    ...row
  }));

  return {
    ok: true as const,
    report: {
      creator_id: "creator_a",
      as_of: "2026-06-30T12:00:00.000Z",
      range: "30d" as const,
      time_range: {
        start: "2026-05-31T00:00:00.000Z",
        end: "2026-06-30T12:00:00.000Z"
      },
      source: "rollup" as const,
      hierarchy: { creative_work_count: 1, post_count: 2, platform_instance_count: 1 },
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
        totals: { impressions: 5000, seen: 0, likes: 40, comments: 8, views: 0 },
        by_destination,
        top_posts: [],
        daily_series: []
      },
      freshness: {
        rollup_computed_at: "2026-06-30T10:00:00.000Z",
        stale: opts?.stale ?? false,
        stale_after_hours: 48
      },
      source_summary: opts?.sourceSummary ?? [
        { destination: "patreon", source: "extension_dom", confidence: "high" }
      ]
    }
  };
}

function samplePostVariant(opts?: {
  byDestination?: Array<{
    destination: string;
    impressions: number;
    likes?: number;
    comments?: number;
  }>;
  creativeWork?: boolean;
}) {
  const by_destination = (opts?.byDestination ?? [
    { destination: "patreon", impressions: 1200, likes: 30, comments: 4 }
  ]).map((row) => ({
    seen: 0,
    views: 0,
    likes: 0,
    comments: 0,
    ...row
  }));
  const totals = by_destination.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      seen: acc.seen + row.seen,
      likes: acc.likes + row.likes,
      comments: acc.comments + row.comments,
      views: acc.views + row.views
    }),
    emptyTotals()
  );
  const total_reach = totals.impressions + totals.seen + totals.views;

  return {
    ok: true as const,
    report: {
      post_id: "post_1",
      title: "Studio piece",
      creative_work: opts?.creativeWork
        ? {
            creative_work_id: "work_1",
            title: "Work one",
            variant_role: "full",
            is_default_bundle: true
          }
        : null,
      as_of: "2026-06-30T12:00:00.000Z",
      range: "30d" as const,
      time_range: {
        start: "2026-05-31T00:00:00.000Z",
        end: "2026-06-30T12:00:00.000Z"
      },
      totals,
      by_destination,
      daily_series: [
        { day: "2026-06-01", impressions: 100, seen: 0, likes: 1, comments: 0, views: 0 }
      ],
      total_reach,
      platform_instances: [],
      freshness: {
        rollup_computed_at: "2026-06-30T10:00:00.000Z",
        stale: false,
        stale_after_hours: 48
      },
      source_summary: [{ destination: "patreon", source: "extension_dom", confidence: "high" }]
    }
  };
}

function stubPrisma(attemptHours: number[] = []): PrismaClient {
  return {
    creatorPostingGoal: {
      findUnique: vi.fn(async () => ({ monthlyPostTarget: 4, timezone: "UTC" }))
    },
    post: {
      count: vi.fn(async () => 2)
    },
    postDistributionAttempt: {
      findMany: vi.fn(async () =>
        attemptHours.map((hour) => ({
          completedAt: new Date(Date.UTC(2026, 5, 15, hour, 0, 0))
        }))
      )
    }
  } as unknown as PrismaClient;
}

function assertAllowlistedPack(pack: CoachFactPack) {
  expect(Object.keys(pack).sort()).toEqual([...FACT_PACK_KEYS].sort());
  expect(Object.keys(pack.coverage).sort()).toEqual([...COVERAGE_KEYS].sort());
  expect(Object.keys(pack.cadence).sort()).toEqual([...CADENCE_KEYS].sort());
  expect(pack.coverage.range).toBe("30d");
  // Denylist: no ads / followers / daily series dumps on the pack root.
  expect(pack).not.toHaveProperty("daily_series");
  expect(pack).not.toHaveProperty("followers");
  expect(pack).not.toHaveProperty("ads");
  expect(JSON.stringify(pack).toLowerCase()).not.toMatch(/follower|advertis|boost spend/);
}

describe("coach-fact-pack", () => {
  beforeEach(() => {
    vi.mocked(getPerformanceOverview).mockReset();
    vi.mocked(getPerformancePostVariant).mockReset();
    vi.mocked(getPerformanceTagRollups).mockReset();
    vi.mocked(getPerformanceWorkBundle).mockReset();
    vi.mocked(listPerformanceWorks).mockReset();
    vi.mocked(getPerformanceInsightActions).mockReset();
    vi.mocked(listCreatorPerformanceGoals).mockReset();

    vi.mocked(getPerformanceOverview).mockResolvedValue(sampleOverview());
    vi.mocked(getPerformancePostVariant).mockResolvedValue(samplePostVariant());
    vi.mocked(getPerformanceTagRollups).mockResolvedValue({
      ok: true,
      report: {
        creator_id: "creator_a",
        as_of: "2026-06-30T12:00:00.000Z",
        range: "30d",
        time_range: {
          start: "2026-05-31T00:00:00.000Z",
          end: "2026-06-30T12:00:00.000Z"
        },
        tag_filter: null,
        groups: [
          {
            tag: "illustration",
            creative_work_count: 2,
            post_count: 3,
            total_reach: 8000,
            totals: { impressions: 8000, seen: 0, likes: 10, comments: 2, views: 0 },
            by_destination: []
          },
          {
            tag: "sketch",
            creative_work_count: 1,
            post_count: 1,
            total_reach: 500,
            totals: { impressions: 500, seen: 0, likes: 1, comments: 0, views: 0 },
            by_destination: []
          }
        ],
        freshness: {
          rollup_computed_at: "2026-06-30T10:00:00.000Z",
          stale: false,
          stale_after_hours: 48
        }
      }
    });
    vi.mocked(listPerformanceWorks).mockResolvedValue({
      ok: true,
      report: {
        creator_id: "creator_a",
        as_of: "2026-06-30T12:00:00.000Z",
        range: "30d",
        time_range: {
          start: "2026-05-31T00:00:00.000Z",
          end: "2026-06-30T12:00:00.000Z"
        },
        works: [
          {
            creative_work_id: "work_top",
            title: "Top work",
            analytics_campaign_label: null,
            tags: [],
            is_default_bundle: true,
            member_count: 2,
            total_reach: 9000,
            totals: { impressions: 9000, seen: 0, likes: 20, comments: 3, views: 0 },
            by_destination: [
              {
                destination: "patreon",
                impressions: 9000,
                seen: 0,
                likes: 20,
                comments: 3,
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
      }
    });
    vi.mocked(getPerformanceInsightActions).mockResolvedValue({
      ok: true,
      report: {
        creator_id: "creator_a",
        as_of: "2026-06-30T12:00:00.000Z",
        range: "30d",
        actions: [
          {
            id: "perf-test-platform",
            title: "Test another platform",
            trigger: "Reach is concentrated on Patreon.",
            body: "Cross-post a variant.",
            action_label: "Create",
            href: "/studio/new-post",
            tone: "guidance",
            confidence: "medium"
          }
        ]
      }
    });
    vi.mocked(listCreatorPerformanceGoals).mockResolvedValue({
      ok: true,
      report: {
        creator_id: "creator_a",
        as_of: "2026-06-30T12:00:00.000Z",
        range: "30d",
        goals: [
          {
            id: "goal_1",
            scope: "creator",
            scope_ref: null,
            scope_label: "All posts",
            metric: "reach",
            target_value: 10000,
            range: "30d",
            label: "Reach goal",
            enabled: true,
            current_value: 5000,
            progress_ratio: 0.5,
            pace_status: "behind",
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-01T00:00:00.000Z"
          }
        ],
        suggested_goals: []
      }
    });
    vi.mocked(getPerformanceWorkBundle).mockResolvedValue({
      ok: true,
      report: {
        creative_work_id: "work_1",
        title: "Work one",
        description: null,
        analytics_campaign_label: null,
        tags: ["illustration"],
        is_default_bundle: true,
        as_of: "2026-06-30T12:00:00.000Z",
        range: "30d",
        time_range: {
          start: "2026-05-31T00:00:00.000Z",
          end: "2026-06-30T12:00:00.000Z"
        },
        totals: emptyTotals(),
        by_destination: [],
        daily_series: [],
        total_reach: 0,
        variants: [],
        crosspost_gaps: {
          present_destinations: ["patreon"],
          missing_destinations: ["x", "bluesky"],
          missing_teaser_destinations: [],
          suggested_source_post_id: "post_1"
        },
        freshness: {
          rollup_computed_at: null,
          stale: false,
          stale_after_hours: 48
        },
        source_summary: []
      }
    });
  });

  it("returns only allowlisted fact-pack fields", async () => {
    const pack = await buildCoachFactPack({
      prisma: stubPrisma([19, 19, 19, 19, 19]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon", "x"],
      postTags: ["illustration"]
    });
    assertAllowlistedPack(pack);
    expect(pack.this_post?.by_destination.every((d) => d.dest !== "x" || d.reach > 0)).toBe(true);
    expect(pack.destination_mix.length).toBeLessThanOrEqual(3);
    expect(pack.tags.length).toBeLessThanOrEqual(3);
    expect(pack.insight_codes.length).toBeLessThanOrEqual(3);
    expect(pack.goals.length).toBeLessThanOrEqual(3);
    expect(pack.reason_codes.length).toBeLessThanOrEqual(8);
  });

  it("labels empty socials as coverage gaps — does not invent X metrics", async () => {
    const pack = await buildCoachFactPack({
      prisma: stubPrisma([]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon", "x", "bluesky"],
      postTags: ["illustration"]
    });

    expect(pack.coverage.with_metrics).toContain("patreon");
    expect(pack.coverage.without_metrics).toEqual(expect.arrayContaining(["x", "bluesky"]));
    expect(pack.this_post?.by_destination.map((d) => d.dest)).toEqual(["patreon"]);
    expect(pack.this_post?.by_destination.find((d) => d.dest === "x")).toBeUndefined();
    expect(pack.reason_codes).toEqual(expect.arrayContaining(["coverage_patreon_only"]));

    const chips = buildCoachFindings({
      canonical: {
        title: "Studio piece",
        bodyText: "Body",
        tagLabels: ["illustration"]
      } satisfies CanonicalPostCopy,
      context: {},
      factPack: pack
    });
    expect(chips.some((c) => c.source === "coverage" && /no data yet for/i.test(c.label))).toBe(
      true
    );
    expect(chips.some((c) => /x.*impressions|underperformed on x/i.test(c.label))).toBe(false);
  });

  it("degrades on partial analytics failure and still returns a pack", async () => {
    vi.mocked(getPerformanceOverview).mockResolvedValue({ ok: false, code: "NO_TENANT" });
    vi.mocked(getPerformancePostVariant).mockRejectedValue(new Error("db blip"));
    vi.mocked(listPerformanceWorks).mockResolvedValue({ ok: false, code: "NO_TENANT" });

    const pack = await buildCoachFactPack({
      prisma: stubPrisma([]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon", "x"]
    });

    assertAllowlistedPack(pack);
    expect(pack.reason_codes).toContain("analytics_partial");
    expect(pack.this_post).toBeNull();
    expect(pack.destination_mix).toEqual([]);
    expect(pack.coverage.without_metrics).toEqual(expect.arrayContaining(["patreon", "x"]));
  });

  it("gates usual-hour on sample_size >= 5 from posted attempts only", async () => {
    const low = await buildCoachFactPack({
      prisma: stubPrisma([19, 19, 19, 19]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon"]
    });
    expect(low.cadence.sample_size).toBe(4);
    expect(low.cadence.timing_confidence).toBe("low");
    expect(low.cadence.historical_hour_of_day).toBeNull();
    expect(low.reason_codes).toContain("timing_insufficient");

    const high = await buildCoachFactPack({
      prisma: stubPrisma([19, 19, 19, 19, 19]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon"]
    });
    expect(high.cadence.sample_size).toBe(5);
    expect(high.cadence.timing_confidence).toBe("high");
    expect(high.cadence.historical_hour_of_day).toBe(19);

    const chips = buildCoachFindings({
      canonical: { title: "T", bodyText: "B", tagLabels: [] },
      context: {},
      factPack: low
    });
    expect(chips.some((c) => c.id === "history_hour")).toBe(false);
  });

  it("computePostedAttemptHour ignores missing completedAt and never queries posts", async () => {
    const findMany = vi.fn(async () => [
      { completedAt: new Date(Date.UTC(2026, 5, 1, 14, 0, 0)) },
      { completedAt: null }
    ]);
    const prisma = {
      postDistributionAttempt: { findMany },
      post: { findMany: vi.fn(async () => [{ id: "should_not_be_called" }]) }
    } as unknown as PrismaClient;

    const result = await computePostedAttemptHour(prisma, "creator_a", "UTC");
    expect(result.sampleSize).toBe(1);
    expect(result.hour).toBe(14);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "posted", completedAt: { not: null } })
      })
    );
    expect((prisma as { post: { findMany: ReturnType<typeof vi.fn> } }).post.findMany).not.toHaveBeenCalled();
  });

  it("maps insight actions to codes without UI payload fields", () => {
    const mapped = mapInsightActionToCode({
      id: "perf-posting-goal-behind",
      title: "Posting goal behind pace",
      trigger: "1/4 Relay posts this month.",
      body: "Ship a post.",
      action_label: "Create",
      href: "/studio/new-post",
      tone: "active",
      confidence: "high"
    });
    expect(mapped).toEqual({
      code: "goal_behind_pace",
      evidence: "1/4 Relay posts this month."
    });
    expect(mapped).not.toHaveProperty("href");
    expect(mapped).not.toHaveProperty("action_label");
  });

  it("maps fact pack into coverage + performance chips for findings UI", async () => {
    vi.mocked(getPerformancePostVariant).mockResolvedValue(
      samplePostVariant({ creativeWork: true })
    );

    const pack = await buildCoachFactPack({
      prisma: stubPrisma([18, 18, 18, 18, 18, 18]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon", "x"],
      postTags: ["illustration"]
    });

    expect(pack.structure?.gaps).toEqual(expect.arrayContaining(["x", "bluesky"]));
    expect(pack.tags[0]?.tag).toBe("illustration");
    expect(pack.tags[0]?.vs_median).toBe("above");
    expect(pack.contrast?.label).toBe("Top work");
    expect(pack.insight_codes[0]?.code).toBe("dest_concentration");

    const chips = buildCoachFindings({
      canonical: {
        title: "Studio piece",
        bodyText: "Body",
        tagLabels: ["illustration"]
      },
      context: { trend_note: "summer challenge" },
      factPack: pack
    });

    expect(chips.some((c) => c.source === "coverage")).toBe(true);
    expect(chips.some((c) => c.source === "performance" && /this post/i.test(c.label))).toBe(true);
    expect(chips.some((c) => c.source === "performance" && /reach mix/i.test(c.label))).toBe(true);
    expect(chips.some((c) => c.source === "history" && /6pm|18/i.test(c.label))).toBe(true);
    expect(chips.some((c) => c.source === "moment")).toBe(true);
    expect(chips.every((c) => !/follower|ad spend|trending on x/i.test(c.label))).toBe(true);
  });

  it("cadenceToPostingAssistantFacts mirrors gated hour", () => {
    expect(
      cadenceToPostingAssistantFacts({
        monthly_post_target: 4,
        posts_this_month: 1,
        historical_hour_of_day: null,
        sample_size: 2,
        timing_confidence: "low",
        timezone: "UTC"
      }).historical_hour_of_day
    ).toBeNull();
  });

  it("flags dest concentration when one destination owns >=70% reach", async () => {
    vi.mocked(getPerformanceOverview).mockResolvedValue(
      sampleOverview({
        byDestination: [
          { destination: "patreon", impressions: 9000 },
          { destination: "relay", impressions: 500, views: 500 }
        ]
      })
    );

    const pack = await buildCoachFactPack({
      prisma: stubPrisma([]),
      creatorId: "creator_a",
      postId: "post_1",
      selectedDestinations: ["patreon"]
    });

    expect(pack.reason_codes.some((c) => c.startsWith("dest_concentration_"))).toBe(true);
    expect(pack.destination_mix[0]?.dest).toBe("patreon");
    expect(pack.destination_mix[0]!.reach_share).toBeGreaterThanOrEqual(0.7);
  });
});
