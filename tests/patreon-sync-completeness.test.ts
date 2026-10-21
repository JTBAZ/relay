import { describe, expect, it, vi } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { PrismaClient } from "@prisma/client";
import { readSyncCompleteness } from "../src/patreon/sync-completeness.js";
import { emptyPostSyncProgress, type PatreonPostProgressStore } from "../src/patreon/post-sync-progress.js";
import { fingerprint } from "../src/export/media-repair-state.js";
import { accessReceiptKey, accessVerificationHead, campaignBindingKey, recordAccessVerification } from "../src/patreon/post-refresh-state.js";

function fixture() {
  const at = new Date().toISOString(), progress = emptyPostSyncProgress();
  const post = (id: string) => ({ id: `patreon_post_${id}`, creatorId: "creator", campaignId: "patreon_campaign_1", source: "PATREON", upstreamStatus: "active", isPublic: true, versions: [{ versionSeq: 1, upstreamRevision: "revision", mediaIds: [], tierIds: ["public"] }] });
  const posts = [post("1")], failures: Record<string, unknown>[] = [];
  const receipts: Array<{ batchKey: string; firstSeenAt: Date }> = [];
  const work = [{ creatorId: "creator", kind: "post", resourceId: posts[0].id, head: fingerprint(["creator", posts[0].id, "PATREON", "active", "patreon_campaign_1", 1, "revision", []]), generation: 1, phase: "complete", collection: "empty", verifiedAt: new Date(at), updatedAt: new Date(at), dueAt: new Date(), attempts: 0, leaseToken: null, lastError: null as string | null }];
  const db = { post: { findMany: vi.fn(async (query: { where: { id?: { in: string[] } } }) => query.where.id ? query.where.id.in.map((id) => post(id.slice(13))) : posts) }, mediaAsset: { findMany: vi.fn(async () => []) },
    patreonMediaRepair: { findMany: vi.fn(async () => work) }, patreonRosterState: { findUnique: vi.fn(async () => null) }, patreonChangeWork: { findMany: vi.fn(async () => failures) }, ingestIdempotencyKey: { findMany: vi.fn(async () => receipts) } };
  const store = { get: vi.fn(async () => progress), claim: vi.fn(), shared: true } as unknown as PatreonPostProgressStore;
  const read = () => readSyncCompleteness(db as unknown as PrismaClient, store, "creator", "1");
  return { at, progress, posts, work, failures, receipts, db, store, read };
}
describe("PS14 persisted scoped completeness", () => {
  it("never calls a capped current-head proof sample complete campaign coverage", async () => {
    const f = fixture(); f.progress.archive.status = "complete"; f.progress.archive.verifiedAt = f.at;
    for (let n = 2; n <= 101; n++) f.posts.push({ ...structuredClone(f.posts[0]), id: `patreon_post_${n}` });
    for (const post of f.posts.slice(0, 100)) {
      const v = post.versions[0];
      const head = accessVerificationHead({ creatorId: "creator", postId: post.id, campaignId: post.campaignId, status: post.upstreamStatus, version: v.versionSeq, revision: v.upstreamRevision, tiers: v.tierIds, isPublic: post.isPublic });
      f.receipts.push({ batchKey: accessReceiptKey("creator", post.id, head, "targeted"), firstSeenAt: new Date(f.at) });
    }
    expect((await f.read()).posts_access).toMatchObject({ status: "partial", scope: "bounded", counts: { verified: 100 } });
  });
  it.each(["media", "changes"])("does not retain complete access when the %s dependency cannot be read", async (dependency) => {
    const f = fixture(); f.progress.archive.status = "complete"; f.progress.archive.verifiedAt = f.at;
    const post = f.posts[0], v = post.versions[0];
    const head = accessVerificationHead({ creatorId: "creator", postId: post.id, campaignId: post.campaignId, status: post.upstreamStatus, version: v.versionSeq, revision: v.upstreamRevision, tiers: v.tierIds, isPublic: post.isPublic });
    f.receipts.push({ batchKey: accessReceiptKey("creator", post.id, head, "targeted"), firstSeenAt: new Date(f.at) });
    expect((await f.read()).posts_access.status).toBe("complete");
    if (dependency === "media") f.db.patreonMediaRepair.findMany.mockRejectedValue(new Error("Unavailable"));
    else f.db.patreonChangeWork.findMany.mockRejectedValue(new Error("Unavailable"));
    expect((await f.read()).posts_access).toMatchObject({ status: "unavailable", counts: null, last_verified_at: f.at });
  });
  it("never promotes complete known media to complete campaign coverage during a partial archive", async () => {
    const f = fixture(); f.progress.archive.status = "partial"; f.progress.archive.next = "cursor";
    const result = await f.read();
    expect(result.media).toMatchObject({ status: "partial", scope: "bounded", counts: { verified: 1 } });
    expect(f.store.claim).not.toHaveBeenCalled();
  });
  it("preserves accepted same-head verification after a later repair failure", async () => {
    const f = fixture(); f.progress.archive.status = "complete"; f.progress.archive.verifiedAt = f.at;
    expect((await f.read()).media).toMatchObject({ status: "complete", last_verified_at: f.at });
    f.work[0].phase = "pending"; f.work[0].lastError = "media_download_retry_required"; f.work[0].attempts = 1;
    expect((await f.read()).media).toMatchObject({ status: "failed", last_verified_at: f.at, counts: { failed: 1 } });
  });
  it("counts failed inspected work independently of five retry buttons and the sampled post set", async () => {
    const f = fixture();
    for (let n = 10; n < 17; n++) f.failures.push({ id: `work${n}`, resourceId: String(n), status: "failed", generation: 1, dueAt: new Date(), retryNotBefore: null });
    const result = await f.read();
    expect(result.posts_access).toMatchObject({ status: "failed", counts: { failed: 7, inspected_work: 7, repair_unavailable: 0 } });
    expect(result.posts_access.repairs).toHaveLength(5);
    expect(f.db.post.findMany).toHaveBeenCalledTimes(2);
  });
  it("keeps failed first-ingest work visible when a current canonical repair head is unavailable", async () => {
    const f = fixture(); f.failures.push({ id: "work", resourceId: "999", status: "failed", generation: 1, dueAt: new Date(), retryNotBefore: null });
    f.db.post.findMany.mockResolvedValueOnce(f.posts).mockResolvedValueOnce([]);
    expect((await f.read()).posts_access).toMatchObject({ status: "failed", counts: { failed: 1, repair_unavailable: 1 }, repairs: [] });
  });
  it("marks corruption/read failure unavailable, while file mode exposes supported progress only", async () => {
    const f = fixture(); f.db.patreonMediaRepair.findMany.mockRejectedValue(new Error("unavailable"));
    expect((await f.read()).media).toMatchObject({ status: "unavailable", counts: null });
    const file = await readSyncCompleteness(null, f.store, "creator", "1");
    expect(file.members.status).toBe("unavailable"); expect(file.media.counts).toBeNull();
  });
});


