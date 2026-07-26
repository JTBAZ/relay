import browser from "./browser";

import { PATREON_SESSION_COOKIE_NAME, PATREON_URL } from "./constants";

import { describeExternalMetricsRefreshFailure } from "./external-metrics-failure-copy";

import { SCRAPE_PATREON_METRICS_SCRIPT } from "./external-metrics-inject";

import {

  chooseExternalMetricsSource,

  mergeExternalMetrics

} from "./external-metrics-merge";

import {

  isExternalMetricsRefreshMessage,

  MSG_RELAY_EXTERNAL_METRICS_REFRESH,

  type ExternalMetricsRefreshMessage,

  type ExternalMetricsRefreshResponse,

  type ExternalMetricsScrapeMetric

} from "./external-metrics-types";

import { reportExternalPostMetrics } from "./external-metrics-report";

import {

  notifyRelayWebExternalMetricsUpdated

} from "./relay-tab-notify";

import {

  MSG_EXTERNAL_METRICS_RESULT,

  type ExternalMetricsDestination

} from "./messages";

import { matchPublishedPostUrl } from "./post-link-patterns";

import { fetchPatreonPostMetricsWithSession } from "./patreon-post-metrics-fetch";

import { patreonMetricsHaveNumericCounters } from "./patreon-metrics-parser";

import * as storage from "./storage";



const REFRESH_TIMEOUT_MS = 35_000;

const TAB_LOAD_TIMEOUT_MS = 20_000;

const API_METRICS_WAIT_MS = 4_000;

const PATREON_POST_SETTLE_MS = 1_200;



const DEBUG = __EXT_ENV__ === "dev";



type PendingRefresh = {

  resolve: (response: ExternalMetricsRefreshResponse) => void;

  timeoutId: ReturnType<typeof setTimeout>;

};



const pendingRefreshes = new Map<string, PendingRefresh>();



const pendingApiFetches = new Map<

  string,

  Promise<Awaited<ReturnType<typeof fetchPatreonPostMetricsWithSession>>>

>();



function logMetricsRefresh(step: string, detail?: Record<string, unknown>): void {

  if (!DEBUG) return;

  if (detail) {

    console.log("[Relay metrics]", step, detail);

  } else {

    console.log("[Relay metrics]", step);

  }

}



