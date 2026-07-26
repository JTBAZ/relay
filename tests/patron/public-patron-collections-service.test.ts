import { describe, expect, it, vi } from "vitest";
import { getPublicPatronCollectionDetail } from "../../src/patron/public-patron-collections-service.js";

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    patronSavedCollection: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    ...overrides
  };
}

describe("getPublicPatronCollectionDetail (service guards)", () => {
  it("returns null for empty collection id", async () => {
    const prisma = buildPrismaStub();
    expect(await getPublicPatronCollectionDetail(prisma as never, "  ", null)).toBeNull();
    expect(prisma.patronSavedCollection.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when collection is missing", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = buildPrismaStub({
      patronSavedCollection: { findFirst }
    });
    expect(await getPublicPatronCollectionDetail(prisma as never, "pcol_missing", null)).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pcol_missing", isPublic: true }
      })
    );
  });
});
