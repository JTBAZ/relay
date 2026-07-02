import browser from "./lib/browser";
import { runRelayCrossPostFlow } from "./lib/cross-post-flow";
import { reportDistributionComplete } from "./lib/distribution-complete-report";
import { reportDistributionFillResult } from "./lib/distribution-fill-report";
import { isExternalCrossPostMessage } from "./lib/cross-post-types";
import {
  handleExternalMetricsResultMessage,
  runExternalMetricsRefreshFlow
} from "./lib/external-metrics-refresh-flow";
import { isExternalMetricsRefreshMessage } from "./lib/external-metrics-types";
import {
  cancelPostLinkEvaluation,
  forgetPostLinkToastShown,
  injectPostLinkXObserver,
  reportPostLinkCandidateUrl,
  startPostLinkWatcher
} from "./lib/post-link-listener";
import {
  buildPostLinkWatch,
  clearPostLinkWatch,
  getMostRecentActiveWatchForTab,
  getPostLinkWatch,
  purgeLegacyPostLinkWatchKeys,
  resolvePendingCrossPostWatchContext,
  setDismissCooldown,
  setPostLinkWatch
} from "./lib/post-link-watch";
import type { PostLinkWatch } from "./lib/post-link-patterns";
import {
  isExternalConsentMessage,
  isExternalStatusRequest,
  isInternalRequest,
  MSG_DISTRIBUTION_FILL_RESULT,
  MSG_EXTERNAL_METRICS_RESULT,
  MSG_POST_LINK_CANDIDATE_URL,
  MSG_POST_LINK_CONFIRM,
  MSG_POST_LINK_DISMISS,
  MSG_POST_LINK_FORGET,
  MSG_POST_LINK_GET_ACTIVE_WATCH,
  MSG_REVOKE_LOCAL,
  MSG_START_CONSENT,
  MSG_STATUS,
  MSG_SYNC_NOW,
  type ExternalStatusResponse
} from "./lib/messages";
import { PATREON_SESSION_COOKIE_NAME, RELAY_WEB_BASE } from "./lib/constants";
import { RELAY_API_BASE, syncNow } from "./lib/sync-now";
import { notifyRelayWebDistributionUpdated } from "./lib/relay-tab-notify";
import * as storage from "./lib/storage";

const ALARM_RELAY_COOKIE = "relay-cookie-refresh";

console.log("[relay:post-link] background service worker started", {
  t: Date.now(),
  extensionId: browser.runtime.id
});
startPostLinkWatcher();
void purgeLegacyPostLinkWatchKeys();

