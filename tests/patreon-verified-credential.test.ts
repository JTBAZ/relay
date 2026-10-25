import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePatreonCookieStore } from "../src/auth/cookie-store.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { createApp } from "../src/server.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "relay-ps13-vault-")); roots.push(root);
  const key = randomBytes(32).toString("base64"), path = join(root, "cookies.json");
  return { root, key, path, store: new FilePatreonCookieStore(path, new TokenEncryption(key)) };
}

describe("PS13 cookie age and consent boundary", () => {
  it.each(["wrong-key", "tampered"])("fails credential checks closed for %s without changing stored bytes", async (condition) => {
    const { root, key, path, store } = await setup(); await store.upsert("creator", "private-fixture-session");
    const readKey = condition === "wrong-key" ? randomBytes(32).toString("base64") : key;
    if (condition === "tampered") { const raw = JSON.parse(await readFile(path, "utf8")); raw.records.creator.encrypted_session_id += "invalid"; await writeFile(path, JSON.stringify(raw)); }
    const before = await readFile(path, "utf8"), reader = new FilePatreonCookieStore(path, new TokenEncryption(readKey));
    await expect(reader.checkCredential("creator")).rejects.toThrow(); await expect(reader.rotateCredential("creator", "must-not-replace")).rejects.toThrow();
    const { app } = createApp({ relay_token_encryption_key: readKey, patreon_client_id: "fixture", patreon_client_secret: "fixture", credential_store_path: join(root, "tokens.json"), cookie_store_path: path, identity_store_path: join(root, "identity.json") });
    const registered = await request(app).post("/api/v1/identity/register").send({ creator_id: "creator", email: "corrupt@example.com", password: "fixture-password", tier_ids: [] }).expect(201);
    const auth = `Bearer ${registered.body.data.token}`;
    const status = await request(app).get("/api/v1/patreon/cookie/status").query({ creator_id: "creator" }).set("Authorization", auth).expect(503);
    const check = await request(app).post("/api/v1/patreon/cookie/check").set("Authorization", auth).send({ creator_id: "creator" }).expect(503);
    expect(JSON.stringify([status.body, check.body])).not.toContain("private-fixture-session");
    expect(await readFile(path, "utf8")).toBe(before);
  });
  it("acknowledges unchanged storage without writes and preserves original age on rotation", async () => {
    const { store, path } = await setup(); await store.upsert("creator", "before");
    const raw = JSON.parse(await readFile(path, "utf8")); raw.records.creator.stored_at = new Date(Date.now() - 89 * 86400000).toISOString();
    await writeFile(path, JSON.stringify(raw)); const before = await readFile(path, "utf8");
    expect(await store.checkCredential("creator")).toEqual({ status: "ok", stored_at: raw.records.creator.stored_at });
    expect(await readFile(path, "utf8")).toBe(before);
    expect(await store.rotateCredential("creator", "after")).toEqual({ status: "ok", stored_at: raw.records.creator.stored_at });
    expect(await store.getSessionId("creator")).toBe("after");
    expect((await store.checkCredential("creator")).stored_at).toBe(raw.records.creator.stored_at);
  });
  it.each(["missing", "expired", "rejected", "removed"])("does not resurrect %s storage", async (condition) => {
    const { store, path } = await setup();
    if (condition !== "missing") await store.upsert("creator", "before");
    if (condition === "expired") { const raw = JSON.parse(await readFile(path, "utf8")); raw.records.creator.stored_at = "2020-01-01T00:00:00.000Z"; await writeFile(path, JSON.stringify(raw)); }
    if (condition === "rejected") await store.markPatreonRejectedSession("creator");
    if (condition === "removed") await store.remove("creator");
    expect((await store.rotateCredential("creator", "unwanted")).status).not.toBe("ok");
    expect((await store.checkCredential("creator")).status).not.toBe("ok");
    await store.upsert("creator", "explicit-fresh-consent");
    expect((await store.checkCredential("creator")).status).toBe("ok");
  });
  it("checks and status reads cannot prune expired cookie or renew a session", async () => {
    const { root, key, path, store } = await setup();
    const { app, identityService } = createApp({ relay_token_encryption_key: key, patreon_client_id: "fixture", patreon_client_secret: "fixture",
      credential_store_path: join(root, "tokens.json"), cookie_store_path: path, identity_store_path: join(root, "identity.json") });
    const pendingTouches: Promise<void>[] = [];
    const originalTouch = identityService.touchSessionExpiry.bind(identityService);
    const touchSpy = vi.spyOn(identityService, "touchSessionExpiry").mockImplementation((token) => {
      const pending = originalTouch(token); pendingTouches.push(pending); return pending;
    });
    const registered = await request(app).post("/api/v1/identity/register").send({ creator_id: "creator", email: "fixture@example.com", password: "fixture-password", tier_ids: [] }).expect(201);
    await store.upsert("creator", "before");
    const raw = JSON.parse(await readFile(path, "utf8")); raw.records.creator.stored_at = "2020-01-01T00:00:00.000Z"; await writeFile(path, JSON.stringify(raw));
    const identity = JSON.parse(await readFile(join(root, "identity.json"), "utf8"));
    identity.sessions[registered.body.data.token].kind = "extension";
    identity.sessions[registered.body.data.token].label = "installation";
    await writeFile(join(root, "identity.json"), JSON.stringify(identity));
    const beforeCookie = await readFile(path, "utf8"), beforeSession = await readFile(join(root, "identity.json"), "utf8");
    const auth = `Bearer ${registered.body.data.token}`;
    const status = await request(app).get("/api/v1/patreon/cookie/status").query({ creator_id: "creator" }).set("Authorization", auth).expect(200);
    expect(status.body.data.has_cookie).toBe(false);
    expect(await readFile(path, "utf8")).toBe(beforeCookie);
    expect(await readFile(join(root, "identity.json"), "utf8")).toBe(beforeSession);
    const check = await request(app).post("/api/v1/patreon/cookie/check").set("Authorization", auth).send({ creator_id: "creator", installation_id: "installation" }).expect(200);
    await Promise.all(pendingTouches);
    expect(check.body.data).toMatchObject({ status: "expired_local", requires_consent: true, stored_at: raw.records.creator.stored_at });
    expect(await readFile(path, "utf8")).toBe(beforeCookie);
    await request(app).post("/api/v1/patreon/cookie").set("Authorization", auth).send({ creator_id: "creator", installation_id: "installation", session_id: "must-not-resurrect" }).expect(409);
    await Promise.all(pendingTouches);
    await request(app).post("/api/v1/patreon/cookie/check").set("Authorization", auth).send({ creator_id: "creator", installation_id: "other-installation" }).expect(403);
    await Promise.all(pendingTouches);
    await request(app).post("/api/v1/patreon/cookie/check").send({ creator_id: "creator" }).expect(401);
    // Earlier POST auth renewals must finish before this separate expired-read fixture is written.
    await Promise.all(pendingTouches);
    const touchCount = touchSpy.mock.calls.length;
    const expiredIdentity = JSON.parse(await readFile(join(root, "identity.json"), "utf8"));
    expiredIdentity.sessions[registered.body.data.token].expires_at = "2020-01-01T00:00:00.000Z";
    const expiredBytes = JSON.stringify(expiredIdentity); await writeFile(join(root, "identity.json"), expiredBytes);
    await request(app).get("/api/v1/patreon/cookie/status").query({ creator_id: "creator" }).set("Authorization", auth).expect(401);
    expect(touchSpy).toHaveBeenCalledTimes(touchCount);
    expect(await readFile(join(root, "identity.json"), "utf8")).toBe(expiredBytes);
  });
});
