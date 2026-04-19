import browser from "./browser";
import {
  PATREON_SESSION_COOKIE_NAME,
  PATREON_URL,
  RELAY_BASE
} from "./constants";
import * as storage from "./storage";

export { PATREON_URL, RELAY_BASE } from "./constants";

const DEBUG = import.meta.env.DEV;

export type SyncResult =
  | { ok: true; status: "stored" | "unchanged" }
  | {
      ok: false;
      reason:
        | "no_grant"
        | "no_creator"
        | "no_patreon_cookie"
        | "grant_revoked"
        | "rate_limited"
        | "http_error";
      detail?: string;
    };

async function sha256Hex(value: string): Promise<string> {
  const enc = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function syncNow(): Promise<SyncResult> {
  const grant = await storage.getGrant();
  if (!grant) return { ok: false, reason: "no_grant" };
  if (!grant.relay_creator_id.trim()) return { ok: false, reason: "no_creator" };

  const cookie = await browser.cookies.get({
    url: PATREON_URL,
    name: PATREON_SESSION_COOKIE_NAME
  });
  if (!cookie?.value) return { ok: false, reason: "no_patreon_cookie" };

  const hash = await sha256Hex(cookie.value);
  const last = await storage.getLastSync();
  if (last?.hash === hash) {
    await storage.setLastSync({
      hash,
      status: "unchanged",
      at: new Date().toISOString()
    });
    return { ok: true, status: "unchanged" };
  }

  const res = await fetch(`${RELAY_BASE}/api/v1/patreon/cookie`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${grant.token}`
    },
    body: JSON.stringify({
      creator_id: grant.relay_creator_id,
      session_id: cookie.value
    })
  });

  if (res.status === 401) {
    await storage.clearGrant();
    return { ok: false, reason: "grant_revoked" };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (!res.ok) {
    if (DEBUG) {
      console.warn("[Relay] syncNow HTTP", res.status);
    }
    return { ok: false, reason: "http_error", detail: String(res.status) };
  }

  await storage.setLastSync({
    hash,
    status: "stored",
    at: new Date().toISOString()
  });
  return { ok: true, status: "stored" };
}
