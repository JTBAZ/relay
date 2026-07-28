/**
 * @fileoverview Server-authoritative account capability projection for `/me/session`.
 * @description Additive Unified Relay Identity contract: surfaces, studios[], activity,
 * Patreon connection health (redacted), suggested_home. Never includes tokens/secrets.
 * @see ./meaningful-supporter-signal.js
 * @see ./active-role-available.js
 */

import type { PrismaClient } from "@prisma/client";
import { CredentialHealth, OAuthPurpose, ProviderKind, UserKind } from "@prisma/client";
import { hasMeaningfulSupporterActivity } from "./meaningful-supporter-signal.js";
import type { ActiveRole } from "./active-role-default.js";

export type PatreonConnectionHealth = "none" | "healthy" | "degraded" | "reconnect_required";

export type AccountStudioProjection = {
  relay_creator_id: string;
  /** Always true for entries in studios[] today (single primary studio). */
  is_primary: boolean;
};

export type AccountSessionCapabilities = {
  /** Compatibility: Account.primaryRelayCreatorId */
  primary_relay_creator_id: string | null;
  /** Forward-compatible list; currently 0–1 entries. */
  studios: AccountStudioProjection[];
  surfaces: {
    /** Every authenticated Account may enter Feed. */
    feed: true;
    /** Studio shell when server-verified ownership exists. */
    studio: boolean;
  };
  activity: {
    has_supporter_activity: boolean;
  };
  patreon: {
    identity_linked: boolean;
    identity_health: PatreonConnectionHealth;
    creator_sync_connected: boolean;
    creator_sync_health: PatreonConnectionHealth;
  };
  /**
   * Suggested post-auth landing. UI lens only — not an authz claim.
   * Prefer studio when owned; otherwise feed.
   */
  suggested_home: "/studio" | "/feed";
};

function mapCredentialHealth(
  linked: boolean,
  health: CredentialHealth | null | undefined
): PatreonConnectionHealth {
  if (!linked) return "none";
  if (health === CredentialHealth.healthy) return "healthy";
  if (health === CredentialHealth.degraded) return "reconnect_required";
  return "degraded";
}

/**
 * Build additive capability projection for an Account.
 * Safe to call with partial Prisma stubs in tests (returns conservative defaults on query failure).
 */
export async function buildAccountSessionCapabilities(
  prisma: PrismaClient,
  accountId: string
): Promise<AccountSessionCapabilities> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      primaryRelayCreatorId: true,
      patronPatreonUserId: true,
      patronOAuthCredential: {
        select: { healthStatus: true }
      }
    }
  });

  const primary = account?.primaryRelayCreatorId?.trim() || null;
  const studios: AccountStudioProjection[] = primary
    ? [{ relay_creator_id: primary, is_primary: true }]
    : [];

  let hasSupporterActivity = false;
  try {
    hasSupporterActivity = await hasMeaningfulSupporterActivity(prisma, accountId);
  } catch {
    hasSupporterActivity = false;
  }

  const identityLinked = Boolean(account?.patronPatreonUserId);
  const identityHealth = mapCredentialHealth(
    identityLinked,
    account?.patronOAuthCredential?.healthStatus
  );

  let creatorSyncConnected = false;
  let creatorSyncHealth: PatreonConnectionHealth = "none";
  if (primary) {
    try {
      const cred = await prisma.oAuthCredential.findFirst({
        where: {
          purpose: OAuthPurpose.creator_ingest,
          providerAccount: {
            provider: ProviderKind.patreon,
            user: {
              kind: UserKind.creator,
              tenant: { relayCreatorId: primary }
            }
          }
        },
        select: { healthStatus: true },
        orderBy: { updatedAt: "desc" }
      });
      creatorSyncConnected = Boolean(cred);
      creatorSyncHealth = mapCredentialHealth(Boolean(cred), cred?.healthStatus);
    } catch {
      creatorSyncConnected = false;
      creatorSyncHealth = "none";
    }
  }

  const suggestedHome: "/studio" | "/feed" = primary ? "/studio" : "/feed";

  return {
    primary_relay_creator_id: primary,
    studios,
    surfaces: {
      feed: true,
      studio: Boolean(primary)
    },
    activity: {
      has_supporter_activity: hasSupporterActivity
    },
    patreon: {
      identity_linked: identityLinked,
      identity_health: identityHealth,
      creator_sync_connected: creatorSyncConnected,
      creator_sync_health: creatorSyncHealth
    },
    suggested_home: suggestedHome
  };
}

/**
 * Derive available UI roles from capabilities (compatibility with PE-I RoleSwitcher).
 * Supporter role listed only when meaningful supporter activity exists — not platform bootstrap alone.
 */
export function availableRolesFromCapabilities(
  caps: AccountSessionCapabilities
): ActiveRole[] {
  const roles: ActiveRole[] = [];
  if (caps.surfaces.studio) roles.push("creator");
  if (caps.activity.has_supporter_activity) roles.push("supporter");
  return roles;
}
