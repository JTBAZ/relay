import { randomUUID } from "node:crypto";
import type { UserAccount } from "../identity/types.js";
import type { JsonApiResource } from "./jsonapi-types.js";
import { mergeEntitledTierIdsCrossProvider } from "../identity/patron-entitlement-snapshot.js";
import { planMembershipLedgerEvents, type PlannedMembershipLedgerEvent } from "./membership-ledger-sync.js";

export type PatreonMemberObservation = {
  memberId: string; userId: string; status: string | null; tiers: string[];
  amount: number | null; pledgeStart: string | null;
};
export type PatreonMemberState = PatreonMemberObservation & {
  sequence: number; observationToken?: string; verifiedAt: string; seenScanId: string | null;
};
export type PatreonRosterState = {
  scanId: string; nextUrl: string | null; phase: "listing" | "verifying" | "complete" | "blocked";
  startedAt: string; completedAt: string | null; seen: number; lastCompleteAt: string | null;
  error: string | null; unverifiedLegacyCount?: number;
};
/** All methods run inside one adapter transaction; no network work belongs here. */
export interface PatreonMemberMutation {
  assertObservation?(id: string, token: string): Promise<void>;
  member(id: string): Promise<PatreonMemberState | null>;
  saveMember(value: PatreonMemberState): Promise<void>;
  roster(): Promise<PatreonRosterState | null>;
  saveRoster(value: PatreonRosterState): Promise<void>;
  absent(scanId: string, limit: number): Promise<PatreonMemberState[]>;
  unmapped(): Promise<number>;
  user(patreonUserId: string): Promise<UserAccount | null>;
  saveUser(patreonUserId: string, tiers: string[], observation?: string, email?: string): Promise<void>;
  tierAmounts(): Promise<Map<string, number>>;
  ledger(events: PlannedMembershipLedgerEvent[]): Promise<void>;
}
export type PatreonMemberMutationOptions = { userIds?: readonly string[]; source?: "oauth_exchange" | "scheduled_refresh" | "webhook" | "manual_support"; campaignScope?: string };
export type PatreonMemberMutationRunner = <T>(creatorId: string, campaignId: string, operation: (tx: PatreonMemberMutation) => Promise<T>, options?: PatreonMemberMutationOptions) => Promise<T>;

export function memberObservation(row: JsonApiResource, campaignId: string, paidTiers: Set<string>): PatreonMemberObservation {
  const campaign = row.relationships?.campaign?.data;
  const user = row.relationships?.user?.data;
  const links = row.relationships?.currently_entitled_tiers?.data;
  if (row.type !== "member" || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.id) || !campaign || Array.isArray(campaign) || campaign.type !== "campaign" || campaign.id !== campaignId ||
      !user || Array.isArray(user) || user.type !== "user" || !/^[a-zA-Z0-9_-]{1,128}$/.test(user.id) || !Array.isArray(links)) throw new Error("Patreon member identity or campaign could not be verified.");
  const attributes = row.attributes ?? {};
  const status = attributes.patron_status;
  if (status !== null && status !== "active_patron" && status !== "former_patron" && status !== "declined_patron") throw new Error("Patreon member status is unavailable.");
  const amount = attributes.currently_entitled_amount_cents;
  const pledge = attributes.pledge_relationship_start;
  const tiers = links.map((link) => {
    if (link.type !== "tier" || !link.id) throw new Error("Invalid Patreon member tier relationship.");
    return `patreon_tier_${link.id}`;
  }).filter((id) => paidTiers.has(id));
  return { memberId: row.id, userId: user.id, status, tiers: status === "active_patron" ? [...new Set(tiers)].sort() : [],
    amount: typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 ? amount : null,
    pledgeStart: typeof pledge === "string" && Number.isFinite(Date.parse(pledge)) ? new Date(pledge).toISOString() : null };
}

/** Fence every accepted observation, including unchanged verification, against slower collectors. */
export async function acceptMember(tx: PatreonMemberMutation, creatorId: string, observation: PatreonMemberObservation,
  expectedSequence: number, scanId?: string, observationToken?: string, campaignTiers: readonly string[] = observation.tiers): Promise<void> {
  if (observationToken) await tx.assertObservation?.(observation.userId, observationToken);
  const prior = await tx.member(observation.memberId);
  if (observationToken && prior?.observationToken && BigInt(prior.observationToken) > BigInt(observationToken)) throw new Error("Patreon member changed during collection; retry required.");
  if ((prior?.sequence ?? 0) !== expectedSequence) throw new Error("Patreon member changed during collection; retry required.");
  if (prior && prior.userId !== observation.userId) throw new Error("Patreon member user binding changed.");
  const user = await tx.user(observation.userId);
  const ownedTiers = new Set([...campaignTiers, ...(prior?.tiers ?? [])]);
  const priorTiers = prior?.tiers ?? (user?.tier_ids ?? []).filter((id) => ownedTiers.has(id));
  const now = new Date();
  const floors = await tx.tierAmounts();
  const events = planMembershipLedgerEvents({ creatorId, patreonMemberResourceId: observation.memberId, patronStatus: observation.status,
    newTierIds: observation.tiers, entitledAmountCents: observation.amount,
    pledgeRelationshipStart: observation.pledgeStart ? new Date(observation.pledgeStart) : null,
    priorExisted: prior !== null || user !== null, priorTierIds: priorTiers,
    priorTierFloorCents: prior?.amount ?? Math.max(0, ...priorTiers.map((id) => floors.get(id) ?? 0)), batchStartedAt: now });
  // Observations have local transition identity; provider pledge start must not dedupe a later rejoin.
  for (const event of events) {
    event.dedupeKey = `patreon-member:${JSON.stringify([creatorId, observation.memberId, (prior?.sequence ?? 0) + 1])}`;
    if (prior) event.occurredAt = now;
  }
  const retained = (user?.tier_ids ?? []).filter((id) => id.startsWith("patreon_tier_") && !ownedTiers.has(id));
  if (user || observation.tiers.length > 0 || observation.status === null) {
    await tx.saveUser(observation.userId, mergeEntitledTierIdsCrossProvider(user?.tier_ids, [...retained, ...observation.tiers], "patreon"), observationToken);
  }
  await tx.ledger(events);
  await tx.saveMember({ ...observation, sequence: expectedSequence + 1, observationToken: observationToken ?? prior?.observationToken, verifiedAt: now.toISOString(), seenScanId: scanId ?? prior?.seenScanId ?? null });
}

export function startRoster(prior: PatreonRosterState | null): PatreonRosterState {
  return { scanId: randomUUID(), nextUrl: null, phase: "listing", startedAt: new Date().toISOString(), completedAt: null,
    seen: 0, lastCompleteAt: prior?.lastCompleteAt ?? null, error: null };
}
