/**
 * @fileoverview Patreon-derived patron entitlement snapshots and PE-H tier-change outbox events.
 * @description Materializes `PatronEntitlementSnapshot`, emits `patron_entitlement.tier_changed` on transitions, and supports OAuth vs operational `source` attribution.
 * @see src/jsdoc-core-entities.ts
 */

import { patronCredentialVersion } from "../auth/patron-oauth-credential-store.js";
import { randomUUID } from "node:crypto";
import { EntitlementSource, TenantRole, type Prisma, type PrismaClient } from "@prisma/client";

import { getPlatformRelayCreatorId } from "./platform-tenant.js";
import { assertPatreonIdentityObservation } from "./patreon-identity-fence.js";

/** Default window after which a snapshot should be refreshed (OAuth does not persist patron access tokens). */
export const DEFAULT_PATRON_ENTITLEMENT_STALE_MS = 6 * 60 * 60 * 1000;

/** PE-H: OutboxEvent name emitted when a snapshot's tier set changes between writes. */
export const PATRON_ENTITLEMENT_TIER_CHANGED_EVENT_NAME = "patron_entitlement.tier_changed";

function sortedTiersFingerprint(ids: readonly string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join("|");
}

const PATREON_TIER_PREFIX = "patreon_tier_";
const SUBSTAR_TIER_PREFIX = "substar_tier_";

/**
 * When refreshing from Patreon vs SubscribeStar independently, merge incoming API tier ids with
 * the other provider's ids already on the snapshot plus shared non-provider-prefixed relay ids.
 */
export function mergeEntitledTierIdsCrossProvider(
  priorTiers: readonly string[] | null | undefined,
  incomingTiers: readonly string[],
  incomingProvider: "patreon" | "subscribestar"
): string[] {
  const prior = priorTiers ?? [];
  const dedupe = (ids: readonly string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of ids) {
      const t = s.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  };

  const priorPatreon = prior.filter((t) => t.startsWith(PATREON_TIER_PREFIX));
  const priorSubstar = prior.filter((t) => t.startsWith(SUBSTAR_TIER_PREFIX));
  const other = prior.filter(
    (t) => !t.startsWith(PATREON_TIER_PREFIX) && !t.startsWith(SUBSTAR_TIER_PREFIX)
  );

  if (incomingProvider === "patreon") {
    return dedupe([...incomingTiers, ...priorSubstar, ...other]);
  }
  return dedupe([...incomingTiers, ...priorPatreon, ...other]);
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
    select: { patreonCampaignId: true, subscribestarProfileId: true }
  });
  if (cp?.patreonCampaignId?.trim()) {
    return cp.patreonCampaignId.trim();
  }
  if (cp?.subscribestarProfileId?.trim()) {
    const campaign = await prisma.campaign.findFirst({
      where: {
        creatorId: relayCreatorId,
        id: { startsWith: "substar_campaign_" }
      },
      select: { id: true },
      orderBy: { upstreamUpdatedAt: "desc" }
    });
    if (campaign?.id) return campaign.id;
  }
  return null;
}

/**
 * @description Materialize or refresh **`PatronEntitlementSnapshot`** with caller-chosen `source`
 * (`oauth_exchange`, `scheduled_refresh`, `webhook`, …). PE-H workers and webhooks must use
 * this (not {@link upsertPatronEntitlementSnapshotForOAuth}) so `/entitlements/health` metrics stay honest.
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {object} args
 * @returns {Promise<void>}
 * @async
 * @throws Prisma errors on upsert/outbox failures (outbox duplicates use conflict-safe insertion).
 */
