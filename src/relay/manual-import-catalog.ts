import type { PrismaClient } from "@prisma/client";
import { tierStableId } from "../ingest/canonical-store-db.js";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";
import {
  inferManualImportStagingProviderFromRelayTierId,
  isProviderLinkedRelayTierId
} from "./manual-import-staging-access.js";

export const MANUAL_RELAY_CAMPAIGN_PREFIX = "relay_manual_campaign_";
export const MANUAL_RELAY_TIER_PREFIX = "relay_manual_tier_";

const RESERVED_RELAY_TIER_IDS = new Set([
  RELAY_TIER_PUBLIC,
  RELAY_TIER_ALL_PATRONS,
  "relay_tier_public",
  "relay_tier_all_patrons"
]);

export class ManualImportCatalogError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "ManualImportCatalogError";
  }
}

export type ManualImportBinInput = {
  name: string;
  amountCents?: number | null;
  sourceHint?: string | null;
  /** Canonical provider relay-tier id (`patreon_tier_*`, `substar_tier_*`) this folder mirrors for uploads. */
  linked_provider_relay_tier_id?: string | null;
};

/** API DTO for `manual_import_staging_json` (Library staging + upload commit). Contract version equals {@link MANUAL_IMPORT_STAGING_CONTRACT_VERSION} in staging-access module. */
export type ManualImportStagingAccessDto = {
  v: number;
  provider: "patreon" | "subscribestar";
  provider_tier_relay_id: string;
  bin_prisma_tier_id: string;
  bin_relay_tier_id: string;
  bin_title: string;
};

export type ManualImportTierRow = {
  tier_id: string;
  relay_tier_id: string;
  title: string;
  amount_cents: number | null;
  source: "manual" | "synced";
  /** True only when uploads may carry matching provider-tier access metadata (OAuth/sync must have created the linked tier rows). */
  upload_enabled: boolean;
  provider: "patreon" | "subscribestar" | null;
  /** Canonical access key uploads will inherit (subset of synced relay tier ids when linked). */
  provider_tier_relay_id: string | null;
  /** For Relay-owned bins: saved link to PATREON/SUBSTAR relay tier ids; synced rows leave this null unless used as self-reference (UI uses `relay_tier_id`). */
  linked_provider_relay_tier_id: string | null;
};

export type ManualImportSetup = {
  manual_campaign: {
    campaign_id: string;
    name: string;
    ready: boolean;
  };
  manual_bins: ManualImportTierRow[];
  synced_tiers: ManualImportTierRow[];
  suggestions: ManualImportTierRow[];
  upload: {
    r2_configured: boolean;
  };
};

/** Maps a Prisma Tier row into the Manual Import API shape; never invents external provider tier ids (flags come from persisted links + synced rows). */
export function tierRowToManualImportDto(
  tier: {
    id: string;
    relayTierId: string;
    title: string;
    amountCents: number | null;
    manualUploadAccessRelayTierId?: string | null;
  },
  source: "manual" | "synced"
): ManualImportTierRow {
  const linkedRaw =
    tier.manualUploadAccessRelayTierId === undefined || tier.manualUploadAccessRelayTierId === null
      ? null
      : tier.manualUploadAccessRelayTierId.trim() || null;

  if (source === "manual") {
    const upload_enabled = Boolean(linkedRaw && isProviderLinkedRelayTierId(linkedRaw));
    const providerTierRelay = upload_enabled ? linkedRaw! : null;
    return {
      tier_id: tier.id,
      relay_tier_id: tier.relayTierId,
      title: tier.title,
      amount_cents: tier.amountCents,
      source: "manual",
      upload_enabled,
      provider: upload_enabled ? inferManualImportStagingProviderFromRelayTierId(providerTierRelay!) : null,
      provider_tier_relay_id: providerTierRelay,
      linked_provider_relay_tier_id: linkedRaw
    };
  }

  const syncedKey = tier.relayTierId.trim();
  const upload_enabled = isProviderLinkedRelayTierId(syncedKey);
  const providerTierRelay = upload_enabled ? syncedKey : null;

  return {
    tier_id: tier.id,
    relay_tier_id: tier.relayTierId,
    title: tier.title,
    amount_cents: tier.amountCents,
    source: "synced",
    upload_enabled,
    provider: upload_enabled ? inferManualImportStagingProviderFromRelayTierId(syncedKey) : null,
    provider_tier_relay_id: providerTierRelay,
    linked_provider_relay_tier_id: null
  };
}

