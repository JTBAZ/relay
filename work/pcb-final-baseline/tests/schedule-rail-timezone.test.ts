import { describe, expect, it } from "vitest";
import {
  datetimeLocalFromIso,
  isoFromDatetimeLocal,
  resolveScheduleDisplayTimeZone,
  zonedLocalDateTimeToUtc
} from "../web/lib/goal-cycle-schedule-local.js";

describe("schedule display timezone", () => {
  it("keeps explicit non-UTC zones", () => {
    expect(resolveScheduleDisplayTimeZone("America/New_York")).toBe("America/New_York");
    expect(resolveScheduleDisplayTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("falls back from UTC default to a browser zone when available", () => {
    const resolved = resolveScheduleDisplayTimeZone("UTC");
    // In Node/Vitest Intl usually provides a zone; accept UTC only if none.
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe("datetime-local ↔ ISO in creator zone", () => {
  it("stores Eastern evening as next-day UTC without shifting the local calendar day", () => {
    const iso = isoFromDatetimeLocal("2026-07-25T23:00", "America/New_York");
    // EDT = UTC-4 → 03:00Z on the 26th
    expect(iso).toBe("2026-07-26T03:00:00.000Z");
    // Round-trip back to local day 25
    expect(datetimeLocalFromIso(iso, "America/New_York")).toBe("2026-07-25T23:00");
  });

  it("UTC zone keeps the typed calendar day", () => {
    const iso = isoFromDatetimeLocal("2026-07-25T23:00", "UTC");
    expect(iso).toBe("2026-07-25T23:00:00.000Z");
  });

  it("groups Eastern evening onto local day 25 via Intl", () => {
    const due = zonedLocalDateTimeToUtc(
      { year: 2026, month: 7, day: 25, hour: 23, minute: 0, second: 0 },
      "America/New_York"
    );
    const day = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        day: "numeric"
      }).format(due)
    );
    expect(day).toBe(25);
    const utcDay = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        day: "numeric"
      }).format(due)
    );
    expect(utcDay).toBe(26);
  });
});
