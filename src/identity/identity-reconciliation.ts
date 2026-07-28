/**
 * @fileoverview Identity reconciliation audit + studio claim helpers (Unified Relay Identity).
 * @description Never merges accounts by email alone. Records append-only IdentityAuditEvent rows.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { IdentityAuditOutcome, ProviderKind, UserKind } from "@prisma/client";
import { getPlatformRelayCreatorId } from "./platform-tenant.js";

export type IdentityAuditFinding = {
  kind:
    | "split_patreon_identity"
    | "studio_missing_creator_oauth"
    | "patreon_linked_no_studio_owned_campaign"
    | "duplicate_campaign_mapping";
  severity: "info" | "warn" | "conflict";
  accountId?: string | null;
  relayCreatorId?: string | null;
  patreonUserId?: string | null;
  patreonCampaignId?: string | null;
  detail: string;
  before?: Record<string, unknown>;
};

export async function recordIdentityAuditEvent(
  prisma: PrismaClient,
  args: {
    accountId?: string | null;
    actorAccountId?: string | null;
    relayCreatorId?: string | null;
    patreonCampaignId?: string | null;
    outcome: IdentityAuditOutcome;
    reason: string;
    beforeJson?: Prisma.InputJsonValue;
    afterJson?: Prisma.InputJsonValue;
    traceId?: string | null;
  }
): Promise<void> {
  await prisma.identityAuditEvent.create({
    data: {
      accountId: args.accountId ?? null,
      actorAccountId: args.actorAccountId ?? null,
      relayCreatorId: args.relayCreatorId ?? null,
      patreonCampaignId: args.patreonCampaignId ?? null,
      outcome: args.outcome,
      reason: args.reason,
      beforeJson: args.beforeJson,
      afterJson: args.afterJson,
      traceId: args.traceId ?? null
    }
  });
}

/**
 * Read-only identity audit. Does not mutate ownership.
 */
export async function auditIdentityOwnership(
  prisma: PrismaClient
): Promise<IdentityAuditFinding[]> {
  const findings: IdentityAuditFinding[] = [];
  const platformId = getPlatformRelayCreatorId();

  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      patronPatreonUserId: true,
      primaryRelayCreatorId: true,
      emailNorm: true
    }
  });

  for (const account of accounts) {
    const pid = account.patronPatreonUserId?.trim();
    if (!pid) continue;

    const providerAccounts = await prisma.providerAccount.findMany({
      where: {
        provider: ProviderKind.patreon,
        providerUserId: pid,
        user: { kind: UserKind.creator }
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            tenant: { select: { relayCreatorId: true } }
          }
        }
      }
    });

    for (const pa of providerAccounts) {
      const studioId = pa.user.tenant.relayCreatorId;
      if (!studioId || studioId === platformId) continue;
      if (account.primaryRelayCreatorId !== studioId) {
        const owner = await prisma.account.findFirst({
          where: { primaryRelayCreatorId: studioId },
          select: { id: true }
        });
        findings.push({
          kind: "split_patreon_identity",
          severity: owner && owner.id !== account.id ? "conflict" : "warn",
          accountId: account.id,
          relayCreatorId: studioId,
          patreonUserId: pid,
          detail:
            owner && owner.id !== account.id
              ? "Patreon user id is linked on Account but creator ProviderAccount belongs to a studio owned by another Account."
              : "Patreon user id is linked on Account but primaryRelayCreatorId does not match the creator ProviderAccount studio.",
          before: {
            account_id: account.id,
            primary_relay_creator_id: account.primaryRelayCreatorId,
            provider_studio_id: studioId,
            studio_owner_account_id: owner?.id ?? null
          }
        });
      }
    }

    if (account.primaryRelayCreatorId) {
      const cred = await prisma.oAuthCredential.findFirst({
        where: {
          purpose: "creator_ingest",
          providerAccount: {
            provider: ProviderKind.patreon,
            user: {
              kind: UserKind.creator,
              tenant: { relayCreatorId: account.primaryRelayCreatorId }
            }
          }
        },
        select: { id: true }
      });
      if (!cred) {
        findings.push({
          kind: "studio_missing_creator_oauth",
          severity: "warn",
          accountId: account.id,
          relayCreatorId: account.primaryRelayCreatorId,
          patreonUserId: pid,
          detail: "Studio owner has no creator_ingest OAuthCredential."
        });
      }
    }
  }

  const campaigns = await prisma.creatorProfile.groupBy({
    by: ["patreonCampaignId"],
    where: { patreonCampaignId: { not: null } },
    _count: { patreonCampaignId: true }
  });
  for (const row of campaigns) {
    if (!row.patreonCampaignId || row._count.patreonCampaignId <= 1) continue;
    findings.push({
      kind: "duplicate_campaign_mapping",
      severity: "conflict",
      patreonCampaignId: row.patreonCampaignId,
      detail: `Patreon campaign ${row.patreonCampaignId} is mapped to ${row._count.patreonCampaignId} CreatorProfile rows.`
    });
  }

  return findings;
}

export type StudioClaimResult =
  | { outcome: "already_correct"; relayCreatorId: string }
  | { outcome: "safe_claim"; relayCreatorId: string }
  | { outcome: "conflict"; message: string; conflictingAccountId?: string | null }
  | { outcome: "insufficient_proof"; message: string };

