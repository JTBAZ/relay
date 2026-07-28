import { parseRelayExtensionIds } from "./relay-extension-ids";

export const RELAY_CROSS_POST_MESSAGE_TYPE = "RELAY_CROSS_POST" as const;
export const RELAY_EXTERNAL_METRICS_REFRESH_MESSAGE_TYPE = "RELAY_EXTERNAL_METRICS_REFRESH" as const;
export type CrossPostDestination = "patreon" | "x" | "deviantart";
export type RelayCrossPostContentOverride = {
  title?: string;
  body_text?: string;
  post_text?: string;
  tags?: string[];
};
export const RELAY_CONSENT_CODE_MESSAGE_TYPE = "RELAY_CONSENT_CODE" as const;

export type ExtensionRuntime = {
  sendMessage(extensionId: string, message: unknown): Promise<unknown> | void;
  lastError?: { message?: string };
};

export type RelayCrossPostSuccess = {
  ok: true;
  tab_id: number;
  relay_post_id: string;
};

export type RelayCrossPostFailure = {
  ok: false;
  reason?: string;
  detail?: string;
  error?: string;
};

export type SendRelayCrossPostResult =
  | { ok: true; extensionId: string; response: RelayCrossPostSuccess }
  | {
      ok: false;
      reason:
        | "no_extension_ids"
        | "no_runtime"
        | "invalid_post_id"
        | "all_failed";
      detail?: string;
    };

export function getExtensionRuntime(): ExtensionRuntime | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    chrome?: { runtime?: ExtensionRuntime };
    browser?: { runtime?: ExtensionRuntime };
  };
  return w.chrome?.runtime ?? w.browser?.runtime ?? null;
}

async function sendExtensionMessage(
  runtime: ExtensionRuntime,
  extensionId: string,
  message: unknown
): Promise<unknown> {
  const out = runtime.sendMessage(extensionId, message);
  if (out && typeof (out as Promise<unknown>).then === "function") {
    return out;
  }
  const lastError = runtime.lastError?.message?.trim();
  if (lastError) {
    throw new Error(lastError);
  }
  return out;
}

export function isRelayCrossPostSuccess(value: unknown): value is RelayCrossPostSuccess {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.ok === true &&
    typeof v.relay_post_id === "string" &&
    v.relay_post_id.trim().length > 0 &&
    typeof v.tab_id === "number" &&
    Number.isFinite(v.tab_id)
  );
}

function crossPostFailureReason(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const v = value as RelayCrossPostFailure;
  if (typeof v.reason === "string" && v.reason.trim()) return v.reason.trim();
  if (typeof v.error === "string" && v.error.trim()) return v.error.trim();
  return undefined;
}

export function describeRelayCrossPostFailure(result: SendRelayCrossPostResult): string {
  if (result.ok) return "";
  switch (result.reason) {
    case "no_extension_ids":
      return "No official Relay extension is configured for this site. Set NEXT_PUBLIC_RELAY_EXTENSION_IDS or install the Relay extension.";
    case "no_runtime":
      return "Could not reach a browser extension from this page. Use Chrome or Firefox with the Relay extension installed.";
    case "invalid_post_id":
      return "This post id is missing or invalid.";
    case "all_failed":
      return result.detail ?? "The Relay extension could not start cross-posting. Connect the extension and try again.";
    default:
      return "Cross-post failed.";
  }
}

export function describeRelayCrossPostExtensionFailure(response: unknown): string {
  const reason = crossPostFailureReason(response);
  switch (reason) {
    case "not_connected":
      return "Connect the Relay extension first (extension popup or Settings → Connected extensions).";
    case "grant_revoked":
      return "Your Relay extension session expired. Reconnect the extension and try again.";
    case "package_fetch_failed":
      return "Relay could not load the post package. Check your connection and try again.";
    case "tab_open_failed":
      return "Relay loaded the draft but could not open the compose page.";
    case "tab_load_timeout":
      return "The compose page took too long to load. Try again when it is reachable.";
    case "inject_failed":
      return "Relay opened the compose page but could not inject the fill script. Try reloading and cross-posting again.";
    case "invalid_message":
      return "Cross-post request was invalid.";
    default:
      if (reason) return reason;
      return "The Relay extension could not start cross-posting.";
  }
}

