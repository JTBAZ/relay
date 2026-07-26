/**
 * Phase 5 / VS8 — sticky schedule reminder toast (no auto-dismiss).
 * Action-typed primary/secondary CTAs; Goal Cycle overlay when present.
 * Never auto-publishes — buttons only open allowlisted URLs or mark done/dismiss/snooze.
 */
import browser from "../lib/browser";
import {
  formatGoalCycleToastMeta,
  getGoalCycleReminderContext,
  hasGoalCycleReminderOverlay,
  prepareReminderPacketForDisplay,
  reminderToastMustNeverAutoPublish
} from "../lib/goal-cycle-reminder";
import {
  MSG_SCHEDULE_REMINDER_DISMISS,
  MSG_SCHEDULE_REMINDER_DONE,
  MSG_SCHEDULE_REMINDER_GET_ACTIVE,
  MSG_SCHEDULE_REMINDER_OPEN,
  MSG_SCHEDULE_REMINDER_SNOOZE
} from "../lib/messages";
import {
  DESTINATION_LABEL,
  reminderActionLabel,
  type ScheduleReminderCta,
  type ScheduleReminderPacket
} from "../lib/schedule-reminder-types";

const TOAST_HOST_ID = "relay-schedule-reminder-toast-root";

void reminderToastMustNeverAutoPublish();

function removeToastHost(): void {
  document.getElementById(TOAST_HOST_ID)?.remove();
}