/**
 * Explicit studio claim from a mapped owned Patreon campaign.
 * Never claims by email alone — requires account.patronPatreonUserId and CreatorProfile mapping.
 */
export async function claimStudioFromPatreonOwnership(
  prisma: PrismaClient,
  args: {
    accountId: string;
    relayCreatorId: string;
    actorAccountId?: string | null;
    traceId?: string | null;
    dryRun?: boolean;
  }
): Promise<StudioClaimResult> {
  const account = await prisma.account.findUnique({
    where: { id: args.accountId },
    select: {
      id: true,
      patronPatreonUserId: true,
      primaryRelayCreatorId: true
    }
  });
  if (!account?.patronPatreonUserId) {
    return {
      outcome: "insufficient_proof",
      message: "Link Patreon identity before claiming a studio."
    };
  }

  const target = args.relayCreatorId.trim();
  if (!target) {
    return { outcome: "insufficient_proof", message: "relay_creator_id is required." };
  }

  if (account.primaryRelayCreatorId === target) {
    await recordIdentityAuditEvent(prisma, {
      accountId: account.id,
      actorAccountId: args.actorAccountId ?? account.id,
      relayCreatorId: target,
      outcome: args.dryRun ? IdentityAuditOutcome.dry_run : IdentityAuditOutcome.already_correct,
      reason: "Account already owns this studio.",
      beforeJson: { primary_relay_creator_id: account.primaryRelayCreatorId },
      afterJson: { primary_relay_creator_id: target },
      traceId: args.traceId
    });
    return { outcome: "already_correct", relayCreatorId: target };
  }

  if (account.primaryRelayCreatorId && account.primaryRelayCreatorId !== target) {
    return {
      outcome: "conflict",
      message: "This account already owns a different studio. Contact support to transfer ownership.",
      conflictingAccountId: account.id
    };
  }

  const profile = await prisma.creatorProfile.findFirst({
    where: {
      tenant: { relayCreatorId: target },
      user: { kind: UserKind.creator }
    },
    select: {
      patreonCampaignId: true,
      user: {
        select: {
          providerAccounts: {
            where: { provider: ProviderKind.patreon },
            select: { providerUserId: true }
          }
        }
      }
    }
  });
  if (!profile) {
    return {
      outcome: "insufficient_proof",
      message: "No creator profile found for that Relay studio."
    };
  }

  const providerMatches = profile.user.providerAccounts.some(
    (pa) => pa.providerUserId === account.patronPatreonUserId
  );
  if (!providerMatches && !profile.patreonCampaignId) {
    return {
      outcome: "insufficient_proof",
      message:
        "Could not verify Patreon ownership for this studio. Complete creator OAuth or ensure the campaign is mapped."
    };
  }
  if (!providerMatches && profile.patreonCampaignId) {
    // Campaign mapped but provider id not yet on ProviderAccount — still require provider match for claim.
    return {
      outcome: "insufficient_proof",
      message:
        "Patreon provider identity on the studio does not match this account’s linked Patreon user."
    };
  }

  const otherOwner = await prisma.account.findFirst({
    where: { primaryRelayCreatorId: target },
    select: { id: true }
  });
  if (otherOwner && otherOwner.id !== account.id) {
    await recordIdentityAuditEvent(prisma, {
      accountId: account.id,
      actorAccountId: args.actorAccountId ?? account.id,
      relayCreatorId: target,
      patreonCampaignId: profile.patreonCampaignId,
      outcome: IdentityAuditOutcome.conflict,
      reason: "Studio already owned by another Account.",
      beforeJson: {
        account_id: account.id,
        conflicting_account_id: otherOwner.id,
        primary_relay_creator_id: account.primaryRelayCreatorId
      },
      traceId: args.traceId
    });
    return {
      outcome: "conflict",
      message: "That Relay studio is already claimed by another account.",
      conflictingAccountId: otherOwner.id
    };
  }

  if (args.dryRun) {
    await recordIdentityAuditEvent(prisma, {
      accountId: account.id,
      actorAccountId: args.actorAccountId ?? account.id,
      relayCreatorId: target,
      patreonCampaignId: profile.patreonCampaignId,
      outcome: IdentityAuditOutcome.dry_run,
      reason: "Dry-run safe claim.",
      beforeJson: { primary_relay_creator_id: account.primaryRelayCreatorId },
      afterJson: { primary_relay_creator_id: target },
      traceId: args.traceId
    });
    return { outcome: "safe_claim", relayCreatorId: target };
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { primaryRelayCreatorId: target }
  });
  await recordIdentityAuditEvent(prisma, {
    accountId: account.id,
    actorAccountId: args.actorAccountId ?? account.id,
    relayCreatorId: target,
    patreonCampaignId: profile.patreonCampaignId,
    outcome: IdentityAuditOutcome.safe_claim,
    reason: "Claimed studio via verified Patreon provider identity.",
    beforeJson: { primary_relay_creator_id: null },
    afterJson: { primary_relay_creator_id: target },
    traceId: args.traceId
  });
  return { outcome: "safe_claim", relayCreatorId: target };
}
