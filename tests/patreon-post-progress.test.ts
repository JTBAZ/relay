import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileCanonicalStore } from "../src/ingest/canonical-store.js";
import { SyncWatermarkStore } from "../src/ingest/sync-watermark-store.js";
import { FilePatreonPostProgressStore } from "../src/patreon/post-sync-progress-file.js";
import { emptyPostSyncProgress, readPostSyncProgress } from "../src/patreon/post-sync-progress.js";
import { targetedFixture } from "./helpers/patreon-targeted-post.js";

const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "relay-ps11-")); dirs.push(dir);
  const watermarks = new SyncWatermarkStore(join(dir, "watermarks.json"));
  const store = new FileCanonicalStore(join(dir, "canonical.json"));
  const fixture = targetedFixture(store, "ps11_local", "9000", "9001", watermarks);
  const sync = (max = 1) => fixture.service.scrapeOrSync(fixture.creatorId, "ps11-local", { campaign_id: fixture.campaignId, max_post_pages: max, resume_archive: true });
  return { ...fixture, dir, watermarks, sync };
}
const pageUrl = (cursor: string) => `https://www.patreon.com/api/oauth2/v2/campaigns/9000/posts?page%5Bcursor%5D=${cursor}`;

describe("PS-11 local progress compatibility", () => {
  it("resumes a capped archive across new service instances without using a legacy watermark as coverage", async () => {
    const run = await setup(); await run.watermarks.set(run.creatorId, run.campaignId, "2026-10-19T00:00:00.000Z");
    const tail = { ...run.resource("Tail"), id: "9002" };
    run.state.listResponse = async (url) => Response.json(url.searchParams.has("page[cursor]") ? { data: [tail] } : { data: [run.resource()], links: { next: pageUrl("tail") } });
    expect((await run.sync()).post_coverage?.archive).toBe("partial");
    expect(await run.watermarks.get(run.creatorId, run.campaignId)).toBe("2026-10-19T00:00:00.000Z");
    const restarted = targetedFixture(new FileCanonicalStore(join(run.dir, "canonical.json")), run.creatorId, run.campaignId, run.resourceId, new SyncWatermarkStore(join(run.dir, "watermarks.json")));
    restarted.state.listResponse = run.state.listResponse;
    const result = await restarted.service.scrapeOrSync(run.creatorId, "restart", { campaign_id: run.campaignId, max_post_pages: 1, resume_archive: true });
    expect(result.post_coverage?.archive).toBe("complete");
    expect(Object.keys((await run.store.load()).posts[run.creatorId]!)).toHaveLength(2);
  });

  it("replays a canonical page after file checkpoint failure and still rejects a later cursor cycle", async () => {
    const run = await setup();
    run.state.listResponse = async (url) => {
      const cursor = url.searchParams.get("page[cursor]");
      return Response.json({ data: [run.resource()], links: { next: pageUrl(cursor === "a" ? "b" : cursor === "b" ? "c" : cursor === "c" ? "a" : "a") } });
    };
    const checkpoint = vi.spyOn(run.watermarks.postProgress, "checkpoint").mockRejectedValueOnce(new Error("checkpoint disk failure"));
    await expect(run.sync()).rejects.toThrow("checkpoint disk failure");
    checkpoint.mockRestore();
    await expect(run.sync()).resolves.toMatchObject({ post_coverage: { archive: "partial" } });
    // Failure yields a turn, so catch-up may run between archive pages.
    let repeated = false;
    for (let i = 0; i < 12 && !repeated; i++) {
      try { await run.sync(); } catch (error) { expect(String(error)).toMatch(/Repeated Patreon page cursor/); repeated = true; }
    }
    expect(repeated).toBe(true);
    expect((await run.post()).upstream_status).toBe("active");
  });

  it("restarts a rejected saved continuation only after a successful first-page control", async () => {
    const run = await setup(); let expired = false;
    run.state.listResponse = async (url) => url.searchParams.has("page[cursor]") && expired
      ? new Response("{}", { status: 400 }) : Response.json({ data: [run.resource()], links: { next: pageUrl("expired") } });
    await run.sync(); expired = true;
    const result = await run.sync();
    expect(result.warnings.join(" ")).toContain("continuation was rejected");
    expect(result.post_coverage?.archive).toBe("partial");
    expect(await run.watermarks.get(run.creatorId, run.campaignId)).toBeNull();
  });

  it("keeps progress on a failed control and persists creator selection across adapters", async () => {
    const run = await setup();
    run.state.listResponse = async () => Response.json({ data: [run.resource()], links: { next: pageUrl("saved") } });
    await run.sync();
    run.state.listResponse = async () => new Response("{}", { status: 403 });
    await expect(run.sync()).rejects.toThrow();
    const lease = await run.watermarks.postProgress.claim(run.creatorId, run.campaignId);
    expect(lease!.progress.archive.next).toBe(pageUrl("saved")); await run.watermarks.postProgress.release(lease!);
    const one = new FilePatreonPostProgressStore(join(run.dir, "fair.json"));
    const two = new FilePatreonPostProgressStore(join(run.dir, "fair.json"));
    expect(await one.selectCreators(["a", "b", "c"], 1)).toEqual(["a"]);
    expect(await two.selectCreators(["a", "b", "c"], 1)).toEqual(["b"]);
    expect(await one.selectCreators(["a", "b", "c"], 1)).toEqual(["c"]);
    expect(await two.selectCreators(["a", "b", "c"], 1)).toEqual(["a"]);
  });

  it("rejects malformed persisted progress and retains legacy coverage as unknown", () => {
    expect(readPostSyncProgress(null).archive.status).toBe("unknown");
    const progress = emptyPostSyncProgress(); progress.archive.pages = -1;
    expect(() => readPostSyncProgress(progress)).toThrow("Invalid Patreon page progress");
    const other = emptyPostSyncProgress(); other.catchup.candidate = "not-a-date";
    expect(() => readPostSyncProgress(other)).toThrow("Invalid Patreon page progress");
  });

  it("rejects malformed JSON maps and lease rows before claiming local work", async () => {
    const run = await setup(), path = join(run.dir, "corrupt.json");
    const store = new FilePatreonPostProgressStore(path);
    await writeFile(path, JSON.stringify({ records: [] }));
    await expect(store.claim("creator", "9000")).rejects.toThrow("Invalid Patreon post progress file");
    for (const lease of [{ version: -1 }, { version: "0" }, { version: 0, token: "broken", until: 3 }, { version: 0, until: "later" }, { version: 0, until: 3 }]) {
      await writeFile(path, JSON.stringify({ records: { '["creator","9000"]': { ...lease, progress: emptyPostSyncProgress() } } }));
      await expect(store.claim("creator", "9000")).rejects.toThrow("Invalid Patreon post progress lease");
    }
    expect(run.fetchImpl).not.toHaveBeenCalled();
  });

  it("never treats a malformed next link or cursor as terminal coverage", async () => {
    const run = await setup();
    for (const continuation of [{ links: { next: false } }, { meta: { pagination: { cursors: { next: 0 } } } }, { links: false }, { meta: { pagination: { cursors: false } } }, { links: [] }]) {
      run.state.listResponse = async () => Response.json({ data: [run.resource()], ...continuation });
      await expect(run.sync()).rejects.toThrow("Invalid Patreon page continuation");
      expect(await run.watermarks.get(run.creatorId, run.campaignId)).toBeNull();
      const lease = (await run.watermarks.postProgress.claim(run.creatorId, run.campaignId))!;
      expect(lease.progress.archive.status).toBe("unknown"); expect(lease.progress.catchup.status).toBe("unknown");
      await run.watermarks.postProgress.release(lease);
    }
  });
});
