import { resolveRelayApiBaseFromEnv } from "./relay-api-env";
import { createVisitorSessionKey } from "./visitor-gallery-telemetry";

export const CREATOR_STUDIO_TELEMETRY_SESSION_KEY = "relay.creator_studio_telemetry_session_key";

export type CreatorStudioTelemetryEventName = "analytics_viewed" | "action_center_used";

export type CreatorStudioTelemetryInput = {
  event_name: CreatorStudioTelemetryEventName;
  creator_id: string;
  /** Internal Relay account id from session. */
  actor_key: string;
  surface: string;
  interaction?: "view" | "accept" | "dismiss" | "refresh";
  recommendation_id?: string;
};

export function readCreatorStudioTelemetrySessionKey(
  storage: Pick<Storage, "getItem" | "setItem">
): string {
  const existing = storage.getItem(CREATOR_STUDIO_TELEMETRY_SESSION_KEY)?.trim();
  if (existing) return existing;
  const next = createVisitorSessionKey();
  storage.setItem(CREATOR_STUDIO_TELEMETRY_SESSION_KEY, next);
  return next;
}

export function ensureCreatorStudioTelemetrySessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readCreatorStudioTelemetrySessionKey(window.localStorage);
  } catch {
    return null;
  }
}

function resolveRelayApiBase(): string {
  return resolveRelayApiBaseFromEnv(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RELAY_API_URL : undefined
  );
}

export function buildCreatorStudioTelemetryBody(
  input: CreatorStudioTelemetryInput
): Record<string, unknown> {
  const sessionKey = ensureCreatorStudioTelemetrySessionKey();
  return {
    event_name: input.event_name,
    occurred_at: new Date().toISOString(),
    producer: "web",
    version: "1.0",
    session_key: sessionKey ?? undefined,
    actor_key: input.actor_key,
    payload: {
      creator_id: input.creator_id,
      actor_key: input.actor_key,
      surface: input.surface,
      ...(input.interaction ? { interaction: input.interaction } : {}),
      ...(input.recommendation_id ? { recommendation_id: input.recommendation_id } : {})
    }
  };
}

export function shouldEmitCreatorStudioPageView(
  storage: Pick<Storage, "getItem" | "setItem">,
  markerKey: string
): boolean {
  if (storage.getItem(markerKey) === "1") return false;
  storage.setItem(markerKey, "1");
  return true;
}

/**
 * PMD-044 — fire-and-forget creator studio telemetry via PMD-041 ingestion.
 */
export function emitCreatorStudioTelemetryEvent(input: CreatorStudioTelemetryInput): void {
  if (typeof window === "undefined") return;
  if (!input.creator_id.trim() || !input.actor_key.trim()) return;

  if (input.event_name === "analytics_viewed") {
    try {
      if (
        !shouldEmitCreatorStudioPageView(
          window.sessionStorage,
          "relay.telemetry.analytics_viewed.emitted"
        )
      ) {
        return;
      }
    } catch {
      /* continue if sessionStorage unavailable */
    }
  }

  if (input.event_name === "action_center_used" && input.interaction === "view") {
    try {
      if (
        !shouldEmitCreatorStudioPageView(
          window.sessionStorage,
          "relay.telemetry.action_center_view.emitted"
        )
      ) {
        return;
      }
    } catch {
      /* continue */
    }
  }

  const sessionKey = ensureCreatorStudioTelemetrySessionKey();
  const body = buildCreatorStudioTelemetryBody(input);

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
