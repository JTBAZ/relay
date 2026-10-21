import { describe, expect, it } from "vitest";
import {
  fromDatetimeLocalInputValue,
  parseScheduledLocal,
  syncSlotScheduledUtc,
  toDatetimeLocalInputValue,
  zonedLocalDateTimeToUtc
} from "../../src/goal-cycle/planner/schedule-local.js";

describe("goal-cycle schedule-local", () => {
  it("parses and formats datetime-local values", () => {
    expect(toDatetimeLocalInputValue("2026-07-22T15:00:00")).toBe("2026-07-22T15:00");
    expect(fromDatetimeLocalInputValue("2026-07-22T15:00")).toBe("2026-07-22T15:00:00");
    expect(parseScheduledLocal("2026-07-22 15:30")).toMatchObject({
      year: 2026,
      month: 7,
      day: 22,
      hour: 15,
      minute: 30
    });
  });

  it("converts America/New_York wall time to UTC", () => {
    // EDT in July: UTC-4
    const utc = zonedLocalDateTimeToUtc(
      { year: 2026, month: 7, day: 22, hour: 15, minute: 0, second: 0 },
      "America/New_York"
    );
    expect(utc.toISOString()).toBe("2026-07-22T19:00:00.000Z");
  });

  it("syncSlotScheduledUtc updates utc when local changes", () => {
    const synced = syncSlotScheduledUtc(
      {
        scheduled_local: "2026-07-25T10:00:00",
        scheduled_utc: "2026-07-22T19:00:00.000Z",
        time_zone: "America/New_York"
      },
      "America/New_York"
    );
    expect(synced.scheduled_local).toBe("2026-07-25T10:00:00");
    expect(synced.scheduled_utc).toBe("2026-07-25T14:00:00.000Z");
  });
});
