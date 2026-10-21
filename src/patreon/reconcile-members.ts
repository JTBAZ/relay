import type { IdentityService } from "../identity/identity-service.js";
import type { PatreonFetchOptions } from "./patreon-resource-api.js";
import { asDataArray, fetchCampaignMembers, fetchMemberById, membersPageUrl } from "./patreon-resource-api.js";
import { PatreonRequestError } from "./oauth-request.js";
import { acceptMember, memberObservation, startRoster, type PatreonRosterState } from "./member-reconciliation.js";

type Context = { identity: IdentityService; creatorId: string; campaignId: string; paidTiers: Set<string>; source?: "scheduled_refresh" | "webhook" | "manual_support"; fetch: PatreonFetchOptions };
async function collect(context: Context, memberId: string) {
  const doc = await fetchMemberById(context.fetch, memberId);
  const rows = asDataArray(doc.data);
  if (rows.length !== 1 || rows[0]!.id !== memberId) throw new Error("Patreon member response identity did not match.");
  return memberObservation(rows[0]!, context.campaignId, context.paidTiers);
}
function absent(error: unknown): boolean { return error instanceof PatreonRequestError && (error.status === 404 || error.status === 410); }

export async function refreshMember(context: Context, memberId: string, allowAbsence: boolean): Promise<void> {
  const run = context.identity.mutatePatreonMembers;
  const expected = await run(context.creatorId, context.campaignId, (tx) => tx.member(memberId));
  const token = await context.identity.capturePatreonObservation();
  let observation;
  try { observation = await collect(context, memberId); }
  catch (error) {
    if (!allowAbsence || !absent(error)) throw error;
    if (!expected) throw new Error("Deleted Patreon member has no verified identity binding; roster reconciliation required.");
    observation = { ...expected, status: "former_patron", tiers: [] };
  }
  await run(context.creatorId, context.campaignId, (tx) => acceptMember(tx, context.creatorId, observation, expected?.sequence ?? 0, undefined, token, [...context.paidTiers]), { userIds: [observation.userId], source: context.source ?? "webhook" });
}

export async function reconcileMembers(context: Context, maxPages: number) {
  const run = context.identity.mutatePatreonMembers;
  let roster = await run(context.creatorId, context.campaignId, async (tx) => {
    const prior = await tx.roster();
    const state = prior && prior.phase !== "complete" && prior.phase !== "blocked" ? prior : startRoster(prior);
    await tx.saveRoster(state); return state;
  });
  let pages = 0, synced = 0;
  while (roster.phase === "listing" && pages < maxPages) {
    const token = await context.identity.capturePatreonObservation();
    let doc;
    try { doc = await fetchCampaignMembers(context.fetch, context.campaignId, roster.nextUrl); }
    catch (error) {
      if (roster.nextUrl && error instanceof PatreonRequestError && [400, 404, 410].includes(error.status ?? 0)) {
        await run(context.creatorId, context.campaignId, async (tx) => {
          const current = await tx.roster();
          if (current?.scanId === roster.scanId && current.nextUrl === roster.nextUrl) await tx.saveRoster(startRoster(current));
        });
      }
      throw error;
    }
    const observations = asDataArray(doc.data).map((row) => memberObservation(row, context.campaignId, context.paidTiers));
    if (new Set(observations.map((row) => row.memberId)).size !== observations.length) throw new Error("Duplicate Patreon member identities in one page.");
    const cursor = doc.meta?.pagination?.cursors?.next;
    const next = doc.links?.next ?? (cursor ? `${membersPageUrl(context.campaignId)}&page%5Bcursor%5D=${encodeURIComponent(cursor)}` : null);
    if (next === roster.nextUrl && next !== null) throw new Error("Patreon roster continuation did not advance.");
    const expected = roster;
    roster = await run(context.creatorId, context.campaignId, async (tx) => {
      const current = await tx.roster();
      if (!current || current.scanId !== expected.scanId || current.phase !== expected.phase || current.nextUrl !== expected.nextUrl || current.seen !== expected.seen) throw new Error("Patreon roster changed during collection; retry required.");
      for (const observation of observations) {
        const prior = await tx.member(observation.memberId);
        await acceptMember(tx, context.creatorId, observation, prior?.sequence ?? 0, current.scanId, token, [...context.paidTiers]);
      }
      const state: PatreonRosterState = { ...current, nextUrl: next, seen: current.seen + observations.length, phase: next ? "listing" as const : "verifying" as const };
      if (!next && state.seen === 0) { state.phase = "blocked"; state.error = "empty_roster"; }
      await tx.saveRoster(state); return state;
    }, { userIds: observations.map((row) => row.userId), source: context.source ?? "webhook" });
    pages++; synced += observations.length;
  }
  // Absence only creates candidates after complete traversal. Each candidate is reread separately.
  if (roster.phase === "verifying") {
    const candidates = await run(context.creatorId, context.campaignId, (tx) => tx.absent(roster.scanId, 26));
    for (const candidate of candidates.slice(0, 25)) {
      const token = await context.identity.capturePatreonObservation();
      let observation;
      try { observation = await collect(context, candidate.memberId); }
      catch (error) { if (!absent(error)) throw error; observation = { ...candidate, status: "former_patron", tiers: [] }; }
      await run(context.creatorId, context.campaignId, async (tx) => {
        const current = await tx.roster();
        if (current?.scanId !== roster.scanId || current.phase !== "verifying") throw new Error("Patreon roster verification was superseded.");
        await acceptMember(tx, context.creatorId, observation, candidate.sequence, roster.scanId, token, [...context.paidTiers]);
      }, { userIds: [observation.userId], source: context.source ?? "webhook" });
    }
    roster = await run(context.creatorId, context.campaignId, async (tx) => {
      const current = await tx.roster();
      if (current?.scanId !== roster.scanId || current.phase !== "verifying") throw new Error("Patreon roster verification was superseded.");
      if ((await tx.absent(current.scanId, 1)).length) return current;
      const unverifiedLegacyCount = await tx.unmapped();
      if (unverifiedLegacyCount > 0) {
        const blocked = { ...current, phase: "blocked" as const, error: "legacy_member_binding_unverified", unverifiedLegacyCount };
        await tx.saveRoster(blocked); return blocked;
      }
      const now = new Date().toISOString();
      const complete = { ...current, phase: "complete" as const, completedAt: now, lastCompleteAt: now, error: null, unverifiedLegacyCount: 0 };
      await tx.saveRoster(complete); return complete;
    });
  }
  return { creator_id: context.creatorId, patreon_campaign_id: context.campaignId, members_synced: synced, pages_fetched: pages,
    coverage: roster.phase === "complete" ? "complete" as const : roster.phase === "blocked" ? "blocked" as const : "partial" as const,
    warnings: roster.phase === "blocked" ? [roster.error === "legacy_member_binding_unverified" ? "Existing Patreon access has no verified member binding; reconciliation remains incomplete." : "Empty Patreon roster requires verification; no absent members were removed."] : [],
    roster: { phase: roster.phase, last_complete_at: roster.lastCompleteAt, started_at: roster.startedAt, unverified_legacy_count: roster.unverifiedLegacyCount ?? 0, reason: roster.error } };
}
