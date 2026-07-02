/**
 * Browse-window + cadence scheduling for patron digest email delivery.
 */

import type { NotificationDigestCadenceId, NotificationDigestSlotId } from "./notification-digest-preferences.js";
import { resolveNotificationDigestCadence, resolveNotificationDigestSlot } from "./notification-digest-preferences.js";

export const DEFAULT_NOTIFICATION_DIGEST_TIMEZONE = "UTC";

const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
const MONTHLY_MS = 28 * 24 * 60 * 60 * 1000;

/** Local hour ranges [startInclusive, endExclusive) for each slot. */
const SLOT_HOUR_RANGES: Record<NotificationDigestSlotId, [number, number]> = {
  morning: [7, 9],
  midday: [12, 13],
  evening: [18, 20],
  late_night: [22, 24],
};

export function resolveNotificationDigestTimezone(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_NOTIFICATION_DIGEST_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_NOTIFICATION_DIGEST_TIMEZONE;
  }
}

export function localHourInTimeZone(now: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = hourPart ? Number(hourPart.value) : NaN;
  return Number.isFinite(hour) ? hour : now.getUTCHours();
}

export function isHourInDigestSlot(hour: number, slot: NotificationDigestSlotId): boolean {
  const [start, end] = SLOT_HOUR_RANGES[slot];
  if (end <= start) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

export function isNowInDigestSlot(now: Date, slot: NotificationDigestSlotId, timeZone: string): boolean {
  return isHourInDigestSlot(localHourInTimeZone(now, timeZone), slot);
}

export function cadenceIntervalMs(cadence: NotificationDigestCadenceId): number {
  return cadence === "monthly" ? MONTHLY_MS : WEEKLY_MS;
}

/** True when enough time has passed since the last successful digest for this cadence. */
export function cadenceElapsedSinceLastSend(
  lastSentAt: Date | null,
  cadence: NotificationDigestCadenceId,
  now: Date
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= cadenceIntervalMs(cadence);
}

export type PatronDigestScheduleInput = {
  notificationDigestEnabled: boolean;
  notificationDigestCadence: string | null;
  notificationDigestSlot: string | null;
  notificationDigestTimezone: string | null;
};

/**
 * Whether a digest-enabled patron should be evaluated for send on this tick.
 * Does not check for content — the worker skips empty digests.
 */
export function isPatronDigestDue(
  now: Date,
  profile: PatronDigestScheduleInput,
  lastSentAt: Date | null
): boolean {
  if (!profile.notificationDigestEnabled) return false;
  const cadence = resolveNotificationDigestCadence(profile.notificationDigestCadence);
  const slot = resolveNotificationDigestSlot(profile.notificationDigestSlot);
  const timeZone = resolveNotificationDigestTimezone(profile.notificationDigestTimezone);
  if (!isNowInDigestSlot(now, slot, timeZone)) return false;
  return cadenceElapsedSinceLastSend(lastSentAt, cadence, now);
}

/** Digest content window: from last successful send (or account epoch) through now. */
export function digestContentWindow(
  lastSentAt: Date | null,
  now: Date,
  fallbackStart: Date
): { periodStart: Date; periodEnd: Date } {
  const periodEnd = now;
  const periodStart = lastSentAt ?? fallbackStart;
  return { periodStart, periodEnd };
}