describe("PS14 accepted access receipt namespace", () => {
  it("replaces only its current post/source and preserves catch-up, other creators and replay markers", () => {
    const post = { post_id: "patreon_post_1", creator_id: "creator", campaign_id: "patreon_campaign_1", source: "PATREON", upstream_status: "active", is_public: true,
      current: { version_seq: 2, upstream_revision: "current", tier_ids: ["public"], media_ids: [] } };
    const binding = campaignBindingKey("creator", post.post_id, post.campaign_id);
    const old = accessReceiptKey("creator", post.post_id, "a".repeat(64), "targeted");
    const catchup = accessReceiptKey("creator", post.post_id, "b".repeat(64), "catchup");
    const other = accessReceiptKey("other", post.post_id, "c".repeat(64), "targeted");
    const preserved = { first_seen_at: "2026-10-01T00:00:00.000Z" };
    const snapshot = { posts: { creator: { [post.post_id]: post } }, ingest_idempotency: { [binding]: preserved, [old]: preserved, [catchup]: preserved, [other]: preserved, "batch:replay": preserved } } as unknown as CanonicalSnapshot;
    recordAccessVerification(snapshot, "creator", [post.post_id], "targeted");
    expect(snapshot.ingest_idempotency[old]).toBeUndefined();
    for (const key of [binding, catchup, other, "batch:replay"]) expect(snapshot.ingest_idempotency[key]).toEqual(preserved);
    expect(Object.keys(snapshot.ingest_idempotency).filter(key => key.startsWith('patreon_access_verified:v1:["creator"') && key.endsWith(":targeted"))).toHaveLength(1);
    delete snapshot.ingest_idempotency[binding];
    const before = structuredClone(snapshot.ingest_idempotency);
    recordAccessVerification(snapshot, "creator", [post.post_id], "access_only");
    expect(snapshot.ingest_idempotency).toEqual(before);
  });
});
