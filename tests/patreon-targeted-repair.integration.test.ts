import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { deferred, targetedFixture } from "./helpers/patreon-targeted-post.js";
import { MediaRepairStore } from "../src/export/media-repair-store.js";
import { postCollectionHead } from "../src/export/media-repair-state.js";
import { DbPatreonSyncHealthStore } from "../src/patreon/patreon-sync-health-store-db.js";
import { PatreonChangeWorkStore } from "../src/patreon/patreon-change-work.js";
import { readSyncCompleteness } from "../src/patreon/sync-completeness.js";
import { syncPostAccessFromOAuth } from "../src/patreon/sync-post-access-from-oauth.js";
import { createApp } from "../src/server.js";

const target = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!target)("PS14 private persisted evidence and targeted repair", () => {
  let first: PrismaClient, second: PrismaClient;
  const creators: string[] = [], healthIds: string[] = [], accounts: string[] = [], users: string[] = [], roots: string[] = [];
  beforeAll(async () => {
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.port !== "49952" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Explicit private PS14 database required");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) }); second = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => {
    if (first) {
      await first.account.deleteMany({ where: { id: { in: accounts } } });
      await first.creatorProfile.deleteMany({ where: { userId: { in: users } } }); await first.user.deleteMany({ where: { id: { in: users } } });
      await first.creatorSyncState.deleteMany({ where: { creatorId: { in: healthIds } } }); await first.tenant.deleteMany({ where: { relayCreatorId: { in: creators } } });
    }
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    for (const root of roots) { if (!root.startsWith(join(tmpdir(), "relay-ps14-http-"))) throw new Error("Unexpected fixture cleanup path"); await rm(root, { recursive: true, force: true }); }
  });
  async function httpReader(f: { creatorId: string; campaignId: string }) {
    const root = await mkdtemp(join(tmpdir(), "relay-ps14-http-")); roots.push(root);
    const tenant = await first.tenant.findUniqueOrThrow({ where: { relayCreatorId: f.creatorId } });
    const user = await first.user.create({ data: { tenantId: tenant.id, kind: "creator", identityAuthProvider: "independent" } }); users.push(user.id);
    await first.creatorProfile.create({ data: { tenantId: tenant.id, userId: user.id, publicSlug: "ps14-" + randomUUID(), patreonCampaignId: f.campaignId } });
    const account = await first.account.create({ data: { identityAuthProvider: "independent", primaryRelayCreatorId: f.creatorId } }); accounts.push(account.id);
    const api = createApp({ prisma: first, relay_db_store_identity: true, relay_db_store_canonical: true, relay_db_store_creator_oauth: true, relay_db_store_watermark: true, relay_db_store_sync_health: true, relay_db_store_patreon_cookie: true,
      relay_token_encryption_key: randomBytes(32).toString("base64"), patreon_client_id: "fixture", patreon_client_secret: "fixture", credential_store_path: join(root, "tokens.json"),
      identity_store_path: join(root, "identity.json"), ingest_canonical_path: join(root, "canonical.json"), cookie_store_path: join(root, "cookie.json"), export_storage_root: join(root, "exports"),
      fetch_impl: (() => { throw new Error("Provider I/O is forbidden in this read fixture"); }) as typeof fetch });
    await api.tokenStore.upsert({ creator_id: f.creatorId, access_token: "private-fixture", refresh_token: "private-fixture", access_token_expires_at: "2099-01-01T00:00:00.000Z", credential_health_status: "healthy" });
    const session = await api.identityService.issueExtensionSessionForAccount(account.id, "fixture");
    return { ...api, accountId: account.id, auth: `Bearer ${session.token}`, get: () => request(api.app).get("/api/v1/patreon/sync-state").query({ creator_id: f.creatorId }).set("Authorization", `Bearer ${session.token}`) };
  }
  async function setup() {
    const id = randomUUID(), creatorId = `ps14_${id}`, campaignId = BigInt(`0x${id.replaceAll("-", "").slice(0, 15)}`).toString();
    creators.push(creatorId); await first.tenant.create({ data: { relayCreatorId: creatorId } });
    const canonical = new DbCanonicalStore(first), run = targetedFixture(canonical, creatorId, campaignId, id);
    await run.seed(run.resource());
    const snapshot = await canonical.loadForCreator(creatorId), post = snapshot.posts[creatorId]![`patreon_post_${id}`]!;
    const repair = new MediaRepairStore(first), other = new MediaRepairStore(second), head = postCollectionHead(post);
    await repair.ensure(creatorId, "post", post.post_id, head);
    await first.patreonMediaRepair.update({ where: { creatorId_kind_resourceId: { creatorId, kind: "post", resourceId: post.post_id } }, data: { attempts: 2, lastError: "cookie_required", dueAt: new Date(Date.now() + 60_000) } });
    return { creatorId, campaignId, post, head, repair, other, run };
  }
  it("reads accepted targeted, reconciliation and access-only proofs with bounded scope and current-head fencing", async () => {
    const f = await setup(), api = await httpReader(f);
    await f.run.refresh();
    let result = (await api.get().expect(200)).body.data.completeness;
    expect(result.posts_access).toMatchObject({ status: "partial", scope: "bounded", counts: { verified: 1 }, sources: ["targeted"] });
    expect(result.posts_access.last_verified_at).toBeTruthy();
    await f.run.service.refreshPost(f.creatorId, "ps14-reconcile", f.campaignId, f.run.resourceId, "reconciliation");
    expect((await api.get().expect(200)).body.data.completeness.posts_access.sources).toContain("reconciliation");
    await syncPostAccessFromOAuth({ creatorId: f.creatorId, traceId: "ps14-access", prisma: first,
      tokenStore: { getByCreatorId: async () => ({ access_token: "fixture" }) } as never,
      authService: { ensureFreshAccessForAutomation: async () => {} } as never,
      fetchImpl: f.run.fetchImpl, options: { campaign_id: f.campaignId } });
    result = (await api.get().expect(200)).body.data.completeness;
    expect(result.posts_access.sources?.sort()).toEqual(["access_only", "reconciliation", "targeted"]);
    expect(result.posts_access.counts?.verified).toBe(1);
    await second.postVersion.updateMany({ where: { postId: f.post.post_id }, data: { upstreamRevision: "changed-head" } });
    expect((await readSyncCompleteness(first, undefined, f.creatorId, f.campaignId)).posts_access).toMatchObject({ status: "unknown", last_verified_at: null, counts: { verified: 0 } });
  });
  it("enforces creator scope on actual GET/retry while leaving the extension session untouched on GET", async () => {
    const f = await setup(), api = await httpReader(f);
    const before = await first.session.findMany({ where: { tenantMembership: { accountId: api.accountId } } });
    await api.get().expect(200);
    await request(api.app).get("/api/v1/patreon/sync-state").query({ creator_id: "another-creator" }).set("Authorization", api.auth).expect(403);
    expect(await second.session.findMany({ where: { tenantMembership: { accountId: api.accountId } } })).toEqual(before);
    const body = { creator_id: f.creatorId, kind: "post", resource_id: f.post.post_id, head: f.head, generation: 1 };
    await request(api.app).post("/api/v1/patreon/repair").set("Authorization", api.auth).send({ ...body, creator_id: "another-creator" }).expect(403);
    const accepted = await request(api.app).post("/api/v1/patreon/repair").set("Authorization", api.auth).send(body).expect(202);
    expect(accepted.body.data).toEqual({ status: "accepted", completed: false });
  });
  it("cannot publish an old collector's access receipt after a newer accepted head", async () => {
    const f = await setup(), seen = deferred<void>(), reply = deferred<Response>();
    f.run.state.postResponse = () => { seen.resolve(); return reply.promise; };
    const older = f.run.refresh(); await seen.promise;
    f.run.state.postResponse = undefined; f.run.state.post = f.run.resource("New head");
    await f.run.refresh();
    const before = await second.ingestIdempotencyKey.findMany({ where: { creatorId: f.creatorId, batchKey: { startsWith: "patreon_access_verified:v1:" } }, orderBy: { batchKey: "asc" } });
    reply.resolve(Response.json({ data: f.run.resource("Old head") }));
    await expect(older).rejects.toThrow("changed");
    const after = await second.ingestIdempotencyKey.findMany({ where: { creatorId: f.creatorId, batchKey: { startsWith: "patreon_access_verified:v1:" } }, orderBy: { batchKey: "asc" } });
    expect(after).toEqual(before);
  });
  it("deduplicates retries from two clients and retains provider backoff", async () => {
    const f = await setup();
    const before = await first.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creatorId } });
    const outcomes = await Promise.all([f.repair.retryResource(f.creatorId, f.campaignId, "post", f.post.post_id, f.head, 1), f.other.retryResource(f.creatorId, f.campaignId, "post", f.post.post_id, f.head, 1)]);
    expect(outcomes.sort()).toEqual(["accepted", "already_pending"]);
    const after = await second.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creatorId } });
    expect(after.dueAt).toEqual(before.dueAt); expect(after.generation).toBe(1); expect(after.leaseToken).toBeNull();
  });
  it("rejects cross-creator, campaign, generation and changed-head retries", async () => {
    const f = await setup();
    expect(await f.repair.retryResource("another", f.campaignId, "post", f.post.post_id, f.head, 1)).toBe("changed");
    expect(await f.repair.retryResource(f.creatorId, "unbound", "post", f.post.post_id, f.head, 1)).toBe("changed");
    expect(await f.repair.retryResource(f.creatorId, f.campaignId, "post", f.post.post_id, f.head, 2)).toBe("changed");
    await second.post.update({ where: { id: f.post.post_id }, data: { upstreamStatus: "deleted" } });
    expect(await f.repair.retryResource(f.creatorId, f.campaignId, "post", f.post.post_id, f.head, 1)).toBe("changed");
  });
  it("retries failed change work only for its current bound resource and generation", async () => {
    const f = await setup(), changes = new PatreonChangeWorkStore(first);
    await changes.accept([{ creatorId: f.creatorId, campaignId: f.campaignId, resourceType: "post", resourceId: f.post.post_id.slice(13), eventType: "posts:update" }], "fixture");
    const row = await first.patreonChangeWork.findFirstOrThrow({ where: { creatorId: f.creatorId } });
    const due = new Date(Date.now() + 60_000);
    await first.patreonChangeWork.update({ where: { id: row.id }, data: { status: "failed", retryNotBefore: due } });
    expect(await changes.retryPost(row.id, f.creatorId, f.campaignId, row.generation + 1, f.head)).toBe(false);
    expect(await changes.retryPost(row.id, f.creatorId, f.campaignId, row.generation, f.head)).toBe(true);
    expect(await new PatreonChangeWorkStore(second).retryPost(row.id, f.creatorId, f.campaignId, row.generation, f.head)).toBe(false);
    expect((await second.patreonChangeWork.findUniqueOrThrow({ where: { id: row.id } })).dueAt).toEqual(due);
  });
  it("serializes two-client probe/scrape/failure merges without losing accepted evidence", async () => {
    const creator = `ps14_health_${randomUUID()}`; healthIds.push(creator);
    const a = new DbPatreonSyncHealthStore(first), b = new DbPatreonSyncHealthStore(second);
    await a.recordPostScrapeSuccess({ creator_id: creator, patreon_campaign_id: "1", posts_fetched: 1, warnings: [] });
    const accepted = (await a.getForCreator(creator))!.last_post_scrape!.last_verified_at;
    const held = deferred<void>(), release = deferred<void>();
    const blocker = first.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"patreon-health:" + creator}, 0))::text`;
      held.resolve(); await release.promise;
    });
    await held.promise;
    const writes = Promise.all([a.recordPostScrapeFailure({ creator_id: creator, patreon_campaign_id: "1", error: { code: "retry", message: "Retry required", hint: "Retry" } }),
      b.recordUpstreamProbe(creator, { campaign_id: "1", observed_at: "2026-10-21T10:00:00.000Z", newest_published_at: null })]);
    try {
      let blocked = 0;
      const deadline = Date.now() + 2000;
      while (blocked < 2 && Date.now() < deadline) {
        const rows = await second.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        blocked = rows[0].count; if (blocked < 2) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBeGreaterThanOrEqual(2);
    } finally { release.resolve(); await blocker; await writes; }
    const result = await b.getForCreator(creator);
    expect(result).toMatchObject({ upstream_probe: { observed_at: "2026-10-21T10:00:00.000Z" }, last_post_scrape: { ok: false, last_verified_at: accepted } });
    await a.recordUpstreamProbe(creator, { campaign_id: "1", observed_at: "2026-10-20T10:00:00.000Z", newest_published_at: null });
    expect((await b.getForCreator(creator))!.upstream_probe!.observed_at).toBe("2026-10-21T10:00:00.000Z");
  });
});
