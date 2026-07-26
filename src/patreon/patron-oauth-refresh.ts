/**
 * @fileoverview Patron OAuth refresh: exchanges stored refresh token for new Patreon tokens and re-persists encrypted credentials.
 * @description BO-DP-R04 / PE-H — intended for workers when entitlements are stale.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `PatronOAuthCredential`, `Account`
 * @security-audit-required Operates on patron tokens and refresh material — never log token bodies.
 */
import type { PrismaClient } from "@prisma/client";
import type { PatreonClient, PatreonTokenResponse } from "../auth/patreon-client.js";
import {
  getPatronOAuthTokensForAccount,
  upsertPatronOAuthCredential
} from "../auth/patron-oauth-credential-store.js";
import type { TokenEncryption } from "../lib/crypto.js";

/**
 * BO-DP-R04 / PE-H — Uses stored refresh token (`patron_oauth_credentials`) to obtain new tokens and
 * re-persist. A scheduled/worker job can call this per account when snapshots are stale.
 * @async
 * @throws {Error} Patreon `refreshToken` failures or Prisma upsert errors.
 */
export async function refreshPatronOAuthTokensWithStoredRefreshToken(args: {
  prisma: PrismaClient;
  accountId: string;
  patreonClient: PatreonClient;
  encryption: TokenEncryption;
}): Promise<PatreonTokenResponse | null> {
  const current = await getPatronOAuthTokensForAccount(
    args.prisma,
    args.accountId,
    args.encryption
  );
  if (!current?.refresh_token?.trim()) {
    return null;
  }
  const next = await args.patreonClient.refreshToken(current.refresh_token);
  await upsertPatronOAuthCredential(args.prisma, args.accountId, next, args.encryption);
  return next;
}
