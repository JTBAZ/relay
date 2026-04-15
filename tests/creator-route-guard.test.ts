import { describe, expect, it, vi } from "vitest";
import {
  assertCreatorRelayMutationAllowed,
  relayCreatorRouteSecretMatches,
  relayTenantExists
} from "../src/identity/creator-route-guard.js";

describe("creator-route-guard (MT-010)", () => {
  it("relayCreatorRouteSecretMatches when env unset", () => {
    const prev = process.env.RELAY_CREATOR_ROUTE_SECRET;
    delete process.env.RELAY_CREATOR_ROUTE_SECRET;
    expect(
      relayCreatorRouteSecretMatches({
        header: () => undefined
      } as never)
    ).toBe(true);
    process.env.RELAY_CREATOR_ROUTE_SECRET = prev;
  });

  it("relayTenantExists queries prisma", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "t1" });
    const prisma = { tenant: { findUnique } } as never;
    await expect(relayTenantExists(prisma, "cr")).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { relayCreatorId: "cr" },
      select: { id: true }
    });
  });

  it("assertCreatorRelayMutationAllowed returns false on bad secret when env set", async () => {
    const prev = process.env.RELAY_CREATOR_ROUTE_SECRET;
    process.env.RELAY_CREATOR_ROUTE_SECRET = "s3cret";
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const ok = await assertCreatorRelayMutationAllowed(
      { header: () => undefined } as never,
      res as never,
      "tid",
      undefined,
      "creator_x"
    );
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    process.env.RELAY_CREATOR_ROUTE_SECRET = prev;
  });
});
