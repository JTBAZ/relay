import { describe, expect, it, vi } from "vitest";
import {
  confidenceFromSource,
  getPerformanceCampaignRollups,
  getPerformancePostVariant,
  getPerformanceWorkBundle,
  getPerformanceWorkInstances,
  listPerformanceWorks
} from "../src/analytics/performance-intelligence-read.js";

vi.mock("../src/autopost/posting-goal-service.js", () => ({
  getCreatorPostingGoalStatus: vi.fn().mockResolvedValue({
    pace_status: "on_track",
    monthly_target: 4,
    posts_this_month: 2,
    active_nudge: null
  })
}));

const CREATOR_ID = "creator_a";

function rollupRow(
  postId: string,
  destination: string,
  metricType: string,
  delta: number,
  source = "extension_dom"
) {
  return {
    postId,
    destination,
    metricType,
    day: new Date("2026-06-30T00:00:00.000Z"),
    value: delta,
    deltaFromPrior: delta,
    computedAt: new Date("2026-06-30T12:00:00.000Z"),
    source
  };
}

describe("confidenceFromSource", () => {
  it("maps high-fidelity sources to high confidence when fresh", () => {
    expect(confidenceFromSource("platform_api", 12)).toBe("high");
    expect(confidenceFromSource("extension_dom", 24)).toBe("high");
  });

  it("downgrades stale high-fidelity sources", () => {
    expect(confidenceFromSource("platform_api", 72)).toBe("medium");
  });

  it("returns unknown for missing source", () => {
    expect(confidenceFromSource(null, 0)).toBe("unknown");
  });
});

describe("getPerformanceCampaignRollups", () => {
  it("groups rollup rows by analytics campaign label", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "cw_summer",
            title: "Summer",
            description: null,
            analyticsCampaignLabel: "Launch",
            tags: [],
            isDefaultBundle: false,
            members: [{ postId: "post_a", variantRole: "full", sortOrder: 0 }]
          },
          {
            id: "cw_default_post_b",
            title: "Beta",
            description: null,
            analyticsCampaignLabel: null,
            tags: [],
            isDefaultBundle: true,
            members: [{ postId: "post_b", variantRole: "standalone", sortOrder: 0 }]
          }
        ])
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          rollupRow("post_a", "patreon", "impressions", 100),
          rollupRow("post_b", "x", "likes", 5)
        ])
      }
    };

    const out = await getPerformanceCampaignRollups(prisma as never, CREATOR_ID, {
      range: "30d",
      asOf: new Date("2026-06-30T20:00:00.000Z")
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.groups).toHaveLength(2);
    const launch = out.report.groups.find((group) => group.campaign_label === "Launch");
    expect(launch).toMatchObject({
      creative_work_count: 1,
      post_count: 1,
      total_reach: 100
    });
  });
});

describe("listPerformanceWorks", () => {
  it("ranks works by total reach", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "cw_low",
            title: "Low",
            description: null,
            analyticsCampaignLabel: null,
            tags: [],
            isDefaultBundle: true,
            members: [{ postId: "post_low", variantRole: "standalone", sortOrder: 0 }]
          },
          {
            id: "cw_high",
            title: "High",
            description: null,
            analyticsCampaignLabel: null,
            tags: [],
            isDefaultBundle: false,
            members: [{ postId: "post_high", variantRole: "full", sortOrder: 0 }]
          }
        ])
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          rollupRow("post_low", "patreon", "impressions", 10),
          rollupRow("post_high", "patreon", "impressions", 500)
        ])
      }
    };

    const out = await listPerformanceWorks(prisma as never, CREATOR_ID);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.works[0]?.creative_work_id).toBe("cw_high");
    expect(out.report.works[0]?.total_reach).toBe(500);
  });
});

