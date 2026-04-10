import {
  CredentialHealth,
  OAuthPurpose,
  PrismaClient,
  ProviderKind,
  UserKind,
  IdentityAuthProvider
} from "@prisma/client";
import { TokenEncryption } from "../lib/crypto.js";
import type {
  CredentialHealthStatus,
  PatreonTokenStore,
  PersistedPatreonTokens
} from "./token-store.js";

/** Stored in `OAuthCredential.keyId` — matches env name used with `TokenEncryption` (rotation label). */
export const RELAY_TOKEN_KEY_ID = "RELAY_TOKEN_ENCRYPTION_KEY";

type EncryptedPayloadJson = {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  provider_user_id?: string;
};

function toPrismaHealth(s: CredentialHealthStatus): CredentialHealth {
  return s === "healthy" ? CredentialHealth.healthy : CredentialHealth.degraded;
}

function toFileHealth(h: CredentialHealth): CredentialHealthStatus {
  return h === CredentialHealth.healthy ? "healthy" : "refresh_failed";
}

export class DbPatreonTokenStore implements PatreonTokenStore {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: TokenEncryption
  ) {}

  public async upsert(tokens: PersistedPatreonTokens): Promise<void> {
    const enc = this.encryption;
    const payload: EncryptedPayloadJson = {
      encrypted_access_token: enc.encrypt(tokens.access_token),
      encrypted_refresh_token: enc.encrypt(tokens.refresh_token),
      provider_user_id: tokens.provider_user_id
    };
    const encryptedPayload = Buffer.from(JSON.stringify(payload), "utf8");
    const pid =
      tokens.provider_user_id?.trim() ||
      `relay_creator:${tokens.creator_id}`;

    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { relayCreatorId: tokens.creator_id },
        create: { relayCreatorId: tokens.creator_id },
        update: {}
      });

      let creatorUser = await tx.user.findFirst({
        where: { tenantId: tenant.id, kind: UserKind.creator }
      });
      if (!creatorUser) {
        creatorUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            kind: UserKind.creator,
            identityAuthProvider: IdentityAuthProvider.patreon,
            tierIds: []
          }
        });
        await tx.creatorProfile.create({
          data: { tenantId: tenant.id, userId: creatorUser.id }
        });
      }

      let pa = await tx.providerAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider: ProviderKind.patreon,
            providerUserId: pid
          }
        }
      });
      if (!pa) {
        pa = await tx.providerAccount.create({
          data: {
            userId: creatorUser.id,
            provider: ProviderKind.patreon,
            providerUserId: pid
          }
        });
      } else if (pa.userId !== creatorUser.id) {
        await tx.providerAccount.update({
          where: { id: pa.id },
          data: { userId: creatorUser.id }
        });
      }

      await tx.oAuthCredential.upsert({
        where: { providerAccountId: pa.id },
        create: {
          providerAccountId: pa.id,
          purpose: OAuthPurpose.creator_ingest,
          encryptedPayload,
          keyId: RELAY_TOKEN_KEY_ID,
          healthStatus: toPrismaHealth(tokens.credential_health_status),
          expiresAtHint: new Date(tokens.access_token_expires_at)
        },
        update: {
          encryptedPayload,
          healthStatus: toPrismaHealth(tokens.credential_health_status),
          expiresAtHint: new Date(tokens.access_token_expires_at)
        }
      });
    });
  }

  public async getByCreatorId(
    creatorId: string
  ): Promise<PersistedPatreonTokens | null> {
    const cred = await this.prisma.oAuthCredential.findFirst({
      where: {
        purpose: OAuthPurpose.creator_ingest,
        providerAccount: {
          user: {
            kind: UserKind.creator,
            tenant: { relayCreatorId: creatorId }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    if (!cred?.expiresAtHint) return null;

    const enc = this.encryption;
    let parsed: EncryptedPayloadJson;
    try {
      parsed = JSON.parse(
        Buffer.from(cred.encryptedPayload).toString("utf8")
      ) as EncryptedPayloadJson;
    } catch {
      return null;
    }

    return {
      creator_id: creatorId,
      access_token: enc.decrypt(parsed.encrypted_access_token),
      refresh_token: enc.decrypt(parsed.encrypted_refresh_token),
      access_token_expires_at: cred.expiresAtHint.toISOString(),
      provider_user_id: parsed.provider_user_id,
      credential_health_status: toFileHealth(cred.healthStatus)
    };
  }
}
