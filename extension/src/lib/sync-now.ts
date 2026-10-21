import browser from "./browser";
import { PATREON_SESSION_COOKIE_NAME, PATREON_URL, RELAY_API_BASE } from "./constants";
import * as storage from "./storage";

export { PATREON_URL, RELAY_API_BASE, RELAY_API_BASE as RELAY_BASE } from "./constants";
export type SyncResult =
  | { ok: true; status: "stored" | "checked" }
  | { ok: false; reason: "no_grant" | "no_creator" | "no_patreon_cookie" | "grant_revoked" | "consent_required" | "rate_limited" | "http_error" | "timeout" | "superseded"; detail?: string };

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bound the request and body; never expose credential response text in errors. */
export async function credentialRequest(url: string, init: RequestInit): Promise<{ status: number; data: Record<string, unknown> | undefined }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const json = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new DOMException("aborted", "AbortError");
      return null;
    }) as { data?: Record<string, unknown> } | null;
    if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
    return { status: response.status, data: json?.data };
  } finally { clearTimeout(timeout); }
}

let pending: Promise<unknown> = Promise.resolve();
export function syncNow(): Promise<SyncResult> {
  const next = pending.then(checkAndRotate, checkAndRotate);
  pending = next.catch(() => {});
  return next;
}

async function checkAndRotate(): Promise<SyncResult> {
  const context = await storage.getCredentialContext();
  if (!context) return { ok: false, reason: "no_grant" };
  const { grant, installationId } = context;
  if (!grant.relay_creator_id.trim()) return { ok: false, reason: "no_creator" };
  const current = async () => (await storage.getCredentialContext())?.binding === context.binding;
  const fail = async (reason: Extract<SyncResult, { ok: false }>["reason"]): Promise<SyncResult> => {
    if (!await storage.updateCredentialState(context, { status: reason })) return { ok: false, reason: "superseded" };
    return { ok: false, reason };
  };
  try {
    const cookie = await browser.cookies.get({ url: PATREON_URL, name: PATREON_SESSION_COOKIE_NAME });
    const value = cookie?.value?.trim() ?? "";
    const hash = value ? await sha256Hex(value) : null;
    const previous = await storage.getCredentialState();
    if (!await storage.updateCredentialState(context, { observed_at: new Date().toISOString(), browser_session_present: Boolean(value), status: "checking" })) return { ok: false, reason: "superseded" };
    const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${grant.token}` };
    const body = { creator_id: grant.relay_creator_id, installation_id: installationId };
    let response = await credentialRequest(`${RELAY_API_BASE}/api/v1/patreon/cookie/check`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!await current()) return { ok: false, reason: "superseded" };
    if (response.status === 401) return { ok: false, reason: await storage.clearGrantIfCurrent(context) ? "grant_revoked" : "superseded" };
    if (response.status === 429) return fail("rate_limited");
    if (response.status === 403) return fail("consent_required");
    if (response.status !== 200 || !response.data) return fail("http_error");
    if (response.data.status !== "ok") return fail("consent_required");
    if (!value) return fail("no_patreon_cookie");
    const changed = previous?.hash !== hash;
    if (changed) {
      response = await credentialRequest(`${RELAY_API_BASE}/api/v1/patreon/cookie`, { method: "POST", headers, body: JSON.stringify({ ...body, session_id: value }) });
      if (!await current()) return { ok: false, reason: "superseded" };
      if (response.status === 401) return { ok: false, reason: await storage.clearGrantIfCurrent(context) ? "grant_revoked" : "superseded" };
      if (response.status === 429) return fail("rate_limited");
      if (response.status === 409 || response.status === 403) return fail("consent_required");
      if (response.status !== 200 || response.data?.status !== "stored") return fail("http_error");
    }
    const at = response.data?.checked_at;
    if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return fail("http_error");
    if (!await storage.updateCredentialState(context, { hash, acknowledged_at: at, ...(changed ? { uploaded_at: at } : {}), status: changed ? "stored" : "checked" })) return { ok: false, reason: "superseded" };
    return { ok: true, status: changed ? "stored" : "checked" };
  } catch (error) { return fail(error instanceof Error && error.name === "AbortError" ? "timeout" : "http_error"); }
}