/** Match `externally_connectable`. Dev-only localhost checks use `import.meta.env.DEV` so prod bundles stay free of `localhost` (P-12). */
function relayWebOriginAllowed(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("https://relayapp.me/")) return true;
  if (__EXT_ENV__ === "dev") {
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

async function startPostLinkWatchForFill(
  attemptId: string,
  tabId: number | null | undefined
): Promise<void> {
  if (tabId === null || tabId === undefined) {
    console.log("[relay:post-link] skip watch — no tab_id", { attemptId });
    return;
  }

  const ctx = await resolvePendingCrossPostWatchContext();
  if (!ctx) {
    console.log(
      "[relay:post-link] skip watch — could not resolve pending cross-post context",
      { attemptId, tabId }
    );
    return;
  }

  const watch = buildPostLinkWatch({
    attempt_id: attemptId,
    destination: ctx.destination,
    relay_post_title: ctx.relay_post_title,
    tab_id: tabId
  });
  await setPostLinkWatch(watch);
  console.log("[relay:post-link] watch created", watch);

  if (ctx.destination === "x") {
    await injectPostLinkXObserver(tabId);
    console.log("[relay:post-link] injected X observer", { attemptId, tabId });
  }
}

async function handleInternalMessage(
  raw: unknown,
  sender?: browser.Runtime.MessageSender
): Promise<unknown> {
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
      const url = `${RELAY_WEB_BASE}/extension/authorize?${q.toString()}`;
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
            `${RELAY_API_BASE}/api/v1/auth/extension/grants/${encodeURIComponent(g.token_id)}`,
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
    case MSG_DISTRIBUTION_FILL_RESULT: {
      if (raw.type !== MSG_DISTRIBUTION_FILL_RESULT) return undefined;
      const tabId =
        typeof sender?.tab?.id === "number" ? sender.tab.id : (raw.extension_tab_id ?? null);
      await reportDistributionFillResult({
        attempt_id: raw.attempt_id,
        status: raw.status,
        fill_result: raw.fill_result ?? {},
        extension_tab_id: tabId,
        error_code: raw.error_code ?? null,
        error_detail: raw.error_detail ?? null
      });
      if (raw.status === "fill_succeeded" || raw.status === "fill_partial") {
        await startPostLinkWatchForFill(raw.attempt_id, tabId);
      }
      return { ok: true as const };
    }
    case MSG_POST_LINK_CONFIRM: {
      if (raw.type !== MSG_POST_LINK_CONFIRM) return undefined;
      const watch = await getPostLinkWatch(raw.attempt_id);
      if (!watch) {
        return { ok: false as const, error: "no_active_watch" };
      }
      const ok = await reportDistributionComplete({
        attempt_id: watch.attempt_id,
        status: "posted",
        external_url: raw.canonical_url,
        external_id: raw.external_id ?? null
      });
      if (!ok) {
        return { ok: false as const, error: "complete_failed" };
      }
      cancelPostLinkEvaluation(watch.tab_id);
      forgetPostLinkToastShown(watch.attempt_id);
      await clearPostLinkWatch(watch.attempt_id);
      void notifyRelayWebDistributionUpdated();
      return { ok: true as const };
    }
    case MSG_POST_LINK_DISMISS: {
      if (raw.type !== MSG_POST_LINK_DISMISS) return undefined;
      const watch = await getPostLinkWatch(raw.attempt_id);
      if (watch) {
        forgetPostLinkToastShown(watch.attempt_id);
        await setDismissCooldown(watch.attempt_id);
      }
      return { ok: true as const };
    }
    case MSG_POST_LINK_FORGET: {
      if (raw.type !== MSG_POST_LINK_FORGET) return undefined;
      const watch = await getPostLinkWatch(raw.attempt_id);
      if (watch) {
        cancelPostLinkEvaluation(watch.tab_id);
        forgetPostLinkToastShown(watch.attempt_id);
      }
      await clearPostLinkWatch(raw.attempt_id);
      return { ok: true as const };
    }
    case MSG_POST_LINK_GET_ACTIVE_WATCH: {
      const tabId = sender?.tab?.id;
      if (typeof tabId !== "number") {
        return { ok: false as const, error: "missing_tab", watch: null };
      }
      const watch: PostLinkWatch | null = await getMostRecentActiveWatchForTab(tabId);
      return { ok: true as const, watch };
    }
    case MSG_POST_LINK_CANDIDATE_URL: {
      if (raw.type !== MSG_POST_LINK_CANDIDATE_URL) return undefined;
      const tabId = sender?.tab?.id;
      const url = raw.url.trim();
      if (typeof tabId !== "number" || !url) {
        return { ok: false as const, error: "missing_tab_or_url" };
      }
      reportPostLinkCandidateUrl(tabId, url);
      return { ok: true as const };
    }
    case MSG_EXTERNAL_METRICS_RESULT: {
      if (raw.type !== MSG_EXTERNAL_METRICS_RESULT) return undefined;
      await handleExternalMetricsResultMessage(raw);
      return { ok: true as const };
    }
    default:
      return undefined;
  }
}

browser.runtime.onMessage.addListener((message: unknown, sender) =>
  handleInternalMessage(message, sender)
);

async function exchangeConsentCode(
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const installationId = await storage.ensureInstallationId();
  const res = await fetch(`${RELAY_API_BASE}/api/v1/auth/extension/consent/exchange`, {
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

async function handleExternalStatusRequest(): Promise<ExternalStatusResponse> {
  const g = await storage.getGrant();
  const last = await storage.getLastSync();
  let patreonCookiePresent = false;
  try {
    const cookie = await browser.cookies.get({
      url: "https://www.patreon.com/",
      name: PATREON_SESSION_COOKIE_NAME
    });
    patreonCookiePresent = Boolean(cookie?.value);
  } catch {
    patreonCookiePresent = false;
  }
  return {
    ok: true,
    hasGrant: Boolean(g),
    relayCreatorId: g?.relay_creator_id ?? null,
    patreonCookiePresent,
    lastSyncAt: last?.at ?? null,
    lastSyncStatus: last?.status ?? null
  };
}

browser.runtime.onMessageExternal.addListener((message: unknown, sender) => {
  return (async (): Promise<unknown> => {
    if (!relayWebOriginAllowed(sender.url)) {
      return { ok: false as const, error: "Forbidden sender." };
    }
    if (isExternalStatusRequest(message)) {
      return handleExternalStatusRequest();
    }
    if (isExternalCrossPostMessage(message)) {
      return runRelayCrossPostFlow(message);
    }
    if (isExternalMetricsRefreshMessage(message)) {
      return runExternalMetricsRefreshFlow(message);
    }
    if (isExternalConsentMessage(message)) {
      return exchangeConsentCode(message.code);
    }
    return { ok: false as const, error: "Unknown message." };
  })();
});
