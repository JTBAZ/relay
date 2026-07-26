/**
 * P5a-ins-002 — Derive `CreatorMembershipEvent` rows from a Patreon campaign members page + prior Relay identity.
 * Uses member resource **id** (Patreon `member.id`) as `patreon_member_id` to align with webhooks.
 */
import type { Prisma } from "@prisma/client";
import {
  CreatorMembershipEventSource,
  CreatorMembershipEventType,
  Prisma as PrismaNamespace
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export type PlannedMembershipLedgerEvent = {
  creatorId: string;
  patreonMemberId: string;
  eventType: CreatorMembershipEventType;
  occurredAt: Date;
  tierId: string | null;
  amountCents: number | null;
  payload?: Prisma.InputJsonValue;
};

export function tierSignature(tierIds: string[]): string {
  return [...tierIds].sort().join("|");
}

export function parsePledgeRelationshipStart(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  const d = new Date(raw.trim());
  return Number.isFinite(d.getTime()) ? d : null;
}

export type PlanMembershipLedgerInput = {
  creatorId: string;
  patreonMemberResourceId: string;
  patronStatus: string | null;
  newTierIds: string[];
  entitledAmountCents: number | null;
  pledgeRelationshipStart: Date | null;
  priorExisted: boolean;
  priorTierIds: string[];
  /** Max `amount_cents` among prior Patreon tiers in Relay DB, or 0 if none. */
  priorTierFloorCents: number;
  batchStartedAt: Date;
};

/**
 * Computes which ledger rows to append for one member after identity is updated (or will be).
 */
export function planMembershipLedgerEvents(
  input: PlanMembershipLedgerInput
): PlannedMembershipLedgerEvent[] {
  const {
    creatorId,
    patreonMemberResourceId,
    patronStatus,
    newTierIds,
    entitledAmountCents,
    pledgeRelationshipStart,
    priorExisted,
    priorTierIds,
    priorTierFloorCents,
    batchStartedAt
  } = input;

  const isActive = patronStatus === "active_patron";
  const hadPaid = priorTierIds.length > 0;
  const newSig = tierSignature(newTierIds);
  const oldSig = tierSignature(priorTierIds);
  const primaryTier = newTierIds[0] ?? null;
  const amount = entitledAmountCents;

  const base = (
    eventType: CreatorMembershipEventType,
    occurredAt: Date,
    opts?: { payload?: Prisma.InputJsonValue }
  ): PlannedMembershipLedgerEvent => ({
    creatorId,
    patreonMemberId: patreonMemberResourceId,
    eventType,
    occurredAt,
    tierId: primaryTier,
    amountCents: amount,
    ...opts
  });

  if (isActive && newTierIds.length > 0) {
    if (!priorExisted) {
      return [
        base(
          CreatorMembershipEventType.join,
          pledgeRelationshipStart ?? batchStartedAt
        )
      ];
    }
    if (!hadPaid) {
      return [
        base(
          CreatorMembershipEventType.rejoin,
          pledgeRelationshipStart ?? batchStartedAt
        )
      ];
    }
    if (hadPaid && oldSig !== newSig) {
      const newAmt = entitledAmountCents ?? 0;
      const upgrade =
        newAmt > priorTierFloorCents
          ? true
          : newAmt < priorTierFloorCents
            ? false
            : newSig > oldSig;
      return [
        base(
          upgrade
            ? CreatorMembershipEventType.upgrade
            : CreatorMembershipEventType.downgrade,
          batchStartedAt,
          {
            payload: {
              from_tiers: priorTierIds,
              to_tiers: newTierIds,
              prior_floor_cents: priorTierFloorCents,
              entitled_cents: newAmt
            }
          }
        )
      ];
    }
    return [];
  }

  if (hadPaid) {
    return [
      base(CreatorMembershipEventType.cancel, batchStartedAt, {
        payload: { prior_tiers: priorTierIds }
      })
    ];
  }

  return [];
}

export async function maxTierFloorCentsForCreator(
  prisma: PrismaClient,
  creatorId: string,
  relayTierIds: string[]
): Promise<number> {
  if (relayTierIds.length === 0) {
    return 0;
  }
  const rows = await prisma.tier.findMany({
    where: { creatorId, relayTierId: { in: relayTierIds } },
    select: { amountCents: true }
  });
  const amounts = rows
    .map((r) => r.amountCents)
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (amounts.length === 0) {
    return 0;
  }
  return Math.max(...amounts);
}

/** One query per member sync — tier floors for upgrade/downgrade comparison. */
export async function loadCreatorTierAmountMap(
  prisma: PrismaClient,
  creatorId: string
): Promise<Map<string, number>> {
  const rows = await prisma.tier.findMany({
    where: { creatorId },
    select: { relayTierId: true, amountCents: true }
  });
  const m = new Map<string, number>();
  for (const t of rows) {
    if (t.amountCents != null && Number.isFinite(t.amountCents)) {
      m.set(t.relayTierId, t.amountCents);
    }
  }
  return m;
}

export function maxTierFloorFromMap(
  map: Map<string, number>,
  relayTierIds: string[]
): number {
  if (relayTierIds.length === 0) {
    return 0;
  }
  const nums = relayTierIds
    .map((id) => map.get(id))
    .filter((n): n is number => n != null && n > 0);
  return nums.length ? Math.max(...nums) : 0;
}

export async function appendMembershipLedgerEvents(
  prisma: PrismaClient,
  events: PlannedMembershipLedgerEvent[]
): Promise<void> {
  for (const row of events) {
    try {
      await prisma.creatorMembershipEvent.create({
        data: {
          creatorId: row.creatorId,
          patreonMemberId: row.patreonMemberId,
          eventType: row.eventType,
          occurredAt: row.occurredAt,
          tierId: row.tierId,
          amountCents: row.amountCents,
          source: CreatorMembershipEventSource.sync,
          payload: row.payload
        }
      });
    } catch (e) {
      if (
        e instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
}
