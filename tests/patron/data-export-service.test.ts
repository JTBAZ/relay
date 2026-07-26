import { describe, expect, it, vi } from "vitest";
import { buildPatronExportBundle } from "../../src/patron/data-export-service.js";

function prismaForMinimalExport(accountId: string) {
  const account = {
    id: accountId,
    emailNorm: "patron@example.com",
    identityAuthProvider: "patreon" as const,
    patronPatreonUserId: "patron-user-1",
    primaryRelayCreatorId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z")
  };
  return {
    account: {
      findUnique: vi.fn().mockResolvedValue(account)
    },
    tenantMembership: {
      findMany: vi.fn().mockResolvedValue([])
    },
    patronProfile: { findMany: vi.fn() },
    patronFollow: { findMany: vi.fn() },
    patronEntitlementSnapshot: { findMany: vi.fn() },
    patronFavorite: { findMany: vi.fn() },
    patronSavedCollection: { findMany: vi.fn() },
    accountFollow: {
      findMany: vi.fn().mockResolvedValue([])
    },
    comment: { findMany: vi.fn() },
    commentReaction: {
      findMany: vi.fn().mockResolvedValue([])
    },
    notification: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    contentReport: {
      findMany: vi.fn().mockResolvedValue([])
    }
  } as never;
}

describe("buildPatronExportBundle (PE-J / pilot data export)", () => {
  it("returns schema_version 1.0 and account snapshot for empty memberships", async () => {
    const accountId = "acc_export_test";
    const prisma = prismaForMinimalExport(accountId);
    const bundle = await buildPatronExportBundle(prisma, accountId);

    expect(bundle.schema_version).toBe("1.0");
    expect(bundle.account.id).toBe(accountId);
    expect(bundle.account.email_norm).toBe("patron@example.com");
    expect(bundle.memberships).toEqual([]);
    expect(bundle.collections).toEqual([]);
    expect(bundle.comments).toEqual([]);
    expect(typeof bundle.exported_at).toBe("string");
  });

  it("throws when account is missing", async () => {
    const prisma = {
      account: { findUnique: vi.fn().mockResolvedValue(null) }
    } as never;
    await expect(buildPatronExportBundle(prisma, "missing")).rejects.toThrow(/not found/);
  });
});