export function manualRelayCampaignId(creatorId: string): string {
  return `${MANUAL_RELAY_CAMPAIGN_PREFIX}${creatorId.trim()}`;
}

function slugifyBinName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeBinInput(input: ManualImportBinInput, index: number): {
  name: string;
  amountCents: number | null;
  relayTierId: string;
  /** `undefined`: leave existing persisted link untouched; explicit `null` clears. */
  linkedProviderRelayTierId: string | null | undefined;
} {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", `Bin ${index + 1} needs a name.`);
  }
  if (name.length > 80) {
    throw new ManualImportCatalogError(
      "VALIDATION_ERROR",
      `Bin "${name.slice(0, 24)}..." is too long. Keep bin names under 80 characters.`
    );
  }
  const slug = slugifyBinName(name);
  if (!slug) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", `Bin "${name}" needs letters or numbers.`);
  }
  const amount =
    input.amountCents === null || input.amountCents === undefined ? null : Number(input.amountCents);
  if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000)) {
    throw new ManualImportCatalogError(
      "VALIDATION_ERROR",
      `Bin "${name}" has an invalid price. Use whole cents between 0 and 1000000.`
    );
  }

  let linkedProviderRelayTierId: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(input, "linked_provider_relay_tier_id")) {
    const lp = input.linked_provider_relay_tier_id;
    if (lp === null) {
      linkedProviderRelayTierId = null;
    } else if (typeof lp === "string") {
      linkedProviderRelayTierId = lp.trim() || null;
    } else {
      linkedProviderRelayTierId = null;
    }
  } else {
    linkedProviderRelayTierId = undefined;
  }

  const relayTierId = `${MANUAL_RELAY_TIER_PREFIX}${slug}`;
  if (RESERVED_RELAY_TIER_IDS.has(relayTierId)) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", `Bin "${name}" uses a reserved tier key.`);
  }
  return { name, amountCents: amount, relayTierId, linkedProviderRelayTierId };
}

export async function ensureManualRelayCampaign(
  prisma: PrismaClient,
  creatorId: string
): Promise<{ id: string; name: string }> {
  const cleanCreatorId = creatorId.trim();
  if (!cleanCreatorId) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", "creator_id is required.");
  }
  const id = manualRelayCampaignId(cleanCreatorId);
  const now = new Date();
  const row = await prisma.campaign.upsert({
    where: { id },
    create: {
      id,
      creatorId: cleanCreatorId,
      name: "Manual Relay Import",
      upstreamUpdatedAt: now,
      versionSeq: 1
    },
    update: {
      name: "Manual Relay Import",
      upstreamUpdatedAt: now
    },
    select: { id: true, name: true }
  });
  return row;
}

