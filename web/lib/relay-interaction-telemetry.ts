import { resolveRelayApiBaseFromEnv } from "./relay-api-env";
import { createVisitorSessionKey } from "./visitor-gallery-telemetry";

export const RELAY_INTERACTION_TELEMETRY_SESSION_KEY =
  "relay.interaction_telemetry_session_key";

export type RelayInteractionEventName =
  | "post_impression"
  | "media_view"
  | "cta_clicked"
  | "favorite_created"
  | "snip_created"
  | "post_liked"
  | "comment_created"
  | "comment_reaction_created";

export type RelayInteractionTelemetryInput = {
  event_name: RelayInteractionEventName;
  surface: string;
  creator_id?: string | null;
  post_id?: string | null;
  media_id?: string | null;
  actor_key?: string | null;
  interaction?: string | null;
  target?: string | null;
  target_kind?: string | null;
  target_id?: string | null;
  collection_id?: string | null;
  comment_id?: string | null;
  reaction_kind?: string | null;
  feed_source?: string | null;
};

function resolveRelayApiBase(): string {
  return resolveRelayApiBaseFromEnv(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RELAY_API_URL : undefined
  );
}

export function readRelayInteractionTelemetrySessionKey(
  storage: Pick<Storage, "getItem" | "setItem">
): string {
  const existing = storage.getItem(RELAY_INTERACTION_TELEMETRY_SESSION_KEY)?.trim();
  if (existing) return existing;
  const next = createVisitorSessionKey();
  storage.setItem(RELAY_INTERACTION_TELEMETRY_SESSION_KEY, next);
  return next;
}

export function ensureRelayInteractionTelemetrySessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return readRelayInteractionTelemetrySessionKey(window.localStorage);
  } catch {
    return null;
  }
}

function addIfPresent(payload: Record<string, unknown>, key: string, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed) payload[key] = trimmed;
}

export function buildRelayInteractionTelemetryBody(
  input: RelayInteractionTelemetryInput
): Record<string, unknown> {
  const sessionKey = ensureRelayInteractionTelemetrySessionKey();
  const payload: Record<string, unknown> = {
    surface: input.surface
  };

  addIfPresent(payload, "creator_id", input.creator_id);
  addIfPresent(payload, "post_id", input.post_id);
  addIfPresent(payload, "media_id", input.media_id);
  addIfPresent(payload, "actor_key", input.actor_key);
  addIfPresent(payload, "interaction", input.interaction);
  addIfPresent(payload, "target", input.target);
  addIfPresent(payload, "target_kind", input.target_kind);
  addIfPresent(payload, "target_id", input.target_id);
  addIfPresent(payload, "collection_id", input.collection_id);
  addIfPresent(payload, "comment_id", input.comment_id);
  addIfPresent(payload, "reaction_kind", input.reaction_kind);
  addIfPresent(payload, "feed_source", input.feed_source);

  return {
    event_name: input.event_name,
    occurred_at: new Date().toISOString(),
    producer: "web",
    version: "1.0",
    session_key: sessionKey ?? undefined,
    actor_key: input.actor_key?.trim() || undefined,
    payload
  };
}

/**
 * Fire-and-forget Relay interaction telemetry.
 * Never include user-authored text, display names, emails, URLs, or raw session tokens.
 */
export function emitRelayInteractionTelemetryEvent(
  input: RelayInteractionTelemetryInput
): void {
  if (typeof window === "undefined") return;

  const sessionKey = ensureRelayInteractionTelemetrySessionKey();
  const body = buildRelayInteractionTelemetryBody(input);

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
