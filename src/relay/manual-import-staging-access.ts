/**
 * @fileoverview Manual Relay Import upload staging — canonical Patreon / SubscribeStar access keys (`patreon_tier_*`, `substar_tier_*`).
 * @see prisma/schema.prisma `MediaAsset.manualImportStagingJson`, `Tier.manualUploadAccessRelayTierId`
 */

import type { PrismaClient } from "@prisma/client";

/** Aligned with `MANUAL_RELAY_TIER_PREFIX` / `manual-import-catalog.ts` — keep in sync manually to avoid cyclic imports. */
const MANUAL_RELAY_TIER_ALIAS = "relay_manual_tier_" as const;
const MANUAL_RELAY_CAMPAIGN_ALIAS = "relay_manual_campaign_" as const;

export const MANUAL_IMPORT_STAGING_CONTRACT_VERSION = 1 as const;

export type ManualImportStagingProviderKind = "patreon" | "subscribestar";

export type ManualImportStagingAccessPayload = {
  v: typeof MANUAL_IMPORT_STAGING_CONTRACT_VERSION;
  provider: ManualImportStagingProviderKind;
  /** Canonical relay access key enforced at publish time (`patreon_tier_*` / `substar_tier_*`). */
  provider_tier_relay_id: string;
  /** Prisma `Tier.id` of the creator's folder row (typically `relay_manual_tier_*`). */
  bin_prisma_tier_id: string;
  /** Relay-tier key saved on `Tier.relayTierId` for this folder. */
  bin_relay_tier_id: string;
  /** Human-readable label for UX (tier title). */
  bin_title: string;
  /** Null while the Manual Import page owns the upload; set when the creator commits it to Library. */
  committed_to_library_at: string | null;
};

export function isProviderLinkedRelayTierId(relayTierId: string): boolean {
  const t = relayTierId.trim();
  return t.startsWith("patreon_tier_") || t.startsWith("substar_tier_");
}

export function inferManualImportStagingProviderFromRelayTierId(relayTierId: string): "patreon" | "subscribestar" {
  const t = relayTierId.trim();
  if (t.startsWith("patreon_tier_")) return "patreon";
  return "subscribestar";
}

/**
 * Validates `tier_id` is an upload folder for Manual Import (`relay_manual_*` campaign/tier namespaces)
 * and resolves provider access from synced relay keys or explicit link on manual folders.
 *
 * Caller must authenticate studio before invoking.
 */
export async function resolveManualImportUploadStagingPayload(
  prisma: PrismaClient,
  creatorId: string,
  binTierPrismaId: string
): Promise<{ ok: true; payload: ManualImportStagingAccessPayload } | { ok: false; message: string }> {
  const cleanBinId = binTierPrismaId.trim();
  if (!cleanBinId) {
    return { ok: false, message: "manual_import_bin_tier_id is required when linking uploads to a Manual Import bin." };
  }

  const folder = await prisma.tier.findFirst({
    where: { id: cleanBinId, creatorId },
    select: {
      id: true,
      relayTierId: true,
      title: true,
      manualUploadAccessRelayTierId: true,
      campaignId: true,
      creatorId: true
    }
  });
  if (!folder) {
    return { ok: false, message: "Unknown bin tier row for this studio." };
  }

  /** Must be a Relay-owned Manual Import tier folder (`relay_manual_tier_*`). */
  if (!folder.relayTierId.startsWith(MANUAL_RELAY_TIER_ALIAS)) {
    return { ok: false, message: "Upload bins must use Manual Relay folders (relay_manual_tier_*)." };
  }
  const campaignOk = typeof folder.campaignId === "string" && folder.campaignId.startsWith(MANUAL_RELAY_CAMPAIGN_ALIAS);
  if (!campaignOk) {
    return { ok: false, message: "Bin tier row is not scoped to Manual Relay Import." };
  }

  const linkedAccess = folder.manualUploadAccessRelayTierId?.trim() ?? "";
  if (!linkedAccess) {
    return {
      ok: false,
      message:
        'Link this folder to a real Patreon or SubscribeStar tier first (saved under Manual Import bins), then uploads unlock for "must match provider" access.'
    };
  }

  if (!isProviderLinkedRelayTierId(linkedAccess)) {
    return { ok: false, message: "Linked tier id must start with patreon_tier_ or substar_tier_." };
  }

  const accessRow = await prisma.tier.findFirst({
    where: { creatorId, relayTierId: linkedAccess },
    select: { id: true, relayTierId: true }
  });
  if (!accessRow || accessRow.relayTierId !== linkedAccess) {
    return {
      ok: false,
      message:
        "Linked tier id must exist as a synced provider tier for this creator. OAuth/sync must populate real tier rows before uploads."
    };
  }

  const provider = inferManualImportStagingProviderFromRelayTierId(linkedAccess);

  return {
    ok: true,
    payload: {
      v: MANUAL_IMPORT_STAGING_CONTRACT_VERSION,
      provider,
      provider_tier_relay_id: linkedAccess,
      bin_prisma_tier_id: folder.id,
      bin_relay_tier_id: folder.relayTierId,
      bin_title: folder.title,
      committed_to_library_at: null
    }
  };
}
