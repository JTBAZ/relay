import { describe, expect, it, vi } from "vitest";
import {
  confirmMergeCreativeWorkBundle,
  dismissCreativeWorkBundleSuggestion,
  inferSuggestedVariantRole,
  linkCreativeWorkMembers,
  scoreBundlePair,
  splitCreativeWorkMember,
  suggestionIdFor,
  titleSimilarity
} from "../src/analytics/creative-work-bundling-service.js";

describe("titleSimilarity", () => {
  it("scores overlapping title tokens", () => {
    expect(titleSimilarity("Summer Sketch Full Piece", "Summer Sketch Teaser")).toBeGreaterThan(0.3);
    expect(titleSimilarity("", "Alpha")).toBe(0);
  });
});

describe("inferSuggestedVariantRole", () => {
  it("detects teaser from title and publish order", () => {
    expect(
      inferSuggestedVariantRole(
        "Summer sketch teaser",
        "Summer sketch full",
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-06-10T00:00:00.000Z")
      )
    ).toBe("teaser");
  });
});

describe("scoreBundlePair", () => {
  it("weights distribution lineage and shared external url highest", () => {
    const source = {
      postId: "post_a",
      creativeWorkId: "cw_default_post_a",
      title: "Summer sketch teaser",
      publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      mediaIds: ["media_1"],
      sourceDraftIds: new Set(["draft_1"]),
      externalUrls: new Set(["https://patreon.com/posts/1"]),
      externalIds: new Set<string>()
    };
    const target = {
      postId: "post_b",
      creativeWorkId: "cw_default_post_b",
      title: "Summer sketch full",
      publishedAt: new Date("2026-06-05T00:00:00.000Z"),
      mediaIds: ["media_1"],
      sourceDraftIds: new Set(["draft_1"]),
      externalUrls: new Set(["https://patreon.com/posts/1"]),
      externalIds: new Set<string>()
    };

    const scored = scoreBundlePair(source, target);
    expect(scored.score).toBeGreaterThanOrEqual(70);
    expect(scored.signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining(["distribution_lineage", "shared_external_url", "shared_media"])
    );
  });
});

describe("dismissCreativeWorkBundleSuggestion", () => {
  it("upserts dismissal rows", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWork: { findFirst: vi.fn().mockResolvedValue({ id: "cw_target" }) },
      creativeWorkBundleSuggestionDismissal: { upsert }
    };

    const out = await dismissCreativeWorkBundleSuggestion(prisma as never, "creator_a", {
      sourcePostId: "post_a",
      targetCreativeWorkId: "cw_target"
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.suggestion_id).toBe(suggestionIdFor("post_a", "cw_target"));
    expect(upsert).toHaveBeenCalled();
  });
});

describe("confirmMergeCreativeWorkBundle", () => {
  it("moves a post into the target work", async () => {
    const updateMember = vi.fn().mockResolvedValue({});
    const updateWork = vi.fn().mockResolvedValue({});
    const count = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const deleteWork = vi.fn().mockResolvedValue({});

    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      creativeWorkMember: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cwm_default_post_a",
          creativeWorkId: "cw_default_post_a",
          variantRole: "standalone",
          creativeWork: { isDefaultBundle: true, members: [{ postId: "post_a" }] }
        }),
        update: updateMember,
        count
      },
      creativeWork: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cw_default_post_b",
          members: [{ postId: "post_b", sortOrder: 0 }]
        }),
        update: updateWork,
        delete: deleteWork
      },
      creativeWorkBundleSuggestionDismissal: { deleteMany },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          creativeWorkMember: { update: updateMember, count },
          creativeWork: { update: updateWork, delete: deleteWork },
          creativeWorkBundleSuggestionDismissal: { deleteMany }
        })
      )
    };

    const out = await confirmMergeCreativeWorkBundle(prisma as never, "creator_a", {
      sourcePostId: "post_a",
      targetCreativeWorkId: "cw_default_post_b",
      variantRole: "teaser"
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.variant_role).toBe("teaser");
    expect(out.result.member_count).toBe(2);
    expect(updateMember).toHaveBeenCalled();
  });
});

describe("linkCreativeWorkMembers", () => {
  it("rejects fewer than two posts", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) }
    };
    const out = await linkCreativeWorkMembers(prisma as never, "creator_a", {
      members: [{ postId: "post_a" }]
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("INVALID_INPUT");
  });

  it("creates a non-default work and moves members with cover sort_order 0", async () => {
    const createWork = vi.fn().mockResolvedValue({});
    const updateMember = vi.fn().mockResolvedValue({});
    const count = vi.fn().mockResolvedValue(0);
    const deleteWork = vi.fn().mockResolvedValue({});
    const findManyPosts = vi.fn().mockResolvedValue([
      { id: "post_a", versions: [{ title: "Page 1" }] },
      { id: "post_b", versions: [{ title: "Page 2" }] }
    ]);
    const findManyMembers = vi.fn().mockResolvedValue([
      {
        id: "cwm_a",
        postId: "post_a",
        creativeWorkId: "cw_default_post_a",
        variantRole: "full",
        memberLabel: null
      },
      {
        id: "cwm_b",
        postId: "post_b",
        creativeWorkId: "cw_default_post_b",
        variantRole: "teaser",
        memberLabel: null
      }
    ]);

    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" }) },
      post: { findMany: findManyPosts },
      creativeWorkMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "existing", creativeWorkId: "cw" }),
        findMany: findManyMembers,
        update: updateMember,
        count,
        create: vi.fn()
      },
      creativeWork: {
        create: createWork,
        upsert: vi.fn(),
        delete: deleteWork,
        update: vi.fn()
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          creativeWork: { create: createWork, delete: deleteWork, update: vi.fn() },
          creativeWorkMember: { update: updateMember, count }
        })
      )
    };

    const out = await linkCreativeWorkMembers(prisma as never, "creator_a", {
      title: "Comic set",
      members: [
        { postId: "post_a", variantRole: "full", memberLabel: "Page 1", isCover: true },
        { postId: "post_b", variantRole: "teaser", memberLabel: "Teaser" }
      ]
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.title).toBe("Comic set");
    expect(out.result.member_count).toBe(2);
    expect(out.result.members[0]).toMatchObject({
      post_id: "post_a",
      sort_order: 0,
      member_label: "Page 1"
    });
    expect(createWork).toHaveBeenCalled();
    expect(updateMember).toHaveBeenCalledTimes(2);
  });
});
