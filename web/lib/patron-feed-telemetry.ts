import { resolveRelayApiBaseFromEnv } from "./relay-api-env";
import { createVisitorSessionKey } from "./visitor-gallery-telemetry";

export const PATRON_TELEMETRY_SESSION_KEY = "relay.patron_telemetry_session_key";

export type PatronFeedTelemetryEventName = "feed_open" | "post_view";

export type PatronFeedTelemetryInput = {
  event_name: PatronFeedTelemetryEventName;
  /** Internal Relay account id (`PatronSessionMe.user_id`). */
  actor_key?: string | null;
  creator_id?: string;
  post_id?: string;
  surface: string;
};

export function readPatronTelemetrySessionKey(
  storage: Pick<Storage, "getItem" | "setItem">
): string {
  const existing = storage.getItem(PATRON_TELEMETRY_SESSION_KEY)?.trim();
  if (existing) return existing;
  const next = createVisitorSessionKey();
  storage.setItem(PATRON_TELEMETRY_SESSION_KEY, next);
  return next;
}

export function ensurePatronTelemetrySessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readPatronTelemetrySessionKey(window.localStorage);
  } catch {
    return null;
  }
}

function resolveRelayApiBase(): string {
  return resolveRelayApiBaseFromEnv(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RELAY_API_URL : undefined
  );
}

export function buildPatronFeedTelemetryBody(input: PatronFeedTelemetryInput): Record<string, unknown> {
  const sessionKey = ensurePatronTelemetrySessionKey();
  const actorKey = input.actor_key?.trim() || undefined;
  return {
    event_name: input.event_name,
    occurred_at: new Date().toISOString(),
    producer: "web",
    version: "1.0",
    session_key: sessionKey ?? undefined,
    actor_key: actorKey,
    payload: {
      surface: input.surface,
      ...(input.creator_id ? { creator_id: input.creator_id } : {}),
      ...(input.post_id ? { post_id: input.post_id } : {}),
      ...(actorKey ? { actor_key: actorKey } : {})
    }
  };
}

export function shouldEmitPatronFeedOpen(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  const markerKey = "relay.telemetry.feed_open.emitted";
  if (storage.getItem(markerKey) === "1") return false;
  storage.setItem(markerKey, "1");
  return true;
}

/**
 * PMD-043 — fire-and-forget patron feed telemetry via PMD-041 ingestion.
 */
export function emitPatronFeedTelemetryEvent(input: PatronFeedTelemetryInput): void {
  if (typeof window === "undefined") return;

  if (input.event_name === "feed_open") {
    if (!input.actor_key?.trim()) return;
    try {
      if (!shouldEmitPatronFeedOpen(window.sessionStorage)) return;
    } catch {
      /* continue if sessionStorage unavailable */
    }
  }

  const sessionKey = ensurePatronTelemetrySessionKey();
  const body = buildPatronFeedTelemetryBody(input);

  void fetch(`${resolveRelayApiBase()}/api/v1/platform-metrics/events`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(sessionKey ? { "X-Relay-Visitor-Session": sessionKey } : {})
    },
    body: JSON.stringify(body),
    credentials: "include",
    keepalive: true,
    cache: "no-store"
  }).catch(() => {});
}
