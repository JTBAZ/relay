import { describe, expect, it } from "vitest";
import {
  cadenceElapsedSinceLastSend,
  isHourInDigestSlot,
  isPatronDigestDue,
  isNowInDigestSlot,
} from "../../src/patron/notification-digest-schedule.js";

describe("notification-digest-schedule", () => {
  it("matches evening slot hours", () => {
    expect(isHourInDigestSlot(18, "evening")).toBe(true);
    expect(isHourInDigestSlot(19, "evening")).toBe(true);
    expect(isHourInDigestSlot(12, "evening")).toBe(false);
  });

  it("requires cadence elapsed before due", () => {
    const now = new Date("2026-05-28T18:30:00.000Z");
    const lastWeek = new Date("2026-05-21T18:30:00.000Z");
    expect(cadenceElapsedSinceLastSend(lastWeek, "weekly", now)).toBe(true);
    expect(cadenceElapsedSinceLastSend(now, "weekly", now)).toBe(false);
  });

  it("marks digest patron due in evening UTC when timezone unset", () => {
    const now = new Date("2026-05-28T18:30:00.000Z");
    expect(isNowInDigestSlot(now, "evening", "UTC")).toBe(true);
    expect(
      isPatronDigestDue(
        now,
        {
          notificationDigestEnabled: true,
          notificationDigestCadence: "weekly",
          notificationDigestSlot: "evening",
          notificationDigestTimezone: null,
        },
        null
      )
    ).toBe(true);
  });

  it("skips instant-mode patrons", () => {
    const now = new Date("2026-05-28T18:30:00.000Z");
    expect(
      isPatronDigestDue(
        now,
        {
          notificationDigestEnabled: false,
          notificationDigestCadence: "weekly",
          notificationDigestSlot: "evening",
          notificationDigestTimezone: "UTC",
        },
        null
      )
    ).toBe(false);
  });
});
