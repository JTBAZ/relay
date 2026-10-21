import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { getR2ObjectBuffer } from "../src/storage/relay-upload-r2.js";
import { CloneService } from "../src/clone/clone-service.js";
import type { CloneSiteStore } from "../src/clone/clone-store.js";
import { GalleryService } from "../src/gallery/gallery-service.js";
import type { GalleryOverridesStore } from "../src/gallery/overrides-store.js";
import { readExportBody } from "../src/export/fetch-retry.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { ExportService } from "../src/export/export-service.js";
import { exportBlobPath, FileExportIndex } from "../src/export/export-index.js";
import { deferred, targetedFixture } from "./helpers/patreon-targeted-post.js";
import { scrapePostByCookieWithCompleteness } from "../src/patreon/cookie-scraper.js";
describe("PS12 bounded complete download bodies", () => {
  it("accepts a real fetch-decompressed gzip response and caps decoded bytes", async () => {
    const bytes = Buffer.from("decoded image data"), compressed = gzipSync(bytes);
    const server = createServer((_request, response) => { response.writeHead(200, { "content-encoding": "gzip", "content-length": compressed.length, "content-type": "image/svg+xml" }); response.end(compressed); });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Loopback fixture unavailable");
    try {
      const url = `http://127.0.0.1:${address.port}/image.svg`;
      expect(await readExportBody(await fetch(url), 1000)).toEqual(bytes);
      await expect(readExportBody(await fetch(url), 1000, 2)).rejects.toThrow("byte limit");
    } finally { server.closeAllConnections(); await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done())); }
  });
  it("passes cancellation through the real R2 helper into an unfinished response body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } });
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({ Body: { transformToWebStream: () => body }, ContentLength: 2 } as never);
    const controller = new AbortController();
    try {
      const pending = getR2ObjectBuffer({ endpoint: "https://fixture.invalid", region: "auto", bucket: "fixture", credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" } }, "fixture", { timeoutMs: 1000, signal: controller.signal });
      setTimeout(() => controller.abort(new Error("Client closed")), 10);
      await expect(pending).rejects.toThrow("Client closed"); expect(cancelled).toBe(true);
      expect((send.mock.calls[0]![1] as { abortSignal: AbortSignal }).abortSignal.aborted).toBe(true);
    } finally { send.mockRestore(); }
  });
  it("rejects stalled bodies after partial bytes instead of publishing a cancelled EOF", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); }, cancel() { cancelled = true; } });
    await expect(readExportBody(new Response(body), 10)).rejects.toThrow("timed out");
    expect(cancelled).toBe(true);
  });
  it("rejects incomplete Content-Length and excessive bodies", async () => {
    await expect(readExportBody(new Response(new Uint8Array([1]), { headers: { "content-length": "2" } }), 100)).rejects.toThrow("Content-Length");
    await expect(readExportBody(new Response(new Uint8Array([1, 2, 3])), 100, 2)).rejects.toThrow("byte limit");
  });
});

