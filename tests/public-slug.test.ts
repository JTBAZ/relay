import { describe, expect, it, vi } from "vitest";
import {
  allocateUniquePublicSlugFromNormalizedBase,
  defaultPublicSlugFromEmail,
  normalizePublicSlugCandidate,
  validatePublicSlugFormat
} from "../src/creator/public-slug.js";

describe("public-slug", () => {
  it("normalizes email local parts", () => {
    expect(normalizePublicSlugCandidate("Hello World")).toBe("hello-world");
    expect(normalizePublicSlugCandidate("user+tag@example.com")).toBe("user");
    expect(defaultPublicSlugFromEmail("Artist.Name@x.com")).toBe("artist-name");
  });

  it("validates slug format and reserved words", () => {
    expect(validatePublicSlugFormat("ab")).toMatchObject({ ok: false });
    expect(validatePublicSlugFormat("good-slug-1")).toMatchObject({ ok: true });
    expect(validatePublicSlugFormat("login")).toMatchObject({ ok: false });
    expect(validatePublicSlugFormat("no_underscore")).toMatchObject({ ok: false });
  });
});

describe("allocateUniquePublicSlugFromNormalizedBase", () => {
  it("returns null when base is invalid", async () => {
    const tx = {
      creatorProfile: { findFirst: vi.fn() }
    };
    await expect(
      allocateUniquePublicSlugFromNormalizedBase(tx as never, "ab", "me")
    ).resolves.toBeNull();
    expect(tx.creatorProfile.findFirst).not.toHaveBeenCalled();
  });

  it("returns base when free", async () => {
    const tx = {
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };
    await expect(
      allocateUniquePublicSlugFromNormalizedBase(tx as never, "cool-artist", "prof_1")
    ).resolves.toBe("cool-artist");
  });

  it("treats slug as free when owned by same profile", async () => {
    const tx = {
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: "prof_1" })
      }
    };
    await expect(
      allocateUniquePublicSlugFromNormalizedBase(tx as never, "same-slug", "prof_1")
    ).resolves.toBe("same-slug");
  });

  it("appends suffix when taken by another profile", async () => {
    const tx = {
      creatorProfile: {
        findFirst: vi.fn(async ({ where }: { where: { publicSlug: string } }) => {
          if (where.publicSlug === "taken") {
            return { id: "other" };
          }
          return null;
        })
      }
    };
    const out = await allocateUniquePublicSlugFromNormalizedBase(
      tx as never,
      "taken",
      "prof_1"
    );
    expect(out).toMatch(/^taken-[a-f0-9]{4}$/);
  });
});
