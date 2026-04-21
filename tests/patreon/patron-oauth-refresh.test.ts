import { describe, expect, it, vi } from "vitest";
import { TokenEncryption } from "../../src/lib/crypto.js";
import { refreshPatronOAuthTokensWithStoredRefreshToken } from "../../src/patreon/patron-oauth-refresh.js";

describe("refreshPatronOAuthTokensWithStoredRefreshToken", () => {
  it("returns null when no stored refresh token path yields empty", async () => {
    const enc = new TokenEncryption(Buffer.alloc(32, 1).toString("base64"));
    const prisma = {
      patronOAuthCredential: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    const patreonClient = { refreshToken: vi.fn() };
    const out = await refreshPatronOAuthTokensWithStoredRefreshToken({
      prisma: prisma as never,
      accountId: "a1",
      patreonClient: patreonClient as never,
      encryption: enc
    });
    expect(out).toBeNull();
    expect(patreonClient.refreshToken).not.toHaveBeenCalled();
  });

  it("refreshes and re-upserts", async () => {
    const key = Buffer.alloc(32, 2).toString("base64");
    const enc = new TokenEncryption(key);
    const inner = {
      encrypted_access_token: enc.encrypt("old_at"),
      encrypted_refresh_token: enc.encrypt("old_rt")
    };
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      patronOAuthCredential: {
        findUnique: vi.fn().mockResolvedValue({
          encryptedPayload: Buffer.from(JSON.stringify(inner), "utf8")
        }),
        upsert
      }
    };
    const nextTokens = {
      access_token: "new_at",
      refresh_token: "new_rt",
      expires_in: 3600
    };
    const patreonClient = { refreshToken: vi.fn().mockResolvedValue(nextTokens) };

    const out = await refreshPatronOAuthTokensWithStoredRefreshToken({
      prisma: prisma as never,
      accountId: "acc_1",
      patreonClient: patreonClient as never,
      encryption: enc
    });

    expect(patreonClient.refreshToken).toHaveBeenCalledWith("old_rt");
    expect(out).toEqual(nextTokens);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
