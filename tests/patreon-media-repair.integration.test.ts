import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DbCanonicalStore } from "../src/ingest/canonical-store-db.js";
import { MediaRepairStore, type RepairLease } from "../src/export/media-repair-store.js";
import { DbExportIndex, type ExportIndex } from "../src/export/export-index.js";
import { mediaExportHead } from "../src/export/media-repair-state.js";
import { targetedFixture } from "./helpers/patreon-targeted-post.js";
import { ExportService } from "../src/export/export-service.js";
import { IngestService } from "../src/ingest/ingest-service.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";
import { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import type { PatreonCookieStore } from "../src/auth/cookie-store.js";
import type { PatreonAuthService } from "../src/auth/auth-service.js";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createPatreonMediaRepairProcessor } from "../src/jobs/register-workers.js";
import { RELAY_JOB_QUEUE_NAMES } from "../src/jobs/queue-names.js";
import { seedPilotUxDevAccounts } from "../src/pilot-ux/seed-pilot-ux-dev-accounts.js";
import { GalleryService } from "../src/gallery/gallery-service.js";
import type { GalleryOverridesStore } from "../src/gallery/overrides-store.js";
import { buildMediaManifest } from "../src/export/manifests.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

const r2 = vi.hoisted(() => ({ bytes: new Map<string, Buffer>(), enabled: true, reads: [] as string[], stall: null as null | ((signal?: AbortSignal) => Promise<Buffer>) }));
vi.mock("../src/storage/r2-config.js", () => ({ getR2ClientConfigFromEnv: () => r2.enabled ? { bucket: "fixture" } : null }));
vi.mock("../src/storage/relay-upload-r2.js", async (original) => ({
  ...await original<typeof import("../src/storage/relay-upload-r2.js")>(),
  putR2ObjectBuffer: async (_config: unknown, key: string, body: Buffer) => { r2.bytes.set(key, Buffer.from(body)); },
  getR2ObjectBuffer: async (_config: unknown, key: string, bounds?: { signal?: AbortSignal }) => { r2.reads.push(key); if (r2.stall) return r2.stall(bounds?.signal); const bytes = r2.bytes.get(key); if (!bytes) throw new Error("Fixture blob missing"); return Buffer.from(bytes); },
  headR2ObjectContentLength: async (_config: unknown, key: string) => { const bytes = r2.bytes.get(key); if (!bytes) throw new Error("Fixture blob missing"); return { contentLength: bytes.length }; }
}));