describe("getPerformanceWorkBundle", () => {
  it("returns NOT_FOUND for unknown work id", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: { findFirst: vi.fn().mockResolvedValue(null) }
    };

    await expect(
      getPerformanceWorkBundle(prisma as never, CREATOR_ID, "missing_work")
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("returns variants with platform instances", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cw_shared",
          title: "Shared work",
          description: null,
          analyticsCampaignLabel: "Campaign",
          tags: ["sketch"],
          isDefaultBundle: false,
          members: [
            { postId: "post_full", variantRole: "full" },
            { postId: "post_teaser", variantRole: "teaser" }
          ]
        })
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          rollupRow("post_full", "patreon", "likes", 12),
          rollupRow("post_teaser", "x", "impressions", 40)
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          { id: "post_full", versions: [{ title: "Full" }] },
          { id: "post_teaser", versions: [{ title: "Teaser" }] }
        ])
      },
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_attempt_1",
            postId: "post_full",
            destination: "patreon",
            externalUrl: "https://patreon.com/posts/1",
            externalId: null,
            attemptId: "attempt_1",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z")
          }
        ])
      }
    };

    const out = await getPerformanceWorkBundle(prisma as never, CREATOR_ID, "cw_shared");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.variants).toHaveLength(2);
    expect(out.report.total_reach).toBe(40);
    expect(out.report.variants[0]).toMatchObject({
      post_id: "post_full",
      variant_role: "full",
      platform_instances: [
        expect.objectContaining({ platform_instance_id: "pi_attempt_1" })
      ]
    });
    expect(out.report.role_breakdown).toBeUndefined();
  });

  it("includes role_breakdown when groupByVariantRole is enabled", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cw_shared",
          title: "Shared work",
          description: null,
          analyticsCampaignLabel: "Campaign",
          tags: ["sketch"],
          isDefaultBundle: false,
          members: [
            { postId: "post_full", variantRole: "full" },
            { postId: "post_teaser", variantRole: "teaser" }
          ]
        })
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          rollupRow("post_full", "patreon", "likes", 12),
          rollupRow("post_teaser", "x", "impressions", 40)
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          { id: "post_full", versions: [{ title: "Full" }] },
          { id: "post_teaser", versions: [{ title: "Teaser" }] }
        ])
      },
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };

    const out = await getPerformanceWorkBundle(prisma as never, CREATOR_ID, "cw_shared", {
      groupByVariantRole: true
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.report.role_breakdown).toMatchObject({
      full: {
        member_count: 1,
        post_ids: ["post_full"],
        total_reach: 0,
        totals: expect.objectContaining({ likes: 12 })
      },
      teaser: {
        member_count: 1,
        post_ids: ["post_teaser"],
        total_reach: 40,
        totals: expect.objectContaining({ impressions: 40 })
      }
    });
    expect(out.report.total_reach).toBe(40);
  });

  it("splits role_breakdown by instance contentVariantRole on a single post", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cw_single",
          title: "Single post bundle",
          description: null,
          analyticsCampaignLabel: null,
          tags: [],
          isDefaultBundle: false,
          members: [{ postId: "post_standalone", variantRole: "standalone" }]
        })
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          rollupRow("post_standalone", "patreon", "likes", 8),
          rollupRow("post_standalone", "x", "impressions", 25)
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          { id: "post_standalone", versions: [{ title: "Piece" }] }
        ])
      },
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_patreon",
            postId: "post_standalone",
            destination: "patreon",
            externalUrl: "https://patreon.com/posts/1",
            externalId: null,
            attemptId: "attempt_patreon",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            contentVariantRole: null
          },
          {
            id: "pi_x",
            postId: "post_standalone",
            destination: "x",
            externalUrl: "https://x.com/handle/status/1",
            externalId: "1",
            attemptId: "attempt_x",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            contentVariantRole: "promo"
          }
        ])
      }
    };

    const out = await getPerformanceWorkBundle(prisma as never, CREATOR_ID, "cw_single", {
      groupByVariantRole: true
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.report.role_breakdown).toMatchObject({
      standalone: {
        member_count: 1,
        post_ids: ["post_standalone"],
        totals: expect.objectContaining({ likes: 8 })
      },
      promo: {
        member_count: 1,
        post_ids: ["post_standalone"],
        total_reach: 25,
        totals: expect.objectContaining({ impressions: 25 })
      }
    });
    expect(out.report.variants[0].platform_instances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destination: "patreon", variant_role: "standalone" }),
        expect.objectContaining({ destination: "x", variant_role: "promo" })
      ])
    );
  });

  it("includes crosspost_gaps for linked destinations", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cw_shared",
          title: "Shared work",
          description: null,
          analyticsCampaignLabel: "Campaign",
          tags: ["sketch"],
          isDefaultBundle: false,
          members: [
            { postId: "post_full", variantRole: "full" },
            { postId: "post_teaser", variantRole: "teaser" }
          ]
        })
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          { id: "post_full", versions: [{ title: "Full" }] },
          { id: "post_teaser", versions: [{ title: "Teaser" }] }
        ])
      },
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_attempt_1",
            postId: "post_full",
            destination: "patreon",
            externalUrl: "https://patreon.com/posts/1",
            externalId: null,
            attemptId: "attempt_1",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z")
          },
          {
            id: "pi_attempt_2",
            postId: "post_teaser",
            destination: "deviantart",
            externalUrl: "https://www.deviantart.com/artist/art/Piece-1",
            externalId: "1",
            attemptId: "attempt_2",
            linkSource: "manual_url_confirm",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z")
          }
        ])
      }
    };

    const out = await getPerformanceWorkBundle(prisma as never, CREATOR_ID, "cw_shared");
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.report.crosspost_gaps).toMatchObject({
      present_destinations: ["deviantart", "patreon"],
      missing_destinations: ["x", "bluesky"],
      suggested_source_post_id: "post_full"
    });
    expect(out.report.crosspost_gaps.missing_teaser_destinations).toContain("x");
  });
});

