import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { FilePatreonCookieStore } from "../src/auth/cookie-store.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { PatreonSyncHealthStore } from "../src/patreon/patreon-sync-health-store.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "relay-ps14-read-")), key = randomBytes(32).toString("base64");
  const fetchImpl = vi.fn(() => { throw new Error("A saved health read must never contact Patreon"); });
  const api = createApp({ patreon_client_id: "fixture", patreon_client_secret: "fixture", relay_token_encryption_key: key,
    credential_store_path: join(root, "tokens.json"), cookie_store_path: join(root, "cookie.json"), identity_store_path: join(root, "identity.json"),
    patreon_sync_health_path: join(root, "health.json"), patreon_sync_watermark_path: join(root, "watermarks.json"), creator_campaign_display_path: join(root, "display.json"),
    ingest_canonical_path: join(root, "canonical.json"), ingest_dlq_path: join(root, "dlq.json"), export_storage_root: join(root, "exports"), fetch_impl: fetchImpl as unknown as typeof fetch });
  const session = await api.identityService.issueExtensionSession({ user_id: "fixture", creator_id: "creator", tier_ids: [], email: "fixture@example.test", password_hash: "fixture", auth_provider: "independent", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, "fixture-installation");
  const get = () => request(api.app).get("/api/v1/patreon/sync-state").query({ creator_id: "creator", probe_upstream: "true" }).set("Authorization", `Bearer ${session.token}`);
  return { ...api, root, key, fetchImpl, session, get };
}
describe("PS14 saved health GET", () => {
  it("reads expired OAuth/cookie/probe without token rotation, pruning, session renewal or upstream I/O", async () => {
    const f = await setup();
    await f.tokenStore.upsert({ creator_id: "creator", access_token: "private-fixture-access", refresh_token: "private-fixture-refresh", access_token_expires_at: "2020-01-01T00:00:00.000Z", credential_health_status: "healthy" });
    await f.patreonSyncHealthStore.recordUpstreamProbe?.("creator", { campaign_id: "1", observed_at: "2026-01-01T00:00:00.000Z", newest_published_at: "2025-12-01T00:00:00.000Z" });
    const cookie = new FilePatreonCookieStore(join(f.root, "cookie.json"), new TokenEncryption(f.key)); await cookie.upsert("creator", "private-fixture-cookie");
    const raw = JSON.parse(await readFile(join(f.root, "cookie.json"), "utf8")); raw.records.creator.stored_at = "2020-01-01T00:00:00.000Z"; await writeFile(join(f.root, "cookie.json"), JSON.stringify(raw));
    const files = ["tokens.json", "cookie.json", "identity.json", "health.json"];
    const before = await Promise.all(files.map((file) => readFile(join(f.root, file), "utf8")));
    const response = await f.get().expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data).toMatchObject({ availability: "available", cookie_session_status: "expired_local", has_cookie_session: false,
      oauth: { access_token_expired: true }, upstream_probe: { observed_at: "2026-01-01T00:00:00.000Z" } });
    expect(JSON.stringify(response.body)).not.toContain("private-fixture");
    expect(await Promise.all(files.map((file) => readFile(join(f.root, file), "utf8")))).toEqual(before);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("returns additive unavailable evidence for missing tokens/binding and never trusts the campaign query", async () => {
    const f = await setup();
    const response = await f.get().query({ campaign_id: "999" }).expect(200);
    expect(response.body.data).toMatchObject({ availability: "unavailable", unavailable_reason: "missing_tokens", patreon_campaign_id: "", oauth: { availability: "unavailable", credential_health_status: "unavailable", access_token_expires_at: null } });
    expect(f.fetchImpl).not.toHaveBeenCalled();
    await f.tokenStore.upsert({ creator_id: "creator", access_token: "fixture", refresh_token: "fixture", access_token_expires_at: "2020-01-01", credential_health_status: "healthy" });
    expect((await f.get().query({ campaign_id: "999" })).body.data.unavailable_reason).toBe("missing_binding");
  });
  it("rejects expired or absent sessions without deleting an expired grant", async () => {
    const f = await setup(), path = join(f.root, "identity.json");
    const raw = JSON.parse(await readFile(path, "utf8")); raw.sessions[f.session.token].expires_at = "2020-01-01T00:00:00.000Z"; await writeFile(path, JSON.stringify(raw));
    const before = await readFile(path, "utf8");
    await f.get().expect(401); expect(await readFile(path, "utf8")).toBe(before);
    await request(f.app).get("/api/v1/patreon/sync-state").query({ creator_id: "creator" }).expect(401);
  });
  it("preserves accepted verification through a failed attempt and a new store instance", async () => {
    const f = await setup();
    await f.patreonSyncHealthStore.recordPostScrapeSuccess({ creator_id: "creator", patreon_campaign_id: "1", posts_fetched: 1, warnings: [] });
    const prior = (await f.patreonSyncHealthStore.getForCreator("creator"))!.last_post_scrape!.last_verified_at;
    await f.patreonSyncHealthStore.recordPostScrapeFailure({ creator_id: "creator", patreon_campaign_id: "2", error: { code: "retry", message: "Retry required.", hint: "Reconnect Patreon." } });
    expect((await new PatreonSyncHealthStore(join(f.root, "health.json")).getForCreator("creator"))?.last_post_scrape?.last_verified_at).toBe(prior);
    const result = await f.get().expect(200);
    expect(result.body.data.patreon_campaign_id).toBe("1");
    expect(result.body.data.last_post_scrape).toMatchObject({ ok: false, last_verified_at: prior, last_verified_campaign_id: "1" });
    expect(result.body.data.sync_health).toMatchObject({ status: "failed", last_success_at: prior });
  });
});
