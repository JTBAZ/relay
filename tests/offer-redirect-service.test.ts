import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ensureOfferRedirectSlug,
  referrerHostFromHeader,
  resolveOfferRedirect
} from "../src/marketing/offer-redirect-service.js";

describe("referrerHostFromHeader", () => {
  it("keeps hostname only", () => {
    expect(referrerHostFromHeader("https://example.com/path?q=1")).toBe("example.com");
    expect(referrerHostFromHeader("not-a-url")).toBe(null);
  });
});

describe("ensureOfferRedirectSlug", () => {
  it("returns existing slug without rewriting", async () => {
    const update = vi.fn();
    const prisma = {
      postMarketingOffer: {
        findFirst: vi.fn().mockResolvedValue({ id: "o1", redirectSlug: "abc123" }),
        update
      }
    } as unknown as PrismaClient;
    const out = await ensureOfferRedirectSlug(prisma, {
      creatorId: "c1",
      postId: "p1",
      offerId: "o1"
    });
    expect(out.redirect_slug).toBe("abc123");
    expect(out.public_path).toBe("/go/abc123");
    expect(update).not.toHaveBeenCalled();
  });

  it("mints when missing", async () => {
    const update = vi.fn().mockResolvedValue({ redirectSlug: "mintedslug" });
    const prisma = {
      postMarketingOffer: {
        findFirst: vi.fn().mockResolvedValue({ id: "o1", redirectSlug: null }),
        update
      }
    } as unknown as PrismaClient;
    const out = await ensureOfferRedirectSlug(prisma, {
      creatorId: "c1",
      postId: "p1",
      offerId: "o1"
    });
    expect(out.redirect_slug).toBe("mintedslug");
    expect(update).toHaveBeenCalled();
  });
});

describe("resolveOfferRedirect", () => {
  it("returns 302 payload for active offers with valid destination", async () => {
    const prisma = {
      postMarketingOffer: {
        findFirst: vi.fn().mockResolvedValue({
          id: "o1",
          creatorId: "c1",
          postId: "p1",
          active: true,
          patreonDestinationUrl: "https://www.patreon.com/join/studio"
        })
      },
      creatorTierPromotionDefault: {
        findFirst: vi.fn()
      }
    } as unknown as PrismaClient;
    const out = await resolveOfferRedirect(prisma, "slug1");
    expect(out.status).toBe("redirect");
    if (out.status === "redirect") {
      expect(out.kind).toBe("offer");
      expect(out.location).toContain("patreon.com");
    }
  });

  it("returns gone when inactive or missing destination", async () => {
    const prisma = {
      postMarketingOffer: {
        findFirst: vi.fn().mockResolvedValue({
          id: "o1",
          creatorId: "c1",
          postId: "p1",
          active: false,
          patreonDestinationUrl: "https://www.patreon.com/x"
        })
      },
      creatorTierPromotionDefault: {
        findFirst: vi.fn()
      }
    } as unknown as PrismaClient;
    expect(await resolveOfferRedirect(prisma, "x")).toEqual({
      status: "gone",
      reason: "inactive"
    });
  });

  it("resolves tier-default tracked links", async () => {
    const prisma = {
      postMarketingOffer: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      creatorTierPromotionDefault: {
        findFirst: vi.fn().mockResolvedValue({
          id: "td1",
          creatorId: "c1",
          active: true,
          patreonDestinationUrl: "https://www.patreon.com/promotions/discounts"
        })
      }
    } as unknown as PrismaClient;
    const out = await resolveOfferRedirect(prisma, "tdslug");
    expect(out).toMatchObject({
      status: "redirect",
      kind: "tier_default",
      tierDefaultId: "td1",
      creatorId: "c1"
    });
  });
});
