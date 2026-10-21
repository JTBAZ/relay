/**
 * Loads SubscribeStar patron GraphQL subscription payload → merged `PatronEntitlementSnapshot` + membership `tierIds`.
 */

import { EntitlementSource, TenantRole, type PrismaClient } from "@prisma/client";
import {
  getPatronSubscribestarOAuthCredentialSnapshot,
  upsertPatronSubscribestarOAuthCredential
} from "../auth/patron-subscribestar-oauth-credential-store.js";
import type { TokenEncryption } from "../lib/crypto.js";
import { upsertPatronProviderEntitlements } from "../identity/patron-entitlement-snapshot.js";
import { fetchSubscribeStarPatronSubscriptionsGraphql } from "./fetch-subscribestar-patron-subscriptions.js";
import { mapSubscribeStarPatronSubscriptionDataToRelayTierIds } from "./map-subscribestar-subscription-to-relay-tier-ids.js";
import { subscribeStarPatronSubscriptionsGraphqlQueryFromEnv } from "./subscribestar-patron-subscriptions-query.js";
import type { SubscribeStarOAuthClient } from "./subscribestar-client.js";

function graphqlErrorLooksLikeAuth(text: string): boolean {
  return /\b401\b/.test(text) || /\b403\b/.test(text) || /unauthorized/i.test(text);
}

export async function syncSubscribeStarPatronEntitlements(args: {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  fetchImpl: typeof fetch;
  graphqlUrl: string;
  subscriptionsQuery?: string | null;
  patronMembershipId: string;
  relayCreatorId: string;
  accountId: string;
  subscribeStarOAuthClient: SubscribeStarOAuthClient;
  source: EntitlementSource;
  snapshotCampaignId?: string | null;
}): Promise<{ ok: true; tier_ids: string[] } | { ok: false; reason: string }> {
  if (
    args.source !== EntitlementSource.oauth_exchange &&
    args.source !== EntitlementSource.scheduled_refresh &&
    args.source !== EntitlementSource.webhook
  ) {
    return { ok: false, reason: "invalid_source_for_subscribestar_patron_sync" };
  }

  const query =
    (args.subscriptionsQuery?.trim()?.length ? args.subscriptionsQuery.trim() : null) ||
    subscribeStarPatronSubscriptionsGraphqlQueryFromEnv();
  if (!query) {
    return { ok: false, reason: "no_subscriptions_query" };
  }

  const cp = await args.prisma.creatorProfile.findFirst({
    where: { tenant: { relayCreatorId: args.relayCreatorId } },
    select: { subscribestarProfileId: true }
  });
  const profileId = cp?.subscribestarProfileId?.trim();
  if (!profileId) {
    return { ok: false, reason: "no_creator_subscribestar_profile" };
  }

  let credential = await getPatronSubscribestarOAuthCredentialSnapshot(
    args.prisma,
    args.accountId,
    args.encryption
  );
  if (!credential?.tokens.access_token?.trim() || !credential.tokens.refresh_token?.trim()) {
    return { ok: false, reason: "no_credential" };
  }

  let dataRoot: unknown;
  try {
    dataRoot = await fetchSubscribeStarPatronSubscriptionsGraphql({
      graphqlUrl: args.graphqlUrl,
      accessToken: credential.tokens.access_token,
      query,
      fetchImpl: args.fetchImpl
    });
  } catch (firstErr) {
    const msg = (firstErr as Error).message;
    if (!graphqlErrorLooksLikeAuth(msg)) {
      return { ok: false, reason: "subscription_fetch_failed" };
    }
    const next = await args.subscribeStarOAuthClient.refreshToken(credential.tokens.refresh_token);
    await upsertPatronSubscribestarOAuthCredential(
      args.prisma,
      args.accountId,
      next,
      args.encryption
    );
    credential = await getPatronSubscribestarOAuthCredentialSnapshot(args.prisma, args.accountId, args.encryption);
    if (!credential || credential.tokens.access_token !== next.access_token) return { ok: false, reason: "credential_changed" };
    try {
      dataRoot = await fetchSubscribeStarPatronSubscriptionsGraphql({
        graphqlUrl: args.graphqlUrl,
        accessToken: next.access_token,
        query,
        fetchImpl: args.fetchImpl
      });
    } catch {
      return { ok: false, reason: "subscription_fetch_failed_after_refresh" };
    }
  }

  const tierIds = mapSubscribeStarPatronSubscriptionDataToRelayTierIds(dataRoot, {
    creatorSubscribeStarProfileId: profileId
  });

  await upsertPatronProviderEntitlements(args.prisma, {
    expectedAccountId: args.accountId, expectedCredentialVersion: credential.version, provider: "subscribestar", expectedSubscribeStarProfileId: profileId,
    patronMembershipId: args.patronMembershipId,
    relayCreatorId: args.relayCreatorId,
    entitledTierIds: tierIds,
    source: args.source,
    campaignId: args.snapshotCampaignId ?? null,
    crossProviderMergeSource: "subscribestar"
  });

  const snap = await args.prisma.patronEntitlementSnapshot.findUnique({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: args.patronMembershipId,
        relayCreatorId: args.relayCreatorId
      }
    },
    select: { entitledTierIds: true }
  });
  const final = snap?.entitledTierIds ?? tierIds;

  return { ok: true, tier_ids: final };
}

/**
 * Session-first link — persists tokens then {@link syncSubscribeStarPatronEntitlements}.
 */
export async function linkSubscribeStarPatronWithCode(params: {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  fetchImpl: typeof fetch;
  graphqlUrl: string;
  oauthClient: SubscribeStarOAuthClient;
  code: string;
  redirectUri: string;
  accountId: string;
  relayCreatorId: string;
  subscriptionsQuery?: string | null;
}): Promise<{ tier_ids: string[] }> {
  const tok = await params.oauthClient.exchangeCode(params.code, params.redirectUri);
  await upsertPatronSubscribestarOAuthCredential(
    params.prisma,
    params.accountId,
    tok,
    params.encryption
  );

  const tenant = await params.prisma.tenant.findUnique({
    where: { relayCreatorId: params.relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    throw new Error("Relay tenant not found for this creator.");
  }

  let membership = await params.prisma.tenantMembership.findFirst({
    where: {
      accountId: params.accountId,
      tenantId: tenant.id,
      role: TenantRole.patron
    }
  });
  if (!membership) {
    membership = await params.prisma.tenantMembership.create({
      data: {
        accountId: params.accountId,
        tenantId: tenant.id,
        role: TenantRole.patron,
        tierIds: []
      }
    });
  }

  const r = await syncSubscribeStarPatronEntitlements({
    prisma: params.prisma,
    encryption: params.encryption,
    fetchImpl: params.fetchImpl,
    graphqlUrl: params.graphqlUrl,
    subscriptionsQuery: params.subscriptionsQuery,
    patronMembershipId: membership.id,
    relayCreatorId: params.relayCreatorId,
    accountId: params.accountId,
    subscribeStarOAuthClient: params.oauthClient,
    source: EntitlementSource.oauth_exchange
  });
  if (!r.ok) {
    throw new Error(`SubscribeStar patron link failed: ${r.reason}`);
  }
  return { tier_ids: r.tier_ids };
}
