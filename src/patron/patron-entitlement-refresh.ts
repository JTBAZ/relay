/**
 * @fileoverview Patron experience module patron-entitlement-refresh.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import { EntitlementSource, type PrismaClient } from "@prisma/client";
import type { PatreonClient } from "../auth/patreon-client.js";
import { getPatronOAuthTokensForAccount } from "../auth/patron-oauth-credential-store.js";
import type { TokenEncryption } from "../lib/crypto.js";
import { upsertPatronEntitlementSnapshot } from "../identity/patron-entitlement-snapshot.js";
import { refreshPatronOAuthTokensWithStoredRefreshToken } from "../patreon/patron-oauth-refresh.js";
import {
  extractPatronSyncFromIdentity,
  fetchPatronIdentity,
  type PatreonIdentityDocument
} from "../patreon/patreon-user-identity.js";

async function resolvePatreonCampaignNumericId(
  prisma: PrismaClient,
  relayCreatorId: string,
  snapshotCampaignId: string | null | undefined
): Promise<string | null> {
  const explicit = snapshotCampaignId?.trim();
  if (explicit) return explicit;
  const cp = await prisma.creatorProfile.findFirst({
    where: { tenant: { relayCreatorId } },
    select: { patreonCampaignId: true }
  });
  return cp?.patreonCampaignId?.trim() ?? null;
}

function identityHttpErrorIndicatesAuthFailure(message: string): boolean {
  return /\(\s*401\s*\)/.test(message) || /\(\s*403\s*\)/.test(message);
}

/**
 * PE-H — Re-materialize one `PatronEntitlementSnapshot` using the patron's stored OAuth tokens
 * (`PatronOAuthCredential`). Call from stale-scan workers or (later) webhook-driven jobs.
 * Writes {@link EntitlementSource.scheduled_refresh} or `webhook` via `source`.
 */
export async function refreshPatronEntitlementSnapshotFromPatreon(args: {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  patronMembershipId: string;
  relayCreatorId: string;
  snapshotCampaignId: string | null;
  source: EntitlementSource;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (
    args.source !== EntitlementSource.scheduled_refresh &&
    args.source !== EntitlementSource.webhook
  ) {
    return { ok: false, reason: "invalid_source_for_refresh" };
  }

  const m = await args.prisma.tenantMembership.findUnique({
    where: { id: args.patronMembershipId },
    select: { accountId: true }
  });
  if (!m) {
    return { ok: false, reason: "membership_not_found" };
  }

  let tokens = await getPatronOAuthTokensForAccount(
    args.prisma,
    m.accountId,
    args.encryption
  );
  if (!tokens?.access_token?.trim()) {
    return { ok: false, reason: "no_credential" };
  }

  const campaignId = await resolvePatreonCampaignNumericId(
    args.prisma,
    args.relayCreatorId,
    args.snapshotCampaignId
  );
  if (!campaignId) {
    return { ok: false, reason: "no_campaign_id" };
  }

  let doc: PatreonIdentityDocument;
  try {
    doc = await fetchPatronIdentity(tokens.access_token, args.fetchImpl);
  } catch (firstErr) {
    const msg = (firstErr as Error).message;
    if (!identityHttpErrorIndicatesAuthFailure(msg)) {
      return { ok: false, reason: "identity_fetch_failed" };
    }
    const next = await refreshPatronOAuthTokensWithStoredRefreshToken({
      prisma: args.prisma,
      accountId: m.accountId,
      patreonClient: args.patreonClient,
      encryption: args.encryption
    });
    if (!next?.access_token?.trim()) {
      return { ok: false, reason: "token_refresh_failed" };
    }
    try {
      doc = await fetchPatronIdentity(next.access_token, args.fetchImpl);
    } catch {
      return { ok: false, reason: "identity_fetch_failed_after_refresh" };
    }
  }

  let sync: ReturnType<typeof extractPatronSyncFromIdentity>;
  try {
    sync = extractPatronSyncFromIdentity(doc, campaignId);
  } catch {
    return { ok: false, reason: "identity_parse_failed" };
  }

  await upsertPatronEntitlementSnapshot(args.prisma, {
    patronMembershipId: args.patronMembershipId,
    relayCreatorId: args.relayCreatorId,
    entitledTierIds: sync.tier_ids,
    source: args.source,
    campaignId: args.snapshotCampaignId
  });

  return { ok: true };
}

/**
 * PE-H — Pre-action freshness gate. Tier-gated routes (e.g. media export) call this
 * before serving content so they never act on a snapshot whose `staleAfter` has passed.
 *
 * Behaviour:
 * - No snapshot or `staleAfter <= now` → invokes {@link refreshPatronEntitlementSnapshotFromPatreon}
 *   with `source = webhook` (closest semantic match in the existing enum: a reactive,
 *   user-action-triggered refresh, as opposed to the periodic stale worker).
 * - Snapshot still fresh → no-op.
 *
 * Returns `{ refreshed }` plus, when skipped, a short `reason` for /entitlements/health metrics.
 */
export async function refreshPatronEntitlementSnapshotIfStale(args: {
  prisma: PrismaClient;
  encryption: TokenEncryption;
  patreonClient: PatreonClient;
  fetchImpl: typeof fetch;
  patronMembershipId: string;
  relayCreatorId: string;
  now?: Date;
}): Promise<{ refreshed: boolean; reason?: string }> {
  const now = args.now ?? new Date();
  const snap = await args.prisma.patronEntitlementSnapshot.findUnique({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: args.patronMembershipId,
        relayCreatorId: args.relayCreatorId
      }
    },
    select: { staleAfter: true, campaignId: true }
  });

  if (snap && snap.staleAfter && snap.staleAfter.getTime() > now.getTime()) {
    return { refreshed: false, reason: "fresh" };
  }

  const result = await refreshPatronEntitlementSnapshotFromPatreon({
    prisma: args.prisma,
    encryption: args.encryption,
    patreonClient: args.patreonClient,
    fetchImpl: args.fetchImpl,
    patronMembershipId: args.patronMembershipId,
    relayCreatorId: args.relayCreatorId,
    snapshotCampaignId: snap?.campaignId ?? null,
    source: EntitlementSource.webhook
  });

  if (result.ok) return { refreshed: true };
  return { refreshed: false, reason: result.reason };
}
