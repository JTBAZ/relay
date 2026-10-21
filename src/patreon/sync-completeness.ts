import type { PrismaClient } from "@prisma/client";
import type { PatreonPostProgressStore, PostSyncProgress } from "./post-sync-progress.js";
import type { PatreonRosterState } from "./member-reconciliation.js";
import type { MediaVersionRow } from "../ingest/canonical-store.js";
import { fingerprint } from "../export/media-repair-state.js";
import { ACCESS_VERIFICATION_SOURCES, accessReceiptKey, accessVerificationHead } from "./post-refresh-state.js";

export type CompletenessStatus = "unknown" | "pending" | "partial" | "complete" | "stale" | "failed" | "unavailable";
export type RepairTarget = { kind: "post" | "media" | "change"; resource_id: string; generation: number; head: string | null; due_at: string };
export type CompletenessLane = {
  status: CompletenessStatus; scope: "campaign" | "bounded" | null;
  last_attempt_at: string | null; last_verified_at: string | null;
  counts: Record<string, number> | null; next_action: "continue_sync" | "sync_members" | "retry_media" | "retry_change" | null;
  repairs?: RepairTarget[];
  sources?: string[];
};
export type SyncCompleteness = { attention: boolean; archive: CompletenessLane; posts_access: CompletenessLane; members: CompletenessLane; media: CompletenessLane };
const lane = (status: CompletenessStatus = "unknown"): CompletenessLane => ({ status, scope: null, last_attempt_at: null, last_verified_at: null, counts: null, next_action: null });
const validIso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const latest = (times: string[]) => times.sort().at(-1) ?? null;
const oldest = (times: string[]) => times.sort()[0] ?? null;

