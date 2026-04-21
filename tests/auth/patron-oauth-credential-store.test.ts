import { describe, expect, it, vi } from "vitest";
import { CredentialHealth } from "@prisma/client";
import {
  getPatronOAuthTokensForAccount,
  getPatronOAuthTokensForMembership,
  upsertPatronOAuthCredentialForMembership
} from "../../src/auth/patron-oauth-credential-store.js";
import { TokenEncryption } from "../../src/lib/crypto.js";

describe("upsertPatronOAuthCredentialForMembership", () => {
  it("upserts encrypted payload for the membership's account", async () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const enc = new TokenEncryption(key);

    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc_1" })
      },
      patronOAuthCredential: { upsert }
    };

    await upsertPatronOAuthCredentialForMembership(
      prisma as never,
      "tm_1",
      { access_token: "at", refresh_token: "rt" },
      enc
    );

    expect(prisma.tenantMembership.findUnique).toHaveBeenCalledWith({
      where: { id: "tm_1" },
      select: { accountId: true }
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0]![0];
    expect(call.where).toEqual({ accountId: "acc_1" });
    expect(call.create.accountId).toBe("acc_1");
    expect(call.create.keyId).toBe("RELAY_TOKEN_ENCRYPTION_KEY");
    expect(call.create.healthStatus).toBe(CredentialHealth.healthy);
    const json = JSON.parse(
      Buffer.from(call.create.encryptedPayload as Buffer).toString("utf8")
    );
    expect(typeof json.encrypted_access_token).toBe("string");
    expect(typeof json.encrypted_refresh_token).toBe("string");
    expect(enc.decrypt(json.encrypted_access_token)).toBe("at");
    expect(enc.decrypt(json.encrypted_refresh_token)).toBe("rt");
  });
});

describe("getPatronOAuthTokensForAccount", () => {
  it("decrypts stored payload", async () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const enc = new TokenEncryption(key);
    const inner = {
      encrypted_access_token: enc.encrypt("access"),
      encrypted_refresh_token: enc.encrypt("refresh")
    };
    const prisma = {
      patronOAuthCredential: {
        findUnique: vi.fn().mockResolvedValue({
          encryptedPayload: Buffer.from(JSON.stringify(inner), "utf8")
        })
      }
    };

    const out = await getPatronOAuthTokensForAccount(prisma as never, "acc_x", enc);

    expect(prisma.patronOAuthCredential.findUnique).toHaveBeenCalledWith({
      where: { accountId: "acc_x" },
      select: { encryptedPayload: true }
    });
    expect(out).toEqual({ access_token: "access", refresh_token: "refresh" });
  });

  it("returns null when row missing", async () => {
    const enc = new TokenEncryption(Buffer.alloc(32, 8).toString("base64"));
    const prisma = {
      patronOAuthCredential: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    expect(await getPatronOAuthTokensForAccount(prisma as never, "acc_x", enc)).toBeNull();
  });
});

describe("getPatronOAuthTokensForMembership", () => {
  it("resolves account via membership then decrypts", async () => {
    const key = Buffer.alloc(32, 3).toString("base64");
    const enc = new TokenEncryption(key);
    const inner = {
      encrypted_access_token: enc.encrypt("a"),
      encrypted_refresh_token: enc.encrypt("r")
    };
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ accountId: "acc_z" })
      },
      patronOAuthCredential: {
        findUnique: vi.fn().mockResolvedValue({
          encryptedPayload: Buffer.from(JSON.stringify(inner), "utf8")
        })
      }
    };

    const out = await getPatronOAuthTokensForMembership(prisma as never, "tm_z", enc);
    expect(out).toEqual({ access_token: "a", refresh_token: "r" });
  });
});
