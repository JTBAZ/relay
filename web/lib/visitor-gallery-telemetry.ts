import { resolveRelayApiBaseFromEnv } from "./relay-api-env";

export const VISITOR_SESSION_STORAGE_KEY = "relay.visitor_session_key";

export type VisitorGalleryTelemetryEventName = "post_reveal";

export type VisitorGalleryTelemetryInput = {
  event_name: VisitorGalleryTelemetryEventName;
  creator_id: string;
  post_id: string;
  media_id?: string;
  surface: string;
};

export function createVisitorSessionKey(nowMs = Date.now()): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `vs_${nowMs}_${Math.random().toString(36).slice(2, 10)}`;
}

export function readVisitorSessionKey(
  storage: Pick<Storage, "getItem" | "setItem">
): string {
  const existing = storage.getItem(VISITOR_SESSION_STORAGE_KEY)?.trim();
  if (existing) return existing;
  const next = createVisitorSessionKey();
  storage.setItem(VISITOR_SESSION_STORAGE_KEY, next);
  return next;
}

export function ensureVisitorSessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readVisitorSessionKey(window.localStorage);
  } catch {
    return null;
  }
}

function resolveRelayApiBase(): string {
  return resolveRelayApiBaseFromEnv(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RELAY_API_URL : undefined
  );
}

/**
 * Fire-and-forget beacon to PMD-041 ingestion for visitor gallery interactions
 * not covered by automatic API-side writers (e.g. tier reveal Upgrade clicks).
 */
export function emitVisitorGalleryTelemetryEvent(input: VisitorGalleryTelemetryInput): void {
  if (typeof window === "undefined") return;

  const sessionKey = ensureVisitorSessionKey();
  const body = {
    event_name: input.event_name,
    occurred_at: new Date().toISOString(),
    producer: "web",
    version: "1.0",
    session_key: sessionKey ?? undefined,
    payload: {
      creator_id: input.creator_id,
      post_id: input.post_id,
      ...(input.media_id ? { media_id: input.media_id } : {}),
      surface: input.surface
    }
  };

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
