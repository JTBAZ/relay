import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityService } from "../../src/identity/identity-service.js";
import { FileIdentityStore } from "../../src/identity/identity-store.js";
import { EXTENSION_SESSION_TTL_MS, WEB_SESSION_TTL_MS } from "../../src/identity/session-constants.js";

describe("Extension vs web session TTL (EXT-0B)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function svcWithUser() {
    const dir = await mkdtemp(join(tmpdir(), "relay-ext-sess-"));
    const store = new FileIdentityStore(join(dir, "identity.json"));
    const svc = new IdentityService(store);
    const user = {
      user_id: "usr_tm1",
      creator_id: "cr_test",
      email: "ext@example.com",
      password_hash: "x",
      auth_provider: "independent" as const,
      tier_ids: [] as string[],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await store.createUser(user);
    return { svc, store, user };
  }

  it("issueExtensionSession mints kind extension, label, ~30d expiry", async () => {
    const { svc, user } = await svcWithUser();
    const s = await svc.issueExtensionSession(user, "Chrome / Windows");
    expect(s.kind).toBe("extension");
    expect(s.label).toBe("Chrome / Windows");
    const span = new Date(s.expires_at).getTime() - Date.now();
    expect(span).toBeGreaterThan(EXTENSION_SESSION_TTL_MS - 60_000);
    expect(span).toBeLessThanOrEqual(EXTENSION_SESSION_TTL_MS);
  });

  it("web session includes kind web and 24h TTL", async () => {
    const { svc, user } = await svcWithUser();
    const s = await svc.issueSessionForUser(user);
    expect(s.kind).toBe("web");
    const span = new Date(s.expires_at).getTime() - Date.now();
    expect(span).toBeGreaterThan(WEB_SESSION_TTL_MS - 60_000);
    expect(span).toBeLessThanOrEqual(WEB_SESSION_TTL_MS);
  });

  it("touchSessionExpiry extends extension session; web session unchanged", async () => {
    const { svc, store, user } = await svcWithUser();
    const web = await svc.issueSessionForUser(user);
    const webExp = web.expires_at;
    await svc.touchSessionExpiry(web.token);
    const webAfter = await store.getSession(web.token);
    expect(webAfter!.expires_at).toBe(webExp);

    const ext = await svc.issueExtensionSession(user, "FF");
    const extExpBefore = new Date(ext.expires_at).getTime();
    await vi.advanceTimersByTimeAsync(20 * 24 * 60 * 60 * 1000);
    await svc.touchSessionExpiry(ext.token);
    const extAfter = await store.getSession(ext.token);
    expect(extAfter).not.toBeNull();
    expect(new Date(extAfter!.expires_at).getTime()).toBeGreaterThan(extExpBefore);
    expect(extAfter!.kind).toBe("extension");
  });

  it("extension session expires after idle beyond window", async () => {
    const { svc, store, user } = await svcWithUser();
    const ext = await svc.issueExtensionSession(user, "idle");
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
    const dead = await store.getSession(ext.token);
    expect(dead).toBeNull();
  });
});
