import { createHash } from "node:crypto";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { SyncBatchInput } from "../ingest/types.js";
import { RELAY_TIER_PUBLIC } from "./relay-access-tiers.js";
import { patreonPostContentHash } from "./post-content-revision.js";

export const campaignBindingKey = (creatorId: string, postId: string, campaignId: string) => `patreon_campaign_binding:v1:${JSON.stringify([creatorId, postId, campaignId])}`;
const observationKey = (creatorId: string, postId: string) => `patreon_post_observation:v1:${JSON.stringify([creatorId, postId])}`;

export type PatreonPostRefresh = { postId: string; state: string; campaignId?: string; preserveMedia?: boolean; deletion?: boolean; requireVerifiedBinding?: boolean; accessSource?: "targeted" | "reconciliation" };
export const ACCESS_VERIFICATION_SOURCES = ["targeted", "reconciliation", "access_only", "catchup"] as const;
export type AccessVerificationSource = typeof ACCESS_VERIFICATION_SOURCES[number];
const accessReceiptPrefix = (creatorId: string, postId: string) => `patreon_access_verified:v1:${JSON.stringify([creatorId, postId])}:`;
export const accessReceiptKey = (creatorId: string, postId: string, head: string, source: AccessVerificationSource) => accessReceiptPrefix(creatorId, postId) + head + ":" + source;
export function accessVerificationHead(row: { creatorId: string; postId: string; campaignId: string; status: string; version: number; revision: string; tiers: string[]; isPublic: boolean }): string {
  return createHash("sha256").update(JSON.stringify([row.creatorId, row.postId, row.campaignId, row.status, row.version, row.revision, row.tiers, row.isPublic])).digest("hex");
}

/** One proof per post/source, committed with the accepted current canonical head. */
export function recordAccessVerification(snapshot: CanonicalSnapshot, creatorId: string, postIds: string[], source: AccessVerificationSource): void {
  const posts = postIds.flatMap((id) => {
    const post = snapshot.posts[creatorId]?.[id];
    return post && post.creator_id === creatorId && post.post_id === id && (post.source ?? "PATREON") === "PATREON" && post.upstream_status === "active" && post.current.tier_ids.length && post.campaign_id && snapshot.ingest_idempotency[campaignBindingKey(creatorId, id, post.campaign_id)] ? [post] : [];
  });
  const prefixes = new Set(posts.map((post) => accessReceiptPrefix(creatorId, post.post_id)));
  for (const key of Object.keys(snapshot.ingest_idempotency)) {
    if (key.startsWith("patreon_access_verified:v1:") && key.endsWith(":" + source) && prefixes.has(key.slice(0, key.lastIndexOf("]:") + 2))) delete snapshot.ingest_idempotency[key];
  }
  for (const post of posts) {
    if (!post.campaign_id) continue;
    const id = post.post_id;
    const head = accessVerificationHead({ creatorId, postId: id, campaignId: post.campaign_id, status: post.upstream_status,
      version: post.current.version_seq, revision: post.current.upstream_revision, tiers: post.current.tier_ids, isPublic: post.is_public === true });
    snapshot.ingest_idempotency[accessReceiptKey(creatorId, id, head, source)] = { first_seen_at: new Date().toISOString() };
  }
}

/** Includes an accepted-observation fence even when content and access are unchanged. */
export function patreonPostState(snapshot: CanonicalSnapshot, creatorId: string, postId: string): string {
  const post = snapshot.posts[creatorId]?.[postId];
  return createHash("sha256").update(JSON.stringify([
    snapshot.ingest_idempotency[observationKey(creatorId, postId)] ?? null,
    post ? [post.source ?? "PATREON", post.upstream_status, post.current.version_seq,
      post.current.upstream_revision, post.current.tier_ids, post.campaign_id, post.is_public ?? false,
      post.current.media_ids.map((id) => {
        const media = snapshot.media[creatorId]?.[id];
        return [id, media?.upstream_status, media?.current.version_seq, media?.current.upstream_revision, media?.current.upstream_url];
      })] : null
  ])).digest("hex");
}