export async function upsertPatronEntitlementSnapshot(
  prisma: DbLike,
  args: {
    inTransaction?: boolean;
    patreonObservation?: string;
    patreonCredentialAccountId?: string;
    patreonCampaignScope?: string;
    patronMembershipId: string;
    relayCreatorId: string;
    entitledTierIds: string[];
    source: EntitlementSource;
    /** When set, stored on the snapshot; otherwise resolved from `CreatorProfile` for the tenant. */
    campaignId?: string | null;
    now?: Date;
    /** Optional trace id for the emitted `patron_entitlement.tier_changed` event (PE-H). */
    traceId?: string;
    /**
     * When set, replaces the corresponding other-provider prefix tiers on the prior snapshot with
     * `entitledTierIds` from this call (union + dedupe). Omit for full replace (legacy behaviour).
     */
    crossProviderMergeSource?: "patreon" | "subscribestar";
  }
): Promise<void> {
  const client = prisma as PrismaClient;
  if (!args.inTransaction && typeof client.$transaction === "function") {
    const target = await client.tenantMembership.findUnique({ where: { id: args.patronMembershipId }, include: { account: true } });
    return client.$transaction(async (tx) => {
      if (target?.account?.patronPatreonUserId) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`patreon-identity:${target.account.patronPatreonUserId}`}, 0))`;
      return upsertPatronEntitlementSnapshot(tx, { ...args, inTransaction: true });
    });
  }
  await prisma.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`entitlements:${args.relayCreatorId}`}, 0))`;
  const membership = await prisma.tenantMembership.findUnique({ where: { id: args.patronMembershipId }, include: { tenant: true, account: true } });
  if (!membership || membership.role !== TenantRole.patron || membership.tenant.relayCreatorId !== args.relayCreatorId) throw new Error("Entitlement membership binding could not be verified.");
  if (args.patreonObservation && membership.account.patronPatreonUserId) await assertPatreonIdentityObservation(prisma, membership.account.patronPatreonUserId, args.patreonObservation, args.relayCreatorId);
  if (args.patreonObservation && membership.patreonObservation > BigInt(args.patreonObservation)) throw new Error("Patreon identity changed during collection; retry required.");
  if (args.patreonCredentialAccountId && (!membership.account.patronPatreonUserId || !await prisma.patronOAuthCredential.findUnique({ where: { accountId: args.patreonCredentialAccountId } }))) throw new Error("Patreon authorization was removed during collection.");
  const now = args.now ?? new Date();
  const campaignId = await resolveCampaignId(prisma, args.relayCreatorId, args.campaignId);

  const prior = await prisma.patronEntitlementSnapshot.findUnique({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: args.patronMembershipId,
        relayCreatorId: args.relayCreatorId
      }
    },
    select: { entitledTierIds: true, active: true }
  });

  const platform = await loadPlatformPatronProjections(prisma, membership.accountId, args.relayCreatorId);
  const currentTiers = [...new Set([...membership.tierIds, ...(prior?.entitledTierIds ?? []), ...platform.flatMap((row) => row.snapshot?.entitledTierIds ?? [])])];
  let incoming = args.entitledTierIds;
  if (args.crossProviderMergeSource === "patreon" && args.patreonCampaignScope) {
    const catalog = await prisma.tier.findMany({ where: { creatorId: args.relayCreatorId, campaignId: `patreon_campaign_${args.patreonCampaignScope}` }, select: { relayTierId: true } });
    const states = membership.account.patronPatreonUserId ? await prisma.$queryRaw<Array<{ state: { tiers: string[] } }>>`SELECT state FROM patreon_member_states WHERE creator_id = ${args.relayCreatorId}
      AND campaign_id = ${args.patreonCampaignScope} AND state->>'userId' = ${membership.account.patronPatreonUserId}` : [];
    const owned = new Set([...catalog.map((tier) => tier.relayTierId), ...states.flatMap((row) => (row.state as { tiers: string[] }).tiers), ...incoming]);
    incoming = [...currentTiers.filter((id) => id.startsWith("patreon_tier_") && !owned.has(id)), ...incoming];
  }
  const tiers =
    args.crossProviderMergeSource !== undefined
      ? mergeEntitledTierIdsCrossProvider(
          currentTiers,
          incoming,
          args.crossProviderMergeSource
        )
      : [...args.entitledTierIds];

  await prisma.tenantMembership.update({ where: { id: args.patronMembershipId }, data: { tierIds: tiers,
    ...(args.patreonObservation ? { patreonObservation: BigInt(args.patreonObservation) } : {}) } });
  await writeSnapshot(prisma, args, tiers, campaignId, now, prior);
  for (const anchor of platform) await writeSnapshot(prisma, { ...args, patronMembershipId: anchor.id }, tiers, campaignId, now, null, false);
}

