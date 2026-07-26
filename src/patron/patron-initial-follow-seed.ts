/**
 * @fileoverview Patron experience module patron-initial-follow-seed.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
import type { PatronFollowSeedSource, PrismaClient } from "@prisma/client";
import { upsertPatronFollowsForMembership } from "./patron-follow-service.js";

/**
 * PE-C — idempotent `PatronFollow` batch insert plus one `PatronFollowSeed` audit row.
 * Call from Patreon OAuth completion or a future scheduled worker (`initial_follow_worker`).
 */
export async function runPatronInitialFollowSeed(args: {
  prisma: PrismaClient;
  patronMembershipId: string;
  relayCreatorIds: readonly string[];
  source: PatronFollowSeedSource;
}): Promise<void> {
  const ids = [...new Set(args.relayCreatorIds.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return;

  await upsertPatronFollowsForMembership(args.prisma, args.patronMembershipId, ids);
  await args.prisma.patronFollowSeed.create({
    data: {
      patronMembershipId: args.patronMembershipId,
      source: args.source,
      relayCreatorIdsCount: ids.length
    }
  });
}
