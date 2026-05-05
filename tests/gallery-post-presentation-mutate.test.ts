import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@prisma/client";

import {
  derivePresentationUpsertFragments,
  presentationPatchTouches,
  validateMediaIdsBelongToPost
} from "../src/gallery/post-presentation-mutate.js";

describe("presentationPatchTouches", () => {
  it("reports only overlay keys listed in PATCH body", () => {
    const t = presentationPatchTouches({ creator_id: "c", relay_title: "x" });
    expect([...t].sort()).toEqual(["relay_title"]);
  });
});

describe("derivePresentationUpsertFragments", () => {
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
