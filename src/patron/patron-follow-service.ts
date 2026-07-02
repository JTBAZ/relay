/**
 * @fileoverview Patron experience module patron-follow-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import type { CreatorProfile, PrismaClient, Tier } from "@prisma/client";
import type { TierRow } from "../ingest/canonical-store.js";
import { resolvePatronEntitlementDisplayLabel } from "../gallery/tier-display-label.js";

/**
 * PE-C — Idempotent follow rows for a patron membership (`TenantMembership.id`).
 */
export async function upsertPatronFollowsForMembership(
  prisma: PrismaClient,
  patronMembershipId: string,
  relayCreatorIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(relayCreatorIds.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return;
  await prisma.patronFollow.createMany({
    data: ids.map((relayCreatorId) => ({
      patronMembershipId,
      relayCreatorId
    })),
    skipDuplicates: true
  });
}

/**
 * Patreon OAuth seed: follow every linked Relay creator except the patron's own studio
 * (PE-I — do not auto-follow your own Relay tenant).
 */
export function relayCreatorIdsForFollowSeed(args: {
  linkedRelayCreatorIds: readonly string[];
  ownedRelayCreatorId: string | null;
}): string[] {
  const owned = args.ownedRelayCreatorId?.trim() ?? "";
  const out = new Set<string>();
  for (const raw of args.linkedRelayCreatorIds) {
    const id = raw.trim();
    if (!id || id === owned) continue;
    out.add(id);
  }
  return [...out];
}

export type PatronFollowListItem = {
  relay_creator_id: string;
  created_at: string;
  creator: {
    display_name: string;
    handle: string;
    public_slug: string | null;
    avatar_url: string | null;
    discipline: string | null;
  };
  entitlement: {
    active: boolean;
    tier_ids: string[];
    tier_label: string;
    as_of: string | null;
    stale_after: string | null;
  };
};

type CreatorProfileWithTenant = CreatorProfile & {
  tenant: { relayCreatorId: string | null };
};

const CREATOR_AVATAR_PLACEHOLDER = "/placeholder.svg?height=40&width=40";

function tierToRow(t: Tier): TierRow {
  return {
    tier_id: t.relayTierId,
    creator_id: t.creatorId,
    campaign_id: t.campaignId ?? undefined,
    title: t.title,
    amount_cents: t.amountCents ?? undefined,
    upstream_updated_at: t.upstreamUpdatedAt.toISOString(),
    version_seq: t.versionSeq
  };
}

function creatorPayload(
  profile: CreatorProfile | undefined,
  relayCreatorId: string
): PatronFollowListItem["creator"] {
  const fallbackHandle = relayCreatorId.slice(0, 12) || "creator";
  const handle = profile?.username?.trim() || profile?.publicSlug?.trim() || fallbackHandle;
  const displayName =
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    profile?.publicSlug?.trim() ||
    fallbackHandle;
  return {
    display_name: displayName,
    handle,
    public_slug: profile?.publicSlug?.trim() || null,
    avatar_url: profile?.avatarUrl?.trim() || CREATOR_AVATAR_PLACEHOLDER,
    discipline: profile?.discipline?.trim() || null
  };
}

export async function listPatronFollowsForMembership(
  prisma: PrismaClient,
  patronMembershipId: string
): Promise<PatronFollowListItem[]> {
  const rows = await prisma.patronFollow.findMany({
    where: { patronMembershipId },
    orderBy: { createdAt: "asc" },
    select: { relayCreatorId: true, createdAt: true }
  });
  const relayCreatorIds = [...new Set(rows.map((r) => r.relayCreatorId.trim()).filter(Boolean))];
  const [profiles, snapshots, tiers] =
    relayCreatorIds.length > 0
      ? await Promise.all([
          prisma.creatorProfile.findMany({
            where: { tenant: { relayCreatorId: { in: relayCreatorIds } } },
            include: { tenant: { select: { relayCreatorId: true } } }
          }),
          prisma.patronEntitlementSnapshot.findMany({
            where: {
              patronMembershipId,
              relayCreatorId: { in: relayCreatorIds }
            }
          }),
          prisma.tier.findMany({
            where: { creatorId: { in: relayCreatorIds } }
          })
        ])
      : [[], [], []];

  const profilesByCreator = new Map<string, CreatorProfileWithTenant>();
  for (const profile of profiles) {
    const relayCreatorId = profile.tenant.relayCreatorId?.trim();
    if (relayCreatorId) {
      profilesByCreator.set(relayCreatorId, profile);
    }
  }
  const snapshotsByCreator = new Map(snapshots.map((snap) => [snap.relayCreatorId, snap]));
  const tiersByCreator = new Map<string, Record<string, TierRow>>();
  for (const tier of tiers) {
    const catalog = tiersByCreator.get(tier.creatorId) ?? {};
    catalog[tier.relayTierId] = tierToRow(tier);
    tiersByCreator.set(tier.creatorId, catalog);
  }

  return rows.map((r) => ({
    relay_creator_id: r.relayCreatorId,
    created_at: r.createdAt.toISOString(),
    creator: creatorPayload(profilesByCreator.get(r.relayCreatorId), r.relayCreatorId),
    entitlement: {
      active: snapshotsByCreator.get(r.relayCreatorId)?.active ?? false,
      tier_ids: snapshotsByCreator.get(r.relayCreatorId)?.entitledTierIds ?? [],
      tier_label: resolvePatronEntitlementDisplayLabel(
        snapshotsByCreator.get(r.relayCreatorId)?.entitledTierIds ?? [],
        tiersByCreator.get(r.relayCreatorId) ?? {}
      ),
      as_of: snapshotsByCreator.get(r.relayCreatorId)?.asOf.toISOString() ?? null,
      stale_after: snapshotsByCreator.get(r.relayCreatorId)?.staleAfter?.toISOString() ?? null
    }
  }));
}

export async function addPatronFollowForMembership(
  prisma: PrismaClient,
  patronMembershipId: string,
  relayCreatorId: string
): Promise<
  | {
      relay_creator_id: string;
      created: boolean;
      created_at: string;
    }
  | null
> {
  const trimmed = relayCreatorId.trim();
  if (!trimmed) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: trimmed },
    select: { id: true }
  });
  if (!tenant) {
    return null;
  }

  const existing = await prisma.patronFollow.findUnique({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId,
        relayCreatorId: trimmed
      }
    }
  });
  if (existing) {
    return {
      relay_creator_id: trimmed,
      created: false,
      created_at: existing.createdAt.toISOString()
    };
  }

  const row = await prisma.patronFollow.create({
    data: { patronMembershipId, relayCreatorId: trimmed }
  });
  return {
    relay_creator_id: trimmed,
    created: true,
    created_at: row.createdAt.toISOString()
  };
}

export async function removePatronFollowForMembership(
  prisma: PrismaClient,
  patronMembershipId: string,
  relayCreatorId: string
): Promise<boolean> {
  const trimmed = relayCreatorId.trim();
  if (!trimmed) return false;
  const r = await prisma.patronFollow.deleteMany({
    where: { patronMembershipId, relayCreatorId: trimmed }
  });
  return r.count > 0;
}
