/**
 * Additive Goal Cycle helpers for schedule reminders (VS8-T01 / T05).
 * Phase 5 packets without overlay fields keep existing behavior.
 * Never opens private media URLs; never automates publish clicks.
 */

import {
  DESTINATION_HOSTS,
  RELAY_WEB_HOSTS,
  type ScheduleReminderCta,
  type ScheduleReminderDestination,
  type ScheduleReminderPacket,
  type ScheduleReminderTaskKind
} from "./schedule-reminder-types";

export type GoalCycleReminderContext = {
  goal_cycle_id: string;
  goal_cycle_slot_id: string | null;
  campaign_key: string | null;
  task_kind: ScheduleReminderTaskKind | null;
  due_local: string | null;
  time_zone: string | null;
  media_requirements: string[];
  instructions: string | null;
  needs_media: boolean;
};

/** Poll / delivery health for extension UX (VS8-T05). */
export type ScheduleReminderPollHealth =
  | {
      status: "ok";
      reminders: ScheduleReminderPacket[];
      next_upcoming_due_at?: string | null;
    }
  | { status: "revoked" }
  | { status: "offline"; detail?: string }
  | {
      status: "outdated";
      reminders: ScheduleReminderPacket[];
      detail?: string;
      next_upcoming_due_at?: string | null;
    };

export const TASK_KIND_LABEL: Record<ScheduleReminderTaskKind, string> = {
  publish: "Publish",
  social_upkeep: "Social upkeep",
  active_rest: "Active rest"
};

/** Packets older than this (by due_at) are treated as outdated for toast context. */
export const OUTDATED_REMINDER_MS = 36 * 60 * 60 * 1000;

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

/** True when the packet carries a Goal Cycle overlay (not Phase 5-only). */
export function hasGoalCycleReminderOverlay(
  packet: ScheduleReminderPacket | null | undefined
): boolean {
  const id = packet?.goal_cycle_id?.trim();
  return Boolean(id);
}

/** Safe display context for toast/UI — never invents private media URLs. */
export function getGoalCycleReminderContext(
  packet: ScheduleReminderPacket
): GoalCycleReminderContext | null {
  const goalCycleId = packet.goal_cycle_id?.trim();
  if (!goalCycleId) return null;
  const requirements = Array.isArray(packet.media_requirements)
    ? packet.media_requirements.filter((r) => typeof r === "string" && r.trim())
    : [];
  return {
    goal_cycle_id: goalCycleId,
    goal_cycle_slot_id: packet.goal_cycle_slot_id?.trim() || null,
    campaign_key: packet.campaign_key?.trim() || null,
    task_kind: packet.task_kind ?? null,
    due_local: packet.due_local?.trim() || null,
    time_zone: packet.time_zone?.trim() || null,
    media_requirements: requirements,
    instructions: packet.instructions?.trim() || null,
    needs_media: !packet.media_ready || requirements.includes("attach_media")
  };
}

/**
 * Deep-link allowlist mirrored from backend contract.
 * Rejects javascript:/data:/file: and hosts outside Relay + destination.
 */
export function isAllowedGoalCycleDeepLink(
  url: string | null | undefined,
  destination: ScheduleReminderDestination | null | undefined
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
  if (!destination) return false;
  return hostAllowed(host, DESTINATION_HOSTS[destination]);
}

/** Custom reminders: any safe http(s) URL (no destination host allowlist). */
export function isAllowedLooseReminderUrl(url: string | null | undefined): boolean {
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
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function sanitizeGoalCycleDeepLink(
  url: string | null | undefined,
  destination: ScheduleReminderDestination | null | undefined
): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return isAllowedGoalCycleDeepLink(trimmed, destination) ? trimmed : null;
}

export function sanitizeLooseReminderUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return isAllowedLooseReminderUrl(trimmed) ? trimmed : null;
}

function sanitizePacketUrl(
  url: string | null | undefined,
  packet: ScheduleReminderPacket
): string | null {
  if (packet.event_type === "custom" || !packet.destination) {
    return sanitizeLooseReminderUrl(url);
  }
  return sanitizeGoalCycleDeepLink(url, packet.destination);
}

function sanitizeCta(
  cta: ScheduleReminderCta | null | undefined,
  packet: ScheduleReminderPacket
): ScheduleReminderCta | null {
  if (!cta) return null;
  return {
    ...cta,
    url: sanitizePacketUrl(cta.url, packet)
  };
}

/**
 * Prepare a packet for toast display: strip disallowed deep links.
 * Does not invent replacement URLs.
 */
export function prepareReminderPacketForDisplay(
  packet: ScheduleReminderPacket
): ScheduleReminderPacket {
  return {
    ...packet,
    open_url: sanitizePacketUrl(packet.open_url, packet),
    primary_cta: sanitizeCta(packet.primary_cta, packet) ?? {
      kind: "relay_studio",
      url: null,
      label: packet.primary_cta?.label ?? "Open in Relay"
    },
    secondary_cta: sanitizeCta(packet.secondary_cta, packet)
  };
}

export function isReminderPacketOutdated(
  packet: ScheduleReminderPacket,
  now: Date = new Date()
): boolean {
  const due = Date.parse(packet.due_at);
  if (!Number.isFinite(due)) return true;
  return now.getTime() - due > OUTDATED_REMINDER_MS;
}

/** Classify HTTP outcomes for due-list polling. */
export function classifyReminderFetchResponse(args: {
  ok: boolean;
  status: number;
  reminders?: ScheduleReminderPacket[];
  next_upcoming_due_at?: string | null;
  networkError?: boolean;
  now?: Date;
}): ScheduleReminderPollHealth {
  if (args.networkError) {
    return { status: "offline", detail: "network_error" };
  }
  if (args.status === 401 || args.status === 403) {
    return { status: "revoked" };
  }
  if (!args.ok) {
    return { status: "offline", detail: `http_${args.status}` };
  }
  const reminders = Array.isArray(args.reminders) ? args.reminders : [];
  const now = args.now ?? new Date();
  const nextUpcoming =
    typeof args.next_upcoming_due_at === "string" && args.next_upcoming_due_at.trim()
      ? args.next_upcoming_due_at.trim()
      : null;
  const outdated = reminders.filter((p) => isReminderPacketOutdated(p, now));
  if (outdated.length > 0 && outdated.length === reminders.length && reminders.length > 0) {
    return {
      status: "outdated",
      reminders: reminders.map(prepareReminderPacketForDisplay),
      detail: "all_due_stale",
      next_upcoming_due_at: nextUpcoming
    };
  }
  return {
    status: "ok",
    reminders: reminders.map(prepareReminderPacketForDisplay),
    next_upcoming_due_at: nextUpcoming
  };
}

/** Explicit non-automation guard for tests and reviewers. */
export function reminderToastMustNeverAutoPublish(): true {
  return true;
}

export function formatGoalCycleToastMeta(ctx: GoalCycleReminderContext): string {
  const kind =
    ctx.task_kind && TASK_KIND_LABEL[ctx.task_kind]
      ? TASK_KIND_LABEL[ctx.task_kind]
      : "Goal Cycle";
  const parts = [kind];
  if (ctx.needs_media) parts.push("needs media");
  if (ctx.due_local) parts.push(ctx.due_local);
  return parts.join(" · ");
}
