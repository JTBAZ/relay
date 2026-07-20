/**
 * Phase 5 — sticky schedule reminder packet types (extension).
 */

export type ScheduleReminderDestination = "patreon" | "x" | "deviantart" | "bluesky";

export type ScheduleReminderAction = "post" | "schedule" | "pin_comment" | "repost";

export type ScheduleReminderExactEventType =
  | "make_post"
  | "schedule_post"
  | "engage_comments"
  | "pin_comment"
  | "repost"
  | "custom";

export type ScheduleReminderCtaKind = "external_post" | "relay_autopost" | "relay_studio";

export type ScheduleReminderCta = {
  kind: ScheduleReminderCtaKind;
  url: string | null;
  label: string;
};

export type ScheduleReminderTaskKind = "publish" | "social_upkeep" | "active_rest";

export type ScheduleReminderPacket = {
  reminder_id: string;
  task_id: string;
  variant_id: string | null;
  post_id: string;
  /** Null for destination-free custom manual events. */
  destination: ScheduleReminderDestination | null;
  action: ScheduleReminderAction;
  title: string;
  open_url: string | null;
  due_at: string;
  plan_label: string | null;
  plan_index?: number;
  plan_total?: number;
  media_ready: boolean;
  primary_cta: ScheduleReminderCta;
  secondary_cta: ScheduleReminderCta | null;
  /** Exact stored type when server provides it (manual events). */
  event_type?: ScheduleReminderExactEventType | null;
  manual_event_id?: string | null;
  /** VS8 Goal Cycle overlay — optional; Phase 5 clients ignore unknown keys. */
  goal_cycle_id?: string | null;
  goal_cycle_slot_id?: string | null;
  campaign_key?: string | null;
  relay_post_id?: string | null;
  distribution_plan_id?: string | null;
  rail_event_id?: string | null;
  task_kind?: ScheduleReminderTaskKind | null;
  due_local?: string | null;
  time_zone?: string | null;
  media_requirements?: string[];
  instructions?: string | null;
};

export const DESTINATION_HOSTS: Record<ScheduleReminderDestination, string[]> = {
  x: ["x.com", "twitter.com"],
  patreon: ["patreon.com"],
  deviantart: ["deviantart.com"],
  bluesky: ["bsky.app"]
};

/** All product social hosts (any destination). */
export const ALL_SOCIAL_HOSTS: string[] = Object.values(DESTINATION_HOSTS).flat();

export const RELAY_WEB_HOSTS = ["localhost", "127.0.0.1", "relayapp.me"] as const;

export function hostMatchesDestination(
  hostname: string,
  destination: ScheduleReminderDestination
): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return DESTINATION_HOSTS[destination].some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

/** True if tab is Relay web or any linked social (inject surface). */
export function isInjectEligibleHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (
    RELAY_WEB_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    )
  ) {
    return true;
  }
  return ALL_SOCIAL_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

export const DESTINATION_LABEL: Record<ScheduleReminderDestination, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt",
  bluesky: "Bluesky"
};

export const ACTION_LABEL: Record<ScheduleReminderAction, string> = {
  post: "Post",
  schedule: "Schedule",
  pin_comment: "Pin comment",
  repost: "Repost"
};

export const EVENT_TYPE_LABEL: Record<ScheduleReminderExactEventType, string> = {
  make_post: "Post",
  schedule_post: "Schedule a post",
  engage_comments: "Engage comments",
  pin_comment: "Pin a comment",
  repost: "Repost",
  custom: "Custom reminder"
};

/** Prefer exact event_type label when the server sends it. */
export function reminderActionLabel(packet: {
  action: ScheduleReminderAction;
  event_type?: ScheduleReminderExactEventType | null;
}): string {
  if (packet.event_type && packet.event_type in EVENT_TYPE_LABEL) {
    return EVENT_TYPE_LABEL[packet.event_type];
  }
  return ACTION_LABEL[packet.action];
}
