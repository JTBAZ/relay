/**
 * @fileoverview Tip eligibility rule (MB-7).
 */
import { describe, expect, it, vi } from "vitest";
import {
  isStorefrontListed,
  resolveTipEligibility,
  tipEligibilityReasonCopy
} from "../src/tips/tip-eligibility.js";

describe("tipEligibilityReasonCopy", () => {
  it("returns stable plain-language strings", () => {
    expect(tipEligibilityReasonCopy("mature")).toMatch(/18\+/);
    expect(tipEligibilityReasonCopy("disabled")).toMatch(/turned Tips off/i);
    expect(tipEligibilityReasonCopy("storefront")).toMatch(/storefront/i);
  });
});

describe("isStorefrontListed", () => {
  it("stub returns false until storefronts exist", () => {
    expect(isStorefrontListed({ creatorId: "c", postId: "p" })).toBe(false);
  });
});

describe("resolveTipEligibility", () => {
  it("marks missing promo pool as not_in_promo_pool", async () => {
    const prisma = {
      post: {
        findUnique: vi.fn(async () => ({
          id: "post1",
          creatorId: "cr1",
          isPublic: false
        }))
      },
      creatorPromoSlot: { findFirst: vi.fn(async () => null) },
      mediaAsset: { findMany: vi.fn(async () => []) },
      postOverride: { findMany: vi.fn(async () => []) }
    } as never;

    const result = await resolveTipEligibility(prisma, {
      creatorId: "cr1",
      postId: "post1"
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(["not_in_promo_pool"]);
  });

  it("blocks when tipEligible is false", async () => {
    const prisma = {
      post: {
        findUnique: vi.fn(async () => ({
          id: "post1",
          creatorId: "cr1",
          isPublic: false
        }))
      },
      creatorPromoSlot: {
        findFirst: vi.fn(async () => ({ id: "slot1", tipEligible: false }))
      },
      mediaAsset: { findMany: vi.fn(async () => []) },
      postOverride: { findMany: vi.fn(async () => []) }
    } as never;

    const result = await resolveTipEligibility(prisma, {
      creatorId: "cr1",
      postId: "post1"
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("disabled");
  });

  it("blocks public / already-entitled viewers", async () => {
    const prisma = {
      post: {
        findUnique: vi.fn(async () => ({
          id: "post1",
          creatorId: "cr1",
          isPublic: true
        }))
      },
      creatorPromoSlot: {
        findFirst: vi.fn(async () => ({ id: "slot1", tipEligible: true }))
      },
      mediaAsset: { findMany: vi.fn(async () => []) },
      postOverride: { findMany: vi.fn(async () => []) }
    } as never;

    const result = await resolveTipEligibility(prisma, {
      creatorId: "cr1",
      postId: "post1"
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("already_entitled");
  });

  it("blocks mature posts even when tipEligible is true", async () => {
    const prisma = {
      post: {
        findUnique: vi.fn(async () => ({
          id: "post1",
          creatorId: "cr1",
          isPublic: false
        }))
      },
      creatorPromoSlot: {
        findFirst: vi.fn(async () => ({ id: "slot1", tipEligible: true }))
      },
      mediaAsset: { findMany: vi.fn(async () => [{ id: "m1" }]) },
      postOverride: {
        findMany: vi.fn(async () => [
          {
            creatorId: "cr1",
            postId: "post1",
            mediaId: "",
            visibility: "review",
            addTagIds: [],
            removeTagIds: [],
            discoveryEligible: false
          }
        ])
      }
    } as never;

    const result = await resolveTipEligibility(prisma, {
      creatorId: "cr1",
      postId: "post1"
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("mature");
  });

  it("is eligible when all conditions pass", async () => {
    const prisma = {
      post: {
        findUnique: vi.fn(async () => ({
          id: "post1",
          creatorId: "cr1",
          isPublic: false
        }))
      },
      creatorPromoSlot: {
        findFirst: vi.fn(async () => ({ id: "slot1", tipEligible: true }))
      },
      mediaAsset: { findMany: vi.fn(async () => [{ id: "m1" }]) },
      postOverride: { findMany: vi.fn(async () => []) }
    } as never;

    const result = await resolveTipEligibility(prisma, {
      creatorId: "cr1",
      postId: "post1"
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.promo_slot_id).toBe("slot1");
  });
});
