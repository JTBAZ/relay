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
import { BENCH_X_HANDOFF_MAX_BYTES, BENCH_X_HANDOFF_PACKET_TTL_MS, encodeBenchXHandoffBytes, parseBenchXHandoffEnvelope, type BenchXHandoffPacket } from "./bench-x-handoff";
import { BENCH_DEVIANTART_HANDOFF_MAX_BYTES, createBenchDeviantArtHandoffPacket, parseBenchDeviantArtHandoffEnvelope, type BenchDeviantArtHandoffPacket } from "./bench-deviantart-handoff";

export type CrossPostFetchResult =
  | { ok: true; relay_post_id: string; destination: CrossPostDestination; schedule_event_id?: never }
  | { ok: true; relay_post_id: string; destination: "x"; schedule_event_id: string }
  | { ok: true; relay_post_id: string; destination: "x"; handoff_id: string; packet: BenchXHandoffPacket }
  | { ok: true; relay_post_id: string; destination: "deviantart"; handoff_id: string; packet: BenchDeviantArtHandoffPacket }
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
  if ("handoff_id" in message) return message.destination === "deviantart" ? fetchBenchDeviantArtHandoffPacket(message) : fetchBenchXHandoffPacket(message);
  if ("schedule_event_id" in message) return fetchAndStoreScheduleEventCrossPostPackage(message);
  return fetchAndStoreCrossPostPackage(
    message.relay_post_id,
    crossPostDestinationFromMessage(message),
    message.content_override,
    message.distribution_attempt_id
  );
}

async function readBoundedJpeg(res: Response): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const reader = res.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BENCH_X_HANDOFF_MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  if (!size) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function fetchBenchXHandoffPacket(message: Extract<ExternalCrossPostMessage, { handoff_id: string }>): Promise<CrossPostFetchResult> {
  const grant = await storage.getGrant();
  if (!grant?.token.trim()) return { ok: false, reason: "not_connected" };
  const base = `${RELAY_API_BASE}/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(message.session_id)}/handoff/${encodeURIComponent(message.handoff_id)}`;
  try {
    const packageResponse = await fetch(`${base}/package`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json", Authorization: `Bearer ${grant.token.trim()}` }, signal: AbortSignal.timeout(15_000) });
    if (packageResponse.status === 401) { await storage.clearGrant(); return { ok: false, reason: "grant_revoked" }; }
    if (!packageResponse.ok) return { ok: false, reason: "package_fetch_failed", detail: String(packageResponse.status) };
    const parsed = parseBenchXHandoffEnvelope(await packageResponse.json(), message.session_id, message.handoff_id);
    if (!parsed) return { ok: false, reason: "package_fetch_failed", detail: "invalid_package" };
    const mediaPath = parsed.pkg.media[0]!.content_url;
    const mediaResponse = await fetch(`${RELAY_API_BASE}${mediaPath}`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "image/jpeg", Authorization: `Bearer ${grant.token.trim()}` }, signal: AbortSignal.timeout(15_000) });
    if (mediaResponse.status === 401) { await storage.clearGrant(); return { ok: false, reason: "grant_revoked" }; }
    if (!mediaResponse.ok || mediaResponse.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "image/jpeg") return { ok: false, reason: "package_fetch_failed", detail: "invalid_media" };
    const bytes = await readBoundedJpeg(mediaResponse);
    if (!bytes) return { ok: false, reason: "package_fetch_failed", detail: "invalid_media" };
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
    if (digest !== parsed.mediaHash) return { ok: false, reason: "package_fetch_failed", detail: "media_hash_mismatch" };
    const packet: BenchXHandoffPacket = { version: 1, handoff_id: message.handoff_id, relay_post_id: parsed.pkg.relay_post_id, post_text: parsed.pkg.post_text, media_id: parsed.pkg.media[0]!.media_id, filename: parsed.pkg.media[0]!.filename, sha256: digest, jpeg_base64: encodeBenchXHandoffBytes(bytes), expires_at: Date.now() + BENCH_X_HANDOFF_PACKET_TTL_MS };
    return { ok: true, relay_post_id: parsed.pkg.relay_post_id, destination: "x", handoff_id: message.handoff_id, packet };
  } catch { return { ok: false, reason: "package_fetch_failed", detail: "network_or_parse_error" }; }
}

async function fetchBenchDeviantArtHandoffPacket(message: Extract<ExternalCrossPostMessage, { handoff_id: string; destination: "deviantart" }>): Promise<CrossPostFetchResult> {
  const grant = await storage.getGrant();
  if (!grant?.token.trim()) return { ok: false, reason: "not_connected" };
  const base = `${RELAY_API_BASE}/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(message.session_id)}/deviantart-handoff/${encodeURIComponent(message.handoff_id)}`;
  try {
    const packageResponse = await fetch(`${base}/package`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json", Authorization: `Bearer ${grant.token.trim()}` }, signal: AbortSignal.timeout(15_000) });
    if (packageResponse.status === 401) { await storage.clearGrant(); return { ok: false, reason: "grant_revoked" }; }
    if (!packageResponse.ok) return { ok: false, reason: "package_fetch_failed", detail: String(packageResponse.status) };
    const parsed = parseBenchDeviantArtHandoffEnvelope(await packageResponse.json(), message.session_id, message.handoff_id);
    if (!parsed) return { ok: false, reason: "package_fetch_failed", detail: "invalid_package" };
    const mediaResponse = await fetch(`${RELAY_API_BASE}${parsed.pkg.media[0]!.content_url}`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "image/jpeg", Authorization: `Bearer ${grant.token.trim()}` }, signal: AbortSignal.timeout(15_000) });
    if (mediaResponse.status === 401) { await storage.clearGrant(); return { ok: false, reason: "grant_revoked" }; }
    if (!mediaResponse.ok || mediaResponse.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "image/jpeg") return { ok: false, reason: "package_fetch_failed", detail: "invalid_media" };
    const bytes = await readBoundedJpeg(mediaResponse);
    if (!bytes || bytes.byteLength > BENCH_DEVIANTART_HANDOFF_MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, reason: "package_fetch_failed", detail: "invalid_media" };
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
    if (digest !== parsed.mediaHash) return { ok: false, reason: "package_fetch_failed", detail: "media_hash_mismatch" };
    const packet = createBenchDeviantArtHandoffPacket({ handoffId: message.handoff_id, pkg: parsed.pkg, bytes, sha256: digest });
    if (!packet) return { ok: false, reason: "package_fetch_failed", detail: "invalid_packet" };
    return { ok: true, relay_post_id: parsed.pkg.relay_post_id, destination: "deviantart", handoff_id: message.handoff_id, packet };
  } catch { return { ok: false, reason: "package_fetch_failed", detail: "network_or_parse_error" }; }
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
