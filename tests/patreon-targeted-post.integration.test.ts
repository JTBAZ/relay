import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { PatreonChangeWorkStore } from "../src/patreon/patreon-change-work.js";
import { processPatreonChanges } from "../src/patreon/patreon-change-worker.js";
import { dispatchVerifiedPatreonPlatformPayload } from "../src/patreon/patreon-webhook-platform.js";
import type { PatreonMemberSyncCoordinator } from "../src/patreon/patreon-member-sync-coordinator.js";
import { syncPostAccessFromOAuth } from "../src/patreon/sync-post-access-from-oauth.js";
import type { PatreonAuthService } from "../src/auth/auth-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import { deferred, targetedFixture } from "./helpers/patreon-targeted-post.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-09 targeted PostgreSQL worker convergence", () => {
  let first: PrismaClient, second: PrismaClient;
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Targeted post tests require a disposable loopback database");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => { await Promise.all([first?.$disconnect(), second?.$disconnect()]); }, 30_000);
  function setup() {
    const id = randomUUID(), creatorId = `ps09_${id}`;
    const campaignId = BigInt(`0x${id.replaceAll("-", "").slice(0, 15)}`).toString();
    const a = targetedFixture(new DbCanonicalStore(first), creatorId, campaignId, id);
    const b = targetedFixture(new DbCanonicalStore(second), creatorId, campaignId, id);
    return { a, b, postId: `patreon_post_${id}` };
  }

  function syncAccess(run: ReturnType<typeof targetedFixture>, prisma: PrismaClient) {
    return syncPostAccessFromOAuth({ creatorId: run.creatorId, traceId: "ps09-access", prisma,
      authService: { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService,
      tokenStore: { getByCreatorId: async () => ({ access_token: "fixture" }) } as unknown as PatreonTokenStore,
      fetchImpl: run.fetchImpl, options: { campaign_id: run.campaignId } });
  }

  it("persists the paid gate before failed media while retaining curation, media, and audit relationships", async () => {
    const { a, b, postId } = setup();
    const original = a.resource(); original.attributes!.content = '<p>Original</p><img src="https://cdn.fixture.example/old.png">';
    await a.seed(original);
    await first.post.update({ where: { id: postId }, data: { isPublic: true } });
    await first.postPresentation.create({ data: { creatorId: a.creatorId, postId, relayTitle: "Creator title", relayDescription: "Creator copy" } });
    await first.postOverride.create({ data: { creatorId: a.creatorId, postId, addTagIds: ["curated"] } });
    const before = await first.post.findUniqueOrThrow({ where: { id: postId }, include: { presentation: true, platformInstances: true, creativeWorkMember: true, mediaAssets: true } });
    const mediaId = before.mediaAssets[0]!.id;
    const comment = await first.comment.create({ data: { relayCreatorId: a.creatorId, postId, mediaId, anchorX: 20, anchorY: 30, patronUserId: "fixture", body: "Pinned audit" } });
    const engagement = await first.relayEngagementEvent.create({ data: { creatorId: a.creatorId, postId, mediaId, eventType: "reveal_interaction", occurredAt: new Date() } });
    const expectAudit = async () => {
      expect(await second.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ mediaId });
      expect(await second.relayEngagementEvent.findUniqueOrThrow({ where: { id: engagement.id } })).toMatchObject({ postId, mediaId });
    };
    a.state.post = a.resource("Paid", false); a.state.cookie = true;
    const started = deferred<void>(), response = deferred<Response>();
    a.state.cookieResponse = () => { started.resolve(); return response.promise; };
    const pending = a.refresh(); await started.promise;
    const gated = await second.post.findUniqueOrThrow({ where: { id: postId }, include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 }, postTiers: true, mediaAssets: true } });
    expect(gated.isPublic).toBe(false); expect(gated.requiredTierId).toBe("patreon_tier_9100");
    expect(gated.versions[0]!.tierIds).toEqual(["patreon_tier_9100"]); expect(gated.postTiers).toHaveLength(1);
    expect(gated.mediaAssets.map((media) => media.id)).toEqual(before.mediaAssets.map((media) => media.id));
    await expectAudit();
    response.resolve(new Response("{}", { status: 403 })); await expect(pending).rejects.toThrow();
    b.state.post = b.resource("Current paid media", false);
    b.state.post.attributes!.content = '<p>Edited body</p><img src="https://cdn.fixture.example/new.png">';
    await b.refresh(); await expectAudit();
    expect(await second.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).toMatchObject({ currentUpstreamUrl: "https://cdn.fixture.example/new.png" });
    b.state.post = b.resource("Current public", true);
    await syncAccess(b, second); await expectAudit();
    expect(await first.post.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({ isPublic: true });
    b.state.status = 404; await b.refresh(true); await expectAudit();
    const after = await second.post.findUniqueOrThrow({ where: { id: postId }, include: { presentation: true, platformInstances: true, creativeWorkMember: true, versions: true } });
    expect(after.upstreamStatus).toBe("deleted"); expect(after.presentation).toEqual(before.presentation);
    expect(after.platformInstances).toEqual(before.platformInstances); expect(after.creativeWorkMember).toEqual(before.creativeWorkMember);
    expect(after.versions.length).toBeGreaterThan(before.mediaAssets.length);
    expect(await second.postOverride.findMany({ where: { creatorId: a.creatorId, postId } })).toEqual([expect.objectContaining({ addTagIds: ["curated"] })]);
  });

  it("fences an older OAuth response across independent clients, including unchanged observations", async () => {
    const { a, b } = setup(); await a.seed();
    const started = deferred<void>(), response = deferred<Response>();
    a.state.postResponse = () => { started.resolve(); return response.promise; };
    const stale = a.refresh(); await started.promise;
    await b.refresh();
    response.resolve(Response.json({ data: a.resource("Stale") }));
    await expect(stale).rejects.toThrow("changed during collection");
    expect((await b.post()).current.title).toBe("Original"); expect((await b.post()).versions).toHaveLength(1);
  });

  it("fences an older post refresh when another worker accepts a shared-media revision", async () => {
    const { a, b, postId } = setup();
    const original = a.resource(); original.attributes!.content = '<img src="https://cdn.fixture.example/shared-old.png">';
    await a.seed(original);
    const current = await a.store.loadForCreator(a.creatorId);
    const mediaId = current.posts[a.creatorId]![postId]!.current.media_ids[0]!;
    const started = deferred<void>(), response = deferred<Response>();
    a.state.postResponse = () => { started.resolve(); return response.promise; };
    const stale = a.refresh(); await started.promise;
    await b.ingest.runBatch({ creator_id: a.creatorId, posts: [{ post_id: `${postId}_shared`, title: "Shared reference",
      published_at: "2026-01-01T00:00:00.000Z", upstream_revision: "shared-post-current", tier_ids: ["relay_tier_public"], tag_ids: [],
      media: [{ media_id: mediaId, upstream_revision: "shared-media-current", upstream_url: "https://cdn.fixture.example/shared-new.png" }] }] }, "ps09-other-post-media");
    response.resolve(Response.json({ data: original }));
    await expect(stale).rejects.toThrow("changed during collection");
    expect(await first.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).toMatchObject({ currentUpstreamRevision: "shared-media-current" });
  });

  it("retains the verified campaign for a public target when the creator has multiple campaigns", async () => {
    const { a, b, postId } = setup();
    await a.ingest.runBatch({ creator_id: a.creatorId, campaigns: [{ campaign_id: `patreon_campaign_0${a.campaignId}`, name: "Alphabetically first", upstream_updated_at: "2026-01-01T00:00:00.000Z" }] }, "ps09-other-campaign");
    await a.seed(); a.state.post = a.resource("Updated public"); await a.refresh();
    expect(await first.post.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({ campaignId: `patreon_campaign_${a.campaignId}`, isPublic: true });
    b.state.post = b.resource("Second public update"); await b.refresh();
    expect((await a.post()).current.title).toBe("Second public update");
    expect((await a.post()).campaign_id).toBe(`patreon_campaign_${a.campaignId}`);
  });

  it("rejects a stale access-only pass instead of widening the targeted paid gate", async () => {
    const { a, b, postId } = setup(); await a.seed(a.resource("Paid original", false));
    const started = deferred<void>(), response = deferred<Response>();
    a.state.listResponse = () => { started.resolve(); return response.promise; };
    const stale = syncAccess(a, first);
    await started.promise; b.state.post = b.resource("Paid current", false); await b.refresh();
    response.resolve(Response.json({ data: [a.resource("Stale public", true)] }));
    await expect(stale).rejects.toThrow("changed during access collection");
    const stored = await second.post.findUniqueOrThrow({ where: { id: postId }, include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } } });
    expect(stored.isPublic).toBe(false); expect(stored.versions[0]!.tierIds).toEqual(["patreon_tier_9100"]);
    expect(stored.versions[0]!.title).toBe("Paid current");
  });

  it("keeps an unchanged public target public after an access pass and same-hash replay", async () => {
    const { a, b, postId } = setup(); await a.seed(); await a.refresh();
    expect((await b.post()).current.tier_ids).toEqual(["relay_tier_public"]);
    await syncAccess(b, second); await a.refresh();
    const stored = await first.post.findUniqueOrThrow({ where: { id: postId }, include: { versions: true } });
    expect(stored.isPublic).toBe(true); expect(stored.versions).toHaveLength(1);
    expect(stored.versions[0]!.tierIds).toEqual(["relay_tier_public"]);
  });

  it.each([true, false])("accepts same-hash source access after an intervening access-only mutation (initial public=%s)", async (initialPublic) => {
    const { a, b, postId } = setup(); a.state.post = a.resource("Original", initialPublic);
    await a.seed(a.state.post); await a.refresh();
    b.state.post = b.resource("Original", !initialPublic); await syncAccess(b, second);
    expect((await b.post()).is_public).toBe(!initialPublic);
    await a.refresh();
    const stored = await first.post.findUniqueOrThrow({ where: { id: postId }, include: { versions: { orderBy: { versionSeq: "desc" } } } });
    expect(stored.isPublic).toBe(initialPublic); expect(stored.versions).toHaveLength(2);
    expect(stored.versions[0]!.tierIds).toEqual(initialPublic ? ["relay_tier_public"] : ["patreon_tier_9100"]);
  });

  it("prevents an in-flight cookie fetch from reopening a later accepted deletion", async () => {
    const { a, b } = setup(); await a.seed(); a.state.cookie = true;
    const started = deferred<void>(), response = deferred<Response>();
    a.state.cookieResponse = () => { started.resolve(); return response.promise; };
    const stale = a.refresh(); await started.promise;
    b.state.status = 410; await b.refresh(true);
    response.resolve(Response.json({ data: a.resource() }));
    await expect(stale).rejects.toThrow("changed during collection"); expect((await a.post()).upstream_status).toBe("deleted");
  });

  it("retains deletion identity after reload and accepts identical restoration followed by a new deletion", async () => {
    const { a, b } = setup(); await a.seed(); a.state.status = 404; await a.refresh(true);
    const before = await first.ingestIdempotencyKey.findMany({ where: { creatorId: a.creatorId, batchKey: { startsWith: "patreon_post_deletion_observed:" } }, select: { batchKey: true, firstSeenAt: true } });
    b.state.status = 404; await b.refresh(true);
    expect(await second.ingestIdempotencyKey.findMany({ where: { creatorId: a.creatorId, batchKey: { startsWith: "patreon_post_deletion_observed:" } }, select: { batchKey: true, firstSeenAt: true } })).toEqual(before);
    b.state.status = 200; await b.refresh(); expect((await b.post()).upstream_status).toBe("active"); expect((await b.post()).versions).toHaveLength(2);
    await a.refresh(true); expect((await b.post()).upstream_status).toBe("deleted");
    expect(await second.ingestIdempotencyKey.count({ where: { creatorId: a.creatorId, batchKey: { startsWith: "patreon_post_deletion_observed:" } } })).toBe(2);
  });

  it("rejects a pre-deletion campaign collection and preserves Relay-native records", async () => {
    const { a, b, postId } = setup(); await a.seed();
    const started = deferred<void>(), response = deferred<Response>();
    a.state.listResponse = () => { started.resolve(); return response.promise; };
    const stale = a.service.scrapeOrSync(a.creatorId, "ps09-old-campaign", { campaign_id: a.campaignId, force_refresh_post_access: true });
    await started.promise; b.state.status = 404; await b.refresh(true); response.resolve(Response.json({ data: [a.resource()] }));
    await expect(stale).rejects.toThrow("changed during collection"); expect((await a.post()).upstream_status).toBe("deleted");
    await first.post.update({ where: { id: postId }, data: { source: "RELAY", upstreamStatus: "active" } });
    const native = await first.post.findUniqueOrThrow({ where: { id: postId }, include: { versions: true } });
    await expect(b.refresh(true)).rejects.toThrow("Relay post");
    expect(await second.post.findUniqueOrThrow({ where: { id: postId }, include: { versions: true } })).toEqual(native);
  });

  it.each(["pending", "running", "failed"])("keeps signed deletion intent through %s coalesced updates and clears the hint after completion", async (status) => {
    const { a, b } = setup(); await a.seed();
    await first.tenant.create({ data: { relayCreatorId: a.creatorId } });
    const receipts = new PatreonChangeWorkStore(first);
    const change = { creatorId: a.creatorId, campaignId: a.campaignId, resourceType: "post" as const, resourceId: a.resourceId, eventType: "posts:delete" };
    await receipts.accept([change], "delete");
    const accepted = await first.patreonChangeWork.findFirstOrThrow({ where: { creatorId: a.creatorId } });
    if (status === "failed") await first.patreonChangeWork.update({ where: { id: accepted.id }, data: { status: "failed", attempts: 5 } });
    if (status === "running") {
      await first.patreonChangeWork.update({ where: { id: accepted.id }, data: { dueAt: new Date(0) } });
      const older = await receipts.claim(accepted.id);
      await receipts.accept([{ ...change, eventType: "posts:update" }], "delayed-update");
      await receipts.finish(older!);
    } else await receipts.accept([{ ...change, eventType: "posts:update" }], "delayed-update");
    const row = await first.patreonChangeWork.findFirstOrThrow({ where: { creatorId: a.creatorId } });
    expect(row).toMatchObject({ generation: 2, eventType: "posts:delete" });
    await first.patreonChangeWork.update({ where: { id: row.id }, data: { dueAt: new Date(0) } });
    b.state.status = 404;
    const execute = async (work: typeof row) => {
      await dispatchVerifiedPatreonPlatformPayload({ creatorId: work.creatorId, campaignId: work.campaignId, resourceId: work.resourceId,
        eventHeader: work.eventType, traceId: "ps09-coalesced", syncService: b.service, memberCoordinator: {} as PatreonMemberSyncCoordinator });
    };
    await processPatreonChanges(new PatreonChangeWorkStore(second), execute, row.id);
    expect((await a.post()).upstream_status).toBe("deleted");
    await receipts.accept([{ ...change, eventType: "posts:update" }], "restored-update");
    expect(await first.patreonChangeWork.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "pending", eventType: "posts:update" });
    b.state.status = 200; await first.patreonChangeWork.update({ where: { id: row.id }, data: { dueAt: new Date(0) } });
    await processPatreonChanges(new PatreonChangeWorkStore(second), execute, row.id);
    expect((await a.post()).upstream_status).toBe("active");
  });
});
