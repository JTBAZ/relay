import { describe, expect, it, vi } from "vitest";
import { CredentialHealth } from "@prisma/client";
import {
  availableRolesFromCapabilities,
  buildAccountSessionCapabilities
} from "../../src/identity/account-session-projection.js";

describe("buildAccountSessionCapabilities", () => {
  it("projects studio ownership and universal feed surface", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          primaryRelayCreatorId: "cr_studio",
          patronPatreonUserId: "pat_1",
          patronOAuthCredential: { healthStatus: CredentialHealth.healthy }
        })
      },
      tenantMembership: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn()
      },
      patronFollow: { count: vi.fn() },
      patronEntitlementSnapshot: { count: vi.fn() },
      oAuthCredential: {
        findFirst: vi.fn().mockResolvedValue({ healthStatus: CredentialHealth.healthy })
      }
    } as never;

    const caps = await buildAccountSessionCapabilities(prisma, "acc_1");
    expect(caps.surfaces).toEqual({ feed: true, studio: true });
    expect(caps.primary_relay_creator_id).toBe("cr_studio");
    expect(caps.studios).toEqual([{ relay_creator_id: "cr_studio", is_primary: true }]);
    expect(caps.activity.has_supporter_activity).toBe(true);
    expect(caps.patreon.identity_linked).toBe(true);
    expect(caps.patreon.identity_health).toBe("healthy");
    expect(caps.patreon.creator_sync_connected).toBe(true);
    expect(caps.patreon.creator_sync_health).toBe("healthy");
    expect(caps.suggested_home).toBe("/studio");
    expect(availableRolesFromCapabilities(caps)).toEqual(["creator", "supporter"]);
  });

  it("returns feed-only capabilities for platform-bootstrap accounts", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          primaryRelayCreatorId: null,
          patronPatreonUserId: null,
          patronOAuthCredential: null
        })
      },
      tenantMembership: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([
          { id: "tm_p", tenant: { relayCreatorId: "__relay_platform" } }
        ])
      },
      patronFollow: { count: vi.fn().mockResolvedValue(0) },
      patronEntitlementSnapshot: { count: vi.fn().mockResolvedValue(0) },
      oAuthCredential: { findFirst: vi.fn() }
    } as never;

    const caps = await buildAccountSessionCapabilities(prisma, "acc_new");
    expect(caps.surfaces).toEqual({ feed: true, studio: false });
    expect(caps.activity.has_supporter_activity).toBe(false);
    expect(caps.patreon.identity_linked).toBe(false);
    expect(caps.suggested_home).toBe("/feed");
    expect(availableRolesFromCapabilities(caps)).toEqual([]);
  });

  it("marks degraded creator sync as reconnect_required", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          primaryRelayCreatorId: "cr_x",
          patronPatreonUserId: "pat_x",
          patronOAuthCredential: { healthStatus: CredentialHealth.degraded }
        })
      },
      tenantMembership: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([])
      },
      patronFollow: { count: vi.fn().mockResolvedValue(0) },
      patronEntitlementSnapshot: { count: vi.fn().mockResolvedValue(0) },
      oAuthCredential: {
        findFirst: vi.fn().mockResolvedValue({ healthStatus: CredentialHealth.degraded })
      }
    } as never;

    const caps = await buildAccountSessionCapabilities(prisma, "acc_1");
    expect(caps.patreon.identity_health).toBe("reconnect_required");
    expect(caps.patreon.creator_sync_health).toBe("reconnect_required");
  });
});
