import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/tips/tip-eligibility.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/tips/tip-eligibility.js")>();
  return {
    ...actual,
    resolveTipEligibility: vi.fn(async () => ({
      eligible: true,
      reasons: [],
      promo_slot_id: "slot",
      creator_id: "cr"
    }))
  };
});

import {
  CreatorPromoSlotTargetNotFoundError,
  CreatorPromoSlotValidationError,
  getCreatorPromoSlots,
  putCreatorPromoSlots
} from "../src/creator/promo-slot-service.js";
import { resolveTipEligibility } from "../src/tips/tip-eligibility.js";

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

  it("rejects duplicate targets", async () => {
    await expect(
      putCreatorPromoSlots({} as never, "cr_1", [
        { slot_rank: 1, target_kind: "post", target_id: "post_a" },
        { slot_rank: 2, target_kind: "post", target_id: "post_a" }
      ])
    ).rejects.toMatchObject({
      name: "CreatorPromoSlotValidationError",
      details: expect.arrayContaining([
        expect.objectContaining({ issue: "duplicate_target" })
      ])
    });
  });
});

describe("putCreatorPromoSlots target ownership", () => {
  it("rejects targets not found for creator", async () => {
    const prisma = {
      post: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      creatorPromoSlot: { findMany: vi.fn() }
    };

    await expect(
      putCreatorPromoSlots(prisma as never, "cr_owner", [
        { slot_rank: 1, target_kind: "post", target_id: "post_not_owned" }
      ])
    ).rejects.toBeInstanceOf(CreatorPromoSlotTargetNotFoundError);
  });
});

function enrichmentMocks(args: {
  postIds?: string[];
  media?: Array<{ id: string; primaryPostId: string | null }>;
}) {
  const postFindMany = vi.fn().mockImplementation(async (query: { where?: { id?: { in?: string[] } } }) => {
    const ids = query?.where?.id?.in ?? args.postIds ?? [];
    return ids.map((id: string) => ({
      id,
      versions: [{ title: `Title ${id}` }],
      mediaAssets: [
        {
          id: `media_for_${id}`,
          currentMimeType: "image/jpeg",
          currentStorageKey: `thumb/${id}.jpg`,
          currentUpstreamUrl: null
        }
      ]
    }));
  });
  const mediaFindMany = vi.fn().mockImplementation(async (query: { where?: { id?: { in?: string[] } } }) => {
    const ids = new Set(query?.where?.id?.in ?? []);
    const rows = (args.media ?? []).filter((m) => ids.has(m.id));
    // ownership assert returns {id}; enrichment returns full row — detect by select shape via call count is hard;
    // return both shapes: if only id requested, still fine with extra fields.
    return rows.map((m) => ({
      id: m.id,
      primaryPostId: m.primaryPostId,
      currentMimeType: "image/jpeg",
      currentStorageKey: `thumb/${m.id}.jpg`,
      currentUpstreamUrl: null
    }));
  });
  return { postFindMany, mediaFindMany };
}

describe("putCreatorPromoSlots stable identity", () => {
  it("preserves promo_piece_id across reorder and compacts ranks", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const create = vi.fn().mockResolvedValue(undefined);
    const tx = { creatorPromoSlot: { deleteMany, create } };
    const $transaction = vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx));

    const existingFindMany = vi.fn().mockResolvedValue([
      {
        id: "pp_post_a",
        targetKind: "post",
        targetId: "post_a",
        label: "Hero",
        metadata: null,
        tipEligible: true
      },
      {
        id: "pp_media_a",
        targetKind: "media",
        targetId: "media_a",
        label: null,
        metadata: { note: "keep" },
        tipEligible: false
      }
    ]);

    // After write, getCreatorPromoSlots reads compacted ranks with preserved ids.
    const afterWriteFindMany = vi.fn().mockResolvedValue([
      {
        id: "pp_media_a",
        slotRank: 1,
        targetKind: "media",
        targetId: "media_a",
        label: null,
        metadata: { note: "keep" },
        tipEligible: false
      },
      {
        id: "pp_post_a",
        slotRank: 2,
        targetKind: "post",
        targetId: "post_a",
        label: "Hero",
        metadata: null,
        tipEligible: true
      }
    ]);

    const creatorPromoSlotFindMany = vi
      .fn()
      // existing rows before replace
      .mockImplementationOnce(() => existingFindMany())
      // getCreatorPromoSlots after replace
      .mockImplementationOnce(() => afterWriteFindMany());

    const { postFindMany, mediaFindMany } = enrichmentMocks({
      postIds: ["post_a"],
      media: [{ id: "media_a", primaryPostId: "post_a" }]
    });

    // assertTargetsExist needs simple id rows; enrichment needs richer — use sequential mocks
    postFindMany
      .mockReset()
      .mockResolvedValueOnce([{ id: "post_a" }])
      .mockResolvedValueOnce([
        {
          id: "post_a",
          versions: [{ title: "Post A" }],
          mediaAssets: [
            {
              id: "media_for_post_a",
              currentMimeType: "image/jpeg",
              currentStorageKey: "thumb/post_a.jpg",
              currentUpstreamUrl: null
            }
          ]
        }
      ]);
    mediaFindMany
      .mockReset()
      .mockResolvedValueOnce([{ id: "media_a" }])
      .mockResolvedValueOnce([
        {
          id: "media_a",
          primaryPostId: "post_a",
          currentMimeType: "image/jpeg",
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

    // Reorder via ranks: media gets input rank 1, post rank 2 — IDs preserved, ranks compacted.
    const out = await putCreatorPromoSlots(prisma as never, "cr_stable", [
      { slot_rank: 2, target_kind: "post", target_id: "post_a", label: "Hero" },
      { slot_rank: 1, target_kind: "media", target_id: "media_a" }
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      id: "pp_media_a",
      slotRank: 1,
      targetKind: "media",
      targetId: "media_a",
      metadata: { note: "keep" },
      tipEligible: false
    });
    expect(create.mock.calls[1]?.[0]?.data).toMatchObject({
      id: "pp_post_a",
      slotRank: 2,
      targetKind: "post",
      targetId: "post_a",
      label: "Hero",
      tipEligible: true
    });

    expect(out.slots.map((s) => s.promo_piece_id)).toEqual(["pp_media_a", "pp_post_a"]);
    expect(out.slots.map((s) => s.slot_rank)).toEqual([1, 2]);
    expect(out.slots[0]?.post_id).toBe("post_a");
    expect(out.slots[1]?.post_id).toBe("post_a");
    expect(out.slots[0]?.tip_eligible).toBe(false);
    expect(out.slots[1]?.tip_eligible).toBe(true);
  });

  it("assigns a new id for new targets and drops removed targets", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue(undefined);
    const tx = { creatorPromoSlot: { deleteMany, create } };
    const $transaction = vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx));

    const creatorPromoSlotFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "pp_old",
          targetKind: "post",
          targetId: "post_old",
          label: null,
          metadata: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "generated-by-prisma",
          slotRank: 1,
          targetKind: "post",
          targetId: "post_new",
          label: null,
          metadata: null
        }
      ]);

    const postFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "post_new" }])
      .mockResolvedValueOnce([
        {
          id: "post_new",
          versions: [{ title: "New" }],
          mediaAssets: [
            {
              id: "media_for_new",
              currentMimeType: "image/jpeg",
              currentStorageKey: "thumb/new.jpg",
              currentUpstreamUrl: null
            }
          ]
        }
      ]);

    const prisma = {
      $transaction,
      post: { findMany: postFindMany },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
      creatorPromoSlot: { findMany: creatorPromoSlotFindMany }
    };

    const out = await putCreatorPromoSlots(prisma as never, "cr_new", [
      { slot_rank: 1, target_kind: "post", target_id: "post_new" }
    ]);

    expect(create.mock.calls[0]?.[0]?.data.id).toBeUndefined();
    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      targetId: "post_new",
      slotRank: 1
    });
    expect(out.slots).toHaveLength(1);
    expect(out.slots[0]?.promo_piece_id).toBe("generated-by-prisma");
    expect(out.slots[0]?.target_id).toBe("post_new");
  });
});

