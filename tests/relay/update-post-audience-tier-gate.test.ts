import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { updatePostAudienceTierGate } from "../../src/relay/update-post-audience-tier-gate.js";

describe("updatePostAudienceTierGate", () => {
  it("updates post head, latest version tierIds, and PostTier junction rows", async () => {
    const postUpdate = vi.fn().mockResolvedValue({});
    const versionFindFirst = vi.fn().mockResolvedValue({ versionSeq: 2 });
    const versionUpdate = vi.fn().mockResolvedValue({});
    const postTierDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const postTierCreateMany = vi.fn().mockResolvedValue({ count: 1 });

    const tx = {
      post: { update: postUpdate },
      postVersion: { findFirst: versionFindFirst, update: versionUpdate },
      postTier: { deleteMany: postTierDeleteMany, createMany: postTierCreateMany }
    };

    const prisma = {
      $transaction: vi.fn(async (fn: (inner: typeof tx) => Promise<void>) => fn(tx))
    } as unknown as PrismaClient;

    const out = await updatePostAudienceTierGate(prisma, {
      creatorId: "creator_a",
      postId: "post_1",
      tierIds: ["patreon_tier_studio", "patreon_tier_studio"]
    });

    expect(out).toEqual({
      postId: "post_1",
      isPublic: false,
      tierIds: ["patreon_tier_studio"]
    });
    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: "post_1" },
      data: { isPublic: false, requiredTierId: "patreon_tier_studio" }
    });
    expect(versionUpdate).toHaveBeenCalledWith({
      where: { postId_versionSeq: { postId: "post_1", versionSeq: 2 } },
      data: { tierIds: ["patreon_tier_studio"] }
    });
    expect(postTierCreateMany).toHaveBeenCalledWith({
      data: [{ postId: "post_1", tierId: "creator_a::patreon_tier_studio" }]
    });
  });

  it("clears tiers and marks post public when tierIds is empty", async () => {
    const postUpdate = vi.fn().mockResolvedValue({});
    const versionFindFirst = vi.fn().mockResolvedValue({ versionSeq: 1 });
    const versionUpdate = vi.fn().mockResolvedValue({});
    const postTierDeleteMany = vi.fn().mockResolvedValue({ count: 0 });

    const tx = {
      post: { update: postUpdate },
      postVersion: { findFirst: versionFindFirst, update: versionUpdate },
      postTier: { deleteMany: postTierDeleteMany, createMany: vi.fn() }
    };

    const prisma = {
      $transaction: vi.fn(async (fn: (inner: typeof tx) => Promise<void>) => fn(tx))
    } as unknown as PrismaClient;

    const out = await updatePostAudienceTierGate(prisma, {
      creatorId: "creator_a",
      postId: "post_2",
      tierIds: [],
      isPublic: true
    });

    expect(out.isPublic).toBe(true);
    expect(out.tierIds).toEqual([]);
    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: "post_2" },
      data: { isPublic: true, requiredTierId: null }
    });
    expect(versionUpdate).toHaveBeenCalledWith({
      where: { postId_versionSeq: { postId: "post_2", versionSeq: 1 } },
      data: { tierIds: [] }
    });
    expect(postTierDeleteMany).toHaveBeenCalled();
  });
});
