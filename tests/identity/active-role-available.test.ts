import { describe, expect, it, vi } from "vitest";
import {
  defaultActiveRoleForAccount
} from "../../src/identity/active-role-default.js";
import { resolveAvailableRolesForAccount } from "../../src/identity/active-role-available.js";

function prismaWithMembershipCount(opts: {
  primaryRelayCreatorId: string | null;
  meaningfulCount: number;
  /** When meaningfulCount is 0, findMany returns this (platform-only memberships). */
  membershipRows?: Array<{ id: string; tenant: { relayCreatorId: string | null } }>;
}) {
  return {
    account: {
      findUnique: vi.fn().mockResolvedValue({
        primaryRelayCreatorId: opts.primaryRelayCreatorId
      })
    },
    tenantMembership: {
      count: vi.fn().mockResolvedValue(opts.meaningfulCount),
      findMany: vi.fn().mockResolvedValue(opts.membershipRows ?? [])
    },
    patronFollow: { count: vi.fn().mockResolvedValue(0) },
    patronEntitlementSnapshot: { count: vi.fn().mockResolvedValue(0) }
  } as never;
}

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
    const prisma = prismaWithMembershipCount({
      primaryRelayCreatorId: "studio-1",
      meaningfulCount: 3
    });
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual(["creator", "supporter"]);
    expect(out.hasCreatorRole).toBe(true);
    expect(out.hasSupporterRole).toBe(true);
  });

  it("includes only creator when account has no meaningful supporter activity", async () => {
    const prisma = prismaWithMembershipCount({
      primaryRelayCreatorId: "studio-1",
      meaningfulCount: 0,
      membershipRows: [
        { id: "tm_platform", tenant: { relayCreatorId: "__relay_platform" } }
      ]
    });
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual(["creator"]);
    expect(out.hasSupporterRole).toBe(false);
  });

  it("includes only supporter when account does not own a studio", async () => {
    const prisma = prismaWithMembershipCount({
      primaryRelayCreatorId: null,
      meaningfulCount: 2
    });
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual(["supporter"]);
    expect(out.hasCreatorRole).toBe(false);
  });

  it("returns empty list when account has neither studio nor meaningful activity", async () => {
    const prisma = prismaWithMembershipCount({
      primaryRelayCreatorId: null,
      meaningfulCount: 0,
      membershipRows: [
        { id: "tm_platform", tenant: { relayCreatorId: "__relay_platform" } }
      ]
    });
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.roles).toEqual([]);
    expect(out.hasSupporterRole).toBe(false);
  });

  it("does not treat platform-only membership as supporter role", async () => {
    const prisma = prismaWithMembershipCount({
      primaryRelayCreatorId: null,
      meaningfulCount: 0,
      membershipRows: [
        { id: "tm_platform", tenant: { relayCreatorId: "__relay_platform" } }
      ]
    });
    const out = await resolveAvailableRolesForAccount(prisma, "acc-1");
    expect(out.hasSupporterRole).toBe(false);
    expect(out.roles).toEqual([]);
  });
});