describe("putCreatorPromoSlots replace semantics", () => {
  it("replaces full set and compacts sparse ranks to 1…N", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn().mockResolvedValue(undefined);
    const tx = { creatorPromoSlot: { deleteMany, create } };
    const $transaction = vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx));

    const creatorPromoSlotFindMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "id_1",
          slotRank: 1,
          targetKind: "post",
          targetId: "post_a",
          label: "Hero",
          metadata: null
        },
        {
          id: "id_2",
          slotRank: 2,
          targetKind: "media",
          targetId: "media_a",
          label: null,
          metadata: null
        }
      ]);

    const postFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "post_a" }])
      .mockResolvedValueOnce([
        {
          id: "post_a",
          versions: [{ title: "Post A" }],
          mediaAssets: [
            {
              id: "media_for_post_a",
              currentMimeType: "image/jpeg",
              currentStorageKey: "thumb/post_a.jpg",
              currentUpstreamUrl: null
            }
          ]
        }
      ]);
    const mediaFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "media_a" }])
      .mockResolvedValueOnce([
        {
          id: "media_a",
          primaryPostId: "post_a",
          currentMimeType: "image/jpeg",
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
    expect(create.mock.calls[0]?.[0]?.data.slotRank).toBe(1);
    expect(create.mock.calls[1]?.[0]?.data.slotRank).toBe(2);
    expect(out.creator_id).toBe("cr_sparse");
    expect(out.slots).toEqual([
      {
        promo_piece_id: "id_1",
        slot_rank: 1,
        target_kind: "post",
        target_id: "post_a",
        post_id: "post_a",
        title: "Post A",
        thumb_url_path: "/api/v1/export/media/cr_sparse/media_for_post_a/thumb",
        label: "Hero",
        metadata: null,
        tip_eligible: true,
        tip_eligibility: { eligible: true, reasons: [] }
      },
      {
        promo_piece_id: "id_2",
        slot_rank: 2,
        target_kind: "media",
        target_id: "media_a",
        post_id: "post_a",
        title: "Post A",
        thumb_url_path: "/api/v1/export/media/cr_sparse/media_a/thumb",
        label: null,
        metadata: null,
        tip_eligible: true,
        tip_eligibility: { eligible: true, reasons: [] }
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

  it("returns promo_piece_id and normalized post_id", async () => {
    const prisma = {
      creatorPromoSlot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pp_1",
            slotRank: 1,
            targetKind: "post",
            targetId: "post_a",
            label: null,
            metadata: null
          }
        ])
      },
      post: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "post_a",
            versions: [{ title: "A" }],
            mediaAssets: [
              {
                id: "media_t",
                currentMimeType: "image/jpeg",
                currentStorageKey: "t.jpg",
                currentUpstreamUrl: null
              }
            ]
          }
        ])
      },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const out = await getCreatorPromoSlots(prisma as never, "cr_read");
    expect(out.slots[0]).toMatchObject({
      promo_piece_id: "pp_1",
      post_id: "post_a",
      slot_rank: 1,
      target_kind: "post",
      target_id: "post_a",
      thumb_url_path: "/api/v1/export/media/cr_read/media_t/thumb"
    });
  });
});
