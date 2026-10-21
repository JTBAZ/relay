/**
 * @fileoverview Patron OAuth code exchange, identity hydration, Relay session issuance, optional credential + follow seed persistence.
 * @description Bridges Patreon patron tokens into `TenantMembership` tier snapshots and encrypted `PatronOAuthCredential` rows.
 * @async External Patreon HTTP and Prisma mutations.
 * @throws {Error} Token exchange, identity fetch, identity service conflicts (`PatreonAccountLinkConflictError`).
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `PatronOAuthCredential`, `TenantMembership`, `PatronFollowSeed`
 * @security-audit-required Handles patron emails / names from Patreon identity — treat as PII at rest.
 */
import { assertPatreonIdentityObservation } from "../identity/patreon-identity-mutation.js";
import { PatronFollowSeedSource, type PrismaClient } from "@prisma/client";
import type { PatreonClient, PatreonTokenResponse } from "../auth/patreon-client.js";
import { upsertPatronOAuthCredentialForMembership } from "../auth/patron-oauth-credential-store.js";
import {
  recordPatronOAuthAttempt,
  recordPatronOAuthFailure,
  recordPatronOAuthSuccess
} from "../auth/part1a-gate-metrics.js";
import type { TokenEncryption } from "../lib/crypto.js";
import { PatreonAccountLinkConflictError } from "../identity/identity-store-db.js";
import type { IdentityService } from "../identity/identity-service.js";
import type { SessionToken, UserAccount } from "../identity/types.js";
import { relayCreatorIdsForFollowSeed } from "../patron/patron-follow-service.js";
import { runPatronInitialFollowSeed } from "../patron/patron-initial-follow-seed.js";
import {
  extractPatronSyncFromIdentity,
  hasVerifiedCreatorMembershipRelationships,
  extractUnifiedPatreonIdentity,
  fetchPatronIdentity
} from "./patreon-user-identity.js";

/**
 * Patron OAuth: exchange authorization code, pull `/v2/identity`, upsert Relay user
 * tiers (same ids as creator-side member sync), issue gallery session.
 *
 * When `prisma` + `encryption` are passed, persists tokens to `PatronOAuthCredential`
 * (PE-H refresh path).
 */
export async function exchangePatreonPatronOAuth(params: {
  code: string;
  redirectUri: string;
  creatorId: string;
  patreonCampaignNumericId: string;
  patreonClient: PatreonClient;
  identityService: IdentityService;
  fetchImpl: typeof fetch;
  prisma?: PrismaClient | null;
  encryption?: TokenEncryption | null;
}): Promise<{ user: UserAccount; session: SessionToken }> {
  recordPatronOAuthAttempt();
  try {
    const observation = await params.identityService.capturePatreonObservation();
    if (!observation) throw new Error("Patreon OAuth observation is required.");
    const tokenResponse = await params.patreonClient.exchangeCode(
      params.code,
      params.redirectUri
    );
    const doc = await fetchPatronIdentity(
      tokenResponse.access_token,
      params.fetchImpl
    );
    if (!hasVerifiedCreatorMembershipRelationships(doc, params.patreonCampaignNumericId)) throw new Error("identity_campaign_binding_unverified");
    const sync = extractPatronSyncFromIdentity(doc, params.patreonCampaignNumericId);
    const out = await params.identityService.completePatreonPatronOAuth(
      params.creatorId,
      sync.patreon_user_id,
      sync.email,
      sync.tier_ids,
      observation,
      params.patreonCampaignNumericId
    );
    await maybePersistPatronTokens(
      params.prisma,
      params.encryption,
      out.user.user_id,
      tokenResponse,
      sync.patreon_user_id,
      observation
    );
    if (params.prisma) {
      await runPatronInitialFollowSeed({
        prisma: params.prisma,
        patronMembershipId: out.user.user_id,
        relayCreatorIds: [params.creatorId.trim()],
        source: PatronFollowSeedSource.oauth_creator_scoped_exchange
      });
    }
    recordPatronOAuthSuccess();
    return out;
  } catch (e) {
    recordPatronOAuthFailure();
    throw e;
  }
}

