export type ActionFamily = "post" | "schedule" | "pin_comment" | "repost" | "custom";
export type ExactEventType =
  | "make_post"
  | "schedule_post"
  | "engage_comments"
  | "pin_comment"
  | "repost"
  | "custom";
export type EventSource = "postbot_task" | "manual_event" | "recurrence_occurrence";
export type EventStatus = "pending" | "done" | "overdue";
export type Destination = "x" | "patreon" | "deviantart" | "bluesky" | null;

/** Per-destination child under a visually grouped rail event. */
export interface ScheduleRailDestinationChild {
  destination: Destination;
  task_id: string;
  variant_id: string;
  status: EventStatus;
  publish_confirm_path?: string | null;
}

export interface ReadyItem {
  id: string;
  task_id?: string;
  variant_id?: string;
  post_id?: string;
  source?: EventSource;
  event_type?: ExactEventType | null;
  action: ActionFamily;
  title: string;
  rationale: string | null;
  destination: Destination;
  link: string | null;
  notify: boolean;
  plan_label: string | null;
  plan_index?: number;
  plan_total?: number;
  status: EventStatus;
  /** Phase 8 — pending post with empty media. */
  needs_media?: boolean;
  media_count?: number;
  /** VS8 — live media ids (no private URLs). */
  media_ids?: string[];
  media_state?: string;
  readiness_errors?: string[];
  task_kind?: "publish" | "social_upkeep" | "active_rest" | null;
  instructions?: string | null;
  publish_confirm_path?: string | null;
  /** Linked Autopost draft when queued from schedule create. */
  draft_id?: string | null;
  /** Recurring routine series when source is recurrence_occurrence. */
  series_id?: string | null;
  series_cadence?: string | null;
  /** Follow-up playbook metadata when materialized from a template. */
  playbook_run_id?: string | null;
  playbook_action_key?: string | null;
  /** Schedule Rail Automations enrichment (additive; ordinary rows omit). */
  automation_id?: string | null;
  automation_title?: string | null;
  preset_kind?: string | null;
  automation_state?: "planned" | "awaiting_review" | string | null;
  automation_run_id?: string | null;
  expires_at?: string | null;
  /** Artist-authored post details state on the linked draft. */
  post_details_state?: "none" | "authored" | "adapted" | null;
  post_description?: string | null;
  post_tags?: string[];
  /** Visual group children (one calendar slice, separate ops). */
  destinations?: ScheduleRailDestinationChild[];
}

export interface ScheduleEvent {
  id: string;
  task_id?: string;
  variant_id?: string;
  post_id?: string;
  source?: EventSource;
  event_type?: ExactEventType | null;
  action: ActionFamily;
  title: string;
  rationale?: string | null;
  destination: Destination;
  at: string;
  link?: string | null;
  notify: boolean;
  plan_label?: string | null;
  plan_index?: number;
  plan_total?: number;
  status: EventStatus;
  /** Phase 8 — pending post with empty media. */
  needs_media?: boolean;
  media_count?: number;
  /** VS8 — live media ids (no private URLs). */
  media_ids?: string[];
  media_state?: string;
  readiness_errors?: string[];
  task_kind?: "publish" | "social_upkeep" | "active_rest" | null;
  instructions?: string | null;
  publish_confirm_path?: string | null;
  /** Linked Autopost draft when queued from schedule create. */
  draft_id?: string | null;
  /** Recurring routine series when source is recurrence_occurrence. */
  series_id?: string | null;
  series_cadence?: string | null;
  /** Follow-up playbook metadata when materialized from a template. */
  playbook_run_id?: string | null;
  playbook_action_key?: string | null;
  /** Schedule Rail Automations enrichment (additive; ordinary rows omit). */
  automation_id?: string | null;
  automation_title?: string | null;
  preset_kind?: string | null;
  automation_state?: "planned" | "awaiting_review" | string | null;
  automation_run_id?: string | null;
  expires_at?: string | null;
  /** Artist-authored post details state on the linked draft. */
  post_details_state?: "none" | "authored" | "adapted" | null;
  post_description?: string | null;
  post_tags?: string[];
  /** Visual group children (one calendar slice, separate ops). */
  destinations?: ScheduleRailDestinationChild[];
}

