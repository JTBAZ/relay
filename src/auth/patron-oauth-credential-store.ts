/**
 * @fileoverview Persistence helpers for patron Patreon OAuth tokens using `PatronOAuthCredential` rows.
 * @description Mirrors creator `OAuthCredential` encryption envelopes for PE-H refresh workers.
 * @see ./token-store-db.js RELAY_TOKEN_KEY_ID
 * @see prisma/schema.prisma PatronOAuthCredential, TenantMembership, Account
 */

import { CredentialHealth, type PrismaClient } from "@prisma/client";
import type { PatreonTokenResponse } from "./patreon-client.js";
import { RELAY_TOKEN_KEY_ID } from "./token-store-db.js";
import type { TokenEncryption } from "../lib/crypto.js";

type PatronOAuthPayloadJson = {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
};

/**
 * Persist Patreon access + refresh tokens for a patron-linked `Account`, using the same
 * AES-GCM envelope as creator `OAuthCredential` (`TokenEncryption` + `RELAY_TOKEN_KEY_ID`).
 * Enables PE-H refresh workers without forcing re-OAuth.
 *
 * @description Upserts encrypted tokens for direct `accountId` ownership.
 * @param prisma Shared Prisma client.
 * @param accountId Relay `Account.id` owning the patron link.
 * @param tokens Plaintext bearer and refresh secrets from Patreon.
 * @param encryption Symmetric cipher helper aligned with KMS/env key rotation.
 * @async
 * @throws {Error} Prisma `upsert` failures or encryption errors from `encryption.encrypt`.
 * @security-audit-required Persists bearer-grade secrets tied to patrons; callers must authorize `accountId` first.
 */
export async function upsertPatronOAuthCredential(
  prisma: PrismaClient,
  accountId: string,
  tokens: Pick<PatreonTokenResponse, "access_token" | "refresh_token">,
  encryption: TokenEncryption
): Promise<void> {
  const payload: PatronOAuthPayloadJson = {
    encrypted_access_token: encryption.encrypt(tokens.access_token),
    encrypted_refresh_token: encryption.encrypt(tokens.refresh_token)
  };
  const encryptedPayload = Buffer.from(JSON.stringify(payload), "utf8");

  await prisma.patronOAuthCredential.upsert({
    where: { accountId },
    create: {
      accountId,
      encryptedPayload,
      keyId: RELAY_TOKEN_KEY_ID,
      healthStatus: CredentialHealth.healthy
    },
    update: {
      encryptedPayload,
      healthStatus: CredentialHealth.healthy
    }
  });
}

/**
 * Resolve `TenantMembership.id` → `Account.id`, then upsert patron OAuth credentials.
 *
 * @description Indirection helper for membership-keyed flows.
 * @param prisma Shared Prisma client.
 * @param tenantMembershipId Membership row id.
 * @param tokens OAuth tokens from Patreon.
 * @param encryption Symmetric cipher helper.
 * @async
 * @throws {Error} When membership row is missing or underlying `upsertPatronOAuthCredential` fails.
 */
export async function upsertPatronOAuthCredentialForMembership(
  prisma: PrismaClient,
  tenantMembershipId: string,
  tokens: Pick<PatreonTokenResponse, "access_token" | "refresh_token">,
  encryption: TokenEncryption
): Promise<void> {
  const row = await prisma.tenantMembership.findUnique({
    where: { id: tenantMembershipId },
    select: { accountId: true }
  });
  if (!row) {
    throw new Error("TenantMembership not found for patron OAuth persistence.");
  }
  await upsertPatronOAuthCredential(prisma, row.accountId, tokens, encryption);
}

/** @description Decrypted tokens returned to workers for Patreon API calls. */
export type DecryptedPatronOAuthTokens = Pick<
  PatreonTokenResponse,
  "access_token" | "refresh_token"
>;

/**
 * PE-H — Read and decrypt tokens written by {@link upsertPatronOAuthCredential} (same JSON envelope
 * as creator `OAuthCredential`).
 *
 * @description Loads ciphertext row and decrypts access/refresh tokens when parse succeeds.
 * @param prisma Shared Prisma client.
 * @param accountId Account id scope.
 * @param encryption Decryption helper for stored fields.
 * @returns Tokens or `null` when row missing/parse/decrypt fails.
 * @async
 * @throws {Error} Prisma query failures propagate; JSON/decrypt issues return `null` instead of throwing.
 * @security-audit-required Returns bearer secrets; never log return value.
 */
export async function getPatronOAuthTokensForAccount(
  prisma: PrismaClient,
  accountId: string,
  encryption: TokenEncryption
): Promise<DecryptedPatronOAuthTokens | null> {
  const row = await prisma.patronOAuthCredential.findUnique({
    where: { accountId },
    select: { encryptedPayload: true }
  });
  if (!row) return null;
  let parsed: PatronOAuthPayloadJson;
  try {
    parsed = JSON.parse(
      Buffer.from(row.encryptedPayload).toString("utf8")
    ) as PatronOAuthPayloadJson;
  } catch {
    return null;
  }
  try {
    return {
      access_token: encryption.decrypt(parsed.encrypted_access_token),
      refresh_token: encryption.decrypt(parsed.encrypted_refresh_token)
    };
  } catch {
    return null;
  }
}

/**
 * @description Membership-keyed reader delegating to `getPatronOAuthTokensForAccount`.
 * @param prisma Shared Prisma client.
 * @param tenantMembershipId Membership id.
 * @param encryption Cipher helper.
 * @returns Tokens or `null`.
 * @async
 * @throws {Error} On Prisma `findUnique` failure.
 */
export async function getPatronOAuthTokensForMembership(
  prisma: PrismaClient,
  tenantMembershipId: string,
  encryption: TokenEncryption
): Promise<DecryptedPatronOAuthTokens | null> {
  const row = await prisma.tenantMembership.findUnique({
    where: { id: tenantMembershipId },
    select: { accountId: true }
  });
  if (!row) return null;
  return getPatronOAuthTokensForAccount(prisma, row.accountId, encryption);
}

/**
 * @description Enumerates accounts that have a stored patron OAuth row (PE-H worker / stale scan).
 * @param prisma Shared Prisma client.
 * @returns Account ids owning patron OAuth rows.
 * @async
 * @throws {Error} On Prisma `findMany` failure.
 */
export async function listAccountIdsWithPatronOAuthCredentials(
  prisma: PrismaClient
): Promise<string[]> {
  const rows = await prisma.patronOAuthCredential.findMany({
    select: { accountId: true }
  });
  return rows.map((r) => r.accountId);
}