const target = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!target)("PS12 guarded export persistence", () => {
  let a: PrismaClient, b: PrismaClient;
  beforeAll(async () => {
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.port !== "49952" || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname) || url.search) throw new Error("PS12 requires guarded disposable PostgreSQL.");
    a = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) }); b = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) });
    await Promise.all([a.$connect(), b.$connect()]);
  });
  afterAll(async () => { await Promise.all([a?.$disconnect(), b?.$disconnect()]); });
  async function setup() {
    const id = randomUUID(), creator = "ps12_" + id;
    await a.tenant.create({ data: { relayCreatorId: creator } });
    const canonical = new DbCanonicalStore(a), run = targetedFixture(canonical, creator, BigInt("0x" + id.replaceAll("-", "").slice(0, 15)).toString(), id);
    const post = run.resource(); post.attributes!.content = '<img src="https://cdn.fixture.example/current.png">';
    await run.seed(post);
    const snapshot = await canonical.loadForCreator(creator), media = Object.values(snapshot.media[creator]!)[0]!;
    const repair = new MediaRepairStore(a);
    await repair.ensure(creator, "media", media.media_id, mediaExportHead(media));
    const lease = (await repair.claim(creator, "media"))!;
    const record = { creator_id: creator, media_id: media.media_id, relative_blob_path: "relay/tenants/" + creator + "/exports/revision/checksum", upstream_revision: media.current.upstream_revision, sha256: "a".repeat(64), byte_length: 4, exported_at: new Date().toISOString() };
    r2.bytes.set(record.relative_blob_path, Buffer.from("test"));
    return { canonical, run, creator, media, repair, lease, record };
  }
  async function providerFixture() {
    const id = randomUUID(), creator = "ps12_source_" + id;
    await a.tenant.create({ data: { relayCreatorId: creator } });
    const base = targetedFixture(new DbCanonicalStore(a), creator, BigInt("0x" + id.replaceAll("-", "").slice(0, 15)).toString(), id);
    const resource = base.resource(), state = { cookie: false, bytesOk: true, token: "current", complete: true, downloads: 0, details: 0, renewOnExpired: false, hasMedia: true };
    const campaigns = { data: [{ type: "campaign", id: base.campaignId, attributes: { name: "Fixture", created_at: "2026-01-01" }, relationships: { tiers: { data: [] } } }] };
    const cookie = () => ({ ...structuredClone(resource), attributes: { ...resource.attributes, image: null, embed_url: "" },
      relationships: { ...resource.relationships, images: { data: state.hasMedia ? [{ type: "media", id: "asset_" + id }] : [] }, ...(state.complete ? { attachments_media: { data: [] }, media: { data: [] }, audio: { data: [] } } : {}) } });
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(campaigns);
      if (url.pathname === "/api/oauth2/v2/posts/" + id) { state.details++; return Response.json({ data: resource }); }
      if (url.pathname === "/api/posts/" + id) return Response.json({ data: cookie(), included: [{ type: "media", id: "asset_" + id, attributes: { download_url: "https://cdn.patreonusercontent.com/asset/" + id + "?token-hash=" + state.token, mimetype: "image/png" } }] });
      if (url.pathname === "/api/oauth2/v2/campaigns/" + base.campaignId + "/posts") return Response.json({ data: [resource] });
      if (url.pathname === "/api/posts") return Response.json({ data: [cookie()] });
      if (url.hostname === "cdn.patreonusercontent.com") { state.downloads++; if (state.renewOnExpired && url.searchParams.get("token-hash") === "expired") state.token = "renewed"; return state.bytesOk && url.searchParams.get("token-hash") !== "expired" ? new Response("verified-source-bytes") : new Response(null, { status: state.bytesOk ? 403 : 503 }); }
      throw new Error("Unexpected fixture request");
    });
    const service = (db: PrismaClient) => {
      const canonical = new DbCanonicalStore(db), exports = new ExportService(canonical, new DbExportIndex(db), "unused-private-root", fetchImpl, { max_attempts: 1, timeout_ms: 1000 }, async () => {}, undefined, db);
      const bus = new InMemoryEventBus();
      const sync = new PatreonSyncService({ getByCreatorId: async () => ({ access_token: "fixture", credential_health_status: "healthy" }), listCreatorIds: async () => [creator] } as unknown as PatreonTokenStore,
        { getSessionId: async () => state.cookie ? "fixture" : null, getCookieLocalStatus: async () => state.cookie ? "ok" : "none", hasRemoteRejectionMarker: async () => false, markPatreonRejectedSession: async () => {} } as unknown as PatreonCookieStore,
        new IngestService(canonical, bus), { get: async () => "2026-10-20T00:00:00.000Z", getRow: async () => null, set: async () => {} },
        { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService, fetchImpl, exports, undefined, undefined, undefined, db);
      return { sync, exports, bus };
    };
    await base.seed(resource);
    return { creator, id, base, resource, state, service, first: service(a), second: service(b), media: () => b.mediaAsset.findFirstOrThrow({ where: { creatorId: creator } }) };
  }
  it("atomically publishes current key, version proof and claimed completion and hydrates both readers", async () => {
    const f = await setup();
    await f.repair.acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, f.lease);
    const current = (await new DbCanonicalStore(b).loadForCreator(f.creator)).media[f.creator]![f.media.media_id]!.current;
    expect(current.storage_key).toBe(f.record.relative_blob_path); expect(current.export_record).toEqual(f.record);
    expect((await new DbExportIndex(b).load(f.creator)).media[f.media.media_id]).toEqual(f.record);
    expect(await b.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "media" } })).toMatchObject({ phase: "complete", leaseToken: null });
  });
  it("rejects stale revision, URL, deletion and cross-creator acceptance without clearing current data", async () => {
    const f = await setup();
    await b.mediaAsset.update({ where: { id: f.media.media_id }, data: { currentUpstreamUrl: "https://cdn.fixture.example/renewed.png" } });
    await expect(f.repair.acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, f.lease)).rejects.toThrow("changed");
    await expect(f.repair.acceptExport("other", f.media.media_id, mediaExportHead(f.media), f.record)).rejects.toThrow("creator");
    expect((await a.mediaAsset.findUniqueOrThrow({ where: { id: f.media.media_id } })).currentStorageKey).toBeNull();
    expect((await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "media" } })).phase).toBe("pending");
  });
  it("rolls back key and version proof when the work generation is superseded", async () => {
    const f = await setup();
    await b.patreonMediaRepair.updateMany({ where: { creatorId: f.creator, kind: "media" }, data: { generation: { increment: 1 } } });
    await expect(f.repair.acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, f.lease)).rejects.toThrow("lease");
    expect((await b.mediaAsset.findUniqueOrThrow({ where: { id: f.media.media_id } })).currentStorageKey).toBeNull();
    expect((await new DbExportIndex(a).load(f.creator)).media).toEqual({});
  });
  it.each(["revision", "deletion"] as const)("rejects a changed %s during byte collection", async (change) => {
    const f = await setup();
    await b.mediaAsset.update({ where: { id: f.media.media_id }, data: change === "revision" ? { currentUpstreamRevision: "new-provider-revision" } : { upstreamStatus: "deleted" } });
    await expect(f.repair.acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, f.lease)).rejects.toThrow("changed");
    expect((await a.mediaAsset.findUniqueOrThrow({ where: { id: f.media.media_id } })).currentStorageKey).toBeNull();
  });
  it("does not reclaim future verified work from a stale due-row read", async () => {
    const f = await setup();
    await a.patreonMediaRepair.updateMany({ where: { creatorId: f.creator }, data: { leaseToken: null, leaseUntil: null } });
    const delayed = {
      $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<RepairLease | null>) => a.$transaction(async (tx) => operation(new Proxy(tx, {
        get(target, property) {
          if (property !== "patreonMediaRepair") return Reflect.get(target, property);
          return new Proxy(tx.patreonMediaRepair, { get(delegate, method) {
            if (method !== "findFirst") return Reflect.get(delegate, method);
            return async (args: Prisma.PatreonMediaRepairFindFirstArgs) => {
              const observed = await delegate.findFirst(args);
              const other = new MediaRepairStore(b), lease = (await other.claim(f.creator, "media"))!;
              await other.acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, lease);
              return observed;
            };
          } });
        }
      })))
    } as unknown as PrismaClient;
    expect(await new MediaRepairStore(delayed).claim(f.creator, "media")).toBeNull();
    expect((await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "media" } })).phase).toBe("complete");
  });
  it("retires deleted work so bounded repair can reach a current asset", async () => {
    const f = await providerFixture(); f.state.cookie = true;
    await f.first.sync.repairMediaForCreator(f.creator, 2);
    const current = await f.media(), work = new MediaRepairStore(a);
    const deletedId = "deleted_" + randomUUID();
    await a.mediaAsset.create({ data: { id: deletedId, creatorId: f.creator, upstreamStatus: "deleted", currentVersionSeq: current.currentVersionSeq,
      currentUpstreamRevision: current.currentUpstreamRevision, currentIngestedAt: current.currentIngestedAt, versionsJson: current.versionsJson as Prisma.InputJsonValue } });
    await work.ensure(f.creator, "media", deletedId, "accepted-before-delete");
    await a.patreonMediaRepair.updateMany({ where: { creatorId: f.creator, kind: "media" }, data: { phase: "pending", dueAt: new Date(0) } });
    r2.bytes.delete(current.currentStorageKey!);
    const downloads = f.state.downloads;
    expect(await f.second.sync.repairMediaForCreator(f.creator, 2)).toEqual({ sources: 0, blobs: 1 });
    expect(f.state.downloads - downloads).toBe(1);
    expect(await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, resourceId: deletedId } })).toMatchObject({ phase: "obsolete", collection: null, verifiedAt: null, leaseToken: null });
    expect(await work.claim(f.creator, "media")).toBeNull();
    expect((await new DbExportIndex(b).load(f.creator)).media[current.id]).toBeDefined();
  });
  it("requeues a restored same-head asset and fences stale retirement by generation and lease", async () => {
    const f = await setup();
    expect(await f.repair.retireIfObsolete(f.lease)).toBe(false);
    await b.mediaAsset.update({ where: { id: f.media.media_id }, data: { upstreamStatus: "deleted" } });
    expect(await f.repair.retireIfObsolete({ ...f.lease, head: "superseded-head" })).toBe(false);
    expect(await f.repair.retireIfObsolete(f.lease)).toBe(true);
    expect(await f.repair.claim(f.creator, "media")).toBeNull();
    await b.mediaAsset.update({ where: { id: f.media.media_id }, data: { upstreamStatus: "active" } });
    await f.repair.ensure(f.creator, "media", f.media.media_id, f.lease.head);
    const next = (await f.repair.claim(f.creator, "media"))!;
    expect(next.generation).toBe(f.lease.generation + 1); expect(next.phase).toBe("pending");
    expect(await f.repair.retireIfObsolete(f.lease)).toBe(false);
    await b.mediaAsset.update({ where: { id: f.media.media_id }, data: { upstreamStatus: "deleted" } });
    expect(await f.repair.retireIfObsolete(f.lease)).toBe(false);
    expect((await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "media" } })).leaseToken).toBe(next.leaseToken);
    expect(await f.repair.retireIfObsolete(next)).toBe(true);
  });
  it.each(["deleted", "native", "missing"] as const)("retires only locally ineligible post work (%s)", async (state) => {
    const f = await setup(); await f.repair.seed(f.creator, false);
    const lease = (await f.repair.claim(f.creator, "post"))!;
    if (state === "missing") await b.post.delete({ where: { id: lease.resourceId } });
    else await b.post.update({ where: { id: lease.resourceId }, data: state === "native" ? { source: "RELAY" } : { upstreamStatus: "deleted" } });
    expect(await f.repair.retireIfObsolete(lease)).toBe(true);
    expect(await f.repair.claim(f.creator, "post")).toBeNull();
  });
  it("does not reclaim obsolete work from a stale due-row read", async () => {
    const f = await setup();
    await a.patreonMediaRepair.updateMany({ where: { creatorId: f.creator }, data: { leaseToken: null, leaseUntil: null } });
    await b.mediaAsset.update({ where: { id: f.media.media_id }, data: { upstreamStatus: "deleted" } });
    const delayed = { $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<RepairLease | null>) => a.$transaction(async (tx) => operation(new Proxy(tx, {
      get(target, property) {
        if (property !== "patreonMediaRepair") return Reflect.get(target, property);
        return new Proxy(tx.patreonMediaRepair, { get(delegate, method) {
          if (method !== "findFirst") return Reflect.get(delegate, method);
          return async (args: Prisma.PatreonMediaRepairFindFirstArgs) => {
            const observed = await delegate.findFirst(args), other = new MediaRepairStore(b);
            expect(await other.retireIfObsolete((await other.claim(f.creator, "media"))!)).toBe(true);
            return observed;
          };
        } });
      }
    }))) } as unknown as PrismaClient;
    expect(await new MediaRepairStore(delayed).claim(f.creator, "media")).toBeNull();
  });
  it("recovers old OAuth-only media after cookie consent through ordinary sync and serves R2 content/ZIP on another API", async () => {
    const f = await providerFixture();
    await f.first.sync.repairMediaForCreator(f.creator, 2);
    expect(await a.mediaAsset.count({ where: { creatorId: f.creator } })).toBe(0);
    expect(await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "post" } })).toMatchObject({ collection: null, lastError: "cookie_required" });
    f.state.cookie = true;
    await f.second.sync.scrapeOrSync(f.creator, "ordinary-after-consent", { campaign_id: f.base.campaignId, max_post_pages: 1 });
    const media = await f.media(), record = (await new DbExportIndex(a).load(f.creator)).media[media.id]!;
    expect(record).toBeDefined(); expect(media.currentStorageKey).toContain("/exports/");
    expect((await f.first.exports.getExportContent(f.creator, media.id))!.buffer.toString()).toBe("verified-source-bytes");
    expect(await f.first.exports.listMissingLibraryZipBlobs(f.creator)).toEqual([]);
    const stream = new PassThrough(), chunks: Buffer[] = []; stream.on("data", (chunk) => chunks.push(chunk));
    await f.first.exports.pipeLibraryZip(f.creator, stream);
    expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe("PK");
    expect(await a.post.count({ where: { creatorId: f.creator } })).toBe(1);
    expect(f.second.bus.getAll()).toEqual([]);
    expect(await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "post" } })).toMatchObject({ collection: "media", phase: "complete" });
  });
  it("retries exhausted downloads through ordinary sync from durable work after a fresh service starts", async () => {
    const f = await providerFixture(); f.state.cookie = true; f.state.bytesOk = false;
    await f.first.sync.repairMediaForCreator(f.creator, 2);
    const failed = await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "media" } });
    expect(failed).toMatchObject({ lastError: "media_download_retry_required", phase: "pending" });
    expect((await new DbExportIndex(b).load(f.creator)).media).toEqual({});
    f.state.bytesOk = true;
    await a.patreonMediaRepair.updateMany({ where: { creatorId: f.creator, kind: "media" }, data: { dueAt: new Date(0) } });
    await f.service(b).sync.scrapeOrSync(f.creator, "ordinary-retry-after-restart", { campaign_id: f.base.campaignId, max_post_pages: 1 });
    expect((await new DbExportIndex(a).load(f.creator)).media[(await f.media()).id]).toBeDefined();
    expect(f.state.downloads).toBe(2);
  });
  it("renews an expired signed URL once through source collection without recursive autoexport", async () => {
    const f = await providerFixture(); f.state.cookie = true; f.state.token = "expired";
    await f.first.sync.refreshPost(f.creator, "source-only", f.base.campaignId, f.id, false, { skipExport: true, requireCompleteMedia: true });
    const media = await f.media(), revision = media.currentUpstreamRevision;
    f.state.token = "renewed"; const details = f.state.details;
    await f.first.exports.exportMedia(f.creator, media.id);
    expect(f.state.details - details).toBe(1); expect(f.state.downloads).toBe(2);
    expect((await f.media()).currentUpstreamRevision).toBe(revision);
    expect((await f.media()).currentUpstreamUrl).toContain("renewed");
  });
  it("never marks unresolved cookie media as a verified empty post", async () => {
    const f = await providerFixture(); f.state.cookie = true; f.state.complete = false;
    await f.first.sync.repairMediaForCreator(f.creator, 2);
    expect(await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "post" } })).toMatchObject({ collection: null, lastError: "media_collection_incomplete", phase: "pending" });
    expect(await a.mediaAsset.count({ where: { creatorId: f.creator } })).toBe(0); expect(f.state.downloads).toBe(0);
  });
  it("completes default targeted refresh when its autoexport renews an expired URL", async () => {
    const f = await providerFixture(); f.state.cookie = true; f.state.token = "expired"; f.state.renewOnExpired = true;
    await expect(f.first.sync.refreshPost(f.creator, "signed-update", f.base.campaignId, f.id)).resolves.toBeDefined();
    expect(f.state.downloads).toBe(2);
    expect((await f.media()).currentUpstreamUrl).toContain("renewed");
    expect((await new DbExportIndex(b).load(f.creator)).media[(await f.media()).id]).toBeDefined();
  });
  it("removes missing objects from gallery and manifest without writing or scheduling on reads", async () => {
    const f = await providerFixture(); f.state.cookie = true;
    await f.first.sync.repairMediaForCreator(f.creator, 2);
    const row = await f.media(), index = new DbExportIndex(b), snapshot = await new DbCanonicalStore(b).loadForCreator(f.creator);
    const gallery = new GalleryService(new DbCanonicalStore(b), index, { load: async () => ({ creators: {} }) } as unknown as GalleryOverridesStore);
    const before = await a.patreonMediaRepair.findMany({ where: { creatorId: f.creator } });
    expect((await gallery.postDetail(f.creator, "patreon_post_" + f.id))!.media[0]!.has_export).toBe(true);
    r2.bytes.delete(row.currentStorageKey!);
    expect((await gallery.postDetail(f.creator, "patreon_post_" + f.id))!.media[0]!.has_export).toBe(false);
    expect((await gallery.list({ creator_id: f.creator, limit: 1 })).items[0]!.export_status).toBe("missing");
    expect((await gallery.facets(f.creator)).export_media_count).toBe(0);
    expect(buildMediaManifest(f.creator, snapshot, await index.load(f.creator)).items).toEqual([]);
    expect(await index.load(f.creator, { includeMissing: true })).toMatchObject({ media: { [row.id]: { upstream_revision: row.currentUpstreamRevision } } });
    expect(await a.patreonMediaRepair.findMany({ where: { creatorId: f.creator } })).toEqual(before);
  });
  it("recovers expired leases and rejects an old worker's success and failure", async () => {
    const f = await setup();
    await a.patreonMediaRepair.updateMany({ where: { creatorId: f.creator, kind: "media" }, data: { leaseUntil: new Date(0) } });
    const next = (await new MediaRepairStore(b).claim(f.creator, "media"))!;
    expect(next.leaseToken).not.toBe(f.lease.leaseToken);
    await expect(f.repair.acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, f.lease)).rejects.toThrow("lease");
    await f.repair.fail(f.lease, "stale_failure");
    expect((await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "media" } })).leaseToken).toBe(next.leaseToken);
    await new MediaRepairStore(b).acceptExport(f.creator, f.media.media_id, mediaExportHead(f.media), f.record, next);
  });
  it.skipIf(!process.env.PATREON_CHANGE_TEST_REDIS_URL)("recovers durable work after lost dispatch through the production BullMQ media worker", async () => {
    const url = new URL(process.env.PATREON_CHANGE_TEST_REDIS_URL!);
    if (url.hostname !== "127.0.0.1" || url.port !== "49953") throw new Error("PS12 requires disposable loopback Redis.");
    const redis = new Redis(url.toString(), { maxRetriesPerRequest: null });
    const prefix = "ps12-media-" + randomUUID();
    const queue = new Queue(RELAY_JOB_QUEUE_NAMES.PATREON_MEDIA_REPAIR, { connection: redis, prefix });
    let consumer: Worker | undefined;
    try {
      const f = await providerFixture(); f.state.cookie = true; f.state.bytesOk = false;
      await f.first.sync.repairMediaForCreator(f.creator, 2);
      await queue.add("lost", {}); await queue.obliterate({ force: true });
      f.state.bytesOk = true;
      await a.patreonMediaRepair.updateMany({ where: { creatorId: f.creator, kind: "media" }, data: { dueAt: new Date(0) } });
      consumer = new Worker(RELAY_JOB_QUEUE_NAMES.PATREON_MEDIA_REPAIR, createPatreonMediaRepairProcessor(f.service(b).sync), { connection: redis, prefix });
      await queue.add("media-only-recovery", {}, { repeat: { every: 200 }, removeOnComplete: true });
      await vi.waitFor(async () => expect((await new DbExportIndex(a).load(f.creator)).media[(await f.media()).id]).toBeDefined(), { timeout: 10000 });
      expect(f.state.downloads).toBe(2);
    } finally { await consumer?.close(); await queue.obliterate({ force: true }); await queue.close(); await redis.quit(); }
  });

  it("bounds R2 ZIP buffering under destination backpressure and stops on disconnect", async () => {
    const creator = "zip-pressure", media: Record<string, import("../src/export/types.js").ExportMediaRecord> = {};
    for (let i = 0; i < 8; i++) {
      const key = `relay/tenants/${creator}/exports/${i}/bytes`, bytes = randomBytes(4 * 1024 * 1024);
      r2.bytes.set(key, bytes); media[String(i)] = { creator_id: creator, media_id: String(i), upstream_revision: "r1", relative_blob_path: key, sha256: "fixture", byte_length: bytes.length, exported_at: "2026-01-01" };
    }
    const canonical = { loadForCreator: async () => ({ media: {}, posts: {}, tiers: {}, campaigns: {}, ingest_idempotency: {} }) } as unknown as import("../src/ingest/canonical-store.js").CanonicalStore;
    const index = { load: async () => ({ creator_id: creator, media }) } as unknown as ExportIndex;
    const service = new ExportService(canonical, index, "unused-root"), dest = new Writable({ highWaterMark: 1, write(_chunk, _encoding, _done) {} });
    r2.reads.length = 0;
    const pending = service.pipeLibraryZip(creator, dest); void pending.catch(() => {});
    try {
      await vi.waitFor(() => expect(r2.reads.length).toBeGreaterThan(0));
      await new Promise((done) => setTimeout(done, 100));
      expect(r2.reads.length).toBeLessThanOrEqual(2);
    } finally { dest.destroy(); }
    await expect(pending).rejects.toThrow("closed");
  });

  it("aborts an in-flight R2 ZIP read immediately when the client disconnects", async () => {
    const creator = "zip-abort", record = { creator_id: creator, media_id: "one", upstream_revision: "r1", relative_blob_path: `relay/tenants/${creator}/exports/one/bytes`, sha256: "fixture", byte_length: 1, exported_at: "2026-01-01" };
    const canonical = { loadForCreator: async () => ({ media: {}, posts: {}, tiers: {}, campaigns: {}, ingest_idempotency: {} }) } as unknown as import("../src/ingest/canonical-store.js").CanonicalStore;
    const index = { load: async () => ({ creator_id: creator, media: { one: record } }) } as unknown as ExportIndex;
    let observed: AbortSignal | undefined;
    r2.stall = async (signal) => { observed = signal; return new Promise<Buffer>(() => {}); };
    const dest = new PassThrough(); dest.resume();
    const pending = new ExportService(canonical, index, "unused-root").pipeLibraryZip(creator, dest); void pending.catch(() => {});
    try {
      await vi.waitFor(() => expect(observed).toBeDefined()); dest.destroy();
      await expect(pending).rejects.toThrow("closed"); expect(observed!.aborted).toBe(true);
    } finally { r2.stall = null; dest.destroy(); }
  });

  it("replays legacy fixture rows into ordinary actual-byte proof while real imported rows stay unknown", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relay-ps12-seed-"));
    const fixturePath = join(directory, "fixture.json");
    const fixture = JSON.parse(await readFile("tests/fixtures/pilot-ux-seed.json", "utf8"));
    // This media replay case does not exercise the separate patron-entitlement seed contract.
    fixture.patron.entitlements = [];
    await writeFile(fixturePath, JSON.stringify(fixture));
    r2.enabled = false;
    try { await seedPilotUxDevAccounts(a, { fixturePath }); } finally { r2.enabled = true; }
    const legacy = await a.mediaAsset.findFirstOrThrow({ where: { creatorId: "rcx_pilot_dev_ava" } });
    await a.mediaAsset.update({ where: { id: legacy.id }, data: { versionsJson: [] } });
    expect((await new DbExportIndex(b).load(legacy.creatorId)).media[legacy.id]).toBeUndefined();
    const real = await setup();
    await a.mediaAsset.update({ where: { id: real.media.media_id }, data: { currentStorageKey: "relay/tenants/" + real.creator + "/exports/unverified/bytes" } });
    r2.bytes.set(legacy.currentStorageKey!, Buffer.from("existing legacy fixture bytes"));
    await seedPilotUxDevAccounts(b, { fixturePath });
    const index = await new DbExportIndex(a).load(legacy.creatorId);
    expect(index.media[legacy.id]).toMatchObject({ byte_length: Buffer.byteLength("existing legacy fixture bytes"), upstream_revision: legacy.currentUpstreamRevision });
    const service = new ExportService(new DbCanonicalStore(a), new DbExportIndex(a), "unused-root", undefined, undefined, undefined, undefined, a);
    expect((await service.getExportContent(legacy.creatorId, legacy.id))!.buffer.toString()).toBe("existing legacy fixture bytes");
    expect((await new DbExportIndex(b).load(real.creator)).media).toEqual({});
    expect(await a.patreonMediaRepair.count({ where: { creatorId: legacy.creatorId } })).toBe(0);
    await rm(directory, { recursive: true, force: true });
  });

  it("records verified empty collection separately from unknown and blob completion", async () => {
    const f = await providerFixture(); f.state.cookie = true; f.state.hasMedia = false;
    await f.first.sync.repairMediaForCreator(f.creator, 2);
    expect(await a.patreonMediaRepair.findFirstOrThrow({ where: { creatorId: f.creator, kind: "post" } })).toMatchObject({ phase: "complete", collection: "empty", lastError: null });
    expect(await a.mediaAsset.count({ where: { creatorId: f.creator } })).toBe(0);
    expect(f.state.downloads).toBe(0);
  });
  it("rejects hosted repair without durable storage before provider requests or work writes", async () => {
    const f = await providerFixture(); r2.enabled = false;
    try {
      await expect(f.first.sync.repairMediaForCreator(f.creator)).rejects.toThrow("persistent export storage");
      expect(f.state.details).toBe(0); expect(f.state.downloads).toBe(0);
      expect(await a.patreonMediaRepair.count({ where: { creatorId: f.creator } })).toBe(0);
    } finally { r2.enabled = true; }
  });

});