async function maybePersistPatronTokens(
  prisma: PrismaClient | null | undefined,
  encryption: TokenEncryption | null | undefined,
  tenantMembershipId: string,
  tokenResponse: PatreonTokenResponse,
  patreonUserId: string,
  observation: string
): Promise<void> {
  if (!prisma || !encryption) return;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`patreon-identity:${patreonUserId}`}, 0))`;
    const membership = await tx.tenantMembership.findUnique({ where: { id: tenantMembershipId }, include: { account: true } });
    if (membership?.account.patronPatreonUserId !== patreonUserId) throw new Error("Patreon authorization was removed during collection.");
    await assertPatreonIdentityObservation(tx, patreonUserId, observation);
    await upsertPatronOAuthCredentialForMembership(tx, tenantMembershipId, tokenResponse, encryption);
  });
}

export type UnifiedPatreonPatronOAuthResult = {
  user: UserAccount;
  session: SessionToken;
  /** Every Relay creator linked on this round-trip (paid + declined + former + free follower). */
  linkedRelayCreatorIds: string[];
  paidMembershipRelayCreatorIds: string[];
  declinedPatronRelayCreatorIds: string[];
  formerPatronRelayCreatorIds: string[];
  freeFollowerRelayCreatorIds: string[];
  ownedRelayCreatorId: string | null;
  unmappedPatreonCampaignIds: string[];
};

/**
 * Single OAuth round-trip: all memberships + owned campaign (see `PATREON_PATRON_OAUTH_SCOPES`).
 * Persists tokens when `prisma` + `encryption` are set.
 *
 * When `anchorMembershipId` is set (session-first `/patron/link`), rejects if the merged
 * `Account` differs from the pre-session account (`PatreonAccountLinkConflictError`).
 */
export async function exchangePatreonPatronOAuthUnified(params: {
  code: string;
  redirectUri: string;
  patreonClient: PatreonClient;
  identityService: IdentityService;
  fetchImpl: typeof fetch;
  prisma?: PrismaClient | null;
  encryption?: TokenEncryption | null;
  /** Pre-OAuth `TenantMembership.id` — must resolve to the same `Account` after link. */
  anchorMembershipId?: string | null;
}): Promise<UnifiedPatreonPatronOAuthResult> {
  recordPatronOAuthAttempt();
  try {
    const observation = await params.identityService.capturePatreonObservation();
    if (!observation) throw new Error("Patreon OAuth observation is required.");
    const tokenResponse = await params.patreonClient.exchangeCode(
      params.code,
      params.redirectUri
    );
    const doc = await fetchPatronIdentity(
      tokenResponse.access_token,
      params.fetchImpl
    );
    const unified = extractUnifiedPatreonIdentity(doc);
    const out = await params.identityService.completeUnifiedPatreonPatronOAuth({
      observation,
      patreonUserId: unified.patreon_user_id,
      email: unified.email,
      ownedCampaignId: unified.owned_campaign_id,
      memberships: unified.memberships
    });

    if (params.anchorMembershipId && params.prisma) {
      const pre = await params.prisma.tenantMembership.findUnique({
        where: { id: params.anchorMembershipId },
        select: { accountId: true }
      });
      const post = await params.prisma.tenantMembership.findUnique({
        where: { id: out.user.user_id },
        select: { accountId: true }
      });
      if (
        !pre?.accountId ||
        !post?.accountId ||
        pre.accountId !== post.accountId
      ) {
        throw new PatreonAccountLinkConflictError(
          "This Patreon account cannot be linked to the signed-in Relay account. Sign in with the account that should own this Patreon link, or use a different Patreon login."
        );
      }
    }

    await maybePersistPatronTokens(
      params.prisma,
      params.encryption,
      out.user.user_id,
      tokenResponse,
      unified.patreon_user_id,
      observation
    );
    if (params.prisma) {
      const toSeed = relayCreatorIdsForFollowSeed({
        linkedRelayCreatorIds: out.linkedRelayCreatorIds,
        ownedRelayCreatorId: out.ownedRelayCreatorId
      });
      if (toSeed.length > 0) {
        await runPatronInitialFollowSeed({
          prisma: params.prisma,
          patronMembershipId: out.user.user_id,
          relayCreatorIds: toSeed,
          source: PatronFollowSeedSource.oauth_unified
        });
      }
    }
    recordPatronOAuthSuccess();
    return {
      user: out.user,
      session: out.session,
      linkedRelayCreatorIds: out.linkedRelayCreatorIds,
      paidMembershipRelayCreatorIds: out.paidMembershipRelayCreatorIds,
      declinedPatronRelayCreatorIds: out.declinedPatronRelayCreatorIds,
      formerPatronRelayCreatorIds: out.formerPatronRelayCreatorIds,
      freeFollowerRelayCreatorIds: out.freeFollowerRelayCreatorIds,
      ownedRelayCreatorId: out.ownedRelayCreatorId,
      unmappedPatreonCampaignIds: out.unmappedPatreonCampaignIds
    };
  } catch (e) {
    recordPatronOAuthFailure();
    throw e;
  }
}