export interface ScheduleRailCue {
  post_id: string;
  plan_id: string | null;
  task_id: string;
  present_destinations: string[];
  missing_destinations: string[];
}

export interface ScheduleMonthlyGoal {
  excerpt: string | null;
}

export interface ScheduleData {
  month: string;
  timezone: string;
  today_day?: number;
  days_in_month?: number;
  remind_me_global: boolean;
  /** Stated monthly goal excerpt (studio brief / posting target). */
  monthly_goal?: ScheduleMonthlyGoal;
  cadence: { posted: number; target: number };
  postbot: { done: number; total: number };
  armed?: boolean;
  cue?: ScheduleRailCue | null;
  ready: ReadyItem[];
  events: ScheduleEvent[];
}

/** Fallback / storybook only — live rail uses GET /api/v1/creator/schedule-rail. */
export const INITIAL_DATA: ScheduleData = {
  month: "2026-07",
  timezone: "America/New_York",
  today_day: 17,
  days_in_month: 31,
  remind_me_global: true,
  monthly_goal: { excerpt: null },
  cadence: { posted: 0, target: 8 },
  postbot: { done: 0, total: 0 },
  armed: false,
  cue: null,
  ready: [],
  events: [],
};

export const ACTION_COLORS: Record<ActionFamily, string> = {
  post: "#9bf0c4",
  schedule: "#7eb8e8",
  pin_comment: "#f0b86a",
  repost: "#b89af0",
  custom: "#888888",
};

export const ACTION_LABELS: Record<ActionFamily, string> = {
  post: "Post",
  schedule: "Schedule",
  pin_comment: "Pin comment",
  repost: "Repost",
  custom: "Custom",
};

export const EVENT_TYPE_LABELS: Record<ExactEventType, string> = {
  make_post: "Post",
  schedule_post: "Schedule a post",
  engage_comments: "Engage comments",
  pin_comment: "Pin a comment",
  repost: "Repost",
  custom: "Custom reminder",
};

/** Exact types still creatable via API / Social action chips (excludes schedule_post). */
export const CREATABLE_EVENT_TYPES = [
  "make_post",
  "engage_comments",
  "pin_comment",
  "repost",
  "custom",
] as const satisfies readonly ExactEventType[];

/** Create Event type picker umbrellas — Social expands to action chips. */
export const CREATE_EVENT_PICKER = [
  { id: "make_post", label: "Make a Post" },
  { id: "social", label: "Manage Socials" },
  { id: "custom", label: "Custom" },
] as const;

/** Social umbrella → persisted exact types. */
export const SOCIAL_ACTION_TYPES = [
  "engage_comments",
  "pin_comment",
  "repost",
] as const satisfies readonly ExactEventType[];

export type SocialActionType = (typeof SOCIAL_ACTION_TYPES)[number];

/** Compact chip labels on the shared Social create path. */
export const SOCIAL_ACTION_CHIP_LABELS: Record<SocialActionType, string> = {
  engage_comments: "Reply / engage comments",
  pin_comment: "Pin a comment",
  repost: "Repost / reshare",
};

export function isSocialActionType(t: ExactEventType): t is SocialActionType {
  return (
    t === "engage_comments" || t === "pin_comment" || t === "repost"
  );
}
export const DEST_LABELS: Record<NonNullable<Destination>, string> = {
  x: "X",
  patreon: "Patreon",
  deviantart: "DeviantArt",
  bluesky: "Bluesky",
};

/** Match group id, primary task id, or any destination child task id. */
export function railItemMatchesId(
  item: Pick<ReadyItem, "id" | "task_id" | "destinations">,
  id: string
): boolean {
  const needle = id.trim();
  if (!needle) return false;
  if (item.id === needle || item.task_id === needle) return true;
  return item.destinations?.some((d) => d.task_id === needle) ?? false;
}

export function railItemDestLabels(
  item: Pick<ReadyItem, "destination" | "destinations">
): string[] {
  if (item.destinations && item.destinations.length > 0) {
    return item.destinations
      .map((d) => (d.destination ? DEST_LABELS[d.destination] : null))
      .filter((x): x is string => Boolean(x));
  }
  if (item.destination) return [DEST_LABELS[item.destination]];
  return [];
}

/** @deprecated Prefer ScheduleData.today_day from the API. */
export const TODAY_DAY = 17;