async function resolveActivePacket(): Promise<ScheduleReminderPacket | null> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: MSG_SCHEDULE_REMINDER_GET_ACTIVE
    })) as { ok?: boolean; packet?: ScheduleReminderPacket | null };
    return response?.packet ?? null;
  } catch {
    return null;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderToast(rawPacket: ScheduleReminderPacket): void {
  if (document.getElementById(TOAST_HOST_ID)) return;

  const packet = prepareReminderPacketForDisplay(rawPacket);
  const gc = hasGoalCycleReminderOverlay(packet)
    ? getGoalCycleReminderContext(packet)
    : null;

  const host = document.createElement("div");
  host.id = TOAST_HOST_ID;
  host.style.all = "initial";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const destLabel =
    packet.destination && packet.destination in DESTINATION_LABEL
      ? DESTINATION_LABEL[packet.destination]
      : null;
  const action = reminderActionLabel(packet);
  const due = new Date(packet.due_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  const plan =
    packet.plan_label && packet.plan_index && packet.plan_total
      ? `${packet.plan_label} · ${packet.plan_index} of ${packet.plan_total}`
      : packet.plan_label && typeof packet.plan_label === "string"
        ? packet.plan_label
        : null;

  const primary = packet.primary_cta;
  const secondary = packet.secondary_cta;
  const showPrimary = Boolean(primary?.url?.trim());
  const showSecondary = Boolean(secondary?.url?.trim());
  const showHint = !showPrimary;

  const primaryBtn = showPrimary
    ? `<button type="button" class="relay-toast__btn relay-toast__btn--primary" data-action="open-primary">${escapeAttr(primary.label)}</button>`
    : "";
  const secondaryBtn = showSecondary
    ? `<button type="button" class="relay-toast__btn relay-toast__btn--ghost" data-action="open-secondary">${escapeAttr(secondary!.label)}</button>`
    : "";

  const gcMeta = gc ? formatGoalCycleToastMeta(gc) : "";
  const gcBlock = gc
    ? `<p class="relay-toast__gc" data-role="goal-cycle">${escapeAttr(gcMeta)}</p>
       ${
         gc.instructions
           ? `<p class="relay-toast__instructions" data-role="instructions"></p>`
           : ""
       }
       ${
         gc.needs_media
           ? `<p class="relay-toast__hint" data-role="media-hint">Attach media in Relay before confirming publish.</p>`
           : ""
       }`
    : "";

  const metaParts = [destLabel, due, plan].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0
  );

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .relay-toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 32px));
        border: 1px solid rgba(0, 170, 111, 0.35);
        border-radius: 12px;
        background: #111;
        color: #f5f5f5;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        overflow: hidden;
      }
      .relay-toast__accent { height: 2px; background: #00aa6f; }
      .relay-toast__body { padding: 14px 14px 10px; }
      .relay-toast__brand {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #00aa6f;
      }
      .relay-toast__brand-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #00aa6f;
        flex-shrink: 0;
      }
      .relay-toast__title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.4;
        color: #fff;
      }
      .relay-toast__meta {
        margin: 8px 0 0;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.55);
      }
      .relay-toast__gc {
        margin: 8px 0 0;
        font-size: 11px;
        font-weight: 600;
        color: rgba(0, 170, 111, 0.95);
      }
      .relay-toast__instructions {
        margin: 6px 0 0;
        font-size: 11px;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.7);
      }
      .relay-toast__hint {
        margin: 6px 0 0;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
      }
      .relay-toast__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        padding: 0 14px 12px;
      }
      .relay-toast__btn {
        border: 0;
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .relay-toast__btn:focus-visible {
        outline: 2px solid #00aa6f;
        outline-offset: 2px;
      }
      .relay-toast__btn--ghost {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.75);
      }
      .relay-toast__btn--primary {
        background: #00aa6f;
        color: #001a11;
      }
    </style>
    <div class="relay-toast" role="dialog" aria-live="polite" aria-label="Relay schedule reminder">
      <div class="relay-toast__accent" aria-hidden="true"></div>
      <div class="relay-toast__body">
        <div class="relay-toast__brand">
          <span class="relay-toast__brand-dot" aria-hidden="true"></span>
          Relay · ${action}
        </div>
        <p class="relay-toast__title"></p>
        <p class="relay-toast__meta">${escapeAttr(metaParts.join(" · "))}</p>
        ${gcBlock}
        <p class="relay-toast__hint" data-role="hint" ${showHint ? "" : "hidden"}>No link yet</p>
      </div>
      <div class="relay-toast__actions">
        <button type="button" class="relay-toast__btn relay-toast__btn--ghost" data-action="dismiss">Dismiss</button>
        <button type="button" class="relay-toast__btn relay-toast__btn--ghost" data-action="snooze">Snooze 1h</button>
        <button type="button" class="relay-toast__btn relay-toast__btn--ghost" data-action="done">Done</button>
        ${secondaryBtn}
        ${primaryBtn}
      </div>
    </div>
  `;
  shadow.appendChild(wrap);

  const titleEl = shadow.querySelector(".relay-toast__title");
  if (titleEl) titleEl.textContent = packet.title;

  const instructionsEl = shadow.querySelector('[data-role="instructions"]');
  if (instructionsEl && gc?.instructions) {
    instructionsEl.textContent = gc.instructions;
  }

  function openCta(cta: ScheduleReminderCta | null | undefined): void {
    const url = cta?.url?.trim() ?? null;
    // Navigation only — never fill forms or click destination publish controls.
    void browser.runtime.sendMessage({
      type: MSG_SCHEDULE_REMINDER_OPEN,
      reminder_id: packet.reminder_id,
      open_url: url
    });
  }

  shadow.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const actionName = (btn as HTMLElement).dataset.action;
      if (actionName === "open-primary") {
        openCta(primary);
        return;
      }
      if (actionName === "open-secondary") {
        openCta(secondary);
        return;
      }
      if (actionName === "done") {
        void browser.runtime.sendMessage({
          type: MSG_SCHEDULE_REMINDER_DONE,
          reminder_id: packet.reminder_id,
          task_id: packet.task_id
        });
        removeToastHost();
        return;
      }
      if (actionName === "dismiss") {
        void browser.runtime.sendMessage({
          type: MSG_SCHEDULE_REMINDER_DISMISS,
          reminder_id: packet.reminder_id
        });
        removeToastHost();
        return;
      }
      if (actionName === "snooze") {
        void browser.runtime.sendMessage({
          type: MSG_SCHEDULE_REMINDER_SNOOZE,
          reminder_id: packet.reminder_id,
          snooze_minutes: 60
        });
        removeToastHost();
      }
    });
  });
}

void (async () => {
  const packet = await resolveActivePacket();
  if (!packet) return;
  // Back-compat if older API omitted CTAs
  if (!packet.primary_cta) {
    packet.primary_cta = {
      kind: "external_post",
      url: packet.open_url,
      label: "Open post"
    };
    packet.secondary_cta = null;
    packet.media_ready = true;
  }
  renderToast(packet);
})();
