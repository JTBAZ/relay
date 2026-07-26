/**
 * Frozen wire contracts for manual Schedule Rail social events (Studio Core).
 * Exact event taxonomy is stored; transport `action` remains the four-value Postbot family
 * for extension backward compatibility.
 *
 * @see docs/studio/PLAN_MANUAL_SOCIAL_EVENTS.md
 */

export const CREATOR_SCHEDULE_EVENT_TYPES = [
  "make_post",
  "schedule_post",
  "engage_comments",
  "pin_comment",
  "repost",
  "custom"
] as const;

export type CreatorScheduleEventTypeWire = (typeof CREATOR_SCHEDULE_EVENT_TYPES)[number];

/**
 * Types offered in Studio Create Event. `schedule_post` stays in the stored taxonomy
 * for Goal Cycle / legacy rail rows, but is not a separate create choice (same job as make_post).
 */
export const CREATABLE_MANUAL_EVENT_TYPES = [
  "make_post",
  "engage_comments",
  "pin_comment",
  "repost",
  "custom"
] as const satisfies readonly CreatorScheduleEventTypeWire[];

export type CreatableManualEventType = (typeof CREATABLE_MANUAL_EVENT_TYPES)[number];

export const CREATOR_SCHEDULE_EVENT_STATUSES = ["pending", "done", "dismissed"] as const;

export type CreatorScheduleEventStatusWire = (typeof CREATOR_SCHEDULE_EVENT_STATUSES)[number];

export const CREATOR_SCHEDULE_DESTINATIONS = [
  "patreon",
  "x",
  "deviantart",
  "bluesky"
] as const;

export type CreatorScheduleDestinationWire = (typeof CREATOR_SCHEDULE_DESTINATIONS)[number];

/** Rail / extension transport family (four-value + custom for rail display). */
export type CreatorScheduleTransportAction =
  | "post"
  | "schedule"
  | "pin_comment"
  | "repost"
  | "custom";

/** Extension packet transport — four values only (old clients). */
export type CreatorScheduleExtensionTransportAction =
  | "post"
  | "schedule"
  | "pin_comment"
  | "repost";

export const MANUAL_EVENT_REMINDER_ID_PREFIX = "schedule_reminder:manual:" as const;

export type CreatorScheduleEventSource = "postbot_task" | "manual_event";

export type CreatorScheduleEventTargetMode = "new_post" | "existing_post" | "external_url";

export type CreateCreatorScheduleEventBody = {
  event_type: CreatorScheduleEventTypeWire;
  /**
   * Required for social event types. Omitted/null for `custom`
   * (raw URL reminder — no platform binding).
   */
  destination?: CreatorScheduleDestinationWire | null;
  due_at: string;
  title?: string;
  note?: string | null;
  remind_me?: boolean;
  /** Target mode — default inferred from post_id / external_url. */
  target_mode?: CreatorScheduleEventTargetMode;
  post_id?: string | null;
  external_url?: string | null;
  /**
   * When true and event_type is make_post/schedule_post with no post/url,
   * create a Relay draft via the legacy scheduled-posts adapter.
   */
  create_relay_draft?: boolean;
  /** Multi-platform queue for create_relay_draft (preferred over singular destination). */
  destinations?: CreatorScheduleDestinationWire[];
  /** Planned format from Create Event dialogue (text | image | video | mixed). */
  planned_format?: "text" | "image" | "video" | "mixed";
};

export type PatchCreatorScheduleEventBody = {
  title?: string;
  note?: string | null;
  due_at?: string;
  remind_me?: boolean;
  status?: "pending" | "done" | "dismissed";
  external_url?: string | null;
};

export type CreatorScheduleEventWire = {
  id: string;
  source: "manual_event";
  event_type: CreatorScheduleEventTypeWire;
  /** Transport family for rail color / legacy ActionFamily. */
  action: CreatorScheduleTransportAction;
  /** Null for custom events. */
  destination: CreatorScheduleDestinationWire | null;
  title: string;
  note: string | null;
  due_at: string;
  post_id: string | null;
  external_url: string | null;
  remind_me: boolean;
  status: CreatorScheduleEventStatusWire;
  created_at: string;
  updated_at: string;
};

export type MissingPlatformLinkPayload = {
  error: "missing_platform_link";
  post_id: string;
  destination: CreatorScheduleDestinationWire;
  message: string;
};

export type CreateCreatorScheduleEventSuccess = {
  event: CreatorScheduleEventWire;
  /** Present when create_relay_draft produced a PostbotTask-backed rail slice. */
  rail_event?: unknown;
};

/** Exact type → rail ActionFamily / transport. */
export function transportActionForEventType(
  eventType: CreatorScheduleEventTypeWire
): CreatorScheduleTransportAction {
  switch (eventType) {
    case "make_post":
      return "post";
    case "schedule_post":
      return "schedule";
    case "engage_comments":
    case "pin_comment":
      return "pin_comment";
    case "repost":
      return "repost";
    case "custom":
      return "custom";
    default: {
      const _exhaustive: never = eventType;
      return _exhaustive;
    }
  }
}

/** Exact type → extension four-value transport (custom → post). */
export function extensionTransportActionForEventType(
  eventType: CreatorScheduleEventTypeWire
): CreatorScheduleExtensionTransportAction {
  const rail = transportActionForEventType(eventType);
  if (rail === "custom") return "post";
  return rail;
}

export function isCreatorScheduleEventType(raw: unknown): raw is CreatorScheduleEventTypeWire {
  return (
    typeof raw === "string" &&
    (CREATOR_SCHEDULE_EVENT_TYPES as readonly string[]).includes(raw)
  );
}

export function isCreatorScheduleDestination(raw: unknown): raw is CreatorScheduleDestinationWire {
  return (
    typeof raw === "string" &&
    (CREATOR_SCHEDULE_DESTINATIONS as readonly string[]).includes(raw)
  );
}

export function reminderIdForManualEvent(eventId: string): string {
  return `${MANUAL_EVENT_REMINDER_ID_PREFIX}${eventId.trim()}`;
}

export function parseManualEventReminderId(reminderId: string): string | null {
  const raw = reminderId.trim();
  if (!raw.startsWith(MANUAL_EVENT_REMINDER_ID_PREFIX)) return null;
  const id = raw.slice(MANUAL_EVENT_REMINDER_ID_PREFIX.length).trim();
  return id || null;
}

export const EVENT_TYPE_LABELS: Record<CreatorScheduleEventTypeWire, string> = {
  make_post: "Post",
  schedule_post: "Schedule a post",
  engage_comments: "Engage comments",
  pin_comment: "Pin a comment",
  repost: "Repost",
  custom: "Custom reminder"
};
