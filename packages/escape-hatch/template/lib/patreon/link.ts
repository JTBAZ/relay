/**
 * Patreon OAuth link flow (EH-040): exchange → campaign validate → encrypt → upsert.
 * Injectable fetch + store for CI; never logs tokens.
 */

import { PatreonClient } from "./client";
import type { CreatorOAuthConfig } from "./config";
import { PatreonTokenEncryption } from "./crypto";
import {
  extractCampaignMembership,
  fetchPatreonIdentity
} from "./identity";
import {
  buildPatreonEntitlementSnapshot,
  type PatreonLinkStore
} from "./store";
import { pkceChallengeS256, signPatreonOAuthState } from "./state";

export type BuildAuthorizeUrlArgs = {
  config: CreatorOAuthConfig;
  siteId: string;
  accountId: string;
  returnPath?: string;
  nowMs?: number;
};

export type BuildAuthorizeUrlResult = {
  url: string;
  state: string;
  expiresAtIso: string;
};

export function buildAuthorizeUrl(
  args: BuildAuthorizeUrlArgs
): BuildAuthorizeUrlResult {
  const signed = signPatreonOAuthState({
    siteId: args.siteId,
    accountId: args.accountId,
    returnPath: args.returnPath,
    secret: args.config.stateSecret,
    nowMs: args.nowMs
  });
  const challenge = pkceChallengeS256(signed.payload.codeVerifier);
  const url = new URL(args.config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.config.clientId);
  url.searchParams.set("redirect_uri", args.config.redirectUri);
  url.searchParams.set("scope", args.config.scopes);
  url.searchParams.set("state", signed.state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return {
    url: url.toString(),
    state: signed.state,
    expiresAtIso: signed.expiresAtIso
  };
}

export type LinkFromCallbackArgs = {
  config: CreatorOAuthConfig;
  store: PatreonLinkStore;
  code: string;
  codeVerifier: string;
  siteId: string;
  accountId: string;
  fetchImpl?: typeof fetch;
};

export type LinkFromCallbackResult =
  | {
      ok: true;
      patreonUserId: string;
      tierIds: string[];
    }
  | { ok: false; reason: string };

/**
 * Exchange code, validate campaign membership, encrypt refresh token, upsert link + entitlement.
 */
export async function linkFromAuthorizationCode(
  args: LinkFromCallbackArgs
): Promise<LinkFromCallbackResult> {
  const client = new PatreonClient({
    clientId: args.config.clientId,
    clientSecret: args.config.clientSecret,
    tokenUrl: args.config.tokenUrl,
    fetchImpl: args.fetchImpl
  });

  let tokens;
  try {
    tokens = await client.exchangeCode(
      args.code,
      args.config.redirectUri,
      args.codeVerifier
    );
  } catch {
    return { ok: false, reason: "token_exchange_failed" };
  }

  let identity;
  try {
    identity = await fetchPatreonIdentity(tokens.access_token, {
      identityUrl: args.config.identityUrl,
      fetchImpl: args.fetchImpl
    });
  } catch {
    return { ok: false, reason: "identity_fetch_failed" };
  }

  let membership;
  try {
    membership = extractCampaignMembership(
      identity,
      args.config.campaignId
    );
  } catch {
    return { ok: false, reason: "campaign_mismatch" };
  }

  // Reject if this Patreon user is already linked to a different site account
  const existing = await args.store.getLinkByPatreonUser(
    args.siteId,
    membership.patreonUserId
  );
  if (existing && existing.authUserId !== args.accountId) {
    return { ok: false, reason: "patreon_user_already_linked" };
  }

  let encrypted: string;
  try {
    const crypto = new PatreonTokenEncryption(args.config.tokenKey);
    encrypted = crypto.encrypt(tokens.refresh_token);
  } catch {
    return { ok: false, reason: "encrypt_failed" };
  }

  const now = new Date().toISOString();
  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  await args.store.upsertLink({
    siteId: args.siteId,
    authUserId: args.accountId,
    patreonUserId: membership.patreonUserId,
    linkedAt: existing?.linkedAt ?? now,
    lastValidatedAt: now
  });

  await args.store.upsertCredential({
    siteId: args.siteId,
    authUserId: args.accountId,
    patreonUserId: membership.patreonUserId,
    encryptedRefreshToken: encrypted,
    accessTokenExpiresAt: expiresAt,
    scopes: tokens.scope ?? args.config.scopes,
    updatedAt: now
  });

  await args.store.upsertEntitlementSnapshot(
    buildPatreonEntitlementSnapshot({
      siteId: args.siteId,
      authUserId: args.accountId,
      tierIds: membership.tierIds,
      observedAt: now
    })
  );

  return {
    ok: true,
    patreonUserId: membership.patreonUserId,
    tierIds: membership.tierIds
  };
}

export type RefreshAndRelinkArgs = {
  config: CreatorOAuthConfig;
  store: PatreonLinkStore;
  siteId: string;
  accountId: string;
  fetchImpl?: typeof fetch;
};

/**
 * Decrypt stored refresh token → refresh → re-validate campaign → update snapshot.
 */
export async function refreshAndRelink(
  args: RefreshAndRelinkArgs
): Promise<LinkFromCallbackResult> {
  const cred = await args.store.getCredential(args.siteId, args.accountId);
  if (!cred) {
    return { ok: false, reason: "no_credential" };
  }

  let refreshPlain: string;
  try {
    const crypto = new PatreonTokenEncryption(args.config.tokenKey);
    refreshPlain = crypto.decrypt(cred.encryptedRefreshToken);
  } catch {
    return { ok: false, reason: "decrypt_failed" };
  }

  const client = new PatreonClient({
    clientId: args.config.clientId,
    clientSecret: args.config.clientSecret,
    tokenUrl: args.config.tokenUrl,
    fetchImpl: args.fetchImpl
  });

  let tokens;
  try {
    tokens = await client.refreshToken(refreshPlain);
  } catch {
    return { ok: false, reason: "refresh_failed" };
  }

  let identity;
  try {
    identity = await fetchPatreonIdentity(tokens.access_token, {
      identityUrl: args.config.identityUrl,
      fetchImpl: args.fetchImpl
    });
  } catch {
    return { ok: false, reason: "identity_fetch_failed" };
  }

  let membership;
  try {
    membership = extractCampaignMembership(
      identity,
      args.config.campaignId
    );
  } catch {
    return { ok: false, reason: "campaign_mismatch" };
  }

  let encrypted: string;
  try {
    const crypto = new PatreonTokenEncryption(args.config.tokenKey);
    encrypted = crypto.encrypt(tokens.refresh_token);
  } catch {
    return { ok: false, reason: "encrypt_failed" };
  }

  const now = new Date().toISOString();
  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  const existingLink = await args.store.getLinkByUser(
    args.siteId,
    args.accountId
  );

  await args.store.upsertLink({
    siteId: args.siteId,
    authUserId: args.accountId,
    patreonUserId: membership.patreonUserId,
    linkedAt: existingLink?.linkedAt ?? now,
    lastValidatedAt: now
  });

  await args.store.upsertCredential({
    siteId: args.siteId,
    authUserId: args.accountId,
    patreonUserId: membership.patreonUserId,
    encryptedRefreshToken: encrypted,
    accessTokenExpiresAt: expiresAt,
    scopes: tokens.scope ?? cred.scopes,
    updatedAt: now
  });

  await args.store.upsertEntitlementSnapshot(
    buildPatreonEntitlementSnapshot({
      siteId: args.siteId,
      authUserId: args.accountId,
      tierIds: membership.tierIds,
      observedAt: now,
      reason: "Patreon OAuth refresh revalidated campaign membership."
    })
  );

  return {
    ok: true,
    patreonUserId: membership.patreonUserId,
    tierIds: membership.tierIds
  };
}
