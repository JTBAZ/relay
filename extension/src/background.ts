import browser from "./lib/browser";
import {
  isExternalConsentMessage,
  isInternalRequest,
  MSG_REVOKE_LOCAL,
  MSG_START_CONSENT,
  MSG_STATUS,
  MSG_SYNC_NOW
} from "./lib/messages";
import { PATREON_SESSION_COOKIE_NAME } from "./lib/constants";
import { RELAY_BASE, syncNow } from "./lib/sync-now";
import * as storage from "./lib/storage";

const ALARM_RELAY_COOKIE = "relay-cookie-refresh";

/** Match `externally_connectable`. Dev-only localhost checks use `import.meta.env.DEV` so prod bundles stay free of `localhost` (P-12). */
function consentOriginAllowed(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("https://relayapp.me/")) return true;
  if (import.meta.env.DEV) {
    return url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:");
  }
  return false;
}

async function ensureRefreshAlarm(): Promise<void> {
  const existing = await browser.alarms.get(ALARM_RELAY_COOKIE);
  if (!existing) {
    await browser.alarms.create(ALARM_RELAY_COOKIE, { periodInMinutes: 12 * 60 });
  }
}

browser.runtime.onInstalled.addListener(() => {
  void (async () => {
    await storage.ensureInstallationId();
    await ensureRefreshAlarm();
  })();
});

browser.runtime.onStartup.addListener(() => {
  void ensureRefreshAlarm();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_RELAY_COOKIE) return;
  void (async () => {
    const g = await storage.getGrant();
    if (!g) return;
    await syncNow();
  })();
});

browser.cookies.onChanged.addListener((changeInfo) => {
  const { cookie, removed } = changeInfo;
  if (removed || cookie.name !== PATREON_SESSION_COOKIE_NAME) return;
  const host = (cookie.domain || "").replace(/^\./, "").toLowerCase();
  if (!host.endsWith("patreon.com")) return;
  void (async () => {
    const g = await storage.getGrant();
    if (!g) return;
    await syncNow();
  })();
});

type StatusPayload = {
  hasGrant: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  accountId: string | null;
  relayCreatorId: string | null;
  consentError: string | null;
};

async function handleInternalMessage(raw: unknown): Promise<unknown> {
  if (!isInternalRequest(raw)) {
    return undefined;
  }
  switch (raw.type) {
    case MSG_START_CONSENT: {
      const id = browser.runtime.id;
      const installationId = await storage.ensureInstallationId();
      const ua =
        typeof globalThis.navigator !== "undefined"
          ? globalThis.navigator.userAgent
          : "Relay extension";
      const q = new URLSearchParams({
        ext_id: id,
        installation_id: installationId,
        label: ua
      });
      const url = `${RELAY_BASE}/extension/authorize?${q.toString()}`;
      const tab = await browser.tabs.create({ url });
      return tab.id ?? null;
    }
    case MSG_SYNC_NOW:
      return syncNow();
    case MSG_REVOKE_LOCAL: {
      const g = await storage.getGrant();
      await storage.clearGrant();
      await storage.clearLastSync();
      if (g?.token_id && g.token) {
        try {
          await fetch(
            `${RELAY_BASE}/api/v1/auth/extension/grants/${encodeURIComponent(g.token_id)}`,
            {
              method: "DELETE",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${g.token}`
              }
            }
          );
        } catch {
          /* local revoke still applies */
        }
      }
      return { ok: true as const };
    }
    case MSG_STATUS: {
      const g = await storage.getGrant();
      const last = await storage.getLastSync();
      const err = await storage.getConsentLastError();
      const payload: StatusPayload = {
        hasGrant: Boolean(g),
        lastSyncAt: last?.at ?? null,
        lastSyncStatus: last?.status ?? null,
        accountId: g?.account_id ?? null,
        relayCreatorId: g?.relay_creator_id ?? null,
        consentError: err ?? null
      };
      return payload;
    }
    default:
      return undefined;
  }
}

browser.runtime.onMessage.addListener((message: unknown) => handleInternalMessage(message));

async function exchangeConsentCode(
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const installationId = await storage.ensureInstallationId();
  const res = await fetch(`${RELAY_BASE}/api/v1/auth/extension/consent/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      consent_code: code.trim(),
      installation_id: installationId
    })
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg =
      json.error?.message ??
      (res.status === 409
        ? "Consent code already used."
        : res.status === 410
          ? "Consent code expired."
          : `Exchange failed (${res.status}).`);
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  const d = json.data;
  if (!d || typeof d !== "object") {
    const msg = "Invalid exchange response.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  const token = d.token;
  const tokenId = d.token_id;
  const expiresAt = d.expires_at;
  const accountId = d.account_id;
  const relayCreatorId = d.relay_creator_id;

  if (typeof token !== "string" || typeof tokenId !== "string" || typeof expiresAt !== "string") {
    const msg = "Exchange response missing token fields.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }
  if (typeof accountId !== "string") {
    const msg = "Exchange response missing account_id.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  const rc =
    relayCreatorId === null || relayCreatorId === undefined
      ? ""
      : typeof relayCreatorId === "string"
        ? relayCreatorId
        : "";
  if (!rc.trim()) {
    const msg = "Relay workspace not provisioned — open the studio and try again.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  try {
    await storage.setGrant({
      token: token.trim(),
      token_id: tokenId.trim(),
      expires_at: expiresAt.trim(),
      account_id: accountId.trim(),
      relay_creator_id: rc.trim(),
      created_at: new Date().toISOString()
    });
  } catch {
    const msg = "Could not store grant.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  await storage.setConsentLastError(undefined);
  await syncNow();
  return { ok: true };
}

browser.runtime.onMessageExternal.addListener((message: unknown, sender) => {
  return (async (): Promise<unknown> => {
    if (!consentOriginAllowed(sender.url)) {
      return { ok: false as const, error: "Forbidden sender." };
    }
    if (!isExternalConsentMessage(message)) {
      return { ok: false as const, error: "Unknown message." };
    }
    return exchangeConsentCode(message.code);
  })();
});
