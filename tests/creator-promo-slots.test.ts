import { describe, expect, it, vi } from "vitest";
import {
  CreatorPromoSlotTargetNotFoundError,
  CreatorPromoSlotValidationError,
  getCreatorPromoSlots,
  putCreatorPromoSlots
} from "../src/creator/promo-slot-service.js";

describe("putCreatorPromoSlots validation", () => {
  it("rejects rank outside 1..5", async () => {
    await expect(
      putCreatorPromoSlots({} as never, "cr_1", [
        { slot_rank: 0 as 1, target_kind: "post", target_id: "p1" }
      ])
    ).rejects.toBeInstanceOf(CreatorPromoSlotValidationError);
  });

  it("rejects payloads larger than 5 rows", async () => {
    const rows = [
      { slot_rank: 1 as const, target_kind: "post" as const, target_id: "p1" },
      { slot_rank: 2 as const, target_kind: "post" as const, target_id: "p2" },
      { slot_rank: 3 as const, target_kind: "post" as const, target_id: "p3" },
      { slot_rank: 4 as const, target_kind: "post" as const, target_id: "p4" },
      { slot_rank: 5 as const, target_kind: "post" as const, target_id: "p5" },
      { slot_rank: 1 as const, target_kind: "media" as const, target_id: "m1" }
    ];
    await expect(putCreatorPromoSlots({} as never, "cr_1", rows)).rejects.toBeInstanceOf(
      CreatorPromoSlotValidationError
    );
  });
});

describe("putCreatorPromoSlots target ownership", () => {
  it("rejects targets not found for creator", async () => {
    const prisma = {
      post: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) }
    };

    await expect(
      putCreatorPromoSlots(prisma as never, "cr_owner", [
        { slot_rank: 1, target_kind: "post", target_id: "post_not_owned" }
      ])
    ).rejects.toBeInstanceOf(CreatorPromoSlotTargetNotFoundError);
  });
});

describe("putCreatorPromoSlots replace semantics", () => {
  it("replaces full set and supports sparse ranks", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const create = vi.fn().mockResolvedValue(undefined);
    const tx = { creatorPromoSlot: { deleteMany, create } };
    const $transaction = vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx));

    const creatorPromoSlotFindMany = vi.fn().mockResolvedValue([
      {
        slotRank: 1,
        targetKind: "post",
        targetId: "post_a",
        label: "Hero"
      },
      {
        slotRank: 3,
        targetKind: "media",
        targetId: "media_a",
        label: null
      }
    ]);

    const postFindMany = vi
      .fn()
      // assertTargetsExistForCreator
      .mockResolvedValueOnce([{ id: "post_a" }])
      // getCreatorPromoSlots enrichment
      .mockResolvedValueOnce([
        {
          id: "post_a",
          versions: [{ title: "Post A" }],
          mediaAssets: [{ currentStorageKey: "thumb/post_a.jpg", currentUpstreamUrl: null }]
        }
      ]);
    const mediaFindMany = vi
      .fn()
      // assertTargetsExistForCreator
      .mockResolvedValueOnce([{ id: "media_a" }])
      // getCreatorPromoSlots enrichment
      .mockResolvedValueOnce([
        {
          id: "media_a",
          primaryPostId: "post_a",
          currentStorageKey: "thumb/media_a.jpg",
          currentUpstreamUrl: null
        }
      ]);

    const prisma = {
      $transaction,
      post: { findMany: postFindMany },
      mediaAsset: { findMany: mediaFindMany },
      creatorPromoSlot: { findMany: creatorPromoSlotFindMany }
    };

    const out = await putCreatorPromoSlots(prisma as never, "cr_sparse", [
      {
        slot_rank: 1,
        target_kind: "post",
        target_id: "post_a",
        label: "Hero"
      },
      {
        slot_rank: 3,
        target_kind: "media",
        target_id: "media_a"
      }
    ]);

    expect(deleteMany).toHaveBeenCalledWith({ where: { creatorId: "cr_sparse" } });
    expect(create).toHaveBeenCalledTimes(2);
    expect(out.creator_id).toBe("cr_sparse");
    expect(out.slots).toEqual([
      {
        slot_rank: 1,
        target_kind: "post",
        target_id: "post_a",
        post_id: "post_a",
        title: "Post A",
        thumb_url_path: "thumb/post_a.jpg",
        label: "Hero"
      },
      {
        slot_rank: 3,
        target_kind: "media",
        target_id: "media_a",
        post_id: "post_a",
        title: "Post A",
        thumb_url_path: "thumb/media_a.jpg",
        label: null
      }
    ]);
  });
});

describe("getCreatorPromoSlots", () => {
  it("returns empty slots when creator has none", async () => {
    const prisma = {
      creatorPromoSlot: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const out = await getCreatorPromoSlots(prisma as never, "cr_empty");
    expect(out).toEqual({ creator_id: "cr_empty", slots: [] });
  });
});
