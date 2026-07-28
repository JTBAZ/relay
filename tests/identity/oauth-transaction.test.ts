import { describe, expect, it, vi } from "vitest";
import { OAuthTransactionStatus } from "@prisma/client";
import {
  claimOAuthCodeExchange,
  completeOAuthTransaction,
  hashOAuthSecret,
  OAuthTransactionPurpose
} from "../../src/identity/oauth-transaction.js";

describe("oauth-transaction", () => {
  it("hashes secrets deterministically", () => {
    expect(hashOAuthSecret("abc")).toBe(hashOAuthSecret("abc"));
    expect(hashOAuthSecret("abc")).not.toBe(hashOAuthSecret("abd"));
  });

  it("claims a fresh code and completes successfully", async () => {
    const created = {
      id: "tx_1",
      status: OAuthTransactionStatus.in_progress
    };
    const prisma = {
      oAuthTransaction: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn()
      }
    } as never;

    const claim = await claimOAuthCodeExchange(prisma, {
      accountId: "acc_1",
      purpose: OAuthTransactionPurpose.patron_link,
      code: "code-1",
      redirectUri: "https://example.com/cb"
    });
    expect(claim).toEqual({ kind: "claimed", transactionId: "tx_1" });

    await completeOAuthTransaction(prisma, {
      transactionId: "tx_1",
      ok: true,
      resultJson: { linked: true }
    });
    expect(prisma.oAuthTransaction.update).toHaveBeenCalled();
  });

  it("replays a completed transaction for the same code hash", async () => {
    const prisma = {
      oAuthTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tx_done",
          status: OAuthTransactionStatus.completed,
          resultJson: { patreon_user_id: "p1" },
          errorCode: null
        })
      }
    } as never;

    const claim = await claimOAuthCodeExchange(prisma, {
      accountId: "acc_1",
      purpose: OAuthTransactionPurpose.patron_link,
      code: "code-replay",
      redirectUri: "https://example.com/cb"
    });
    expect(claim.kind).toBe("replay");
    if (claim.kind === "replay") {
      expect(claim.resultJson).toEqual({ patreon_user_id: "p1" });
    }
  });

  it("returns in_flight when another request holds the code", async () => {
    const prisma = {
      oAuthTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tx_busy",
          status: OAuthTransactionStatus.in_progress,
          accountId: "acc_1"
        })
      }
    } as never;

    const claim = await claimOAuthCodeExchange(prisma, {
      accountId: "acc_1",
      purpose: OAuthTransactionPurpose.creator_ingest,
      code: "code-busy",
      redirectUri: "https://example.com/cb"
    });
    expect(claim).toEqual({ kind: "in_flight" });
  });
});
