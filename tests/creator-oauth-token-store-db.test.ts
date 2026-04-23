import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CredentialHealth,
  IdentityAuthProvider,
  OAuthPurpose,
  ProviderKind,
  PublicSlugSource,
  UserKind
} from "@prisma/client";
import { DbPatreonTokenStore, RELAY_TOKEN_KEY_ID } from "../src/auth/token-store-db.js";
import { TokenEncryption } from "../src/lib/crypto.js";

/**
 * MIG-20 — Creator Patreon ingest OAuth persists via Prisma only (same schema on Supabase Postgres).
 * No dependency on `Account` / `supabaseUserId`; registration identity is a separate track.
 */
describe("DbPatreonTokenStore", () => {
  it("upserts Tenant → User(creator) → CreatorProfile → ProviderAccount → OAuthCredential (no Account model)", async () => {
    const key = randomBytes(32).toString("base64");
    const encryption = new TokenEncryption(key);

    const tenantUpsert = vi.fn().mockResolvedValue({
      id: "tenant_1",
      relayCreatorId: "creator_x"
    });
    const userFindFirst = vi.fn().mockResolvedValue(null);
    const userCreate = vi.fn().mockResolvedValue({ id: "user_1" });
    const creatorProfileFindUnique = vi.fn().mockResolvedValue(null);
    const creatorProfileCreate = vi.fn().mockResolvedValue({});
    const providerFindFirst = vi.fn().mockResolvedValue(null);
    const providerFindUnique = vi.fn().mockResolvedValue(null);
    const providerCreate = vi.fn().mockResolvedValue({ id: "pa_1" });
    const providerUpdate = vi.fn();
    const oauthUpsert = vi.fn().mockResolvedValue({});

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          tenant: { upsert: tenantUpsert },
          user: { findFirst: userFindFirst, create: userCreate },
          creatorProfile: { create: creatorProfileCreate, findUnique: creatorProfileFindUnique },
          providerAccount: {
            findFirst: providerFindFirst,
            findUnique: providerFindUnique,
            create: providerCreate,
            update: providerUpdate
          },
          oAuthCredential: { upsert: oauthUpsert }
        };
        return fn(tx);
      })
    };

    const store = new DbPatreonTokenStore(prisma as never, encryption);

    await store.upsert({
      creator_id: "creator_x",
      access_token: "access",
      refresh_token: "refresh",
      access_token_expires_at: new Date("2030-06-01T00:00:00.000Z").toISOString(),
      credential_health_status: "healthy",
      provider_user_id: "patron_api_user_9"
    });

    expect(tenantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { relayCreatorId: "creator_x" },
        create: { relayCreatorId: "creator_x" }
      })
    );

    expect(userCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant_1",
        kind: UserKind.creator,
        identityAuthProvider: IdentityAuthProvider.patreon,
        tierIds: []
      }
    });

    expect(creatorProfileCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        userId: "user_1",
        publicSlug: expect.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        slugSource: PublicSlugSource.allocated
      })
    });

    expect(providerCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        provider: ProviderKind.patreon,
        providerUserId: "patron_api_user_9"
      }
    });

    expect(oauthUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerAccountId: "pa_1" },
        create: expect.objectContaining({
          providerAccountId: "pa_1",
          purpose: OAuthPurpose.creator_ingest,
          keyId: RELAY_TOKEN_KEY_ID,
          healthStatus: CredentialHealth.healthy
        })
      })
    );
  });

  it("getByCreatorId reads OAuthCredential scoped by tenant relayCreatorId", async () => {
    const key = randomBytes(32).toString("base64");
    const encryption = new TokenEncryption(key);
    const payload = {
      encrypted_access_token: encryption.encrypt("a"),
      encrypted_refresh_token: encryption.encrypt("r"),
      provider_user_id: "pu1"
    };
    const encryptedPayload = Buffer.from(JSON.stringify(payload), "utf8");

    const findFirst = vi.fn().mockResolvedValue({
      expiresAtHint: new Date("2030-01-01T00:00:00.000Z"),
      encryptedPayload,
      healthStatus: CredentialHealth.healthy
    });

    const prisma = {
      oAuthCredential: { findFirst }
    };

    const store = new DbPatreonTokenStore(prisma as never, encryption);
    const out = await store.getByCreatorId("creator_y");

    expect(out).not.toBeNull();
    expect(out?.creator_id).toBe("creator_y");
    expect(out?.access_token).toBe("a");
    expect(out?.refresh_token).toBe("r");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          purpose: OAuthPurpose.creator_ingest,
          providerAccount: {
            user: {
              kind: UserKind.creator,
              tenant: { relayCreatorId: "creator_y" }
            }
          }
        }
      })
    );
  });
});
