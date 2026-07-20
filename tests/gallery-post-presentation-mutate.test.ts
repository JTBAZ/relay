import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@prisma/client";

import {
  derivePresentationUpsertFragments,
  presentationPatchTouches,
  validateMediaIdsBelongToPost,
  validatePromoPreviewMediaForCreator
} from "../src/gallery/post-presentation-mutate.js";

describe("presentationPatchTouches", () => {
  it("reports only overlay keys listed in PATCH body", () => {
    const t = presentationPatchTouches({ creator_id: "c", relay_title: "x" });
    expect([...t].sort()).toEqual(["relay_title"]);
  });

  it("detects promo_preview_media_id without requiring media_order", () => {
    const t = presentationPatchTouches({
      creator_id: "c",
      promo_preview_media_id: "m_promo"
    });
    expect([...t]).toEqual(["promo_preview_media_id"]);
  });
});

describe("derivePresentationUpsertFragments", () => {
  it("sanitizes relay_description HTML on write", () => {
    const f = derivePresentationUpsertFragments(
      { relay_description: '<p>ok</p><script>alert(1)</script>' },
      presentationPatchTouches({ relay_description: '<p>ok</p><script>alert(1)</script>' })
    );
    expect(f.relayDescription).toBe("<p>ok</p>");
    expect(f.relayDescription).not.toMatch(/script/i);
  });

  it("parses relay_title clears to null when empty string", () => {
    const f = derivePresentationUpsertFragments(
      { relay_title: "" },
      presentationPatchTouches({ relay_title: "" })
    );
    expect(f.relayTitle).toBe(null);
  });

  it("rejects tier_preview_settings bigint", () => {
    expect(() =>
      derivePresentationUpsertFragments({ tier_preview_settings: BigInt(1) }, new Set(["tier_preview_settings"]))
    ).toThrow();
  });

  it("rejects duplicate media_order ids before DB validation", () => {
    expect(() =>
      derivePresentationUpsertFragments({ media_order: ["a", "a"] }, new Set(["media_order"]))
    ).toThrow("VALIDATION:media_order_dupes");
  });

  it("parses promo_preview_media_id set and clear without touching media_order", () => {
    const set = derivePresentationUpsertFragments(
      { promo_preview_media_id: "  staged_1  " },
      new Set(["promo_preview_media_id"])
    );
    expect(set.promoPreviewMediaId).toBe("staged_1");
    expect(set.mediaOrder).toBeUndefined();

    const clear = derivePresentationUpsertFragments(
      { promo_preview_media_id: null },
      new Set(["promo_preview_media_id"])
    );
    expect(clear.promoPreviewMediaId).toBe(null);
    expect(clear.mediaOrder).toBeUndefined();
  });
});

describe("validateMediaIdsBelongToPost", () => {
  it("allows ids linked via primaryPostId or postIds", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "m1", primaryPostId: "p1", postIds: [] as string[] },
      { id: "m2", primaryPostId: null, postIds: ["p1", "other"] }
    ]);
    const prisma = { mediaAsset: { findMany } } as unknown as PrismaClient;
    const out = await validateMediaIdsBelongToPost(prisma, "c1", "p1", ["m1", "m2"]);
    expect(out).toEqual({ ok: true });
    expect(findMany).toHaveBeenCalledWith({
      where: { creatorId: "c1", id: { in: ["m1", "m2"] } },
      select: { id: true, primaryPostId: true, postIds: true }
    });
  });

  it("rejects ids not belonging to creator", async () => {
    const prisma = {
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "m1", primaryPostId: "p1", postIds: [] }])
      }
    } as unknown as PrismaClient;
    const out = await validateMediaIdsBelongToPost(prisma, "c1", "p1", ["m1", "missing"]);
    expect(out.ok).toBe(false);
  });

  it("rejects ids not linked to the post", async () => {
    const prisma = {
      mediaAsset: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "m1", primaryPostId: "elsewhere", postIds: ["x"] },
            { id: "missing", primaryPostId: null, postIds: [] }
          ])
      }
    } as unknown as PrismaClient;
    const out = await validateMediaIdsBelongToPost(prisma, "c1", "p1", ["m1", "missing"]);
    expect(out.ok).toBe(false);
  });
});

describe("validatePromoPreviewMediaForCreator", () => {
  it("accepts staging media owned by the creator without post linkage", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "staged_1",
      currentStorageKey: "s3://bucket/key",
      currentUpstreamUrl: null
    });
    const prisma = { mediaAsset: { findFirst } } as unknown as PrismaClient;
    const out = await validatePromoPreviewMediaForCreator(prisma, "c1", "staged_1");
    expect(out).toEqual({ ok: true });
  });

  it("rejects foreign or missing media", async () => {
    const prisma = {
      mediaAsset: { findFirst: vi.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;
    const out = await validatePromoPreviewMediaForCreator(prisma, "c1", "foreign");
    expect(out.ok).toBe(false);
  });
});