export async function upsertManualTierBins(
  prisma: PrismaClient,
  creatorId: string,
  bins: ManualImportBinInput[]
): Promise<ManualImportTierRow[]> {
  const cleanCreatorId = creatorId.trim();
  if (!cleanCreatorId) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", "creator_id is required.");
  }
  if (!Array.isArray(bins) || bins.length === 0) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", "Add at least one access bin.");
  }
  if (bins.length > 12) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", "Manual import supports up to 12 bins.");
  }

  const normalized = bins.map(normalizeBinInput);
  const seen = new Set<string>();
  for (const bin of normalized) {
    if (seen.has(bin.relayTierId)) {
      throw new ManualImportCatalogError(
        "VALIDATION_ERROR",
        `Two bins resolve to the same key: ${bin.name}. Rename one of them.`
      );
    }
    seen.add(bin.relayTierId);
  }

  for (let i = 0; i < normalized.length; i++) {
    const bin = normalized[i]!;
    const linked = bin.linkedProviderRelayTierId;
    if (linked === undefined || linked === null) {
      continue;
    }
    if (!isProviderLinkedRelayTierId(linked)) {
      throw new ManualImportCatalogError(
        "VALIDATION_ERROR",
        `Bin "${bin.name}": linked Patreon / SubscribeStar tier id must start with patreon_tier_ or substar_tier_.`
      );
    }
    if (linked.startsWith(MANUAL_RELAY_TIER_PREFIX)) {
      throw new ManualImportCatalogError(
        "VALIDATION_ERROR",
        `Bin "${bin.name}": link a synced provider tier, not another Relay-owned manual folder.`
      );
    }
    const providerRow = await prisma.tier.findFirst({
      where: { creatorId: cleanCreatorId, relayTierId: linked },
      select: { id: true, relayTierId: true }
    });
    if (!providerRow || providerRow.relayTierId !== linked) {
      throw new ManualImportCatalogError(
        "PROVIDER_LINK_MISSING",
        `Bin "${bin.name}": Relay has no synced tier row matching ${linked}. Connect Patreon / SubscribeStar and complete tier sync before linking.`,
        422
      );
    }
  }

  const conflicting = await prisma.tier.findMany({
    where: {
      creatorId: cleanCreatorId,
      relayTierId: { in: normalized.map((b) => b.relayTierId) }
    },
    select: { relayTierId: true, providerTierId: true }
  });
  const externalConflict = conflicting.find((tier) => !tier.providerTierId.startsWith(MANUAL_RELAY_TIER_PREFIX));
  if (externalConflict) {
    throw new ManualImportCatalogError(
      "TIER_COLLISION",
      `A synced tier already uses ${externalConflict.relayTierId}. Rename the manual bin.`
    );
  }

  const campaign = await ensureManualRelayCampaign(prisma, cleanCreatorId);
  const now = new Date();
  const rows: ManualImportTierRow[] = [];
  for (const bin of normalized) {
    const id = tierStableId(cleanCreatorId, bin.relayTierId);
    const row = await prisma.tier.upsert({
      where: { id },
      create: {
        id,
        creatorId: cleanCreatorId,
        relayTierId: bin.relayTierId,
        providerTierId: bin.relayTierId,
        campaignId: campaign.id,
        manualUploadAccessRelayTierId:
          bin.linkedProviderRelayTierId === undefined ? null : bin.linkedProviderRelayTierId,
        title: bin.name,
        amountCents: bin.amountCents,
        upstreamUpdatedAt: now,
        versionSeq: 1
      },
      update: {
        title: bin.name,
        amountCents: bin.amountCents,
        campaignId: campaign.id,
        upstreamUpdatedAt: now,
        ...(bin.linkedProviderRelayTierId !== undefined
          ? { manualUploadAccessRelayTierId: bin.linkedProviderRelayTierId }
          : {})
      },
      select: {
        id: true,
        relayTierId: true,
        title: true,
        amountCents: true,
        manualUploadAccessRelayTierId: true
      }
    });
    rows.push(tierRowToManualImportDto(row, "manual"));
  }
  return rows;
}

export async function getManualImportSetup(
  prisma: PrismaClient,
  creatorId: string,
  r2Configured: boolean
): Promise<ManualImportSetup> {
  const cleanCreatorId = creatorId.trim();
  if (!cleanCreatorId) {
    throw new ManualImportCatalogError("VALIDATION_ERROR", "creator_id is required.");
  }
  const campaignId = manualRelayCampaignId(cleanCreatorId);
  const [campaign, tiers] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: campaignId, creatorId: cleanCreatorId },
      select: { id: true, name: true }
    }),
    prisma.tier.findMany({
      where: {
        creatorId: cleanCreatorId,
        relayTierId: { notIn: [RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC] }
      },
      orderBy: [{ amountCents: "asc" }, { title: "asc" }],
      select: {
        id: true,
        relayTierId: true,
        providerTierId: true,
        manualUploadAccessRelayTierId: true,
        title: true,
        amountCents: true,
        campaignId: true
      }
    })
  ]);

  const manualBins = tiers
    .filter((tier) => tier.providerTierId.startsWith(MANUAL_RELAY_TIER_PREFIX))
    .map((tier) => tierRowToManualImportDto(tier, "manual"));

  const syncedTiers = tiers
    .filter((tier) => !tier.providerTierId.startsWith(MANUAL_RELAY_TIER_PREFIX))
    .map((tier) => tierRowToManualImportDto(tier, "synced"));

  return {
    manual_campaign: {
      campaign_id: campaign?.id ?? campaignId,
      name: campaign?.name ?? "Manual Relay Import",
      ready: Boolean(campaign)
    },
    manual_bins: manualBins,
    synced_tiers: syncedTiers,
    suggestions: syncedTiers.length > 0 ? syncedTiers : manualBins,
    upload: {
      r2_configured: r2Configured
    }
  };
}
