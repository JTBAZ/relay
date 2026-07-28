import { describe, expect, it, vi } from "vitest";
import { IdentityAuditOutcome } from "@prisma/client";
import {
  claimStudioFromPatreonOwnership
} from "../../src/identity/identity-reconciliation.js";

describe("claimStudioFromPatreonOwnership", () => {
  it("requires Patreon identity first", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          patronPatreonUserId: null,
          primaryRelayCreatorId: null
        })
      }
    } as never;
    const out = await claimStudioFromPatreonOwnership(prisma, {
      accountId: "acc_1",
      relayCreatorId: "cr_1"
    });
    expect(out.outcome).toBe("insufficient_proof");
  });

  it("returns already_correct when primary matches", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          patronPatreonUserId: "pat_1",
          primaryRelayCreatorId: "cr_1"
        })
      },
      identityAuditEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const out = await claimStudioFromPatreonOwnership(prisma, {
      accountId: "acc_1",
      relayCreatorId: "cr_1"
    });
    expect(out).toEqual({ outcome: "already_correct", relayCreatorId: "cr_1" });
    expect(prisma.identityAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: IdentityAuditOutcome.already_correct })
      })
    );
  });

  it("blocks claim when another account owns the studio", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          patronPatreonUserId: "pat_1",
          primaryRelayCreatorId: null
        }),
        findFirst: vi.fn().mockResolvedValue({ id: "acc_other" }),
        update: vi.fn()
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          patreonCampaignId: "100",
          user: {
            providerAccounts: [{ providerUserId: "pat_1" }]
          }
        })
      },
      identityAuditEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const out = await claimStudioFromPatreonOwnership(prisma, {
      accountId: "acc_1",
      relayCreatorId: "cr_owned"
    });
    expect(out.outcome).toBe("conflict");
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("safe-claims when provider identity matches and studio is unowned", async () => {
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: "acc_1",
          patronPatreonUserId: "pat_1",
          primaryRelayCreatorId: null
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({})
      },
      creatorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          patreonCampaignId: "100",
          user: {
            providerAccounts: [{ providerUserId: "pat_1" }]
          }
        })
      },
      identityAuditEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const out = await claimStudioFromPatreonOwnership(prisma, {
      accountId: "acc_1",
      relayCreatorId: "cr_new"
    });
    expect(out).toEqual({ outcome: "safe_claim", relayCreatorId: "cr_new" });
    expect(prisma.account.update).toHaveBeenCalled();
  });
});