export function patreonPostStates(snapshot: CanonicalSnapshot, creatorId: string): Record<string, string> {
  const ids = new Set(Object.keys(snapshot.posts[creatorId] ?? {}));
  for (const key of Object.keys(snapshot.ingest_idempotency)) {
    if (key.startsWith("patreon_post_observation:v1:")) {
      const [owner, id] = JSON.parse(key.slice("patreon_post_observation:v1:".length)) as string[];
      if (owner === creatorId && id) ids.add(id);
    }
  }
  return Object.fromEntries([...ids].map((id) => [id, patreonPostState(snapshot, creatorId, id)]));
}

export function preparePatreonPostRefresh(snapshot: CanonicalSnapshot, batch: SyncBatchInput,
  refresh?: PatreonPostRefresh, expectedStates?: Record<string, string>, preserveMedia = false): string[] {
  const creatorId = batch.creator_id;
  const ids = refresh ? [refresh.postId] : (batch.posts ?? []).map((post) => post.post_id);
  for (const id of ids) {
    const existing = snapshot.posts[creatorId]?.[id];
    if (refresh?.campaignId && existing?.campaign_id && existing.campaign_id !== refresh.campaignId) throw new Error("Patreon post belongs to a different campaign.");
    if (snapshot.posts[creatorId]?.[id]?.source === "RELAY") throw new Error("Patreon refresh cannot change a Relay post.");
    const expected = refresh?.state ?? expectedStates?.[id] ?? patreonPostState({ ingest_idempotency: {}, posts: {} } as CanonicalSnapshot, creatorId, id);
    if (patreonPostState(snapshot, creatorId, id) !== expected) throw new Error("Patreon post changed during collection; retry current source metadata.");
  }
  if (refresh?.deletion) {
    const post = snapshot.posts[creatorId]?.[refresh.postId];
    if (refresh.requireVerifiedBinding && (!refresh.campaignId || !snapshot.ingest_idempotency[campaignBindingKey(creatorId, refresh.postId, refresh.campaignId)])) throw new Error("Patreon post campaign binding is unverified; deletion requires a verified observation.");
    // A restored post has a new head; retries of this deletion keep its first observation.
    const key = `patreon_post_deletion_observed:v1:${JSON.stringify([creatorId, refresh.postId, post?.current.version_seq ?? 0])}`;
    const observed = snapshot.ingest_idempotency[key] ??= { first_seen_at: new Date().toISOString() };
    batch.tombstones = [{ entity_type: "post", id: refresh.postId, deleted_at: observed.first_seen_at }];
  }
  if (refresh?.preserveMedia || preserveMedia) {
    for (const post of batch.posts ?? []) {
      const existing = snapshot.posts[creatorId]?.[post.post_id];
      if (!existing) continue;
      post.media = existing.current.media_ids.map((id) => {
        const media = snapshot.media[creatorId]?.[id];
        if (!media) throw new Error("Patreon post media is unavailable; retry refresh.");
        return { media_id: id, ...media.current };
      });
      post.upstream_revision = post.upstream_revision.replace(/:sha256:.*$/, "") + `:sha256:${patreonPostContentHash(post)}`;
    }
  }
  return ids;
}

export function finishPatreonPostRefresh(snapshot: CanonicalSnapshot, creatorId: string, ids: string[]): void {
  for (const id of ids) {
    const post = snapshot.posts[creatorId]?.[id];
    if (post) post.is_public = post.current.tier_ids.includes(RELAY_TIER_PUBLIC);
    const key = observationKey(creatorId, id);
    const previous = Date.parse(snapshot.ingest_idempotency[key]?.first_seen_at ?? "") || 0;
    snapshot.ingest_idempotency[key] = { first_seen_at: new Date(Math.max(Date.now(), previous + 1)).toISOString() };
  }
}
