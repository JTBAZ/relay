/**
 * Popup ↔ background message types (keep in sync with `EXT-4A` popup).
 */

export const MSG_START_CONSENT = "START_CONSENT" as const;
export const MSG_SYNC_NOW = "SYNC_NOW" as const;
export const MSG_REVOKE_LOCAL = "REVOKE_LOCAL" as const;
export const MSG_STATUS = "STATUS" as const;
export const MSG_DISTRIBUTION_FILL_RESULT = "DISTRIBUTION_FILL_RESULT" as const;
export const MSG_POST_LINK_CONFIRM = "POST_LINK_CONFIRM" as const;
export const MSG_POST_LINK_DISMISS = "POST_LINK_DISMISS" as const;
export const MSG_POST_LINK_CANDIDATE_URL = "POST_LINK_CANDIDATE_URL" as const;
export const MSG_POST_LINK_FORGET = "POST_LINK_FORGET" as const;
export const MSG_POST_LINK_GET_ACTIVE_WATCH = "POST_LINK_GET_ACTIVE_WATCH" as const;
export const MSG_EXTERNAL_METRICS_REFRESH = "EXTERNAL_METRICS_REFRESH" as const;
export const MSG_EXTERNAL_METRICS_RESULT = "EXTERNAL_METRICS_RESULT" as const;
export const MSG_SCHEDULE_REMINDER_GET_ACTIVE = "SCHEDULE_REMINDER_GET_ACTIVE" as const;
export const MSG_SCHEDULE_REMINDER_OPEN = "SCHEDULE_REMINDER_OPEN" as const;
export const MSG_SCHEDULE_REMINDER_DONE = "SCHEDULE_REMINDER_DONE" as const;
export const MSG_SCHEDULE_REMINDER_DISMISS = "SCHEDULE_REMINDER_DISMISS" as const;
export const MSG_SCHEDULE_REMINDER_SNOOZE = "SCHEDULE_REMINDER_SNOOZE" as const;

export type ExternalMetricsDestination = "patreon" | "x" | "deviantart";

export type ExternalMetricsScrapeMetricWire = {
  metric_type: string;
  value?: number | null;
  raw?: Record<string, unknown>;
};

export type InternalRequest =
  | { type: typeof MSG_START_CONSENT }
  | { type: typeof MSG_SYNC_NOW }
  | { type: typeof MSG_REVOKE_LOCAL }
  | { type: typeof MSG_STATUS }
  | {
      type: typeof MSG_DISTRIBUTION_FILL_RESULT;
      attempt_id: string;
      status: "fill_succeeded" | "fill_partial" | "fill_failed";
      fill_result?: Record<string, unknown>;
      extension_tab_id?: number | null;
      error_code?: string | null;
      error_detail?: string | null;
    }
  | {
      type: typeof MSG_POST_LINK_CONFIRM;
      attempt_id: string;
      canonical_url: string;
      external_id?: string | null;
    }
  | { type: typeof MSG_POST_LINK_DISMISS; attempt_id: string }
  | { type: typeof MSG_POST_LINK_FORGET; attempt_id: string }
  | { type: typeof MSG_POST_LINK_GET_ACTIVE_WATCH }
  | { type: typeof MSG_POST_LINK_CANDIDATE_URL; url: string }
  | {
      type: typeof MSG_EXTERNAL_METRICS_REFRESH;
      attempt_id: string;
      post_id: string;
      destination: ExternalMetricsDestination;
      external_url: string;
    }
  | {
      type: typeof MSG_EXTERNAL_METRICS_RESULT;
      attempt_id: string;
      post_id: string;
      destination: ExternalMetricsDestination;
      external_url: string;
      ok: boolean;
      source?: "extension_dom" | "platform_api";
      metrics?: ExternalMetricsScrapeMetricWire[];
      error?: string | null;
    }
  | { type: typeof MSG_SCHEDULE_REMINDER_GET_ACTIVE }
  | {
      type: typeof MSG_SCHEDULE_REMINDER_OPEN;
      reminder_id: string;
      open_url: string | null;
    }
  | {
      type: typeof MSG_SCHEDULE_REMINDER_DONE;
      reminder_id: string;
      task_id: string;
    }
  | { type: typeof MSG_SCHEDULE_REMINDER_DISMISS; reminder_id: string }
  | {
      type: typeof MSG_SCHEDULE_REMINDER_SNOOZE;
      reminder_id: string;
      snooze_minutes?: number;
    };

export type ExternalConsentMessage = { type: "RELAY_CONSENT_CODE"; code: string };

/**
 * Web page → extension: request current connection + Patreon cookie status.
 * Safe to call at any time; no side effects.
 */
export type ExternalStatusRequest = { type: "RELAY_STATUS_REQUEST" };

/**
 * Extension → web page: response to RELAY_STATUS_REQUEST.
 * ok is always true; the shape is fixed so web can type-narrow on presence.
 */
export type ExternalStatusResponse = {
  ok: true;
  hasGrant: boolean;
  relayCreatorId: string | null;
  patreonCookiePresent: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

export function isInternalRequest(v: unknown): v is InternalRequest {
  if (v === null || typeof v !== "object" || !("type" in v)) return false;
  const t = (v as { type: unknown }).type;
  return (
    t === MSG_START_CONSENT ||
    t === MSG_SYNC_NOW ||
    t === MSG_REVOKE_LOCAL ||
    t === MSG_STATUS ||
    t === MSG_DISTRIBUTION_FILL_RESULT ||
    t === MSG_POST_LINK_CONFIRM ||
    t === MSG_POST_LINK_DISMISS ||
    t === MSG_POST_LINK_CANDIDATE_URL ||
    t === MSG_POST_LINK_FORGET ||
    t === MSG_POST_LINK_GET_ACTIVE_WATCH ||
    t === MSG_EXTERNAL_METRICS_REFRESH ||
    t === MSG_EXTERNAL_METRICS_RESULT ||
    t === MSG_SCHEDULE_REMINDER_GET_ACTIVE ||
    t === MSG_SCHEDULE_REMINDER_OPEN ||
    t === MSG_SCHEDULE_REMINDER_DONE ||
    t === MSG_SCHEDULE_REMINDER_DISMISS ||
    t === MSG_SCHEDULE_REMINDER_SNOOZE
  );
}

export function isExternalConsentMessage(v: unknown): v is ExternalConsentMessage {
  if (v === null || typeof v !== "object" || !("type" in v) || !("code" in v)) {
    return false;
  }
  const m = v as { type: unknown; code: unknown };
  return m.type === "RELAY_CONSENT_CODE" && typeof m.code === "string" && m.code.trim().length > 0;
}

export function isExternalStatusRequest(v: unknown): v is ExternalStatusRequest {
  if (v === null || typeof v !== "object" || !("type" in v)) return false;
  return (v as { type: unknown }).type === "RELAY_STATUS_REQUEST";
}
