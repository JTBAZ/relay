import { EntitlementSource, IdentityAuthProvider, TenantRole, type PrismaClient } from "@prisma/client";
import { advancePatreonIdentityFence } from "./patreon-identity-fence.js";
export { advancePatreonIdentityFence, assertPatreonIdentityObservation } from "./patreon-identity-fence.js";
import { getPlatformRelayCreatorId } from "./platform-tenant.js";
import { upsertPlatformPatronEntitlementProjection, upsertPatronEntitlementSnapshot } from "./patron-entitlement-snapshot.js";

/** Unlink shares identity → sorted creator lock order with member, OAuth and purge writers. */
export async function unlinkPatreonAccount(prisma: PrismaClient, accountId: string) {
  return prisma.$transaction(async (tx) => {
    const binding = await tx.account.findUnique({ where: { id: accountId }, select: { patronPatreonUserId: true } });
    if (binding?.patronPatreonUserId) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`patreon-identity:${binding.patronPatreonUserId}`}, 0))`;
    const memberships = await tx.tenantMembership.findMany({ where: { accountId, role: TenantRole.patron }, include: { tenant: true } });
    const snapshots = await tx.patronEntitlementSnapshot.findMany({ where: { patronMembershipId: { in: memberships.map((row) => row.id) } }, select: { patronMembershipId: true, relayCreatorId: true, entitledTierIds: true, campaignId: true } });
    const creators = [...new Set([...memberships.map((row) => row.tenant.relayCreatorId), ...snapshots.map((row) => row.relayCreatorId)].filter((id): id is string => Boolean(id)))].sort();
    for (const creatorId of creators) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`entitlements:${creatorId}`}, 0))`;
    }
    const fence = binding?.patronPatreonUserId ? await advancePatreonIdentityFence(tx, binding.patronPatreonUserId) : undefined;
    const credResult = await tx.patronOAuthCredential.deleteMany({ where: { accountId } });
    let snapshotCount = 0;
    for (const membership of memberships) {
      const creatorId = membership.tenant.relayCreatorId;
      if (!creatorId) continue;
      await upsertPatronEntitlementSnapshot(tx, { inTransaction: true, patronMembershipId: membership.id, relayCreatorId: creatorId,
        entitledTierIds: [], crossProviderMergeSource: "patreon", source: EntitlementSource.manual_support, patreonObservation: fence });
      await tx.patronEntitlementSnapshot.updateMany({ where: { patronMembershipId: membership.id, relayCreatorId: creatorId }, data: { staleAfter: new Date() } });
      snapshotCount++;
    }
    for (const snapshot of snapshots) {
      const anchor = memberships.find((row) => row.id === snapshot.patronMembershipId);
      if (anchor?.tenant.relayCreatorId !== getPlatformRelayCreatorId()) continue;
      // Creator-bound writes above have already mirrored their accepted result.
      if (!memberships.some((row) => row.tenant.relayCreatorId === snapshot.relayCreatorId)) {
        await upsertPlatformPatronEntitlementProjection(tx, { inTransaction: true, patronMembershipId: snapshot.patronMembershipId,
          relayCreatorId: snapshot.relayCreatorId, campaignId: snapshot.campaignId,
          entitledTierIds: snapshot.entitledTierIds.filter((id) => !id.startsWith("patreon_tier_")) });
        snapshotCount++;
      }
      await tx.patronEntitlementSnapshot.updateMany({ where: { patronMembershipId: snapshot.patronMembershipId, relayCreatorId: snapshot.relayCreatorId }, data: { staleAfter: new Date() } });
    }
    await tx.account.update({ where: { id: accountId }, data: { patronPatreonUserId: null, identityAuthProvider: IdentityAuthProvider.independent } });
    return { credResult, snapshotCount };
  });
}
