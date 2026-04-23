import { describe, expect, it, vi } from "vitest";
import { getPublicPatronProfileByHandle } from "../../src/patron/public-patron-profile-service.js";

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    patronProfile: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    patronSavedCollection: {
      findMany: vi.fn().mockResolvedValue([])
    },
    ...overrides
  };
}

describe("getPublicPatronProfileByHandle", () => {
  it("returns null for an empty handle (defensive guard)", async () => {
    const prisma = buildPrismaStub();
    expect(await getPublicPatronProfileByHandle(prisma as never, "")).toBeNull();
    expect(prisma.patronProfile.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no profile exists for the handle", async () => {
    const prisma = buildPrismaStub({
      patronProfile: { findUnique: vi.fn().mockResolvedValue(null) }
    });
    expect(await getPublicPatronProfileByHandle(prisma as never, "ghost")).toBeNull();
  });

  it("returns null for a private profile (enumeration resistance)", async () => {
    const prisma = buildPrismaStub({
      patronProfile: {
        findUnique: vi.fn().mockResolvedValue({
          tenantMembershipId: "m1",
          handle: "private_user",
          displayName: null,
          bio: null,
          avatarUrl: null,
          bannerUrl: null,
          isPublic: false
        })
      }
    });
    expect(
      await getPublicPatronProfileByHandle(prisma as never, "private_user")
    ).toBeNull();
  });

  it("returns null when handle is missing on the profile row (defensive)", async () => {
    const prisma = buildPrismaStub({
      patronProfile: {
        findUnique: vi.fn().mockResolvedValue({
          tenantMembershipId: "m1",
          handle: null,
          displayName: null,
          bio: null,
          avatarUrl: null,
          bannerUrl: null,
          isPublic: true
        })
      }
    });
    expect(
      await getPublicPatronProfileByHandle(prisma as never, "x")
    ).toBeNull();
  });

  it("normalizes the handle to lowercase before lookup", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = buildPrismaStub({
      patronProfile: { findUnique }
    });
    await getPublicPatronProfileByHandle(prisma as never, "MixedCase");
    expect(findUnique).toHaveBeenCalledWith({
      where: { handleNorm: "mixedcase" },
      select: expect.any(Object)
    });
  });

  it("returns the public profile + only PUBLIC collections", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      tenantMembershipId: "m1",
      handle: "alice",
      displayName: "Alice",
      bio: "Hello world",
      avatarUrl: "https://cdn/a.png",
      bannerUrl: null,
      isPublic: true
    });
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "col1",
        title: "Public set",
        createdAt: new Date("2026-04-22T00:00:00.000Z"),
        _count: { entries: 5 }
      },
      {
        id: "col2",
        title: "Another",
        createdAt: new Date("2026-04-23T00:00:00.000Z"),
        _count: { entries: 0 }
      }
    ]);
    const prisma = buildPrismaStub({
      patronProfile: { findUnique },
      patronSavedCollection: { findMany }
    });
    const out = await getPublicPatronProfileByHandle(prisma as never, "Alice");
    expect(out).toEqual({
      handle: "alice",
      display_name: "Alice",
      bio: "Hello world",
      avatar_url: "https://cdn/a.png",
      banner_url: null,
      public_collections: [
        {
          id: "col1",
          title: "Public set",
          entry_count: 5,
          created_at: "2026-04-22T00:00:00.000Z"
        },
        {
          id: "col2",
          title: "Another",
          entry_count: 0,
          created_at: "2026-04-23T00:00:00.000Z"
        }
      ]
    });
    // Verify the collections query enforces isPublic + scopes by membership.
    expect(findMany.mock.calls[0][0].where).toEqual({
      patronMembershipId: "m1",
      isPublic: true
    });
  });
});
