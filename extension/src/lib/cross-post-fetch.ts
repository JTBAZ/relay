import { RELAY_API_BASE } from "./constants";
import { getCrossPostPlatform } from "./cross-post-registry";
import {
  crossPostDestinationFromMessage,
  type CrossPostContentOverride,
  type CrossPostDestination,
  type ExternalCrossPostMessage,
  type ScheduleEventExternalCrossPostMessage
} from "./cross-post-types";
import { parseXCrossPostPackage } from "./cross-post-types";
import * as storage from "./storage";

export type CrossPostFetchResult =
  | { ok: true; relay_post_id: string; destination: CrossPostDestination; schedule_event_id?: never }
  | { ok: true; relay_post_id: string; destination: "x"; schedule_event_id: string }
  | {
      ok: false;
      reason:
        | "invalid_message"
        | "not_connected"
        | "grant_revoked"
        | "package_fetch_failed";
      detail?: string;
    };

function packagePath(destination: CrossPostDestination, postId: string): string {
  const { apiSegment } = getCrossPostPlatform(destination);
  return `${RELAY_API_BASE}/api/v1/extension/cross-post/${apiSegment}/${encodeURIComponent(postId)}`;
}

function mergeContentOverride(
  destination: CrossPostDestination,
  raw: unknown,
  override: CrossPostContentOverride | undefined
): unknown {
  if (!override) return raw;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const merged: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if (destination === "x") {
    if (override.post_text?.trim()) {
      merged.post_text = override.post_text.trim();
    }
    return merged;
  }
  if (destination === "patreon") {
    if (override.title?.trim()) merged.title = override.title.trim();
    if (override.body_text !== undefined) {
      merged.body_text = override.body_text.trim();
      delete merged.body_html;
    }
    return merged;
  }
  if (destination === "deviantart") {
    if (override.title?.trim()) merged.title = override.title.trim();
    if (override.body_text !== undefined) {
      merged.body_text = override.body_text.trim();
      delete merged.body_html;
    }
    if (override.tags) {
      merged.tags = override.tags.map((tag) => tag.trim()).filter(Boolean);
    }
  }
  return merged;
}

function attemptPackagePath(attemptId: string): string {
  return `${RELAY_API_BASE}/api/v1/extension/cross-post/attempts/${encodeURIComponent(attemptId)}`;
}

/**
 * Fetches an owner-authorized package from Relay API and stores it for editor fill.
 */
export async function fetchAndStoreCrossPostPackage(
  relayPostId: string,
  destination: CrossPostDestination = "patreon",
  contentOverride?: CrossPostContentOverride,
  attemptId?: string
): Promise<CrossPostFetchResult> {
  const postId = relayPostId.trim();
  const attempt = attemptId?.trim() ?? "";
  if (!postId && !attempt) {
    return { ok: false, reason: "invalid_message" };
  }

  const grant = await storage.getGrant();
  if (!grant?.token.trim()) {
    return { ok: false, reason: "not_connected" };
  }

  await storage.clearPendingCrossPost();

  const url = attempt
    ? attemptPackagePath(attempt)
    : packagePath(destination, postId);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${grant.token.trim()}`
    }
  });

  if (res.status === 401) {
    await storage.clearGrant();
    return { ok: false, reason: "grant_revoked" };
  }

  if (!res.ok) {
    return { ok: false, reason: "package_fetch_failed", detail: String(res.status) };
  }

  const json = (await res.json().catch(() => ({}))) as {
    data?: { destination?: CrossPostDestination; package?: unknown };
  };
  try {
    const resolvedDestination =
      attempt && json.data?.destination ? json.data.destination : destination;
    const platform = getCrossPostPlatform(resolvedDestination);
    const rawPackage = attempt ? json.data?.package : json.data;
    const pkg = platform.parsePackage(
      mergeContentOverride(resolvedDestination, rawPackage, contentOverride)
    );
    await storage.setPendingCrossPost(pkg, attempt || undefined);
    return { ok: true, relay_post_id: pkg.relay_post_id, destination: resolvedDestination };
  } catch {
    return { ok: false, reason: "package_fetch_failed", detail: "invalid_package" };
  }
}

export async function fetchAndStoreCrossPostPackageFromMessage(
  message: ExternalCrossPostMessage
): Promise<CrossPostFetchResult> {
  if ("schedule_event_id" in message) return fetchAndStoreScheduleEventCrossPostPackage(message);
  return fetchAndStoreCrossPostPackage(
    message.relay_post_id,
    crossPostDestinationFromMessage(message),
    message.content_override,
    message.distribution_attempt_id
  );
}

/** Fetch and store the immutable X package for one confirmed schedule event. */
export async function fetchAndStoreScheduleEventCrossPostPackage(
  message: ScheduleEventExternalCrossPostMessage
): Promise<CrossPostFetchResult> {
  const eventId = message.schedule_event_id.trim();
  if (!/^bench_event_[a-f0-9]{64}$/.test(eventId)) return { ok: false, reason: "invalid_message" };
  const grant = await storage.getGrant();
  if (!grant?.token.trim()) return { ok: false, reason: "not_connected" };
  await storage.clearPendingCrossPost();

  let res: Response;
  try {
    res = await fetch(`${RELAY_API_BASE}/api/v1/extension/cross-post/schedule-events/${encodeURIComponent(eventId)}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${grant.token.trim()}` },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return { ok: false, reason: "package_fetch_failed", detail: "network_error" };
  }
  if (res.status === 401) {
    await storage.clearGrant();
    return { ok: false, reason: "grant_revoked" };
  }
  if (!res.ok) return { ok: false, reason: "package_fetch_failed", detail: String(res.status) };

  try {
    const json = await res.json() as { data?: { schedule_event_id?: unknown; destination?: unknown; package?: unknown } };
    if (json.data?.schedule_event_id !== eventId || json.data.destination !== "x") {
      return { ok: false, reason: "package_fetch_failed", detail: "event_mismatch" };
    }
    const pkg = parseXCrossPostPackage(json.data.package);
    if (!pkg.relay_post_id.trim()) return { ok: false, reason: "package_fetch_failed", detail: "invalid_package" };
    // Clear any distribution-attempt identity immediately before storing the event package.
    await storage.clearPendingCrossPost();
    await storage.setPendingCrossPost(pkg);
    return { ok: true, schedule_event_id: eventId, relay_post_id: pkg.relay_post_id, destination: "x" };
  } catch {
    return { ok: false, reason: "package_fetch_failed", detail: "invalid_package" };
  }
}
