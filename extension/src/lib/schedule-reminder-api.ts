/**

 * Extension HTTP client for Phase 5 / VS8 schedule sticky reminders.

 */



import { RELAY_API_BASE } from "./constants";

import {

  classifyReminderFetchResponse,

  type ScheduleReminderPollHealth

} from "./goal-cycle-reminder";

import * as storage from "./storage";

import type { ScheduleReminderPacket } from "./schedule-reminder-types";



async function authHeaders(): Promise<HeadersInit | null> {

  const grant = await storage.getGrant();

  if (!grant?.token) return null;

  return {

    Authorization: `Bearer ${grant.token}`,

    "Content-Type": "application/json"

  };

}



/**

 * Fetch due reminders with explicit revoked / offline / outdated health.

 * Never throws — callers branch on `status`.

 */

export async function fetchDueScheduleRemindersHealth(): Promise<ScheduleReminderPollHealth> {

  const headers = await authHeaders();

  if (!headers) {

    return { status: "revoked" };

  }

  try {

    const res = await fetch(`${RELAY_API_BASE}/api/v1/extension/schedule-reminders/due`, {

      method: "GET",

      headers

    });

    if (res.status === 401 || res.status === 403) {

      return { status: "revoked" };

    }

    if (!res.ok) {

      return classifyReminderFetchResponse({

        ok: false,

        status: res.status

      });

    }

    const json = (await res.json()) as {
      data?: {
        reminders?: ScheduleReminderPacket[];
        next_upcoming_due_at?: string | null;
      };
    };

    const reminders = Array.isArray(json.data?.reminders) ? json.data!.reminders! : [];
    const nextUpcoming =
      typeof json.data?.next_upcoming_due_at === "string"
        ? json.data.next_upcoming_due_at
        : null;

    return classifyReminderFetchResponse({
      ok: true,
      status: res.status,
      reminders,
      next_upcoming_due_at: nextUpcoming
    });

  } catch {

    return classifyReminderFetchResponse({

      ok: false,

      status: 0,

      networkError: true

    });

  }

}



/** Back-compat: returns reminders only (empty on revoked/offline). */

export async function fetchDueScheduleReminders(): Promise<ScheduleReminderPacket[]> {

  const health = await fetchDueScheduleRemindersHealth();

  if (health.status === "ok" || health.status === "outdated") {

    return health.reminders;

  }

  return [];

}



export async function postScheduleReminderPresented(reminderId: string): Promise<boolean> {

  const headers = await authHeaders();

  if (!headers) return false;

  try {

    const res = await fetch(

      `${RELAY_API_BASE}/api/v1/extension/schedule-reminders/${encodeURIComponent(reminderId)}/presented`,

      { method: "POST", headers, body: "{}" }

    );

    return res.ok;

  } catch {

    return false;

  }

}



export async function postScheduleReminderDismiss(reminderId: string): Promise<boolean> {

  const headers = await authHeaders();

  if (!headers) return false;

  try {

    const res = await fetch(

      `${RELAY_API_BASE}/api/v1/extension/schedule-reminders/${encodeURIComponent(reminderId)}/dismiss`,

      { method: "POST", headers, body: "{}" }

    );

    return res.ok;

  } catch {

    return false;

  }

}



export async function postScheduleReminderSnooze(

  reminderId: string,

  snoozeMinutes = 60

): Promise<boolean> {

  const headers = await authHeaders();

  if (!headers) return false;

  try {

    const res = await fetch(

      `${RELAY_API_BASE}/api/v1/extension/schedule-reminders/${encodeURIComponent(reminderId)}/snooze`,

      {

        method: "POST",

        headers,

        body: JSON.stringify({ snooze_minutes: snoozeMinutes })

      }

    );

    return res.ok;

  } catch {

    return false;

  }

}



export async function patchPostbotTaskDone(taskId: string): Promise<boolean> {

  const headers = await authHeaders();

  if (!headers) return false;

  try {

    const res = await fetch(

      `${RELAY_API_BASE}/api/v1/creator/postbot-tasks/${encodeURIComponent(taskId)}`,

      {

        method: "PATCH",

        headers,

        body: JSON.stringify({ status: "done" })

      }

    );

    return res.ok;

  } catch {

    return false;

  }

}