/** Sends only `relay_post_id` (+ optional destination / distribution_attempt_id) to each configured official extension id until one succeeds. */
export async function sendRelayCrossPostToExtension(
  relayPostId: string,
  destination: CrossPostDestination = "patreon",
  contentOverride?: RelayCrossPostContentOverride,
  opts?: { distribution_attempt_id?: string }
): Promise<SendRelayCrossPostResult> {
  const postId = relayPostId.trim();
  if (!postId && !opts?.distribution_attempt_id?.trim()) {
    return { ok: false, reason: "invalid_post_id" };
  }

  const extensionIds = Array.from(parseRelayExtensionIds());
  if (extensionIds.length === 0) {
    return { ok: false, reason: "no_extension_ids" };
  }

  const runtime = getExtensionRuntime();
  if (!runtime?.sendMessage) {
    return { ok: false, reason: "no_runtime" };
  }

  let lastFailure: unknown;
  for (const extensionId of extensionIds) {
    try {
      const response = await sendExtensionMessage(runtime, extensionId, {
        type: RELAY_CROSS_POST_MESSAGE_TYPE,
        relay_post_id: postId,
        ...(destination !== "patreon" ? { destination } : {}),
        ...(contentOverride ? { content_override: contentOverride } : {}),
        ...(opts?.distribution_attempt_id
          ? { distribution_attempt_id: opts.distribution_attempt_id.trim() }
          : {})
      });
      if (isRelayCrossPostSuccess(response)) {
        return { ok: true, extensionId, response };
      }
      lastFailure = response;
    } catch (e) {
      lastFailure = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    ok: false,
    reason: "all_failed",
    detail: describeRelayCrossPostExtensionFailure(lastFailure)
  };
}

export type SendRelayExternalMetricsRefreshResult =
  | {
      ok: true;
      extensionId: string;
      response: {
        ok: true;
        attempt_id: string | null;
        platform_instance_id?: string | null;
        post_id: string;
        destination: CrossPostDestination;
        snapshot_count: number;
      };
    }
  | {
      ok: false;
      reason:
        | "no_extension_ids"
        | "no_runtime"
        | "invalid_context"
        | "all_failed";
      detail?: string;
    };

function isExternalMetricsRefreshSuccess(value: unknown): value is {
  ok: true;
  attempt_id: string | null;
  platform_instance_id?: string | null;
  post_id: string;
  destination: CrossPostDestination;
  snapshot_count: number;
} {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const hasAttempt = typeof v.attempt_id === "string" && v.attempt_id.trim().length > 0;
  const hasInstance =
    typeof v.platform_instance_id === "string" && v.platform_instance_id.trim().length > 0;
  return (
    v.ok === true &&
    (hasAttempt || hasInstance || v.attempt_id === null) &&
    typeof v.post_id === "string" &&
    typeof v.snapshot_count === "number"
  );
}

export function describeRelayExternalMetricsRefreshFailure(
  result: Extract<SendRelayExternalMetricsRefreshResult, { ok: false }>
): string {
  switch (result.reason) {
    case "no_extension_ids":
      return "No official Relay extension is configured for this site.";
    case "no_runtime":
      return "Could not reach the Relay extension from this page.";
    case "invalid_context":
      return "This post is not linked on Patreon yet.";
    case "all_failed":
      return result.detail ?? "The Relay extension could not refresh external stats.";
    default:
      return "Could not refresh external stats.";
  }
}

function externalMetricsRefreshFailureReason(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const v = value as { reason?: unknown; detail?: unknown; error?: unknown };
  if (typeof v.detail === "string" && v.detail.trim()) return v.detail.trim();
  if (typeof v.reason === "string" && v.reason.trim()) return v.reason.trim();
  if (typeof v.error === "string" && v.error.trim()) return v.error.trim();
  return undefined;
}

export function describeRelayExternalMetricsRefreshExtensionFailure(
  response: unknown
): string {
  const detail =
    response !== null &&
    typeof response === "object" &&
    "detail" in response &&
    typeof (response as { detail?: unknown }).detail === "string"
      ? String((response as { detail: string }).detail).trim()
      : "";
  if (detail) return detail;

  const reason = externalMetricsRefreshFailureReason(response);
  switch (reason) {
    case "not_connected":
      return "Connect the Relay extension first (popup or Settings → Connected extensions).";
    case "invalid_message":
      return "Refresh request was invalid.";
    case "unsupported_destination":
      return "External stats refresh is not supported for this platform yet.";
    case "tab_open_failed":
      return "Relay could not open the linked Patreon post tab.";
    case "tab_load_timeout":
      return "The Patreon post took too long to load, or the scraper never responded.";
    case "inject_failed":
      return "Relay opened Patreon but could not inject the stats scraper. Reload the extension and try again.";
    case "scrape_failed":
      return "Relay could not read stats from the Patreon page. Make sure you are logged in and the post is visible.";
    case "metrics_post_failed":
      return "Relay read stats but could not save them. Check that the Relay API is running and the extension is connected.";
    default:
      if (reason) return reason;
      return "The Relay extension could not refresh external stats.";
  }
}

export async function sendRelayExternalMetricsRefreshToExtension(input: {
  postId: string;
  attemptId?: string | null;
  platformInstanceId?: string | null;
  destination: CrossPostDestination;
  externalUrl: string;
}): Promise<SendRelayExternalMetricsRefreshResult> {
  const postId = input.postId.trim();
  const attemptId = input.attemptId?.trim() ?? "";
  const platformInstanceId = input.platformInstanceId?.trim() ?? "";
  const externalUrl = input.externalUrl.trim();
  if (!postId || !externalUrl || (!attemptId && !platformInstanceId)) {
    return { ok: false, reason: "invalid_context" };
  }

  const extensionIds = Array.from(parseRelayExtensionIds());
  if (extensionIds.length === 0) {
    return { ok: false, reason: "no_extension_ids" };
  }

  const runtime = getExtensionRuntime();
  if (!runtime?.sendMessage) {
    return { ok: false, reason: "no_runtime" };
  }

  let lastFailure: unknown;
  for (const extensionId of extensionIds) {
    try {
      const response = await sendExtensionMessage(runtime, extensionId, {
        type: RELAY_EXTERNAL_METRICS_REFRESH_MESSAGE_TYPE,
        post_id: postId,
        ...(attemptId ? { attempt_id: attemptId } : {}),
        ...(platformInstanceId ? { platform_instance_id: platformInstanceId } : {}),
        destination: input.destination,
        external_url: externalUrl
      });
      if (isExternalMetricsRefreshSuccess(response)) {
        return { ok: true, extensionId, response };
      }
      lastFailure = response;
    } catch (e) {
      lastFailure = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    ok: false,
    reason: "all_failed",
    detail: describeRelayExternalMetricsRefreshExtensionFailure(lastFailure)
  };
}

// ---------------------------------------------------------------------------
// Extension status probe — A3/A4
// ---------------------------------------------------------------------------

export type RelayExtensionStatusProbeSuccess = {
  ok: true;
  extensionId: string;
  hasGrant: boolean;
  relayCreatorId: string | null;
  patreonCookiePresent: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

export type RelayExtensionStatusProbeFailure = {
  ok: false;
  reason:
    | "no_extension_ids"
    | "no_runtime"
    | "all_failed";
  detail?: string;
};

export type RelayExtensionStatusProbeResult =
  | RelayExtensionStatusProbeSuccess
  | RelayExtensionStatusProbeFailure;

function isStatusResponse(v: unknown): v is RelayExtensionStatusProbeSuccess & { extensionId?: string } {
  if (v === null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return r.ok === true && "hasGrant" in r && "patreonCookiePresent" in r;
}

/**
 * Probes each configured Relay extension ID and returns the first successful
 * status response, or a failure with reason. Safe to call without side effects.
 */
export async function probeRelayExtensionStatus(): Promise<RelayExtensionStatusProbeResult> {
  const extensionIds = Array.from(parseRelayExtensionIds());
  if (extensionIds.length === 0) {
    return { ok: false, reason: "no_extension_ids" };
  }

  const runtime = getExtensionRuntime();
  if (!runtime?.sendMessage) {
    return { ok: false, reason: "no_runtime" };
  }

  let lastError: string | undefined;
  for (const extensionId of extensionIds) {
    try {
      const response = await sendExtensionMessage(runtime, extensionId, {
        type: "RELAY_STATUS_REQUEST"
      });
      if (isStatusResponse(response)) {
        const r = response as Record<string, unknown>;
        return {
          ok: true,
          extensionId,
          hasGrant: Boolean(r.hasGrant),
          relayCreatorId: typeof r.relayCreatorId === "string" ? r.relayCreatorId : null,
          patreonCookiePresent: Boolean(r.patreonCookiePresent),
          lastSyncAt: typeof r.lastSyncAt === "string" ? r.lastSyncAt : null,
          lastSyncStatus: typeof r.lastSyncStatus === "string" ? r.lastSyncStatus : null
        };
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    ok: false,
    reason: "all_failed",
    detail: lastError
  };
}

export function describeRelayExtensionProbeFailure(result: RelayExtensionStatusProbeFailure): string {
  switch (result.reason) {
    case "no_extension_ids":
      return "No official Relay extension is configured for this site.";
    case "no_runtime":
      return "Relay extension not found. Install it from the Chrome or Firefox store, then refresh.";
    case "all_failed":
      return result.detail ?? "Could not reach the Relay extension. Make sure it is installed and enabled.";
    default:
      return "Could not detect the Relay extension.";
  }
}

// ---------------------------------------------------------------------------

export type ConsentExchangeResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sends the consent code to the extension and returns the exchange result.
 * Previously void — callers that don't need the result can still ignore it.
 */
export async function sendConsentCodeToExtension(
  extId: string,
  code: string
): Promise<ConsentExchangeResult> {
  const runtime = getExtensionRuntime();
  if (!runtime?.sendMessage) {
    throw new Error(
      "Could not reach the extension from this page. Use Chrome or Firefox with the Relay extension installed, or open this tab from the extension."
    );
  }
  const raw = await sendExtensionMessage(runtime, extId, {
    type: RELAY_CONSENT_CODE_MESSAGE_TYPE,
    code: code.trim()
  });
  // Extension returns { ok: true } or { ok: false, error: string }
  if (raw !== null && typeof raw === "object" && "ok" in raw) {
    const r = raw as Record<string, unknown>;
    if (r.ok === true) return { ok: true };
    if (r.ok === false && typeof r.error === "string") {
      return { ok: false, error: r.error };
    }
  }
  // If the extension doesn't return a structured result, treat as success
  // (backward-compatible with older extension builds that returned void/undefined).
  return { ok: true };
}
