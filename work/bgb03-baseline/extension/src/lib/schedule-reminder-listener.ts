/**
 * Phase 5 — poll due schedule reminders; inject on Relay or any linked social.
 * VS8-T05: Goal Cycle overlay packets + revoked/offline/outdated health.
 */

import browser from "./browser";
import {
  fetchDueScheduleRemindersHealth,
  patchPostbotTaskDone,
  postScheduleReminderDismiss,
  postScheduleReminderPresented,
  postScheduleReminderSnooze
} from "./schedule-reminder-api";
import { SCHEDULE_REMINDER_TOAST_SCRIPT } from "./schedule-reminder-inject";
import {
  prepareReminderPacketForDisplay,
  sanitizeGoalCycleDeepLink,
  sanitizeLooseReminderUrl,
  type ScheduleReminderPollHealth
} from "./goal-cycle-reminder";
import {
  isInjectEligibleHost,
  type ScheduleReminderDestination,
  type ScheduleReminderPacket
} from "./schedule-reminder-types";

const ALARM_SCHEDULE_REMINDERS = "relay-schedule-reminders";
/** One-shot alarm aimed at the exact next due instant. */
const ALARM_SCHEDULE_REMINDERS_EXACT = "relay-schedule-reminders-exact";
/** Chrome MV3 recurring alarms floor at 1 minute; keep as a safety net. */
const POLL_MINUTES = 1;

type ActiveSticky = {
  tabId: number;
  packet: ScheduleReminderPacket;
};

let activeSticky: ActiveSticky | null = null;
let pendingQueue: ScheduleReminderPacket[] = [];
let pollInFlight = false;
let lastPollHealth: ScheduleReminderPollHealth = { status: "ok", reminders: [] };

export function getActiveScheduleReminderForTab(
  tabId: number
): ScheduleReminderPacket | null {
  if (activeSticky && activeSticky.tabId === tabId) return activeSticky.packet;
  return null;
}

export function getScheduleReminderPollHealth(): ScheduleReminderPollHealth {
  return lastPollHealth;
}

async function injectToast(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [SCHEDULE_REMINDER_TOAST_SCRIPT]
    });
    return true;
  } catch (e) {
    console.log("[relay:schedule-reminder] inject failed", { tabId, error: String(e) });
    return false;
  }
}

/** Prefer active eligible tab; else first Relay/social match. */
async function findInjectTab(): Promise<browser.Tabs.Tab | null> {
  const tabs = await browser.tabs.query({});
  const eligible: browser.Tabs.Tab[] = [];
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || !tab.url) continue;
    try {
      const url = new URL(tab.url);
      if (isInjectEligibleHost(url.hostname)) {
        eligible.push(tab);
      }
    } catch {
      /* ignore bad urls */
    }
  }
  if (eligible.length === 0) return null;
  const active = eligible.find((t) => t.active);
  return active ?? eligible[0] ?? null;
}

async function tryShowNext(): Promise<void> {
  if (activeSticky) return;
  while (pendingQueue.length > 0) {
    const packet = pendingQueue.shift()!;
    const tab = await findInjectTab();
    if (!tab || typeof tab.id !== "number") {
      // No eligible tab yet — put packet back and wait for next poll.
      pendingQueue.unshift(packet);
      return;
    }
    activeSticky = { tabId: tab.id, packet: prepareReminderPacketForDisplay(packet) };
    const ok = await injectToast(tab.id);
    if (!ok) {
      activeSticky = null;
      continue;
    }
    await postScheduleReminderPresented(packet.reminder_id);
    return;
  }
}

export async function clearActiveScheduleReminder(): Promise<void> {
  activeSticky = null;
  await tryShowNext();
}

export async function pollScheduleReminders(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const health = await fetchDueScheduleRemindersHealth();
    lastPollHealth = health;

    if (health.status === "revoked" || health.status === "offline") {
      console.log("[relay:schedule-reminder] poll health", health.status);
      return;
    }

    await scheduleExactDueAlarm(health.next_upcoming_due_at ?? null);

    const due = health.reminders;
    if (due.length === 0) return;

    const activeId = activeSticky?.packet.reminder_id;
    const queuedIds = new Set(pendingQueue.map((p) => p.reminder_id));
    for (const packet of due) {
      if (packet.reminder_id === activeId) continue;
      if (queuedIds.has(packet.reminder_id)) continue;
      pendingQueue.push(packet);
      queuedIds.add(packet.reminder_id);
    }
    await tryShowNext();
  } finally {
    pollInFlight = false;
  }
}

async function scheduleExactDueAlarm(nextUpcomingIso: string | null): Promise<void> {
  try {
    await browser.alarms.clear(ALARM_SCHEDULE_REMINDERS_EXACT);
  } catch {
    /* ignore */
  }
  if (!nextUpcomingIso) return;
  const when = Date.parse(nextUpcomingIso);
  if (!Number.isFinite(when)) return;
  const delayMs = when - Date.now();
  if (delayMs <= 250) return;
  // Cap far-future one-shots; recurring poll covers the long horizon.
  if (delayMs > 24 * 60 * 60 * 1000) return;
  await browser.alarms.create(ALARM_SCHEDULE_REMINDERS_EXACT, { when });
}

export async function ensureScheduleReminderAlarm(): Promise<void> {
  const existing = await browser.alarms.get(ALARM_SCHEDULE_REMINDERS);
  if (!existing || existing.periodInMinutes !== POLL_MINUTES) {
    await browser.alarms.clear(ALARM_SCHEDULE_REMINDERS);
    await browser.alarms.create(ALARM_SCHEDULE_REMINDERS, {
      periodInMinutes: POLL_MINUTES
    });
  }
}

export function isScheduleReminderAlarm(name: string): boolean {
  return name === ALARM_SCHEDULE_REMINDERS || name === ALARM_SCHEDULE_REMINDERS_EXACT;
}

export async function handleScheduleReminderDone(
  reminderId: string,
  taskId: string
): Promise<boolean> {
  const ok = await patchPostbotTaskDone(taskId);
  if (ok && activeSticky?.packet.reminder_id === reminderId) {
    await clearActiveScheduleReminder();
  }
  return ok;
}

export async function handleScheduleReminderDismiss(reminderId: string): Promise<boolean> {
  const ok = await postScheduleReminderDismiss(reminderId);
  if (ok && activeSticky?.packet.reminder_id === reminderId) {
    await clearActiveScheduleReminder();
  }
  return ok;
}

export async function handleScheduleReminderSnooze(
  reminderId: string,
  snoozeMinutes: number
): Promise<boolean> {
  const ok = await postScheduleReminderSnooze(reminderId, snoozeMinutes);
  if (ok && activeSticky?.packet.reminder_id === reminderId) {
    await clearActiveScheduleReminder();
  }
  return ok;
}

/**
 * Open a deep link in a new tab after allowlist sanitize.
 * Never auto-publishes; only navigates.
 */
export function handleScheduleReminderOpen(
  openUrl: string | null,
  destination?: ScheduleReminderDestination | null
): void {
  const packet = activeSticky?.packet;
  const url =
    packet?.event_type === "custom" || !destination
      ? sanitizeLooseReminderUrl(openUrl)
      : sanitizeGoalCycleDeepLink(
          openUrl,
          destination ?? packet?.destination ?? null
        );
  if (!url) return;
  void browser.tabs.create({ url });
}

export function startScheduleReminderWatcher(): void {
  void ensureScheduleReminderAlarm();
  void pollScheduleReminders();
}
