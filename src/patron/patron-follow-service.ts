/**
 * @fileoverview Patron experience module patron-follow-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import type { PrismaClient } from "@prisma/client";

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
};

export async function listPatronFollowsForMembership(
  prisma: PrismaClient,
  patronMembershipId: string
): Promise<PatronFollowListItem[]> {
  const rows = await prisma.patronFollow.findMany({
    where: { patronMembershipId },
    orderBy: { createdAt: "asc" },
    select: { relayCreatorId: true, createdAt: true }
  });
  return rows.map((r) => ({
    relay_creator_id: r.relayCreatorId,
    created_at: r.createdAt.toISOString()
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