function sleep(ms: number): Promise<void> {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



function normalizeExternalUrl(url: string): string {

  return url.trim().replace(/\/$/, "");

}



function patreonPostUrlMatches(tabUrl: string | undefined, externalUrl: string): boolean {

  if (!tabUrl) return false;

  try {

    const tab = new URL(tabUrl);

    const target = new URL(externalUrl);

    return (

      tab.hostname.replace(/^www\./, "") === target.hostname.replace(/^www\./, "") &&

      tab.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")

    );

  } catch {

    return tabUrl.startsWith(externalUrl) || externalUrl.startsWith(tabUrl);

  }

}



function waitForPatreonPostTabReady(tabId: number, externalUrl: string): Promise<void> {

  return new Promise((resolve, reject) => {

    let settled = false;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;



    const finish = (fn: () => void) => {

      if (settled) return;

      settled = true;

      cleanup();

      fn();

    };



    const cleanup = () => {

      if (timeoutId !== undefined) clearTimeout(timeoutId);

      browser.tabs.onUpdated.removeListener(onUpdated);

    };



    const onUpdated = (

      updatedTabId: number,

      changeInfo: { status?: string },

      tab: { url?: string }

    ) => {

      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;

      if (!patreonPostUrlMatches(tab.url, externalUrl)) {

        finish(() => reject(new Error("tab_navigated_away")));

        return;

      }

      finish(() => resolve());

    };



    browser.tabs.onUpdated.addListener(onUpdated);

    timeoutId = setTimeout(() => {

      finish(() => reject(new Error("timeout")));

    }, TAB_LOAD_TIMEOUT_MS);



    void browser.tabs

      .get(tabId)

      .then((tab) => {

        if (tab.status === "complete" && patreonPostUrlMatches(tab.url, externalUrl)) {

          finish(() => resolve());

        }

      })

      .catch(() => {

        finish(() => reject(new Error("tab_gone")));

      });

  });

}



async function openOrFocusTab(externalUrl: string): Promise<number | undefined> {

  const targetUrl = normalizeExternalUrl(externalUrl);

  const tabs = await browser.tabs.query({ url: ["*://*.patreon.com/*", "*://patreon.com/*"] });

  const existing = tabs.find((tab) => patreonPostUrlMatches(tab.url, targetUrl));

  if (existing?.id !== undefined) {

    await browser.tabs.update(existing.id, { active: true });

    if (existing.windowId !== undefined) {

      await browser.windows.update(existing.windowId, { focused: true });

    }

    return existing.id;

  }

  const tab = await browser.tabs.create({ url: targetUrl, active: true });

  return tab.id;

}



async function readPatreonSessionId(): Promise<string | null> {

  try {

    const cookie = await browser.cookies.get({

      url: PATREON_URL,

      name: PATREON_SESSION_COOKIE_NAME

    });

    return cookie?.value?.trim() || null;

  } catch {

    return null;

  }

}



function startPatreonApiMetricsFetch(attemptId: string, externalUrl: string): void {

  const match = matchPublishedPostUrl("patreon", externalUrl);

  const postId = match?.external_id?.trim();

  if (!postId) {

    logMetricsRefresh("api_fetch_skipped", { reason: "missing_external_id", externalUrl });

    return;

  }



  const promise = (async () => {

    const sessionId = await readPatreonSessionId();

    if (!sessionId) {

      logMetricsRefresh("api_fetch_skipped", { reason: "no_patreon_cookie", postId });

      return {

        ok: false,

        metrics: [],

        diagnostics: { reason: "no_patreon_cookie" }

      };

    }

    logMetricsRefresh("api_fetch_start", { postId });

    const result = await fetchPatreonPostMetricsWithSession({

      sessionId,

      postId

    });

    logMetricsRefresh("api_fetch_done", {

      postId,

      ok: result.ok,

      metric_types: result.metrics.map((metric) => metric.metric_type),

      http_status: result.http_status,

      diagnostics: result.diagnostics

    });

    return result;

  })();



  pendingApiFetches.set(attemptId, promise);

}



async function resolveApiFetchResult(

  attemptId: string

): Promise<Awaited<ReturnType<typeof fetchPatreonPostMetricsWithSession>> | null> {

  const promise = pendingApiFetches.get(attemptId);

  pendingApiFetches.delete(attemptId);

  if (!promise) return null;



  const result = await Promise.race([

    promise,

    new Promise<null>((resolve) => setTimeout(() => resolve(null), API_METRICS_WAIT_MS))

  ]);

  if (result === null) {

    logMetricsRefresh("api_fetch_timeout", { attemptId, wait_ms: API_METRICS_WAIT_MS });

  }

  return result;

}



function buildEmptyMetricsDetail(

  domMetrics: ExternalMetricsScrapeMetric[],

  apiResult: Awaited<ReturnType<typeof fetchPatreonPostMetricsWithSession>> | null

): string {

  const domNumeric = patreonMetricsHaveNumericCounters(domMetrics);

  const apiNumeric = patreonMetricsHaveNumericCounters(apiResult?.metrics ?? []);

  const apiReason =

    apiResult?.diagnostics &&

    typeof apiResult.diagnostics === "object" &&

    "reason" in apiResult.diagnostics

      ? String((apiResult.diagnostics as { reason?: unknown }).reason ?? "")

      : "";



  if (!domNumeric && !apiNumeric) {

    if (apiReason === "no_patreon_cookie") {

      return "No stats were found. Log into Patreon in this browser, then try Refresh stats again.";

    }

    return "No stats were found on the Patreon page or creator API. Impressions and Seen may require a Patreon Insights CSV import.";

  }

  return describeExternalMetricsRefreshFailure({ ok: false, reason: "metrics_post_failed" });

}



async function injectPatreonMetricsScraper(tabId: number): Promise<boolean> {

  try {

    await browser.scripting.executeScript({

      target: { tabId },

      files: [SCRAPE_PATREON_METRICS_SCRIPT]

    });

    return true;

  } catch (error) {

    logMetricsRefresh("inject_failed", {

      tabId,

      error: error instanceof Error ? error.message : String(error)

    });

    return false;

  }

}



function waitForRefreshResult(attemptId: string): Promise<ExternalMetricsRefreshResponse> {

  return new Promise((resolve) => {

    const timeoutId = setTimeout(() => {

      pendingRefreshes.delete(attemptId);

      resolve({

        ok: false,

        reason: "tab_load_timeout",

        detail: "Metrics refresh timed out waiting for the Patreon scraper."

      });

    }, REFRESH_TIMEOUT_MS);

    pendingRefreshes.set(attemptId, { resolve, timeoutId });

  });

}



function completePendingRefresh(

  attemptId: string,

  response: ExternalMetricsRefreshResponse

): void {

  const pending = pendingRefreshes.get(attemptId);

  if (!pending) return;

  clearTimeout(pending.timeoutId);

  pendingRefreshes.delete(attemptId);

  if (!response.ok) {

    logMetricsRefresh("refresh_failed", {

      attemptId,

      reason: response.reason,

      detail: response.detail

    });

  } else {

    logMetricsRefresh("refresh_succeeded", {

      attemptId,

      snapshot_count: response.snapshot_count

    });

  }

  pending.resolve(response);

}



function failureResponse(

  reason: ExternalMetricsRefreshResponse extends { ok: false }

    ? ExternalMetricsRefreshResponse["reason"]

    : never,

  detail?: string

): ExternalMetricsRefreshResponse {

  const response = {

    ok: false as const,

    reason,

    detail: detail ?? describeExternalMetricsRefreshFailure({ ok: false, reason, detail })

  };

  logMetricsRefresh("refresh_failed", { reason: response.reason, detail: response.detail });

  return response;

}



export async function runExternalMetricsRefreshFlow(

  message: ExternalMetricsRefreshMessage

): Promise<ExternalMetricsRefreshResponse> {

  if (!isExternalMetricsRefreshMessage(message)) {

    return failureResponse("invalid_message");

  }



  const grant = await storage.getGrant();

  if (!grant?.token.trim()) {

    return failureResponse("not_connected");

  }



  if (message.destination !== "patreon") {

    return failureResponse("unsupported_destination");

  }



  const externalUrl = normalizeExternalUrl(message.external_url);

  if (!externalUrl) {

    return failureResponse("invalid_message", "external_url is required.");

  }



  logMetricsRefresh("refresh_start", {

    attempt_id: message.attempt_id,

    post_id: message.post_id,

    external_url: externalUrl

  });



  startPatreonApiMetricsFetch(message.attempt_id, externalUrl);



  let tabId: number | undefined;

  try {

    tabId = await openOrFocusTab(externalUrl);

  } catch {

    return failureResponse("tab_open_failed");

  }

  if (tabId === undefined) {

    return failureResponse("tab_open_failed");

  }



  try {

    await waitForPatreonPostTabReady(tabId, externalUrl);

  } catch {

    return failureResponse("tab_load_timeout");

  }



  await sleep(PATREON_POST_SETTLE_MS);



  await storage.setPendingExternalMetricsScrape({

    attempt_id: message.attempt_id,

    post_id: message.post_id,

    destination: message.destination,

    external_url: externalUrl

  });



  const resultPromise = waitForRefreshResult(message.attempt_id);

  const injected = await injectPatreonMetricsScraper(tabId);

  if (!injected) {

    const response = failureResponse("inject_failed");

    completePendingRefresh(message.attempt_id, response);

    return response;

  }



  logMetricsRefresh("scraper_injected", { tabId, attempt_id: message.attempt_id });

  return resultPromise;

}



export async function handleExternalMetricsResultMessage(raw: {

  type: typeof MSG_EXTERNAL_METRICS_RESULT;

  attempt_id: string;

  post_id: string;

  destination: ExternalMetricsDestination;

  external_url: string;

  ok: boolean;

  source?: "extension_dom" | "platform_api";

  metrics?: Array<{ metric_type: string; value?: number | null; raw?: Record<string, unknown> }>;

  diagnostics?: Record<string, unknown>;

  error?: string | null;

}): Promise<void> {

  const attemptId = raw.attempt_id.trim();

  const domMetrics = Array.isArray(raw.metrics) ? raw.metrics : [];

  const apiResult = await resolveApiFetchResult(attemptId);

  const apiMetrics = apiResult?.metrics ?? [];

  const mergedMetrics = mergeExternalMetrics(domMetrics, apiMetrics);

  const source = chooseExternalMetricsSource(mergedMetrics, apiMetrics);



  logMetricsRefresh("result_received", {

    attemptId,

    dom_metric_types: domMetrics.map((metric) => metric.metric_type),

    api_metric_types: apiMetrics.map((metric) => metric.metric_type),

    merged_metric_types: mergedMetrics.map((metric) => metric.metric_type),

    dom_diagnostics: raw.diagnostics ?? null,

    api_diagnostics: apiResult?.diagnostics ?? null

  });



  let snapshotCount = 0;

  let reportError: string | undefined;



  if (mergedMetrics.length > 0) {

    const report = await reportExternalPostMetrics({

      attempt_id: attemptId,

      source,

      metrics: mergedMetrics

    });

    snapshotCount = report.snapshot_count;

    reportError = report.error;

    logMetricsRefresh("metrics_post", {

      attemptId,

      ok: report.ok,

      snapshot_count: report.snapshot_count,

      http_status: report.http_status,

      error: report.error

    });

  }



  if (snapshotCount > 0) {

    void notifyRelayWebExternalMetricsUpdated();

    completePendingRefresh(attemptId, {

      ok: true,

      attempt_id: attemptId,

      post_id: raw.post_id,

      destination: raw.destination,

      snapshot_count: snapshotCount

    });

    return;

  }



  let detail = raw.error?.trim() || undefined;

  if (!detail && mergedMetrics.length === 0) {

    detail = buildEmptyMetricsDetail(domMetrics, apiResult);

  } else if (!detail && reportError) {

    detail =

      reportError.startsWith("http_") || /^HTTP \d+/.test(reportError)

        ? `Relay could not save stats (${reportError.replace(/^http_/, "HTTP ")}). Is the API running on port 8787?`

        : reportError === "extension_not_connected"

          ? "Connect the Relay extension first, then try Refresh stats again."

          : `Relay could not save stats: ${reportError}`;

  } else if (!detail) {

    detail = buildEmptyMetricsDetail(domMetrics, apiResult);

  }



  completePendingRefresh(attemptId, {

    ok: false,

    reason: raw.error ? "scrape_failed" : "metrics_post_failed",

    detail

  });

}



export { MSG_RELAY_EXTERNAL_METRICS_REFRESH };


