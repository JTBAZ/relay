/**
 * Patron notification digest — cadence + browse-window for batched creator updates.
 *
 * When enabled, new-post alerts roll into a curated wrap-up on the patron's chosen
 * cadence (weekly or monthly) during their browse window instead of instant pings.
 */

export const NOTIFICATION_DIGEST_CADENCES = [
  {
    id: "weekly",
    label: "Weekly",
    description: "A weekly batch of new posts you missed.",
  },
  {
    id: "monthly",
    label: "Monthly",
    description: "A monthly roundup for lighter browsing.",
  },
] as const;

export type NotificationDigestCadenceId = (typeof NOTIFICATION_DIGEST_CADENCES)[number]["id"];

const CADENCE_IDS = new Set<string>(NOTIFICATION_DIGEST_CADENCES.map((c) => c.id));

export const DEFAULT_NOTIFICATION_DIGEST_CADENCE: NotificationDigestCadenceId = "weekly";
export const MUTED_NOTIFICATION_CADENCE = "never";
export type NotificationCadencePreferenceId =
  | NotificationDigestCadenceId
  | typeof MUTED_NOTIFICATION_CADENCE;

export function isNotificationDigestCadenceId(value: string): value is NotificationDigestCadenceId {
  return CADENCE_IDS.has(value);
}

export function normalizeNotificationDigestCadence(
  raw: string | null | undefined
): NotificationDigestCadenceId | null {
  if (raw == null) return null;
  const norm = raw.trim().toLowerCase();
  return isNotificationDigestCadenceId(norm) ? norm : null;
}

export function isMutedNotificationCadence(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === MUTED_NOTIFICATION_CADENCE;
}

export function normalizeNotificationCadencePreference(
  raw: string | null | undefined
): NotificationCadencePreferenceId | null {
  if (isMutedNotificationCadence(raw)) return MUTED_NOTIFICATION_CADENCE;
  return normalizeNotificationDigestCadence(raw);
}

export function resolveNotificationDigestCadence(
  raw: string | null | undefined
): NotificationDigestCadenceId {
  return normalizeNotificationDigestCadence(raw) ?? DEFAULT_NOTIFICATION_DIGEST_CADENCE;
}

export const NOTIFICATION_DIGEST_SLOTS = [
  {
    id: "morning",
    label: "Morning",
    window: "7–9am",
    description: "Before the day starts.",
  },
  {
    id: "midday",
    label: "Midday",
    window: "12–1pm",
    description: "A quick lunch break catch-up.",
  },
  {
    id: "evening",
    label: "After work",
    window: "6–8pm",
    description: "When you usually wind down.",
  },
  {
    id: "late_night",
    label: "Late night",
    window: "10pm–midnight",
    description: "A quiet window before bed.",
  },
] as const;

export type NotificationDigestSlotId = (typeof NOTIFICATION_DIGEST_SLOTS)[number]["id"];

const SLOT_IDS = new Set<string>(NOTIFICATION_DIGEST_SLOTS.map((s) => s.id));

export const DEFAULT_NOTIFICATION_DIGEST_SLOT: NotificationDigestSlotId = "evening";

export function isNotificationDigestSlotId(value: string): value is NotificationDigestSlotId {
  return SLOT_IDS.has(value);
}

export function normalizeNotificationDigestSlot(
  raw: string | null | undefined
): NotificationDigestSlotId | null {
  if (raw == null) return null;
  const norm = raw.trim().toLowerCase();
  return isNotificationDigestSlotId(norm) ? norm : null;
}

export function resolveNotificationDigestSlot(
  raw: string | null | undefined
): NotificationDigestSlotId {
  return normalizeNotificationDigestSlot(raw) ?? DEFAULT_NOTIFICATION_DIGEST_SLOT;
}

/** How creator update notifications are delivered. */
export const NOTIFICATION_DELIVERY_MODES = [
  {
    id: "instant",
    label: "Immediately",
    description:
      "As soon as the post is made.",
  },
  {
    id: "scheduled",
    label: "Scheduled",
    description:
      "Select a day/time you'd like to receive batches of art.",
  },
  {
    id: "never",
    label: "Never",
    description: "Browse as you please.",
  },
] as const;

export type NotificationDeliveryModeId =
  (typeof NOTIFICATION_DELIVERY_MODES)[number]["id"];

export function notificationDeliveryModeFromDigestEnabled(
  digestEnabled: boolean
): NotificationDeliveryModeId {
  return digestEnabled ? "scheduled" : "instant";
}

export function notificationDeliveryModeFromProfile(
  digestEnabled: boolean,
  cadence: string | null | undefined
): NotificationDeliveryModeId {
  if (!digestEnabled && isMutedNotificationCadence(cadence)) return "never";
  return notificationDeliveryModeFromDigestEnabled(digestEnabled);
}

export function notificationDigestEnabledFromDeliveryMode(
  mode: NotificationDeliveryModeId
): boolean {
  return mode === "scheduled";
}