/** Pure bounded reads. Missing work rows and old head proofs are unknown, never zero pending. */
export async function readSyncCompleteness(db: PrismaClient | null, progressStore: PatreonPostProgressStore | undefined,
  creatorId: string, campaignId: string): Promise<SyncCompleteness> {
  const result: SyncCompleteness = { attention: true, archive: lane(), posts_access: lane(), members: lane("unavailable"), media: lane("unavailable") };
  if (!campaignId) return result;
  let progress: PostSyncProgress | null = null;
  try {
    progress = await progressStore?.get(creatorId, campaignId) ?? null;
    if (progress) {
      const archive = progress.archive, catchup = progress.catchup;
      result.archive = { ...lane(archive.status === "complete" && !validIso(archive.verifiedAt) ? "unknown" : archive.status === "complete" ? "complete" : archive.status === "partial" ? "partial" : "unknown"),
        scope: "campaign", last_verified_at: validIso(archive.verifiedAt) ? archive.verifiedAt : null,
        counts: { accepted_pages: archive.pages }, next_action: archive.status === "complete" ? null : "continue_sync" };
      result.posts_access = { ...lane(catchup.status === "complete" && validIso(catchup.verifiedAt) ? Date.parse(catchup.verifiedAt) < Date.now() - 15 * 60_000 ? "stale" : "partial" : catchup.status === "partial" ? "partial" : "unknown"),
        scope: "bounded", last_verified_at: validIso(catchup.verifiedAt) ? catchup.verifiedAt : null, counts: { accepted_pages: catchup.pages }, next_action: "continue_sync" };
    }
  } catch { result.archive = lane("unavailable"); result.posts_access = lane("unavailable"); }
  if (!db) return result;
  try {
    const roster = (await db.patreonRosterState.findUnique({ where: { creatorId_campaignId: { creatorId, campaignId } } }))?.state as PatreonRosterState | undefined;
    if (roster) {
      if (!["listing", "verifying", "complete", "blocked"].includes(roster.phase) || !validIso(roster.startedAt) || !Number.isSafeInteger(roster.seen) || roster.seen < 0 || (roster.unverifiedLegacyCount !== undefined && (!Number.isSafeInteger(roster.unverifiedLegacyCount) || roster.unverifiedLegacyCount < 0))) throw new Error("Invalid roster health");
      const verified = validIso(roster.lastCompleteAt) ? roster.lastCompleteAt : null;
      result.members = { ...lane(roster.phase === "blocked" ? "failed" : roster.phase !== "complete" ? "partial" : !verified || !Number.isSafeInteger(roster.unverifiedLegacyCount) ? "unknown" : roster.unverifiedLegacyCount! > 0 ? "partial" : Date.parse(verified) < Date.now() - 6 * 60 * 60_000 ? "stale" : "complete"),
        scope: "campaign", last_attempt_at: roster.startedAt, last_verified_at: verified,
        counts: { observed: roster.seen, ...(Number.isSafeInteger(roster.unverifiedLegacyCount) ? { unverified_legacy: roster.unverifiedLegacyCount! } : {}) }, next_action: "sync_members" };
    } else result.members = lane("unknown");
  } catch { result.members = lane("unavailable"); }
  try {
    const posts = await db.post.findMany({ where: { creatorId, campaignId: `patreon_campaign_${campaignId}`, source: "PATREON", upstreamStatus: "active" }, orderBy: { id: "asc" }, take: 101,
      include: { versions: { orderBy: { versionSeq: "desc" }, take: 1, select: { versionSeq: true, upstreamRevision: true, mediaIds: true, tierIds: true } } } });
    const sampled = posts.slice(0, 100), mediaIds = [...new Set(sampled.flatMap((post) => post.versions[0]?.mediaIds ?? []))].slice(0, 100);
    const populationAt = latest([progress?.archive.verifiedAt, progress?.catchup.verifiedAt].filter(validIso));
    const populationKnown = progress?.archive.status === "complete" && validIso(progress.archive.verifiedAt) && posts.length <= 100;
    const proofKeys = sampled.flatMap((post) => {
      const v = post.versions[0];
      if (!v) return [];
      const head = accessVerificationHead({ creatorId, postId: post.id, campaignId: post.campaignId, status: post.upstreamStatus, version: v.versionSeq, revision: v.upstreamRevision, tiers: v.tierIds, isPublic: post.isPublic });
      return ACCESS_VERIFICATION_SOURCES.map((source) => ({ postId: post.id, source, key: accessReceiptKey(creatorId, post.id, head, source) }));
    });
    const receipts = proofKeys.length ? await db.ingestIdempotencyKey.findMany({ where: { creatorId, batchKey: { in: proofKeys.map((proof) => proof.key) } }, select: { batchKey: true, firstSeenAt: true } }) : [];
    const accessTimes: string[] = [], accessSources = new Set<string>();
    for (const post of sampled) {
      const accepted = proofKeys.filter((proof) => proof.postId === post.id).flatMap((proof) => {
        const receipt = receipts.find((item) => item.batchKey === proof.key);
        if (receipt) accessSources.add(proof.source);
        return receipt ? [receipt.firstSeenAt.toISOString()] : [];
      });
      const verified = latest(accepted); if (verified) accessTimes.push(verified);
    }
    const accessComplete = populationKnown && accessTimes.length === sampled.length;
    const accessAt = oldest([...accessTimes, ...(accessComplete && populationAt ? [populationAt] : [])]);
    result.posts_access = { ...lane(accessComplete ? accessAt && Date.parse(accessAt) < Date.now() - 6 * 60 * 60_000 ? "stale" : "complete" : accessTimes.length ? "partial" : "unknown"),
      scope: accessComplete ? "campaign" : "bounded", last_verified_at: accessAt, counts: { inspected_posts: sampled.length, verified: accessTimes.length, unknown: sampled.length - accessTimes.length }, sources: [...accessSources], next_action: accessComplete && accessAt && Date.parse(accessAt) >= Date.now() - 6 * 60 * 60_000 ? null : "continue_sync" };
    const media = mediaIds.length ? await db.mediaAsset.findMany({ where: { creatorId, id: { in: mediaIds }, ingestOrigin: "PATREON", upstreamStatus: "active" } }) : [];
    const resources = [...sampled.map((post) => ({ kind: "post", id: post.id, head: post.versions[0] ? fingerprint([creatorId, post.id, post.source, post.upstreamStatus, post.campaignId, post.versions[0].versionSeq, post.versions[0].upstreamRevision, post.versions[0].mediaIds]) : "", blob: true })),
      ...media.map((asset) => ({ kind: "media", id: asset.id, head: fingerprint([creatorId, asset.id, asset.upstreamStatus, asset.currentVersionSeq, asset.currentUpstreamRevision, asset.currentUpstreamUrl, asset.currentStorageKey]), blob: (asset.versionsJson as unknown as MediaVersionRow[])?.some?.((v) => v.version_seq === asset.currentVersionSeq && v.upstream_revision === asset.currentUpstreamRevision && v.export_record?.creator_id === creatorId && v.export_record.media_id === asset.id && v.export_record.upstream_revision === asset.currentUpstreamRevision && v.export_record.relative_blob_path === asset.currentStorageKey) === true }))];
    const work = resources.length ? await db.patreonMediaRepair.findMany({ where: { creatorId, OR: resources.map((r) => ({ kind: r.kind, resourceId: r.id })) } }) : [];
    let unknown = 0, pending = 0, failed = 0, verified = 0, empty = 0, stale = 0;
    const verifiedTimes: string[] = [], attempts: string[] = [], repairs: RepairTarget[] = [];
    for (const resource of resources) {
      if (!resource.head) { unknown++; continue; }
      const row = work.find((w) => w.kind === resource.kind && w.resourceId === resource.id && w.head === resource.head && w.phase !== "obsolete");
      if (!row) { unknown++; continue; }
      if (row.attempts > 0) attempts.push(row.updatedAt.toISOString());
      const proof = row.verifiedAt && (resource.kind === "post" ? row.collection === "empty" || row.collection === "media" : resource.blob);
      if (proof) verifiedTimes.push(row.verifiedAt!.toISOString());
      const accepted = row.phase === "complete" && proof;
      if (accepted) {
        verified++;
        if (row.collection === "empty") empty++;
        if (row.verifiedAt!.getTime() < Date.now() - 24 * 60 * 60_000) stale++;
      } else if (row.lastError) failed++; else pending++;
      if (!accepted && !row.leaseToken && row.lastError && repairs.length < 5) repairs.push({ kind: resource.kind as "post" | "media", resource_id: resource.id, head: row.head, generation: row.generation, due_at: row.dueAt.toISOString() });
    }
    const allMedia = [...new Set(sampled.flatMap((post) => post.versions[0]?.mediaIds ?? []))];
    unknown += allMedia.filter((id) => !media.some((asset) => asset.id === id)).length;
    const bounded = !populationKnown || allMedia.length > 100;
    const emptyVerified = sampled.length === 0 && progress?.archive.status === "complete" && validIso(progress.archive.verifiedAt);
    const complete = !bounded && !unknown && !pending && !failed && (resources.length > 0 || emptyVerified);
    if (complete && populationAt && Date.parse(populationAt) < Date.now() - 24 * 60 * 60_000) stale++;
    result.media = { ...lane(failed ? "failed" : pending && !unknown && !verified ? "pending" : bounded || unknown || pending ? "partial" : complete ? stale ? "stale" : "complete" : "unknown"),
      scope: bounded || verifiedTimes.length < resources.length ? "bounded" : "campaign", last_attempt_at: latest(attempts), last_verified_at: oldest([...verifiedTimes, ...(!bounded && populationAt ? [populationAt] : [])]) ?? (emptyVerified ? progress?.archive.verifiedAt ?? null : null),
      counts: { inspected_posts: sampled.length, inspected_media: media.length, verified, verified_empty: empty, pending, failed, unknown }, next_action: failed ? "retry_media" : complete && !stale ? null : "continue_sync", repairs };
    const changes = await db.patreonChangeWork.findMany({ where: { creatorId, campaignId, resourceType: "post", status: { in: ["failed", "pending", "running"] } }, orderBy: { lastAcceptedAt: "desc" }, take: 26 });
    const inspected = changes.slice(0, 25), failures = inspected.filter((change) => change.status === "failed");
    const failedPosts = failures.length ? await db.post.findMany({ where: { creatorId, campaignId: `patreon_campaign_${campaignId}`, source: "PATREON", id: { in: failures.map((change) => `patreon_post_${change.resourceId}`) } }, include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } } }) : [];
    const targets = failures.flatMap((change) => {
      const post = failedPosts.find((p) => p.id === `patreon_post_${change.resourceId}`), v = post?.versions[0];
      return post && v ? [{ kind: "change" as const, resource_id: change.id, head: fingerprint([creatorId, post.id, post.source, post.upstreamStatus, post.campaignId, v.versionSeq, v.upstreamRevision, v.mediaIds]), generation: change.generation, due_at: (change.retryNotBefore ?? change.dueAt).toISOString() }] : [];
    });
    if (changes.length) result.posts_access = { ...result.posts_access, status: failures.length ? "failed" : "partial", scope: "bounded", counts: { ...result.posts_access.counts, inspected_work: inspected.length, failed: failures.length, repair_unavailable: failures.length - targets.length, ...(changes.length > 25 ? { more_work: 1 } : {}) }, next_action: failures.length ? "retry_change" : "continue_sync", repairs: targets.slice(0, 5) };
  } catch {
    result.media = lane("unavailable");
    result.posts_access = { ...result.posts_access, status: "unavailable", counts: null, next_action: "continue_sync" };
  }
  result.attention = [result.archive, result.posts_access, result.members, result.media].some((item) => item.status !== "complete");
  return result;
}
