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
import { assertPatreonIdentityObservation } from "../identity/patreon-identity-mutation.js";
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
  const binding = await args.prisma.account.findUnique({ where: { id: args.accountId }, select: { patronPatreonUserId: true } });
  if (!binding?.patronPatreonUserId) return null;
  const patreonUserId = binding.patronPatreonUserId;
  const fence = await args.prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('patreon_member_observation_seq') AS value`;
  const current = await getPatronOAuthTokensForAccount(
    args.prisma,
    args.accountId,
    args.encryption
  );
  if (!current?.refresh_token?.trim()) {
    return null;
  }
  const next = await args.patreonClient.refreshToken(current.refresh_token);
  return args.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`patreon-identity:${patreonUserId}`}, 0))`;
    const account = await tx.account.findUnique({ where: { id: args.accountId }, select: { patronPatreonUserId: true } });
    const tokens = await getPatronOAuthTokensForAccount(tx, args.accountId, args.encryption);
    if (account?.patronPatreonUserId !== patreonUserId || tokens?.refresh_token !== current.refresh_token) return null;
    await assertPatreonIdentityObservation(tx, patreonUserId, fence[0]!.value.toString());
    await upsertPatronOAuthCredential(tx, args.accountId, next, args.encryption);
    return next;
  });
}
