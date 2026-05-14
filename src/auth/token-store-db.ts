/**
 * @fileoverview Prisma-backed `PatreonTokenStore` with tenant/user bootstrap and encrypted `OAuthCredential` rows.
 * @description Maps creator-scoped tokens onto `Tenant`, `User`, `ProviderAccount`, `OAuthCredential` (creator ingest purpose).
 * @see ./token-store.js
 * @see ../creator/public-slug.js allocateUniquePublicSlug
 * @see prisma/schema.prisma Tenant, User, ProviderAccount, OAuthCredential, CreatorProfile
 */

import {
  CredentialHealth,
  IdentityAuthProvider,
  OAuthPurpose,
  PrismaClient,
  ProviderKind,
  PublicSlugSource,
  UserKind
} from "@prisma/client";
import { allocateUniquePublicSlug } from "../creator/public-slug.js";
import { TokenEncryption } from "../lib/crypto.js";
import type {
  CredentialHealthStatus,
  PatreonTokenStore,
  PersistedPatreonTokens
} from "./token-store.js";

/** @description Stored in `OAuthCredential.keyId` — matches env name used with `TokenEncryption` (rotation label). */
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

/**
 * @description Prisma implementation that upserts encrypted Patreon tokens and ensures related identity rows exist.
 * @security-audit-required Writes OAuth secrets and mutates `Tenant`/`User`/`ProviderAccount`; routes must enforce authenticated creator scope.
 */
export class DbPatreonTokenStore implements PatreonTokenStore {
  /**
   * @description Constructs store with shared Prisma client and encryption helper.
   * @param prisma Prisma client.
   * @param encryption AES-GCM helper for token fields.
   */
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: TokenEncryption
  ) {}

  /**
   * @description Transactionally ensures tenant + creator user + Patreon provider account exist, then upserts `OAuthCredential`.
   * @param tokens Plaintext tokens for the creator.
   * @async
   * @throws {Error} Unique constraint clashes on `providerAccount`, transaction failures, or decryption/encryption errors from upstream callers.
   */
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
        const publicSlug = await allocateUniquePublicSlug(tx, null);
        await tx.creatorProfile.create({
          data: {
            tenantId: tenant.id,
            userId: creatorUser.id,
            publicSlug,
            slugSource: PublicSlugSource.allocated
          }
        });
      }

      let pa = await tx.providerAccount.findFirst({
        where: {
          userId: creatorUser.id,
          provider: ProviderKind.patreon,
          oauthCredential: {
            is: { purpose: OAuthPurpose.creator_ingest }
          }
        }
      });

      if (!pa) {
        pa = await tx.providerAccount.findUnique({
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
      } else if (
        pa.providerUserId.startsWith("relay_creator:") &&
        tokens.provider_user_id?.trim() &&
        !tokens.provider_user_id.trim().startsWith("relay_creator:")
      ) {
        const nextPid = tokens.provider_user_id.trim();
        const clash = await tx.providerAccount.findFirst({
          where: {
            provider: ProviderKind.patreon,
            providerUserId: nextPid,
            NOT: { id: pa.id }
          }
        });
        if (clash) {
          throw new Error(
            "This Patreon login is already connected to a different Relay studio. " +
              "Use the same Patreon account you used for this studio, or ask support if you need to move the link."
          );
        }
        await tx.providerAccount.update({
          where: { id: pa.id },
          data: { providerUserId: nextPid }
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

  /**
   * @description Loads latest creator-ingest credential for a Relay `relayCreatorId` and decrypts payload JSON.
   * @param creatorId Relay legacy creator id string.
   * @returns Decrypted tokens or `null` when missing/unparseable payload.
   * @async
   * @throws {Error} Prisma query failures; decryption errors may surface as exceptions from `TokenEncryption`.
   */
  public async getByCreatorId(
    creatorId: string
  ): Promise<PersistedPatreonTokens | null> {
    const cred = await this.prisma.oAuthCredential.findFirst({
      where: {
        purpose: OAuthPurpose.creator_ingest,
        providerAccount: {
          provider: ProviderKind.patreon,
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

  /**
   * @description Returns distinct `relayCreatorId` values for tenants that have Patreon creator-ingest credentials.
   * @returns Sorted creator ids suitable for sync schedulers.
   * @async
   * @throws {Error} Prisma `findMany` failures.
   */
  public async listCreatorIds(): Promise<string[]> {
    const rows = await this.prisma.tenant.findMany({
      where: {
        relayCreatorId: { not: null },
        users: {
          some: {
            kind: UserKind.creator,
            providerAccounts: {
              some: {
                provider: ProviderKind.patreon,
                oauthCredential: {
                  is: { purpose: OAuthPurpose.creator_ingest }
                }
              }
            }
          }
        }
      },
      select: { relayCreatorId: true }
    });
    const ids = rows
      .map((r) => r.relayCreatorId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return [...new Set(ids)].sort();
  }
}