describe("getPerformanceWorkInstances", () => {
  it("returns NOT_FOUND for unknown work id", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: { findFirst: vi.fn().mockResolvedValue(null) }
    };

    await expect(
      getPerformanceWorkInstances(prisma as never, CREATOR_ID, "missing_work")
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("returns instances grouped by post with refresh eligibility", async () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cw_shared",
          title: "Shared work",
          members: [
            { postId: "post_full", variantRole: "full" },
            { postId: "post_teaser", variantRole: "teaser" }
          ]
        })
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          { id: "post_full", versions: [{ title: "Full" }] },
          { id: "post_teaser", versions: [{ title: "Teaser" }] }
        ])
      },
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_attempt_1",
            creatorId: CREATOR_ID,
            postId: "post_full",
            destination: "patreon",
            externalUrl: "https://patreon.com/posts/1",
            externalId: null,
            attemptId: "attempt_1",
            linkSource: "autopost_success",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            lastManualRefreshRequestedAt: null
          },
          {
            id: "pi_attempt_2",
            creatorId: CREATOR_ID,
            postId: "post_teaser",
            destination: "x",
            externalUrl: "https://x.com/handle/status/1",
            externalId: "1",
            attemptId: "attempt_2",
            linkSource: "manual_url_confirm",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: new Date("2026-06-30T10:00:00.000Z"),
            lastManualRefreshRequestedAt: new Date("2026-07-01T11:50:00.000Z")
          }
        ])
      }
    };

    const out = await getPerformanceWorkInstances(prisma as never, CREATOR_ID, "cw_shared", {
      asOf: now
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.report).toMatchObject({
      creative_work_id: "cw_shared",
      title: "Shared work",
      posts: [
        {
          post_id: "post_full",
          title: "Full",
          variant_role: "full",
          platform_instances: [
            expect.objectContaining({
              platform_instance_id: "pi_attempt_1",
              destination: "patreon",
              refresh_eligible: true,
              can_refresh_manually: true,
              cooldown_active: false,
              recommended_method: "extension_handoff"
            })
          ]
        },
        {
          post_id: "post_teaser",
          title: "Teaser",
          variant_role: "teaser",
          platform_instances: [
            expect.objectContaining({
              platform_instance_id: "pi_attempt_2",
              destination: "x",
              refresh_eligible: false,
              can_refresh_manually: true,
              cooldown_active: true,
              recommended_method: "extension_handoff"
            })
          ]
        }
      ],
      crosspost_gaps: {
        present_destinations: ["patreon", "x"],
        missing_destinations: ["deviantart", "bluesky"],
        missing_teaser_destinations: ["patreon", "deviantart", "bluesky"],
        suggested_source_post_id: "post_full"
      }
    });
  });
});

describe("getPerformancePostVariant", () => {
  it("returns post drilldown with creative work membership", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      post: {
        findFirst: vi.fn().mockResolvedValue({
          id: "post_a",
          versions: [{ title: "Alpha" }],
          creativeWorkMember: {
            variantRole: "standalone",
            creativeWork: {
              id: "cw_default_post_a",
              title: "Alpha",
              isDefaultBundle: true
            }
          }
        })
      },
      externalPostMetricDaily: {
        findMany: vi.fn().mockResolvedValue([
          rollupRow("post_a", "relay", "views", 15, "manual")
        ])
      },
      platformInstance: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pi_relay_post_a",
            postId: "post_a",
            destination: "relay",
            externalUrl: null,
            externalId: null,
            attemptId: null,
            linkSource: "relay_native",
            status: "active",
            refreshPolicy: "conservative",
            linkedAt: new Date("2026-06-01T00:00:00.000Z"),
            lastRefreshedAt: null
          }
        ])
      }
    };

    const out = await getPerformancePostVariant(prisma as never, CREATOR_ID, "post_a");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.creative_work).toMatchObject({
      creative_work_id: "cw_default_post_a",
      variant_role: "standalone"
    });
    expect(out.report.total_reach).toBe(15);
    expect(out.report.platform_instances).toHaveLength(1);
  });
});
