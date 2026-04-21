import { EntitlementSource, type Prisma, type PrismaClient } from "@prisma/client";

/** Default window after which a snapshot should be refreshed (OAuth does not persist patron access tokens). */
export const DEFAULT_PATRON_ENTITLEMENT_STALE_MS = 6 * 60 * 60 * 1000;

export function getPatronEntitlementStaleAfterMs(): number {
  const raw = process.env.RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS?.trim();
  if (!raw) return DEFAULT_PATRON_ENTITLEMENT_STALE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PATRON_ENTITLEMENT_STALE_MS;
}

type DbLike = PrismaClient | Prisma.TransactionClient;

async function resolveCampaignId(
  prisma: DbLike,
  relayCreatorId: string,
  explicit?: string | null
): Promise<string | null> {
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return explicit;
  }
  const cp = await prisma.creatorProfile.findFirst({
    where: { tenant: { relayCreatorId } },
    select: { patreonCampaignId: true }
  });
  return cp?.patreonCampaignId ?? null;
}

/**
 * MIG-40 — After patron Patreon OAuth (or tier update from the same flow), materialize
 * **`PatronEntitlementSnapshot`** with `asOf`, `staleAfter`, and `source = oauth_exchange`.
 */
export async function upsertPatronEntitlementSnapshotForOAuth(
  prisma: DbLike,
  args: {
    patronMembershipId: string;
    relayCreatorId: string;
    entitledTierIds: string[];
    /** When set, stored on the snapshot; otherwise resolved from `CreatorProfile` for the tenant. */
    campaignId?: string | null;
    now?: Date;
  }
): Promise<void> {
  const now = args.now ?? new Date();
  const staleAfter = new Date(now.getTime() + getPatronEntitlementStaleAfterMs());
  const campaignId = await resolveCampaignId(prisma, args.relayCreatorId, args.campaignId);
  const tiers = [...args.entitledTierIds];

  await prisma.patronEntitlementSnapshot.upsert({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: args.patronMembershipId,
        relayCreatorId: args.relayCreatorId
      }
    },
    create: {
      patronMembershipId: args.patronMembershipId,
      relayCreatorId: args.relayCreatorId,
      campaignId,
      entitledTierIds: tiers,
      active: tiers.length > 0,
      source: EntitlementSource.oauth_exchange,
      asOf: now,
      staleAfter
    },
    update: {
      campaignId,
      entitledTierIds: tiers,
      active: tiers.length > 0,
      source: EntitlementSource.oauth_exchange,
      asOf: now,
      staleAfter
    }
  });
}

/**
 * After Patreon unlink: entitlement rows must not keep “fresh” Patreon-derived tiers.
 * Marks all snapshots for the given memberships inactive, empty, and immediately stale.
 */
export async function invalidatePatronEntitlementSnapshotsForMemberships(
  prisma: DbLike,
  patronMembershipIds: string[],
  now?: Date
): Promise<number> {
  if (patronMembershipIds.length === 0) return 0;
  const t = now ?? new Date();
  const result = await prisma.patronEntitlementSnapshot.updateMany({
    where: { patronMembershipId: { in: patronMembershipIds } },
    data: {
      entitledTierIds: [],
      active: false,
      staleAfter: t,
      asOf: t,
      source: EntitlementSource.manual_support
    }
  });
  return result.count;
}
