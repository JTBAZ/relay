import { describe, expect, it, vi } from "vitest";
import {
  loadPatronAuthContext,
  patronMayAccessCreator
} from "../src/identity/patron-auth-context.js";
import type { SessionToken } from "../src/identity/types.js";

describe("patron-auth-context (MT-009)", () => {
  const session: SessionToken = {
    token: "sess_x",
    user_id: "mem_a",
    creator_id: "creator_one",
    tier_ids: ["t1"],
    expires_at: new Date().toISOString()
  };

  it("file mode uses single session creator_id", async () => {
    const ctx = await loadPatronAuthContext(undefined, session);
    expect(ctx.allowedRelayCreatorIds).toEqual(["creator_one"]);
    expect(patronMayAccessCreator(ctx, "creator_one")).toBe(true);
    expect(patronMayAccessCreator(ctx, "other")).toBe(false);
  });

  it("db mode aggregates all patron memberships for the account", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      accountId: "acc1",
      role: "patron"
    });
    const findMany = vi.fn().mockResolvedValue([
      {
        tenant: { relayCreatorId: "c1" }
      },
      {
        tenant: { relayCreatorId: "c2" }
      }
    ]);
    const prisma = {
      tenantMembership: { findUnique, findMany },
      patronFollow: { findMany: vi.fn().mockResolvedValue([]) },
      patronEntitlementSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      account: { findUnique: vi.fn().mockResolvedValue(null) }
    } as never;
    const ctx = await loadPatronAuthContext(prisma, session);
    expect(ctx.accountId).toBe("acc1");
    expect([...ctx.allowedRelayCreatorIds].sort()).toEqual(["c1", "c2"]);
    expect(patronMayAccessCreator(ctx, "c2")).toBe(true);
  });

  it("db mode unions follows, entitlement snapshots, and studio primaryRelayCreatorId", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      accountId: "acc1",
      role: "patron"
    });
    const findMany = vi.fn().mockResolvedValue([
      { tenant: { relayCreatorId: "__relay_platform" } }
    ]);
    const prisma = {
      tenantMembership: { findUnique, findMany },
      patronFollow: {
        findMany: vi.fn().mockResolvedValue([{ relayCreatorId: "rcx_pilot_dev_ava" }])
      },
      patronEntitlementSnapshot: {
        findMany: vi.fn().mockResolvedValue([{ relayCreatorId: "rcx_pilot_dev_milo" }])
      },
      account: {
        findUnique: vi.fn().mockResolvedValue({ primaryRelayCreatorId: "rcx_pilot_dev_ava" })
      }
    } as never;
    const ctx = await loadPatronAuthContext(prisma, session);
    expect([...ctx.allowedRelayCreatorIds].sort()).toEqual(
      ["__relay_platform", "rcx_pilot_dev_ava", "rcx_pilot_dev_milo"].sort()
    );
    expect(patronMayAccessCreator(ctx, "rcx_pilot_dev_ava")).toBe(true);
  });
});
