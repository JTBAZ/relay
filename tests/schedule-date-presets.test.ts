import { describe, expect, it } from "vitest";
import {
  defaultScheduleDatetimeLocal,
  resolveScheduleDatePreset
} from "../web/lib/schedule-date-presets";

describe("schedule-date-presets", () => {
  it("resolves tomorrow at preserved time of day", () => {
    const now = new Date("2026-07-19T18:00:00.000Z"); // 14:00 America/New_York (EDT)
    const resolved = resolveScheduleDatePreset({
      preset: "tomorrow",
      timeZone: "America/New_York",
      now,
      currentDatetimeLocal: "2026-07-19T14:00"
    });
    expect(resolved).toBe("2026-07-20T14:00");
  });

  it("resolves this weekend to Saturday when mid-week", () => {
    // Sunday Jul 19 2026 is... wait Jul 19 2026 is Sunday.
    // Use Wednesday Jul 15 2026.
    const now = new Date("2026-07-15T16:00:00.000Z"); // Wed 12:00 EDT
    const resolved = resolveScheduleDatePreset({
      preset: "this_weekend",
      timeZone: "America/New_York",
      now,
      currentDatetimeLocal: "2026-07-15T14:00"
    });
    expect(resolved).toBe("2026-07-18T14:00"); // Saturday
  });

  it("rolls this weekend past a passed Saturday slot to Sunday or next Saturday", () => {
    // Saturday afternoon after 14:00 — Saturday 14:00 has passed → Sunday
    const now = new Date("2026-07-18T20:00:00.000Z"); // Sat 16:00 EDT
    const resolved = resolveScheduleDatePreset({
      preset: "this_weekend",
      timeZone: "America/New_York",
      now,
      currentDatetimeLocal: "2026-07-18T14:00"
    });
    expect(resolved).toBe("2026-07-19T14:00"); // Sunday
  });

  it("resolves end of month and rolls to next month when past", () => {
    const mid = new Date("2026-07-10T16:00:00.000Z");
    expect(
      resolveScheduleDatePreset({
        preset: "end_of_month",
        timeZone: "America/New_York",
        now: mid,
        currentDatetimeLocal: "2026-07-10T14:00"
      })
    ).toBe("2026-07-31T14:00");

    const late = new Date("2026-07-31T20:00:00.000Z"); // Jul 31 16:00 EDT — 14:00 already passed
    expect(
      resolveScheduleDatePreset({
        preset: "end_of_month",
        timeZone: "America/New_York",
        now: late,
        currentDatetimeLocal: "2026-07-31T14:00"
      })
    ).toBe("2026-08-31T14:00");
  });

  it("choose_date returns null", () => {
    expect(
      resolveScheduleDatePreset({
        preset: "choose_date",
        timeZone: "UTC",
        now: new Date("2026-07-19T12:00:00.000Z")
      })
    ).toBeNull();
  });

  it("defaultScheduleDatetimeLocal bumps to next whole hour in zone", () => {
    const now = new Date("2026-07-19T18:30:00.000Z"); // 14:30 EDT
    const v = defaultScheduleDatetimeLocal("America/New_York", now);
    expect(v).toBe("2026-07-19T15:00");
  });
});