async function files(fetchImpl: typeof fetch, timeout = 100) {
  const root = await mkdtemp(join(tmpdir(), "relay-ps12-"));
  const run = targetedFixture(), resource = run.resource();
  resource.attributes!.content = '<img src="https://cdn.fixture.example/current.png">';
  await run.seed(resource);
  const row = Object.values((await run.store.loadForCreator(run.creatorId)).media[run.creatorId]!)[0]!;
  const index = new FileExportIndex(root), service = new ExportService(run.store, index, root, fetchImpl, { max_attempts: 1, timeout_ms: timeout });
  return { root, run, row, index, service, export: () => service.exportMedia(run.creatorId, row.media_id) };
}
describe("PS12 immutable local export publication", () => {
  it("rejects stale bytes without overwriting a newer revision or its index", async () => {
    const started = deferred<void>(), response = deferred<Response>();
    let first = true;
    const f = await files(async () => { if (first) { first = false; started.resolve(); return response.promise; } return new Response("new"); });
    try {
      const pending = f.export(); await started.promise;
      await f.run.store.mutateForCreator(f.run.creatorId, (snapshot) => {
        const media = snapshot.media[f.run.creatorId]![f.row.media_id]!;
        media.current = { ...media.current, version_seq: 2, upstream_revision: "new-revision", upstream_url: "https://cdn.fixture.example/new.png" };
        media.versions.push(media.current);
      });
      await f.export();
      const accepted = (await f.index.load(f.run.creatorId)).media[f.row.media_id]!;
      response.resolve(new Response("old")); await expect(pending).rejects.toThrow("changed");
      expect((await f.index.load(f.run.creatorId)).media[f.row.media_id]).toEqual(accepted);
      expect((await readFile(exportBlobPath(f.root, f.run.creatorId, accepted.relative_blob_path))).toString()).toBe("new");
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("redownloads a missing matching-revision blob and uses creator-scoped loads", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("verified"));
    const f = await files(fetcher);
    try {
      vi.spyOn(f.run.store, "load").mockRejectedValue(new Error("Global load must not run."));
      await f.export();
      const record = (await f.index.load(f.run.creatorId)).media[f.row.media_id]!;
      await rm(exportBlobPath(f.root, f.run.creatorId, record.relative_blob_path));
      expect((await f.export()).idempotent_skip).toBe(false); expect(fetcher).toHaveBeenCalledTimes(2);
      expect((await f.export()).idempotent_skip).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("excludes stale revisions from ZIP while retaining current missing-blob diagnostics", async () => {
    const f = await files(async () => new Response("old"));
    try {
      await f.export();
      await f.run.store.mutateForCreator(f.run.creatorId, (snapshot) => { snapshot.media[f.run.creatorId]![f.row.media_id]!.current.upstream_revision = "next"; });
      const clone = await new CloneService(f.run.store, f.index, { upsert: async () => {} } as unknown as CloneSiteStore).generate(f.run.creatorId, "https://fixture.example");
      expect(clone.posts[0]!.media[0]!.has_export).toBe(false);
      expect(await f.service.isLibraryZipEmpty(f.run.creatorId)).toBe(true);
      expect(await f.service.listMissingLibraryZipBlobs(f.run.creatorId)).toEqual([]);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("keeps shared media parent titles, access and curation distinct in paginated verified views", async () => {
    const f = await files(async () => new Response("bytes"));
    try {
      await f.export();
      await f.run.store.mutateForCreator(f.run.creatorId, (snapshot) => {
        const original = Object.values(snapshot.posts[f.run.creatorId]!)[0]!;
        const copy = structuredClone(original); copy.post_id = "other-parent";
        copy.current = { ...copy.current, title: "Other parent", tier_ids: ["paid-other"] };
        snapshot.posts[f.run.creatorId]![copy.post_id] = copy;
        snapshot.media[f.run.creatorId]![f.row.media_id]!.post_ids.push(copy.post_id);
      });
      const overrides = { creators: { [f.run.creatorId]: { posts: { "other-parent": { add_tag_ids: [], remove_tag_ids: [], visibility: "hidden" } } } } };
      const gallery = new GalleryService(f.run.store, f.index, { load: async () => overrides } as unknown as GalleryOverridesStore);
      const result = await gallery.list({ creator_id: f.run.creatorId, limit: 20 });
      const other = result.items.find((item) => item.post_id === "other-parent")!, original = result.items.find((item) => item.post_id !== "other-parent")!;
      expect(other.title).toBe("Other parent"); expect(other.tier_ids).toEqual(["paid-other"]); expect(other.visibility).toBe("hidden");
      expect(original.title).not.toBe("Other parent"); expect(original.tier_ids).not.toEqual(["paid-other"]); expect(original.visibility).toBe("visible");
      expect(original.has_export && other.has_export).toBe(true);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("uses the bounded common presence view for multi-object ZIP preflight", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-ps12-preflight-")), index = new FileExportIndex(root);
    for (const [name, value] of Object.entries({ R2_ACCESS_KEY_ID: "fixture", R2_SECRET_ACCESS_KEY: "fixture", R2_BUCKET: "fixture", R2_ENDPOINT: "https://fixture.invalid" })) vi.stubEnv(name, value);
    let active = 0, maximum = 0, missing = false;
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (command: { input: { Key: string } }) => {
      active++; maximum = Math.max(maximum, active);
      try { await new Promise((done) => setTimeout(done, 5)); if (missing && command.input.Key.endsWith("/0")) throw new Error("Missing object"); return { ContentLength: 1 }; }
      finally { active--; }
    }) as never);
    try {
      await index.mutate("preflight", (value) => {
        for (let id = 0; id < 12; id++) value.media[String(id)] = { creator_id: "preflight", media_id: String(id), upstream_revision: "r1", relative_blob_path: `relay/tenants/preflight/exports/bytes/${id}`, sha256: "f".repeat(64), byte_length: 1, exported_at: "2026-01-01" };
      });
      const canonical = { loadForCreator: async () => ({ media: {}, posts: {}, campaigns: {}, tiers: {}, ingest_idempotency: {} }) } as unknown as import("../src/ingest/canonical-store.js").CanonicalStore;
      const service = new ExportService(canonical, index, root);
      expect(await service.listMissingLibraryZipBlobs("preflight")).toEqual([]);
      expect(send).toHaveBeenCalledTimes(12); expect(maximum).toBe(8);
      missing = true;
      expect(await service.listMissingLibraryZipBlobs("preflight")).toEqual(["relay/tenants/preflight/exports/bytes/0"]);
      expect(Object.keys((await index.load("preflight", { includeMissing: true })).media)).toHaveLength(12);
    } finally { send.mockRestore(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); }
  });
  it("keeps newer success when an older same-head attempt fails", async () => {
    const started = deferred<void>(), response = deferred<Response>(); let first = true;
    const f = await files(async () => { if (first) { first = false; started.resolve(); return response.promise; } return new Response("current"); });
    try {
      const pending = f.export(); await started.promise; await f.export();
      response.resolve(new Response(null, { status: 503 })); await expect(pending).rejects.toThrow("503");
      expect((await f.index.load(f.run.creatorId)).export_failures?.[f.row.media_id]).toBeUndefined();
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("publishes no success or blob from a timed-out partial response", async () => {
    const f = await files(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); } })), 10);
    try { await expect(f.export()).rejects.toThrow("timed out"); expect((await f.index.load(f.run.creatorId)).media).toEqual({}); }
    finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("fails closed on corrupt indexes and does not replace them", async () => {
    const f = await files(async () => new Response("current"));
    try {
      await f.index.mutate(f.run.creatorId, () => {});
      const path = join(f.root, f.run.creatorId, "export_index.json"); await writeFile(path, "{");
      await expect(f.export()).rejects.toThrow("corrupt"); expect(await readFile(path, "utf8")).toBe("{");
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it("merges index writes from two actual processes", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-ps12-process-"));
    const child = (prefix: string) => new Promise<void>((done, fail) => {
      const processChild = spawn(process.execPath, [resolve("node_modules/vite-node/vite-node.mjs"), resolve("tests/helpers/patreon-media-file-process.ts")],
        { windowsHide: true, stdio: "ignore", env: { ...process.env, RELAY_MEDIA_FILE_TEST_INPUT: JSON.stringify({ root, prefix }) } });
      const timer = setTimeout(() => { processChild.kill(); fail(new Error("Export child timed out")); }, 30_000);
      processChild.on("error", fail); processChild.on("close", (code) => { clearTimeout(timer); code === 0 ? done() : fail(new Error("Export child failed")); });
    });
    try { await Promise.all([child("a"), child("b")]); expect(Object.keys((await new FileExportIndex(root).load("file")).media)).toHaveLength(20); }
    finally { await rm(root, { recursive: true, force: true }); }
  }, 40_000);
});
describe("PS12 source collection proof", () => {
  it.each([{ url: "https://fixture.example/embed" }, 12, false])("keeps a malformed declared embed unknown (%j)", async (embed_url) => {
    const resource = { type: "post", id: "12", attributes: { title: "Partial embed", published_at: "2026-01-01", image: null, embed_url },
      relationships: { campaign: { data: { type: "campaign", id: "34" } }, images: { data: [] }, attachments_media: { data: [] }, media: { data: [] }, audio: { data: [] } } };
    const result = await scrapePostByCookieWithCompleteness("fixture", "34", "12", async () => Response.json({ data: resource }));
    expect(result.post.media).toEqual([]); expect(result.complete).toBe(false);
  });
  it("keeps linked media with a whitespace-only URL unknown when the mapper drops it", async () => {
    const resource = { type: "post", id: "12", attributes: { title: "Partial source", published_at: "2026-01-01", image: null, embed_url: "" },
      relationships: { campaign: { data: { type: "campaign", id: "34" } }, images: { data: [{ type: "media", id: "blank-url" }] }, attachments_media: { data: [] }, media: { data: [] }, audio: { data: [] } } };
    const result = await scrapePostByCookieWithCompleteness("fixture", "34", "12", async () => Response.json({
      data: resource, included: [{ type: "media", id: "blank-url", attributes: { download_url: " \t \n " } }]
    }));
    expect(result.post.media).toEqual([]);
    expect(result.complete).toBe(false);
  });
  it.each([{ large_url: "   " }, { url: " \t " }, { thumb_url: "\n " }])("keeps a declared cover with an unusable selected URL unknown (%j)", async (image) => {
    const resource = { type: "post", id: "12", attributes: { title: "Partial cover", published_at: "2026-01-01", image, embed_url: "" },
      relationships: { campaign: { data: { type: "campaign", id: "34" } }, images: { data: [] }, attachments_media: { data: [] }, media: { data: [] }, audio: { data: [] } } };
    const result = await scrapePostByCookieWithCompleteness("fixture", "34", "12", async () => Response.json({ data: resource }));
    expect(result.post.media).toEqual([]); expect(result.complete).toBe(false);
  });
  it("distinguishes explicit empty relationships from missing or unresolved media", async () => {
    const row = { type: "post", id: "12", attributes: { title: "Text", published_at: "2026-01-01", image: null, embed_url: "" },
      relationships: { campaign: { data: { type: "campaign", id: "34" } }, images: { data: [] }, attachments_media: { data: [] }, media: { data: [] }, audio: { data: [] } } };
    const collect = (resource: unknown) => scrapePostByCookieWithCompleteness("fixture", "34", "12", async () => Response.json({ data: resource }));
    expect(await collect(row)).toMatchObject({ complete: true, post: { media: [] } });
    const missing = structuredClone(row); delete (missing.relationships as Partial<typeof row.relationships>).images;
    expect((await collect(missing)).complete).toBe(false);
    const unresolved = structuredClone(row); (unresolved.relationships.images.data as unknown[]) = [{ type: "media", id: "absent" }];
    expect((await collect(unresolved)).complete).toBe(false);
  });
});
