/**
 * @fileoverview Patreon-derived patron entitlement snapshots and PE-H tier-change outbox events.
 * @description Materializes `PatronEntitlementSnapshot`, emits `patron_entitlement.tier_changed` on transitions, and supports OAuth vs operational `source` attribution.
 * @see src/jsdoc-core-entities.ts
 */

import { randomUUID } from "node:crypto";
import { EntitlementSource, type Prisma, type PrismaClient } from "@prisma/client";

/** Default window after which a snapshot should be refreshed (OAuth does not persist patron access tokens). */
export const DEFAULT_PATRON_ENTITLEMENT_STALE_MS = 6 * 60 * 60 * 1000;

/** PE-H: OutboxEvent name emitted when a snapshot's tier set changes between writes. */
export const PATRON_ENTITLEMENT_TIER_CHANGED_EVENT_NAME = "patron_entitlement.tier_changed";

function sortedTiersFingerprint(ids: readonly string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join("|");
}

/**
 * @description Reads `RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS` or returns default stale window.
 * @returns {number}
 */
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
 * @description Materialize or refresh **`PatronEntitlementSnapshot`** with caller-chosen `source`
 * (`oauth_exchange`, `scheduled_refresh`, `webhook`, …). PE-H workers and webhooks must use
 * this (not {@link upsertPatronEntitlementSnapshotForOAuth}) so `/entitlements/health` metrics stay honest.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {object} args
 * @returns {Promise<void>}
 * @async
 * @throws Prisma errors on upsert/outbox failures (outbox dedupe swallows P2002).
 */
export async function upsertPatronEntitlementSnapshot(
  prisma: DbLike,
  args: {
    patronMembershipId: string;
    relayCreatorId: string;
    entitledTierIds: string[];
    source: EntitlementSource;
    /** When set, stored on the snapshot; otherwise resolved from `CreatorProfile` for the tenant. */
    campaignId?: string | null;
    now?: Date;
    /** Optional trace id for the emitted `patron_entitlement.tier_changed` event (PE-H). */
    traceId?: string;
  }
): Promise<void> {
  const now = args.now ?? new Date();
  const staleAfter = new Date(now.getTime() + getPatronEntitlementStaleAfterMs());
  const campaignId = await resolveCampaignId(prisma, args.relayCreatorId, args.campaignId);
  const tiers = [...args.entitledTierIds];

  const prior = await prisma.patronEntitlementSnapshot.findUnique({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: args.patronMembershipId,
        relayCreatorId: args.relayCreatorId
      }
    },
    select: { entitledTierIds: true, active: true }
  });

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
      source: args.source,
      asOf: now,
      staleAfter
    },
    update: {
      campaignId,
      entitledTierIds: tiers,
      active: tiers.length > 0,
      source: args.source,
      asOf: now,
      staleAfter
    }
  });

  const nextActive = tiers.length > 0;
  const priorTiers = prior?.entitledTierIds ?? [];
  const priorActive = prior?.active ?? false;
  const isCreate = prior === null;
  const tiersChanged =
    sortedTiersFingerprint(priorTiers) !== sortedTiersFingerprint(tiers);
  const activeFlipped = priorActive !== nextActive;

  // Emit only on transitions: a brand-new snapshot is not a "change" worth waking notifiers.
  if (!isCreate && (tiersChanged || activeFlipped)) {
    await emitPatronEntitlementTierChangedEvent(prisma, {
      patronMembershipId: args.patronMembershipId,
      relayCreatorId: args.relayCreatorId,
      priorTierIds: priorTiers,
      nextTierIds: tiers,
      priorActive,
      nextActive,
      source: args.source,
      occurredAt: now,
      traceId: args.traceId
    });
  }
}

async function emitPatronEntitlementTierChangedEvent(
  prisma: DbLike,
  args: {
    patronMembershipId: string;
    relayCreatorId: string;
    priorTierIds: readonly string[];
    nextTierIds: readonly string[];
    priorActive: boolean;
    nextActive: boolean;
    source: EntitlementSource;
    occurredAt: Date;
    traceId?: string;
  }
): Promise<void> {
  const eventId = `evt_${randomUUID()}`;
  const traceId = args.traceId?.trim() || `patron_entitlement_tier_changed:${args.patronMembershipId}`;
  const payload = {
    primary_id: args.patronMembershipId,
    patron_membership_id: args.patronMembershipId,
    relay_creator_id: args.relayCreatorId,
    prior_tier_ids: [...args.priorTierIds].sort((a, b) => a.localeCompare(b)),
    next_tier_ids: [...args.nextTierIds].sort((a, b) => a.localeCompare(b)),
    prior_active: args.priorActive,
    next_active: args.nextActive,
    source: args.source
  };

  try {
    await prisma.outboxEvent.create({
      data: {
        eventId,
        eventName: PATRON_ENTITLEMENT_TIER_CHANGED_EVENT_NAME,
        tenantId: args.relayCreatorId,
        primaryId: args.patronMembershipId,
        occurredAt: args.occurredAt,
        traceId,
        producer: "patron-entitlement-snapshot",
        version: "1.0",
        payload: payload as Prisma.InputJsonValue
      }
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return; // dedupe collision on (event_name, tenant_id, primary_id, occurred_at) — fine
    }
    // eslint-disable-next-line no-console -- visible when an unexpected DB error breaks event emission
    console.error("upsertPatronEntitlementSnapshot: tier_changed outbox insert failed", err);
  }
}

/**
 * @description MIG-40 / BO-CONF-C4 — OAuth path: `source = oauth_exchange`.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {object} args
 * @returns {Promise<void>}
 * @async
 */
export async function upsertPatronEntitlementSnapshotForOAuth(
  prisma: DbLike,
  args: {
    patronMembershipId: string;
    relayCreatorId: string;
    entitledTierIds: string[];
    campaignId?: string | null;
    now?: Date;
  }
): Promise<void> {
  await upsertPatronEntitlementSnapshot(prisma, {
    ...args,
    source: EntitlementSource.oauth_exchange
  });
}

/**
 * @description After Patreon unlink: mark snapshots inactive, empty tiers, and immediate stale.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {string[]} patronMembershipIds
 * @param {Date} [now]
 * @returns {Promise<number>} Row update count.
 * @async
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
