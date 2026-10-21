import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { DbSyncWatermarkStore } from "../src/ingest/sync-watermark-store-db.js";
import { emptyPostSyncProgress } from "../src/patreon/post-sync-progress.js";
import { campaignBindingKey } from "../src/patreon/post-refresh-state.js";
import { runIncrementalAutosyncOnce } from "../src/patreon/incremental-sync-worker.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import { deferred, targetedFixture } from "./helpers/patreon-targeted-post.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-11 transactional post progress", () => {
  let first: PrismaClient, second: PrismaClient;
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Post progress tests require a disposable loopback database");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => { await Promise.all([first?.$disconnect(), second?.$disconnect()]); }, 30_000);
  function setup() {
    const id = randomUUID(), creator = `ps11_${id}`, campaign = BigInt(`0x${id.replaceAll("-", "").slice(0, 15)}`).toString();
    const watermarks = new DbSyncWatermarkStore(first), otherWatermarks = new DbSyncWatermarkStore(second);
    const a = targetedFixture(new DbCanonicalStore(first), creator, campaign, id, watermarks);
    const b = targetedFixture(new DbCanonicalStore(second), creator, campaign, id, otherWatermarks);
    const sync = (max = 1) => a.service.scrapeOrSync(creator, "ps11", { campaign_id: campaign, max_post_pages: max });
    const next = (cursor: string) => `https://www.patreon.com/api/oauth2/v2/campaigns/${campaign}/posts?page%5Bcursor%5D=${cursor}`;
    return { a, b, watermarks, otherWatermarks, sync, next };
  }

  it("commits bounded archive/catch-up progress, preserves a newer legacy watermark, and finds equal-time IDs", async () => {
    const { a, watermarks, sync, next } = setup();
    await watermarks.set(a.creatorId, a.campaignId, "2026-10-19T00:00:00.000Z");
    const tail = { ...a.resource("Old tail"), id: a.resourceId + "_tail" };
    let arrivals = false;
    const newer = { ...a.resource("Equal-time arrival"), id: a.resourceId + "_new" };
    a.state.listResponse = async (url) => Response.json(url.searchParams.has("page[cursor]") ? { data: [tail] } : { data: arrivals ? [a.resource(), newer] : [a.resource()], links: { next: next("tail") } });
    expect((await sync()).post_coverage?.archive).toBe("partial"); arrivals = true;
    expect((await sync()).post_coverage?.archive).toBe("complete");
    expect(await first.post.findUnique({ where: { id: `patreon_post_${tail.id}` } })).not.toBeNull();
    expect((await sync()).post_coverage?.catchup).toBe("partial");
    // Due reconciliation gets a turn before catch-up resumes; provider ordering is not inferred.
    for (let i = 0; i < 4; i++) await sync();
    expect(await first.post.findUnique({ where: { id: `patreon_post_${newer.id}` } })).not.toBeNull();
    const lease = await watermarks.postProgress.claim(a.creatorId, a.campaignId);
    expect(lease!.progress.catchup.status).toBe("complete"); await watermarks.postProgress.release(lease!);
    expect(await watermarks.get(a.creatorId, a.campaignId)).toBe("2026-10-19T00:00:00.000Z");
  });

  it("rolls canonical data back when the atomic checkpoint loses its lease and allows a fresh worker", async () => {
    const { a, watermarks, otherWatermarks } = setup();
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    expect(await otherWatermarks.postProgress.claim(a.creatorId, a.campaignId)).toBeNull();
    const batch = (await a.service.scrapeOrSync(a.creatorId, "dry", { campaign_id: a.campaignId, dry_run: true })).batch;
    await first.syncCursor.update({ where: { creatorId_campaignId: { creatorId: a.creatorId, campaignId: a.campaignId } }, data: { postLeaseUntil: new Date(0) } });
    const replacement = (await otherWatermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    await expect(a.ingest.runBatch(batch, "stale-checkpoint", undefined, [], { currentPatreonSnapshot: true, expectedPatreonPostStates: {}, verifiedPatreonCampaign: `patreon_campaign_${a.campaignId}`, postCheckpoint: { lease, progress: emptyPostSyncProgress() } })).rejects.toThrow("lease changed");
    expect(await second.post.findUnique({ where: { id: `patreon_post_${a.resourceId}` } })).toBeNull();
    expect(await second.ingestIdempotencyKey.count({ where: { creatorId: a.creatorId, batchKey: { startsWith: "patreon_access_verified:v1:" } } })).toBe(0);
    await watermarks.postProgress.release(lease);
    expect(await watermarks.postProgress.claim(a.creatorId, a.campaignId)).toBeNull();
    await otherWatermarks.postProgress.release(replacement);
  });

  it("rejects an old list response after a targeted paid update without advancing that page", async () => {
    const { a, b, watermarks, sync } = setup(); await a.seed();
    const started = deferred<void>(), response = deferred<Response>();
    a.state.listResponse = () => { started.resolve(); return response.promise; };
    const pending = sync(); await started.promise;
    b.state.post = b.resource("Paid current", false); await b.refresh();
    response.resolve(Response.json({ data: [a.resource("Old public")] }));
    await expect(pending).rejects.toThrow("changed during collection");
    expect(await a.post()).toMatchObject({ is_public: false, current: { title: "Paid current" } });
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    expect(lease.progress.archive.pages).toBe(0); expect(lease.progress.archive.status).toBe("unknown");
    await watermarks.postProgress.release(lease);
  });

  it("repairs a legacy same-creator wrong public campaign binding only from an explicit verified relationship", async () => {
    const { a, watermarks, sync } = setup(); await a.seed();
    const wrongId = `patreon_campaign_${BigInt(a.campaignId) + 1n}`;
    await first.campaign.create({ data: { id: wrongId, creatorId: a.creatorId, name: "Legacy other", versionSeq: 1, upstreamUpdatedAt: new Date() } });
    await first.post.update({ where: { id: `patreon_post_${a.resourceId}` }, data: { campaignId: wrongId } });
    a.state.listResponse = async () => Response.json({ data: [{ ...a.resource(), relationships: {} }] });
    await expect(sync()).rejects.toThrow("binding requires an authoritative relationship");
    expect((await a.post()).campaign_id).toBe(wrongId);
    a.state.listResponse = async () => Response.json({ data: [a.resource()] });
    await sync(2);
    expect((await a.post()).campaign_id).toBe(`patreon_campaign_${a.campaignId}`);
    const snapshot = await a.store.loadForCreator(a.creatorId);
    expect(snapshot.ingest_idempotency[campaignBindingKey(a.creatorId, `patreon_post_${a.resourceId}`, `patreon_campaign_${a.campaignId}`)]).toBeDefined();
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!; await watermarks.postProgress.release(lease);
  });

  it("does not delete absent/unverified legacy rows and only reconciles 404 after a campaign-verified observation", async () => {
    const { a, watermarks, sync } = setup(); await a.seed();
    // A scheduled 404 for an unverified legacy binding cannot invent a signed deletion.
    a.state.status = 404;
    await expect(a.service.refreshPost(a.creatorId, "reconcile", a.campaignId, a.resourceId, "reconciliation")).rejects.toThrow("unverified");
    expect((await a.post()).upstream_status).toBe("active");
    await sync(1); // list explicitly verifies the binding
    a.state.status = 403;
    await expect(a.service.refreshPost(a.creatorId, "reconcile", a.campaignId, a.resourceId, "reconciliation")).rejects.toThrow();
    expect((await a.post()).upstream_status).toBe("active");
    a.state.status = 404;
    await a.service.refreshPost(a.creatorId, "reconcile", a.campaignId, a.resourceId, "reconciliation");
    expect((await a.post()).upstream_status).toBe("deleted");
    expect(await watermarks.get(a.creatorId, a.campaignId)).not.toBeNull();
  });

  it("a caught-up probe leaves archive and old-record reconciliation runnable", async () => {
    const { a, watermarks, sync, next } = setup();
    a.state.listResponse = async (url) => Response.json({ data: [a.resource()], ...(url.searchParams.has("page[cursor]") ? {} : { links: { next: next("tail") } }) });
    await sync(); await sync(1);
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    expect(lease.progress.archive.status).toBe("complete");
    lease.progress.catchup.status = "complete"; lease.progress.catchup.due = 0; lease.progress.turn = 3;
    await watermarks.postProgress.checkpoint({ lease, progress: lease.progress }); await watermarks.postProgress.release(lease);
    a.state.post = a.resource("Older edited", false);
    await sync(1);
    expect((await a.post()).current.title).toBe("Older edited");
  });

  it("advances failed reconciliation keys and rotates capped creators across independent selectors", async () => {
    const { a, watermarks, otherWatermarks, sync } = setup(); await sync();
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    lease.progress.turn = 3; await watermarks.postProgress.checkpoint({ lease, progress: lease.progress }); await watermarks.postProgress.release(lease);
    a.state.status = 403;
    const result = await sync(); expect(result.warnings.join(" ")).toContain("Reconciliation remains unverified");
    const after = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    expect(after.progress.reconcile.after).toBe(`patreon_post_${a.resourceId}`); await watermarks.postProgress.release(after);
    const ids = ["ps11_fair_a", "ps11_fair_b", "ps11_fair_c"];
    await first.patreonPostScheduler.deleteMany({ where: { id: "posts" } });
    const selected = await Promise.all([watermarks.postProgress.selectCreators(ids, 1), otherWatermarks.postProgress.selectCreators(ids, 1)]);
    expect(selected.flat().sort()).toEqual([ids[0], ids[1]]);
    expect(await otherWatermarks.postProgress.selectCreators(ids, 1)).toEqual([ids[2]]);
  });

  it("discovers an equal-time ID arriving after both traversals completed despite a caught-up worker probe", async () => {
    const { a, watermarks, sync } = setup();
    await sync(2);
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    expect(lease.progress.archive.status).toBe("complete"); expect(lease.progress.catchup.status).toBe("complete");
    lease.progress.catchup.due = 0; lease.progress.turn = 2;
    await watermarks.postProgress.checkpoint({ lease, progress: lease.progress }); await watermarks.postProgress.release(lease);
    const arrival = { ...a.resource("Same timestamp new ID"), id: a.resourceId + "_arrival" };
    a.state.listResponse = async () => Response.json({ data: [a.resource(), arrival] });
    const probe = await a.service.prepareSyncStateForAutomation(a.creatorId, { campaign_id: a.campaignId, probe_upstream: true });
    expect(probe.likely_has_newer_posts).toBe(false);
    const result = await runIncrementalAutosyncOnce({ creatorId: a.creatorId, maxPostPages: 1, probeSkipWhenCaughtUp: true,
      tokenStore: {} as PatreonTokenStore, patreonSyncService: a.service });
    expect(result.creators_succeeded).toBe(1); expect(result.creators_skipped_probe).toBe(0);
    expect(await second.postVersion.findFirst({ where: { postId: `patreon_post_${arrival.id}` }, orderBy: { versionSeq: "desc" } })).toMatchObject({ title: "Same timestamp new ID" });
  });

  it("honors explicit force-access after completion and resumes the forced pass across capped requests", async () => {
    const { a, watermarks, sync, next } = setup(); await sync(2);
    const lease = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    lease.progress.reconcile.due = Date.now() + 3_600_000;
    await watermarks.postProgress.checkpoint({ lease, progress: lease.progress }); await watermarks.postProgress.release(lease);
    const seen: Array<string | null> = [];
    a.state.listResponse = async (url) => {
      seen.push(url.searchParams.get("page[cursor]"));
      return Response.json(url.searchParams.has("page[cursor]") ? { data: [{ ...a.resource("Forced tail", false), id: a.resourceId + "_forced" }] } : { data: [a.resource("Forced paid", false)], links: { next: next("force-tail") } });
    };
    const force = () => a.service.scrapeOrSync(a.creatorId, "force-access", { campaign_id: a.campaignId, max_post_pages: 1, force_refresh_post_access: true });
    await force(); expect((await a.post()).is_public).toBe(false);
    await force(); expect(seen).toEqual([null, "force-tail"]);
    const completed = (await watermarks.postProgress.claim(a.creatorId, a.campaignId))!;
    expect(completed.progress.catchup.status).toBe("complete"); await watermarks.postProgress.release(completed);
  });
});
