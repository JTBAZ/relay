import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ raw: {} as Record<string, unknown>, cookie: "browser-current", fetch: vi.fn() }));
vi.mock("../../extension/src/lib/browser", () => ({ default: {
  cookies: { get: vi.fn(async () => fixture.cookie ? { value: fixture.cookie } : null) },
  storage: { local: {
    get: vi.fn(async (keys: string | string[]) => Object.fromEntries((typeof keys === "string" ? [keys] : keys).map((key) => [key, structuredClone(fixture.raw[key])]))),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(fixture.raw, structuredClone(values)); }),
    remove: vi.fn(async (keys: string[]) => { for (const key of keys) delete fixture.raw[key]; })
  } }
} }));
import * as storage from "../../extension/src/lib/storage";
import { syncNow, sha256Hex } from "../../extension/src/lib/sync-now";
import { exchangeConsentCode, cancelConsentExchange } from "../../extension/src/lib/consent-flow";

const at = "2026-10-21T10:00:00.000Z";
const grant = (id = "a") => ({ token: `test-${id}`, token_id: id, account_id: `account-${id}`, relay_creator_id: `creator-${id}`, expires_at: "2020-01-01T00:00:00.000Z", created_at: at });
const reply = (status: number, data: Record<string, unknown> = {}) => new Response(JSON.stringify({ data }), { status });
async function connected() { await storage.setInstallationId("installation"); await storage.setGrant(grant()); return (await storage.getCredentialContext())!; }
beforeEach(() => { fixture.raw = {}; fixture.cookie = "browser-current"; fixture.fetch.mockReset(); vi.stubGlobal("fetch", fixture.fetch); });

afterEach(() => { vi.unstubAllGlobals(); });

describe("PS13 bound credential checks", () => {
  it("checks an unchanged cookie on Relay despite old cached expiry, preserving separate evidence", async () => {
    const context = await connected();
    await storage.updateCredentialState(context, { hash: await sha256Hex(fixture.cookie), uploaded_at: at, acknowledged_at: at });
    fixture.fetch.mockResolvedValue(reply(200, { status: "ok", checked_at: at }));
    expect(await syncNow()).toEqual({ ok: true, status: "checked" });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.fetch.mock.calls[0][0]).toMatch(/\/cookie\/check$/);
    expect(fixture.fetch.mock.calls[0][1].method).toBe("POST");
    expect(await storage.getCredentialState()).toMatchObject({ acknowledged_at: at, uploaded_at: at, data_sync_at: null });
    expect(await storage.getCredentialStatus()).not.toHaveProperty("hash");
  });
  it.each(["none", "expired_local", "rejected_remote"])("requires consent for %s without restoring the credential", async (status) => {
    await connected(); fixture.fetch.mockResolvedValue(reply(200, { status, checked_at: at }));
    expect(await syncNow()).toEqual({ ok: false, reason: "consent_required" });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect((await storage.getCredentialState())?.acknowledged_at).toBeNull();
  });
  it("does not acknowledge success without the browser cookie, but still checks grant authority", async () => {
    await connected(); fixture.cookie = ""; fixture.fetch.mockResolvedValue(reply(200, { status: "ok", checked_at: at }));
    expect(await syncNow()).toEqual({ ok: false, reason: "no_patreon_cookie" });
    expect(await storage.getCredentialState()).toMatchObject({ browser_session_present: false, acknowledged_at: null });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });
  it("uploads current rotation after checking, never an old cached upload", async () => {
    await connected(); fixture.fetch.mockResolvedValueOnce(reply(200, { status: "ok", checked_at: at })).mockResolvedValueOnce(reply(200, { status: "stored", checked_at: at }));
    expect(await syncNow()).toEqual({ ok: true, status: "stored" });
    expect(JSON.parse(fixture.fetch.mock.calls[1][1].body)).toMatchObject({ session_id: "browser-current", installation_id: "installation" });
  });
  it.each([200, 401])("ignores a superseded %s response after switching grants", async (status) => {
    await connected(); let complete!: (response: Response) => void;
    fixture.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const checking = syncNow(); await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalled());
    await storage.setGrant(grant("b")); complete(reply(status, { status: "ok", checked_at: at }));
    expect(await checking).toEqual({ ok: false, reason: "superseded" });
    expect((await storage.getGrant())?.token_id).toBe("b"); expect(await storage.getLastSync()).toBeUndefined();
  });
  it.each([[429, "rate_limited"], [401, "grant_revoked"]] as const)("handles %s without a fresh success", async (status, reason) => {
    await connected(); fixture.fetch.mockResolvedValue(reply(status));
    expect(await syncNow()).toEqual({ ok: false, reason }); expect(await storage.getLastSync()).toBeUndefined();
  });
  it("reports transport timeout without advancing acknowledgment", async () => {
    await connected(); fixture.fetch.mockRejectedValue(new DOMException("aborted", "AbortError"));
    expect(await syncNow()).toEqual({ ok: false, reason: "timeout" }); expect(await storage.getLastSync()).toBeUndefined();
  });
  it("retains timeout classification after response headers arrive", async () => {
    await connected(); fixture.fetch.mockResolvedValue({ status: 200, json: async () => { throw new DOMException("body aborted", "AbortError"); } });
    expect(await syncNow()).toEqual({ ok: false, reason: "timeout" });
  });
  it("migrates an actual legacy grant without promoting its local success", async () => {
    fixture.raw = { installation_id: "legacy", grant: grant(), last_sync_hash: "untrusted", last_sync_at: at, last_sync_status: "unchanged" };
    fixture.fetch.mockResolvedValue(reply(200, { status: "none", checked_at: at }));
    expect(await syncNow()).toEqual({ ok: false, reason: "consent_required" });
    expect(fixture.fetch).toHaveBeenCalledTimes(1); expect(fixture.raw.credential_generation).toBeTypeOf("string");
    expect(await storage.getLastSync()).toBeUndefined(); expect(fixture.raw.last_sync_at).toBeUndefined();
  });
  it("discards legacy unbound cache and invalidates old binding updates", async () => {
    const old = await connected(); fixture.raw.last_sync_at = at; fixture.raw.last_sync_hash = "old"; fixture.raw.last_sync_status = "stored";
    await storage.setGrant(grant("b"));
    expect(await storage.updateCredentialState(old, { acknowledged_at: at })).toBe(false);
    expect(await storage.getLastSync()).toBeUndefined();
  });
});

describe("PS13 fresh consent capture", () => {
  it.each(["stored", "unavailable", "missing_browser_session"])("keeps grant and %s capture outcomes separate", async (status) => {
    await connected(); if (status === "missing_browser_session") fixture.cookie = "";
    fixture.fetch.mockResolvedValue(reply(200, { ...grant("new"), credential_capture: { status, checked_at: at } }));
    expect(await exchangeConsentCode("fresh-code")).toEqual({ ok: true, credentialCapture: status });
    expect(JSON.parse(fixture.fetch.mock.calls[0][1].body).session_id).toBe(fixture.cookie || undefined);
    expect((await storage.getGrant())?.token_id).toBe("new");
    expect((await storage.getCredentialState())?.acknowledged_at).toBe(status === "stored" ? at : null);
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });
  it("cannot reinstall a disconnected grant from a late exchange response", async () => {
    await connected(); let complete!: (response: Response) => void;
    fixture.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const exchange = exchangeConsentCode("code"); await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalled());
    cancelConsentExchange(); await storage.clearGrant(); complete(reply(200, grant("old")));
    expect((await exchange).ok).toBe(false); expect(await storage.getGrant()).toBeUndefined();
  });
});
