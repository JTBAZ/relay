import { describe, expect, it, vi } from "vitest";
import {
  ensurePatronProfileForMembership,
  patchPatronProfileForMembership
} from "../../src/patron/patron-profile-service.js";

function mockRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pp1",
    tenantMembershipId: "mem1",
    handle: "user_abc123",
    handleNorm: "user_abc123",
    displayName: null,
    bio: null,
    avatarUrl: null,
    bannerUrl: null,
    isPublic: false,
    onboardingStep: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe("patron-profile-service", () => {
  it("ensurePatronProfileForMembership creates with auto handle when missing", async () => {
    const created = mockRow({ handle: "user_deadbe", handleNorm: "user_deadbe" });
    const findUnique = vi.fn().mockResolvedValue(null);
    const findFirst = vi.fn();
    const create = vi.fn().mockResolvedValue(created);
    const update = vi.fn();
    const prisma = {
      patronProfile: { findUnique, findFirst, create, update }
    };
    const row = await ensurePatronProfileForMembership(prisma as never, "mem1");
    expect(create).toHaveBeenCalled();
    expect(row.handleNorm).toBe("user_deadbe");
  });

  it("ensurePatronProfileForMembership backfills handleNorm when null", async () => {
    const existing = mockRow({ handle: null, handleNorm: null });
    const updated = mockRow({ handle: "user_aaa111", handleNorm: "user_aaa111" });
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    const findFirst = vi.fn();
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue(updated);
    const prisma = {
      patronProfile: { findUnique, findFirst, create, update }
    };
    await ensurePatronProfileForMembership(prisma as never, "mem1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantMembershipId: "mem1" },
        data: expect.objectContaining({ handleNorm: expect.any(String) })
      })
    );
  });

  it("patchPatronProfileForMembership rejects reserved handle", async () => {
    const row = mockRow();
    const findUnique = vi.fn().mockResolvedValue(row);
    const findFirst = vi.fn();
    const create = vi.fn();
    const update = vi.fn();
    const prisma = {
      patronProfile: { findUnique, findFirst, create, update }
    };
    const r = await patchPatronProfileForMembership(prisma as never, "mem1", {
      handle: "admin"
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VALIDATION_ERROR");
    expect(update).not.toHaveBeenCalled();
  });

  it("patchPatronProfileForMembership returns CONFLICT when handleNorm taken", async () => {
    const row = mockRow();
    const findUnique = vi.fn().mockResolvedValue(row);
    const findFirst = vi.fn().mockResolvedValue({ id: "other" });
    const create = vi.fn();
    const update = vi.fn();
    const prisma = {
      patronProfile: { findUnique, findFirst, create, update }
    };
    const r = await patchPatronProfileForMembership(prisma as never, "mem1", {
      handle: "cool_name"
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("CONFLICT");
    expect(update).not.toHaveBeenCalled();
  });

  it("patchPatronProfileForMembership updates display_name", async () => {
    const row = mockRow();
    const updated = mockRow({ displayName: "Ada" });
    const findUnique = vi.fn().mockResolvedValue(row);
    const findFirst = vi.fn();
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue(updated);
    const prisma = {
      patronProfile: { findUnique, findFirst, create, update }
    };
    const r = await patchPatronProfileForMembership(prisma as never, "mem1", {
      display_name: "Ada"
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.profile.display_name).toBe("Ada");
    expect(update).toHaveBeenCalled();
  });
});
