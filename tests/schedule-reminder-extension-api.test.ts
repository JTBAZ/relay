import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNOOZE_MINUTES,
  effectivePerEventNotify,
  isDueReminderEligible,
  parseReminderTaskId,
  reminderIdForTask,
  resolveRelayWebBase,
  resolveReminderCtas
} from "../src/distribution/schedule-reminder-extension-api.js";

describe("schedule-reminder-extension-api helpers", () => {
  it("encodes and parses reminder_id", () => {
    const id = reminderIdForTask("task_abc");
    expect(id).toBe("schedule_reminder:task:task_abc");
    expect(parseReminderTaskId(id)).toBe("task_abc");
    expect(parseReminderTaskId("bad")).toBeNull();
  });

  it("prefers task remindMe over variant when non-null", () => {
    expect(
      effectivePerEventNotify({ taskRemindMe: false, variantRemindMe: true })
    ).toBe(false);
    expect(
      effectivePerEventNotify({ taskRemindMe: true, variantRemindMe: false })
    ).toBe(true);
    expect(
      effectivePerEventNotify({ taskRemindMe: null, variantRemindMe: true })
    ).toBe(true);
    expect(
      effectivePerEventNotify({ taskRemindMe: undefined, variantRemindMe: false })
    ).toBe(false);
  });

  it("gates due eligibility on global, per-event, due time, sent, snooze", () => {
    const now = new Date("2026-07-13T18:00:00.000Z");
    const dueAt = new Date("2026-07-13T17:00:00.000Z");
    const base = {
      status: "pending",
      dueAt,
      now,
      remindMeGlobal: true,
      taskRemindMe: null as boolean | null,
      variantRemindMe: true,
      reminderSentAt: null as Date | null,
      snoozedUntil: null as Date | null
    };
    expect(isDueReminderEligible(base)).toBe(true);
    expect(isDueReminderEligible({ ...base, remindMeGlobal: false })).toBe(false);
    expect(
      isDueReminderEligible({ ...base, taskRemindMe: false, variantRemindMe: true })
    ).toBe(false);
    expect(isDueReminderEligible({ ...base, dueAt: null })).toBe(false);
    expect(
      isDueReminderEligible({
        ...base,
        dueAt: new Date("2026-07-13T19:00:00.000Z")
      })
    ).toBe(false);
    expect(
      isDueReminderEligible({
        ...base,
        reminderSentAt: new Date("2026-07-13T17:30:00.000Z")
      })
    ).toBe(false);
    expect(
      isDueReminderEligible({
        ...base,
        snoozedUntil: new Date("2026-07-13T19:00:00.000Z")
      })
    ).toBe(false);
    expect(
      isDueReminderEligible({
        ...base,
        snoozedUntil: new Date("2026-07-13T17:00:00.000Z")
      })
    ).toBe(true);
    expect(isDueReminderEligible({ ...base, status: "done" })).toBe(false);
    expect(DEFAULT_SNOOZE_MINUTES).toBe(60);
  });

  it("resolves CTA matrix by action and media readiness", () => {
    const base = "http://localhost:3000";

    const repost = resolveReminderCtas({
      action: "repost",
      destination: "x",
      mediaReady: true,
      openUrl: "https://x.com/u/status/1",
      relayWebBase: base,
      draftId: null
    });
    expect(repost.primary_cta.kind).toBe("external_post");
    expect(repost.primary_cta.url).toBe("https://x.com/u/status/1");
    expect(repost.primary_cta.label).toBe("Open on X");
    expect(repost.secondary_cta).toBeNull();

    const pinNoLink = resolveReminderCtas({
      action: "pin_comment",
      destination: "x",
      mediaReady: true,
      openUrl: null,
      relayWebBase: base,
      draftId: null
    });
    expect(pinNoLink.primary_cta.url).toBeNull();
    expect(pinNoLink.secondary_cta?.kind).toBe("relay_studio");
    expect(pinNoLink.secondary_cta?.url).toBe(`${base}/studio`);
    expect(pinNoLink.secondary_cta?.label).toBe("Open in Relay");

    const postEmpty = resolveReminderCtas({
      action: "post",
      destination: "deviantart",
      mediaReady: false,
      openUrl: null,
      relayWebBase: base,
      draftId: null
    });
    expect(postEmpty.primary_cta.kind).toBe("relay_autopost");
    expect(postEmpty.primary_cta.label).toBe("Stage in Autopost");
    expect(postEmpty.primary_cta.url).toBe(`${base}/studio/autopost`);
    expect(postEmpty.secondary_cta).toBeNull();

    const postEmptyLinked = resolveReminderCtas({
      action: "post",
      destination: "deviantart",
      mediaReady: false,
      openUrl: null,
      relayWebBase: base,
      draftId: "draft_queued"
    });
    expect(postEmptyLinked.primary_cta.label).toBe("Continue in Autopost");
    expect(postEmptyLinked.primary_cta.url).toContain("draft_id=draft_queued");

    const postReady = resolveReminderCtas({
      action: "post",
      destination: "deviantart",
      mediaReady: true,
      openUrl: "https://www.deviantart.com/art/1",
      relayWebBase: base,
      draftId: "draft_9"
    });
    expect(postReady.primary_cta.label).toBe("Open in Autopost");
    expect(postReady.primary_cta.url).toContain("draft_id=draft_9");
    expect(postReady.secondary_cta?.label).toBe("Open on DeviantArt");

    const schedule = resolveReminderCtas({
      action: "schedule",
      destination: "patreon",
      mediaReady: true,
      openUrl: null,
      relayWebBase: base,
      draftId: null
    });
    expect(schedule.primary_cta.kind).toBe("relay_studio");
    expect(schedule.primary_cta.label).toBe("Review in Relay");
    expect(schedule.primary_cta.url).toBe(`${base}/studio`);

    const engage = resolveReminderCtas({
      action: "pin_comment",
      destination: "x",
      mediaReady: true,
      openUrl: "https://x.com/u/status/9",
      relayWebBase: base,
      draftId: null,
      eventType: "engage_comments"
    });
    expect(engage.primary_cta.kind).toBe("external_post");
    expect(engage.primary_cta.url).toBe("https://x.com/u/status/9");

    const customUrl = resolveReminderCtas({
      action: "post",
      destination: null,
      mediaReady: true,
      openUrl: "https://example.com/notes",
      relayWebBase: base,
      draftId: null,
      eventType: "custom"
    });
    expect(customUrl.primary_cta.kind).toBe("external_post");
    expect(customUrl.primary_cta.label).toBe("Open link");
    expect(customUrl.primary_cta.url).toBe("https://example.com/notes");

    // Automations approval deep link (B13 / AU-07) — same custom+url path.
    const approval = resolveReminderCtas({
      action: "post",
      destination: null,
      mediaReady: true,
      openUrl:
        "https://relay.example/studio/autopost?draft_id=d1&automation_run_id=r1&automation_id=a1",
      relayWebBase: base,
      draftId: null,
      eventType: "custom"
    });
    expect(approval.primary_cta.kind).toBe("external_post");
    expect(approval.primary_cta.url).toContain("/studio/autopost?");
    expect(approval.primary_cta.url).toContain("automation_run_id=r1");

    const customNoUrl = resolveReminderCtas({
      action: "post",
      destination: null,
      mediaReady: true,
      openUrl: null,
      relayWebBase: base,
      draftId: null,
      eventType: "custom"
    });
    expect(customNoUrl.primary_cta.kind).toBe("relay_studio");
    expect(customNoUrl.primary_cta.url).toBe(`${base}/studio`);
  });

  it("resolveRelayWebBase falls back to localhost", () => {
    expect(resolveRelayWebBase({})).toBe("http://localhost:3000");
    expect(
      resolveRelayWebBase({ RELAY_PUBLIC_WEB_BASE_URL: "https://relayapp.me/" })
    ).toBe("https://relayapp.me");
  });
});
