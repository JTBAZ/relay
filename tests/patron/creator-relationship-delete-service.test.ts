import { describe, expect, it, vi } from "vitest";
import { deleteCreatorRelationship } from "../../src/patron/creator-relationship-delete-service.js";

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  const tx = {
    patronFavorite: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    patronSavedCollectionEntry: { count: vi.fn().mockResolvedValue(0) },
    patronSavedCollection: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    commentReaction: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    comment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    contentReport: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationPreference: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tenantMembership: { delete: vi.fn().mockResolvedValue(null) },
    ...((overrides.tx as Record<string, unknown>) ?? {})
  };
  return {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ id: "tenant-1" })
    },
    tenantMembership: {
      findUnique: vi.fn().mockResolvedValue({ id: "mem-1" })
    },
    contentReport: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx),
    ...overrides,
    __tx: tx
  };
}

describe("deleteCreatorRelationship", () => {
  it("rejects empty inputs", async () => {
    await expect(
      deleteCreatorRelationship({} as never, { accountId: "", relayCreatorId: "c" })
    ).rejects.toThrow();
    await expect(
      deleteCreatorRelationship({} as never, { accountId: "a", relayCreatorId: "" })
    ).rejects.toThrow();
  });

  it("returns zero counts when the tenant doesn't exist", async () => {
    const prisma = buildPrismaStub({
      tenant: { findUnique: vi.fn().mockResolvedValue(null) }
    });
    const out = await deleteCreatorRelationship(prisma as never, {
      accountId: "acc",
      relayCreatorId: "missing-creator"
    });
    expect(out.memberships).toBe(0);
    expect(out.favorites).toBe(0);
  });

  it("when membership is missing, still purges any orphaned content reports for that scope", async () => {
    const reportDelete = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = buildPrismaStub({
      tenantMembership: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (cb: (txArg: unknown) => Promise<unknown>) =>
        cb({ contentReport: { deleteMany: reportDelete } })
    });
    const out = await deleteCreatorRelationship(prisma as never, {
      accountId: "acc",
      relayCreatorId: "c1"
    });
    expect(out.memberships).toBe(0);
    expect(out.contentReports).toBe(2);
    expect(reportDelete.mock.calls[0][0].where).toEqual({
      reporterAccountId: "acc",
      relayCreatorId: "c1"
    });
  });

  it("scopes every soft-FK delete to (membershipId, creatorId) and finally drops the membership", async () => {
    const stub = buildPrismaStub({
      tx: {
        patronFavorite: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
        patronSavedCollectionEntry: { count: vi.fn().mockResolvedValue(11) },
        patronSavedCollection: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
        commentReaction: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "r1" }, { id: "r2" }, { id: "r3" }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 3 })
        },
        comment: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
        contentReport: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        notificationPreference: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
        notification: { deleteMany: vi.fn().mockResolvedValue({ count: 6 }) },
        tenantMembership: { delete: vi.fn().mockResolvedValue(null) }
      }
    });
    const out = await deleteCreatorRelationship(stub as never, {
      accountId: "acc",
      relayCreatorId: "c1"
    });
    expect(out).toEqual({
      favorites: 4,
      collections: 3,
      collectionEntries: 11,
      comments: 5,
      commentReactions: 3,
      contentReports: 1,
      notificationPreferences: 2,
      notifications: 6,
      memberships: 1
    });
    const tx = (stub as { __tx: Record<string, { deleteMany?: ReturnType<typeof vi.fn> } > }).__tx;
    // Verify scoping: every deleteMany targets the right combination.
    expect(tx.patronFavorite.deleteMany?.mock.calls[0][0].where).toEqual({
      patronMembershipId: "mem-1",
      creatorId: "c1"
    });
    expect(tx.comment.deleteMany?.mock.calls[0][0].where).toEqual({
      patronUserId: "mem-1",
      relayCreatorId: "c1"
    });
    expect((tx.tenantMembership as { delete: ReturnType<typeof vi.fn> }).delete.mock.calls[0][0])
      .toEqual({ where: { id: "mem-1" } });
  });
});