type SnapshotArgs = Parameters<typeof upsertPatronEntitlementSnapshot>[1];
type SnapshotPrior = { entitledTierIds: string[]; active: boolean };

/** One platform anchor per account; snapshots remain scoped to the requested creator. */
export async function loadPlatformPatronProjections(prisma: DbLike, accountId: string, relayCreatorId: string) {
  if (relayCreatorId === getPlatformRelayCreatorId()) return [];
  const anchors = await prisma.tenantMembership.findMany({ where: { accountId, role: TenantRole.patron, tenant: { relayCreatorId: getPlatformRelayCreatorId() } }, select: { id: true } });
  const snapshots = anchors.length ? await prisma.patronEntitlementSnapshot.findMany({ where: { patronMembershipId: { in: anchors.map((row) => row.id) }, relayCreatorId }, select: { patronMembershipId: true, entitledTierIds: true, active: true } }) : [];
  return anchors.map((anchor) => ({ id: anchor.id, snapshot: snapshots.find((snapshot) => snapshot.patronMembershipId === anchor.id) ?? null }));
}

/** Trusted seed/support projection only. Provider admission never calls this path. */
export async function upsertPlatformPatronEntitlementProjection(prisma: DbLike, args: Pick<SnapshotArgs, "patronMembershipId" | "relayCreatorId" | "entitledTierIds" | "campaignId" | "now" | "traceId" | "inTransaction">): Promise<void> {
  const client = prisma as PrismaClient;
  if (!args.inTransaction && typeof client.$transaction === "function") return client.$transaction((tx) => upsertPlatformPatronEntitlementProjection(tx, { ...args, inTransaction: true }));
  await prisma.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`entitlements:${args.relayCreatorId}`}, 0))`;
  const anchor = await prisma.tenantMembership.findUnique({ where: { id: args.patronMembershipId }, include: { tenant: true } });
  const target = await prisma.tenant.findUnique({ where: { relayCreatorId: args.relayCreatorId }, select: { id: true } });
  if (!anchor || anchor.role !== TenantRole.patron || anchor.tenant.relayCreatorId !== getPlatformRelayCreatorId() || !target || args.relayCreatorId === getPlatformRelayCreatorId()) throw new Error("Platform entitlement projection binding could not be verified.");
  const prior = await prisma.patronEntitlementSnapshot.findUnique({ where: { patronMembershipId_relayCreatorId: { patronMembershipId: anchor.id, relayCreatorId: args.relayCreatorId } }, select: { entitledTierIds: true, active: true } });
  await writeSnapshot(prisma, { ...args, source: EntitlementSource.manual_support }, [...args.entitledTierIds], await resolveCampaignId(prisma, args.relayCreatorId, args.campaignId), args.now ?? new Date(), prior);
}

/** Normalize an existing platform refresh to the same account's creator-bound admission. */
export async function upsertPatronProviderEntitlements(prisma: PrismaClient, args: SnapshotArgs & { expectedAccountId: string; expectedCredentialVersion: string; expectedPatreonUserId?: string; expectedSubscribeStarProfileId?: string; provider: "patreon" | "subscribestar" }): Promise<void> {
  const observed = await prisma.tenantMembership.findUnique({ where: { id: args.patronMembershipId }, include: { account: true } });
  if (!observed || observed.accountId !== args.expectedAccountId) throw new Error("Entitlement account binding could not be verified.");
  return prisma.$transaction(async (tx) => {
    const id = args.provider === "patreon" ? args.expectedPatreonUserId : observed.account.patronPatreonUserId;
    if (id) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`patreon-identity:${id}`}, 0))`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`entitlements:${args.relayCreatorId}`}, 0))`;
    const anchor = await tx.tenantMembership.findUnique({ where: { id: args.patronMembershipId }, include: { account: true, tenant: true } });
    if (!anchor || anchor.accountId !== args.expectedAccountId || anchor.role !== TenantRole.patron || ![getPlatformRelayCreatorId(), args.relayCreatorId].includes(anchor.tenant.relayCreatorId ?? "")) throw new Error("Entitlement membership binding could not be verified.");
    if (args.provider === "patreon") {
      if (!id || anchor.account.patronPatreonUserId !== id || !args.patreonObservation) throw new Error("Patreon authorization was removed during collection.");
      await assertPatreonIdentityObservation(tx, id, args.patreonObservation, args.relayCreatorId);
      const scope = args.patreonCampaignScope;
      const profile = await tx.creatorProfile.findFirst({ where: { tenant: { relayCreatorId: args.relayCreatorId } }, select: { patreonCampaignId: true } });
      const campaign = scope ? await tx.campaign.findFirst({ where: { id: `patreon_campaign_${scope}`, creatorId: args.relayCreatorId }, select: { id: true } }) : null;
      const acceptedCampaign = scope ? await tx.patreonMemberState.findFirst({ where: { creatorId: args.relayCreatorId, campaignId: scope }, select: { memberId: true } }) : null;
      if (!scope || (profile?.patreonCampaignId !== scope && !campaign && !acceptedCampaign)) throw new Error("Patreon campaign binding could not be verified.");
      const credential = await tx.patronOAuthCredential.findUnique({ where: { accountId: anchor.accountId } });
      if (!credential || patronCredentialVersion(credential.encryptedPayload) !== args.expectedCredentialVersion) throw new Error("Patreon authorization changed during collection.");
    } else {
      const profile = await tx.creatorProfile.findFirst({ where: { tenant: { relayCreatorId: args.relayCreatorId } }, select: { subscribestarProfileId: true } });
      if (!args.expectedSubscribeStarProfileId || profile?.subscribestarProfileId !== args.expectedSubscribeStarProfileId) throw new Error("SubscribeStar creator binding could not be verified.");
      const credential = await tx.patronSubscribestarOAuthCredential.findUnique({ where: { accountId: anchor.accountId } });
      if (!credential || patronCredentialVersion(credential.encryptedPayload) !== args.expectedCredentialVersion) throw new Error("SubscribeStar authorization changed during collection.");
    }
    const tenant = await tx.tenant.findUnique({ where: { relayCreatorId: args.relayCreatorId }, select: { id: true } });
    if (!tenant) throw new Error("Entitlement creator binding could not be verified.");
    const membership = await tx.tenantMembership.upsert({ where: { accountId_tenantId: { accountId: anchor.accountId, tenantId: tenant.id } }, create: { accountId: anchor.accountId, tenantId: tenant.id, role: TenantRole.patron, tierIds: [] }, update: {} });
    await upsertPatronEntitlementSnapshot(tx, { ...args, inTransaction: true, patronMembershipId: membership.id });
  }, { timeout: 30_000 });
}

async function writeSnapshot(prisma: DbLike, args: SnapshotArgs, tiers: string[], campaignId: string | null, now: Date, prior: SnapshotPrior | null, emitEvent = true): Promise<void> {
  const staleAfter = new Date(now.getTime() + getPatronEntitlementStaleAfterMs());
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
  if (emitEvent && !isCreate && (tiersChanged || activeFlipped)) {
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

  await prisma.outboxEvent.createMany({
    skipDuplicates: true,
    data: { eventId, eventName: PATRON_ENTITLEMENT_TIER_CHANGED_EVENT_NAME, tenantId: args.relayCreatorId,
      primaryId: args.patronMembershipId, occurredAt: args.occurredAt, traceId, producer: "patron-entitlement-snapshot",
      version: "1.0", payload: payload as Prisma.InputJsonValue }
  });
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
    patreonObservation?: string;
    inTransaction?: boolean;
  }
): Promise<void> {
  const rows = args.patreonObservation ? null : await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('patreon_member_observation_seq') AS value`;
  await upsertPatronEntitlementSnapshot(prisma, {
    ...args,
    source: EntitlementSource.oauth_exchange,
    patreonObservation: args.patreonObservation ?? rows![0]!.value.toString(),
    crossProviderMergeSource: "patreon"
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
