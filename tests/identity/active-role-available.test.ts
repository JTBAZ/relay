import { describe, expect, it, vi } from "vitest";
import {
  defaultActiveRoleForAccount
} from "../../src/identity/active-role-default.js";
import { resolveAvailableRolesForAccount } from "../../src/identity/active-role-available.js";

describe("defaultActiveRoleForAccount (PE-I)", () => {
  it("prefers creator when account owns a studio", () => {
    expect(
      defaultActiveRoleForAccount({
        primaryRelayCreatorId: "creator-1",
        hasSupporterMemberships: true
      })
    ).toBe("creator");
  });

  it("falls back to supporter when only memberships are present", () => {
    expect(
      defaultActiveRoleForAccount({
        primaryRelayCreatorId: null,
        hasSupporterMemberships: true
      })
    ).toBe("supporter");
  });

  it("falls back to supporter when neither role is occupied", () => {
    expect(
      defaultActiveRoleForAccount({
        primaryRelayCreatorId: null,
        hasSupporterMemberships: false
      })
    ).toBe("supporter");
  });
});

describe("resolveAvailableRolesForAccount (PE-I)", () => {
  it("returns empty list when prisma is null (file-backed identity store)", async () => {
    const out = await resolveAvailableRolesForAccount(null, "any");
    expect(out.roles).toEqual([]);
    expect(out.hasCreatorRole).toBe(false);
    expect(out.hasSupporterRole).toBe(false);
  });

  it("returns empty list when account is not found", async () => {
    const prisma = {
      account: { findUnique: vi.fn().mockResolvedValue(null) },
      tenantMembership: { count: vi.fn() }
    } as never;
    const out = await resolveAvailableRolesForAccount(prisma, "missing");
    expect(out.roles).toEqual([]);
  });

  it("includes creator + supporter when both signals present", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ primaryRelayCreatorId: "studio-1" })
      },
      tenantMembership: { count: vi.fn().mockResolvedValue(3) }
    } as never;
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual(["creator", "supporter"]);
    expect(out.hasCreatorRole).toBe(true);
    expect(out.hasSupporterRole).toBe(true);
  });

  it("includes only creator when account has no memberships", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ primaryRelayCreatorId: "studio-1" })
      },
      tenantMembership: { count: vi.fn().mockResolvedValue(0) }
    } as never;
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual(["creator"]);
    expect(out.hasSupporterRole).toBe(false);
  });

  it("includes only supporter when account does not own a studio", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ primaryRelayCreatorId: null })
      },
      tenantMembership: { count: vi.fn().mockResolvedValue(2) }
    } as never;
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual(["supporter"]);
    expect(out.hasCreatorRole).toBe(false);
  });

  it("returns empty list when account has neither studio nor memberships", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ primaryRelayCreatorId: null })
      },
      tenantMembership: { count: vi.fn().mockResolvedValue(0) }
    } as never;
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual([]);
  });
});
