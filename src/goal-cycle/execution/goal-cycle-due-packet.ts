/**
 * Goal Cycle due-packet contract (VS8-T01).
 * Additive fields for ScheduleReminderPacket — never required for Phase 5 packets.
 */

import type { ScheduleReminderDestination } from "../../distribution/schedule-reminder-extension-api.js";

export const GOAL_CYCLE_DUE_PACKET_VERSION = "goal-cycle-due-v1" as const;

export const GOAL_CYCLE_TASK_KINDS = ["publish", "social_upkeep", "active_rest"] as const;
export type GoalCycleTaskKind = (typeof GOAL_CYCLE_TASK_KINDS)[number];

/** Optional Goal Cycle overlay on a schedule reminder packet. */
export type GoalCycleDuePacketFields = {
  goal_cycle_id: string | null;
  goal_cycle_slot_id: string | null;
  campaign_key: string | null;
  /** Same as packet.post_id when present — explicit for extension deep links. */
  relay_post_id: string | null;
  distribution_plan_id: string | null;
  rail_event_id: string | null;
  task_kind: GoalCycleTaskKind | null;
  /** Creator-local wall clock for the due moment (no offset). */
  due_local: string | null;
  time_zone: string | null;
  /** Machine-readable missing requirements (e.g. attach_media). Never private URLs. */
  media_requirements: string[];
  /** Safe short instructions for the toast — no patron data. */
  instructions: string | null;
};

export const EMPTY_GOAL_CYCLE_DUE_PACKET_FIELDS: GoalCycleDuePacketFields = {
  goal_cycle_id: null,
  goal_cycle_slot_id: null,
  campaign_key: null,
  relay_post_id: null,
  distribution_plan_id: null,
  rail_event_id: null,
  task_kind: null,
  due_local: null,
  time_zone: null,
  media_requirements: [],
  instructions: null
};

const DESTINATION_HOSTS: Record<ScheduleReminderDestination, string[]> = {
  x: ["x.com", "twitter.com"],
  patreon: ["patreon.com"],
  deviantart: ["deviantart.com"],
  bluesky: ["bsky.app"]
};

const RELAY_WEB_HOSTS = ["localhost", "127.0.0.1", "relayapp.me"] as const;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
  return allowed.some((a) => hostname === a || hostname.endsWith(`.${a}`));
}

/**
 * Deep-link allowlist: Relay web OR the packet destination's social hosts.
 * javascript:/data:/file: and unknown hosts are rejected.
 */
export function isAllowedReminderDeepLink(
  url: string | null | undefined,
  destination: ScheduleReminderDestination,
  relayWebBase?: string | null
): boolean {
  if (url == null) return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:")
  ) {
    return false;
  }
  const host = hostnameOf(trimmed);
  if (!host) return false;
  if (hostAllowed(host, RELAY_WEB_HOSTS)) return true;
  if (relayWebBase) {
    const baseHost = hostnameOf(relayWebBase);
    if (baseHost && (host === baseHost || host.endsWith(`.${baseHost}`))) return true;
  }
  return hostAllowed(host, DESTINATION_HOSTS[destination]);
}

/** Strip disallowed URLs to null (never invent a replacement). */
export function sanitizeReminderDeepLink(
  url: string | null | undefined,
  destination: ScheduleReminderDestination,
  relayWebBase?: string | null
): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return isAllowedReminderDeepLink(trimmed, destination, relayWebBase) ? trimmed : null;
}

/**
 * Custom reminders: any safe http(s) URL (personal site, webmail, Slack, …).
 * Still blocks javascript:/data:/file:. Destination allowlist does not apply.
 */
export function sanitizeLooseReminderUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:")
  ) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function parseGoalCycleIdFromCampaignKey(campaignKey: string | null | undefined): string | null {
  const raw = campaignKey?.trim();
  if (!raw) return null;
  const m = /^gc_camp_(.+)$/.exec(raw);
  return m?.[1]?.trim() || null;
}

export function mapGoalCycleTaskKind(args: {
  breakMode: string | null | undefined;
  slotMode?: string | null;
  action?: string | null;
}): GoalCycleTaskKind {
  if (args.breakMode === "social_upkeep" || args.slotMode === "upkeep_task") {
    return "social_upkeep";
  }
  if (args.breakMode === "active_rest") {
    return "active_rest";
  }
  return "publish";
}

export function formatDueLocal(dueAt: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(dueAt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const y = get("year");
    const mo = get("month");
    const d = get("day");
    const h = get("hour");
    const mi = get("minute");
    if (!y || !mo || !d) return null;
    return `${y}-${mo}-${d}T${h || "00"}:${mi || "00"}:00`;
  } catch {
    return null;
  }
}

export function buildGoalCycleInstructions(args: {
  taskKind: GoalCycleTaskKind;
  mediaReady: boolean;
  destinationLabel: string;
}): string {
  if (args.taskKind === "social_upkeep") {
    return `Social upkeep on ${args.destinationLabel} — engage without publishing a new Relay post.`;
  }
  if (args.taskKind === "active_rest") {
    return `Active rest cue on ${args.destinationLabel} — light touch only; no new publish required.`;
  }
  if (!args.mediaReady) {
    return `Attach media in Relay, then confirm publish on ${args.destinationLabel}.`;
  }
  return `Review the draft in Relay, then confirm publish on ${args.destinationLabel}.`;
}

export function buildGoalCycleDuePacketFields(input: {
  cycleId: string;
  slotId: string;
  campaignKey: string;
  postId: string;
  planId: string | null;
  taskId: string;
  taskKind: GoalCycleTaskKind;
  dueAt: Date;
  timeZone: string;
  mediaReady: boolean;
  destinationLabel: string;
}): GoalCycleDuePacketFields {
  return {
    goal_cycle_id: input.cycleId,
    goal_cycle_slot_id: input.slotId,
    campaign_key: input.campaignKey,
    relay_post_id: input.postId,
    distribution_plan_id: input.planId,
    rail_event_id: input.taskId,
    task_kind: input.taskKind,
    due_local: formatDueLocal(input.dueAt, input.timeZone),
    time_zone: input.timeZone,
    media_requirements: input.mediaReady ? [] : ["attach_media"],
    instructions: buildGoalCycleInstructions({
      taskKind: input.taskKind,
      mediaReady: input.mediaReady,
      destinationLabel: input.destinationLabel
    })
  };
}
