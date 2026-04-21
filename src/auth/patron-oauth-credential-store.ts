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

export type DecryptedPatronOAuthTokens = Pick<
  PatreonTokenResponse,
  "access_token" | "refresh_token"
>;

/**
 * PE-H — Read and decrypt tokens written by {@link upsertPatronOAuthCredential} (same JSON envelope
 * as creator `OAuthCredential`).
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

/** Enumerate accounts that have a stored patron OAuth row (PE-H worker / stale scan). */
export async function listAccountIdsWithPatronOAuthCredentials(
  prisma: PrismaClient
): Promise<string[]> {
  const rows = await prisma.patronOAuthCredential.findMany({
    select: { accountId: true }
  });
  return rows.map((r) => r.accountId);
}
