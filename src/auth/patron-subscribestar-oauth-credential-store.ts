/**
 * @fileoverview Encrypted SubscribeStar **subscriber** OAuth tokens (`PatronSubscribestarOAuthCredential`).
 * @description Mirrors {@link ./patron-oauth-credential-store.js} for a second provider on the same `Account`.
 */

import { CredentialHealth, type PrismaClient } from "@prisma/client";
import type { SubscribeStarTokenResponse } from "../subscribestar/subscribestar-client.js";
import { RELAY_TOKEN_KEY_ID } from "./token-store-db.js";
import type { TokenEncryption } from "../lib/crypto.js";

type PayloadJson = {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
};

export async function upsertPatronSubscribestarOAuthCredential(
  prisma: PrismaClient,
  accountId: string,
  tokens: Pick<SubscribeStarTokenResponse, "access_token" | "refresh_token">,
  encryption: TokenEncryption
): Promise<void> {
  const payload: PayloadJson = {
    encrypted_access_token: encryption.encrypt(tokens.access_token),
    encrypted_refresh_token: encryption.encrypt(tokens.refresh_token)
  };
  const encryptedPayload = Buffer.from(JSON.stringify(payload), "utf8");

  await prisma.patronSubscribestarOAuthCredential.upsert({
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

export type DecryptedPatronSubscribestarOAuthTokens = Pick<
  SubscribeStarTokenResponse,
  "access_token" | "refresh_token"
>;

export async function getPatronSubscribestarOAuthTokensForAccount(
  prisma: PrismaClient,
  accountId: string,
  encryption: TokenEncryption
): Promise<DecryptedPatronSubscribestarOAuthTokens | null> {
  const row = await prisma.patronSubscribestarOAuthCredential.findUnique({
    where: { accountId },
    select: { encryptedPayload: true }
  });
  if (!row) return null;
  let parsed: PayloadJson;
  try {
    parsed = JSON.parse(Buffer.from(row.encryptedPayload).toString("utf8")) as PayloadJson;
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

export async function listAccountIdsWithPatronSubscribestarOAuthCredentials(
  prisma: PrismaClient
): Promise<string[]> {
  const rows = await prisma.patronSubscribestarOAuthCredential.findMany({
    select: { accountId: true }
  });
  return rows.map((r) => r.accountId);
}
