import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePatreonCookieStore } from "../src/auth/cookie-store.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { runCookieProcess } from "./helpers/run-cookie-process.js";
import { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";
import type { PatreonAuthService } from "../src/auth/auth-service.js";
import type { IngestService } from "../src/ingest/ingest-service.js";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: vi.fn(fs.rename) };
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "relay-cookie-test-"));
  roots.push(root);
  const path = join(root, "cookies.json");
  const encryption = new TokenEncryption(randomBytes(32).toString("base64"));
  return { root, path, encryption, store: new FilePatreonCookieStore(path, encryption) };
}

describe("local Patreon session vault", () => {
  it("encrypts sessions and keeps the existing presence/deletion contract", async () => {
    const { store, path } = await setup();
    expect(await store.getCookieLocalStatus("a")).toBe("none");
    await store.upsert("a", "fixture-session");
    expect(await readFile(path, "utf8")).not.toContain("fixture-session");
    expect(await store.getSessionId("a")).toBe("fixture-session");
    expect(await store.getCookieLocalStatus("a")).toBe("ok");
    expect(await store.remove("a")).toBe(true);
    expect(await store.remove("a")).toBe(false);
    expect(await store.getSessionId("a")).toBeNull();
  });

  it("retains concurrent updates across separate instances using the same file", async () => {
    const { path, encryption, store } = await setup();
    const second = new FilePatreonCookieStore(path, encryption);
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? second : store).upsert(`c${i}`, `fixture-${i}`)));
    for (let i = 0; i < 12; i++) expect(await second.getSessionId(`c${i}`)).toBe(`fixture-${i}`);
  });

  it("retains concurrent writes from two actual processes", async () => {
    const { path } = await setup();
    const key = randomBytes(32).toString("base64");
    const groups = [["child-a", "child-b"], ["child-c", "child-d"]];
    await Promise.all(groups.map((ids) => runCookieProcess({ key, path, ids })));
    const store = new FilePatreonCookieStore(path, new TokenEncryption(key));
    for (const id of groups.flat()) expect(await store.getSessionId(id)).toBe(`fixture-${id}`);
  }, 30_000);

  it("retains the old snapshot and releases the lock when atomic replacement fails", async () => {
    const { store, path, root } = await setup();
    await store.upsert("a", "original");
    const before = await readFile(path, "utf8");
    vi.mocked(rename).mockRejectedValueOnce(new Error("Synthetic rename failure"));
    await expect(store.upsert("b", "replacement")).rejects.toThrow("Synthetic rename failure");
    expect(await readFile(path, "utf8")).toBe(before);
    expect(await readdir(root)).toEqual(["cookies.json"]);
    await store.upsert("b", "retry");
    expect(await store.getSessionId("a")).toBe("original");
    expect(await store.getSessionId("b")).toBe("retry");
  });

  it("rejects a file symlink that would split the vault's lock and replacement paths", async ({ skip }) => {
    const { store, path, root, encryption } = await setup();
    await store.upsert("a", "original");
    const alias = join(root, "alias.json");
    try { await symlink(path, alias); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") { skip(); return; } throw error; }
    await expect(new FilePatreonCookieStore(alias, encryption).upsert("b", "replacement")).rejects.toThrow("regular file path");
    expect(await store.getSessionId("a")).toBe("original");
    expect(await store.getSessionId("b")).toBeNull();
  });

  it.each(["{bad json fixture-secret", '{"records":{"a":42}}', '{"records":{"a":{"creator_id":"other"}}}'])(
    "rejects corrupt data without resetting or echoing it", async (contents) => {
      const { path, store } = await setup();
      await writeFile(path, contents);
      await expect(store.upsert("b", "new-session")).rejects.toThrow();
      await expect(store.getCookieLocalStatus("a")).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(contents);
      try { await store.getSessionId("a"); } catch (error) { expect(String(error)).not.toContain("fixture-secret"); }
    }
  );

  it("distinguishes unreadable paths from a missing vault", async () => {
    const { root, encryption } = await setup();
    await expect(new FilePatreonCookieStore(root, encryption).getCookieLocalStatus("a")).rejects.toThrow();
  });

  it("retains age and expires a session without clearing its rejection marker", async () => {
    const { store, path } = await setup();
    await store.upsert("a", "fixture-session");
    const data = JSON.parse(await readFile(path, "utf8"));
    data.records.a.stored_at = "2000-01-01T00:00:00.000Z";
    await writeFile(path, JSON.stringify(data));
    expect(await store.getCookieLocalStatus("a")).toBe("expired_local");
    expect(await store.getSessionId("a")).toBeNull();
    expect(await store.getCookieLocalStatus("a")).toBe("none");
    await store.markPatreonRejectedSession("a");
    expect(await store.hasRemoteRejectionMarker("a")).toBe(true);
    expect(await store.remove("a")).toBe(true);
    expect(await store.hasRemoteRejectionMarker("a")).toBe(false);
  });

  it("atomically rejects only the session actually used by a failing request", async () => {
    const { store } = await setup();
    await store.upsert("a", "old-session");
    await store.upsert("a", "fresh-session");
    await store.markPatreonRejectedSession("a", "old-session");
    expect(await store.getSessionId("a")).toBe("fresh-session");
    expect(await store.hasRemoteRejectionMarker("a")).toBe(false);
    await store.markPatreonRejectedSession("a", "fresh-session");
    expect(await store.getSessionId("a")).toBeNull();
    expect(await store.hasRemoteRejectionMarker("a")).toBe(true);
    await store.clearPatreonRejectedSession("a", "fresh-session");
    expect(await store.hasRemoteRejectionMarker("a")).toBe(true);
    await store.upsert("a", "replacement");
    expect(await store.hasRemoteRejectionMarker("a")).toBe(false);
  });

  it("surfaces decryption errors without removing or replacing the record", async () => {
    const { store, path } = await setup();
    await store.upsert("a", "fixture-session");
    const before = await readFile(path, "utf8");
    const wrongKey = new FilePatreonCookieStore(path, new TokenEncryption(randomBytes(32).toString("base64")));
    await expect(wrongKey.getSessionId("a")).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("keeps a new upload when the sync request using the old session returns 401", async () => {
    const { store } = await setup();
    await store.upsert("a", "old-session");
    const fixture = JSON.parse(await readFile(new URL("./fixtures/patreon/sync-baseline.json", import.meta.url), "utf8"));
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(fixture.campaigns);
      if (url.pathname === "/api/posts") { await store.upsert("a", "fresh-session"); return new Response("Unauthorized", { status: 401 }); }
      if (url.pathname === `/api/oauth2/v2/campaigns/${fixture.campaign_id}/posts`) return Response.json({ data: [], links: {} });
      throw new Error("Unexpected fixture request");
    };
    const service = new PatreonSyncService(
      { getByCreatorId: async () => ({ access_token: "fixture-only" }) } as unknown as PatreonTokenStore,
      store, {} as IngestService, { get: async () => null, getRow: async () => null, set: async () => {} },
      { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService, fetchImpl
    );
    await service.scrapeOrSync("a", "ps06-rejection-race", { campaign_id: fixture.campaign_id, dry_run: true, max_post_pages: 1 });
    expect(await store.getSessionId("a")).toBe("fresh-session");
    expect(await store.hasRemoteRejectionMarker("a")).toBe(false);
  });
});
