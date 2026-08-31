import { describe, expect, it } from "vitest";
import {
  compileFinitePlan,
  lab2FixtureWeeklyDueDates,
  LAB2_FIXTURE_WEEKLY_START_UTC
} from "../../../src/studio/command/finite-plan-compiler.js";

function localParts(iso: string, timeZone: string): { weekday: number; hour: number; day: number; month: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    day: "2-digit",
    month: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(new Date(iso));
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayName = read("weekday");
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return {
    weekday: map[weekdayName] ?? -1,
    hour: Number(read("hour")) % 24,
    day: Number(read("day")),
    month: Number(read("month"))
  };
}

describe("finite plan compiler (RC-P9-T01)", () => {
  it("snaps a Thursday start to Saturday and steps weekly in America/New_York", () => {
    const slots = compileFinitePlan({
      frozen_post_ids: ["p1", "p2", "p3"],
      time_zone: "America/New_York",
      weekday: "saturday",
      interval_days: 7,
      start_local: "2026-08-27T19:00:00"
    });
    expect(slots.map((s) => s.post_id)).toEqual(["p1", "p2", "p3"]);
    expect(localParts(slots[0]!.due_at, "America/New_York")).toMatchObject({
      weekday: 6,
      hour: 19,
      day: 29,
      month: 8
    });
    expect(localParts(slots[1]!.due_at, "America/New_York")).toMatchObject({
      weekday: 6,
      hour: 19,
      day: 5,
      month: 9
    });
  });

  it("keeps 19:00 local across US Eastern DST spring-forward and fall-back", () => {
    const spring = compileFinitePlan({
      frozen_post_ids: ["a", "b", "c"],
      time_zone: "America/New_York",
      weekday: 6,
      interval_days: 7,
      start_local: "2026-02-28T19:00:00"
    });
    expect(spring.map((s) => localParts(s.due_at, "America/New_York"))).toEqual([
      { weekday: 6, hour: 19, day: 28, month: 2 },
      { weekday: 6, hour: 19, day: 7, month: 3 },
      { weekday: 6, hour: 19, day: 14, month: 3 }
    ]);
    expect(new Date(spring[0]!.due_at).toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(new Date(spring[1]!.due_at).toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(new Date(spring[2]!.due_at).toISOString()).toBe("2026-03-14T23:00:00.000Z");

    const fall = compileFinitePlan({
      frozen_post_ids: ["a", "b"],
      time_zone: "America/New_York",
      weekday: 6,
      interval_days: 7,
      start_local: "2026-10-24T19:00:00"
    });
    expect(localParts(fall[0]!.due_at, "America/New_York")).toMatchObject({ hour: 19, day: 24, month: 10 });
    expect(localParts(fall[1]!.due_at, "America/New_York")).toMatchObject({ hour: 19, day: 31, month: 10 });
    expect(new Date(fall[0]!.due_at).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(new Date(fall[1]!.due_at).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("skips destination and plan exclusions, then honors a slot override without shifting neighbors", () => {
    const slots = compileFinitePlan({
      frozen_post_ids: ["cover", "p1", "p2", "p3"],
      skip_post_ids: ["cover"],
      exclude_post_ids: ["p2"],
      time_zone: "UTC",
      weekday: 4,
      interval_days: 7,
      start_local: "2026-08-27T19:00:00",
      slot_overrides: { p1: "2026-09-01T12:00:00.000Z" }
    });
    expect(slots.map((s) => s.post_id)).toEqual(["p1", "p3"]);
    expect(slots[0]!.due_at).toBe("2026-09-01T12:00:00.000Z");
    expect(slots[1]!.due_at).toBe("2026-09-03T19:00:00.000Z");
  });

  it("rejects invalid IANA zones and does not use the Lab 2 fixture week as a compiler default", () => {
    expect(() =>
      compileFinitePlan({
        frozen_post_ids: ["p1"],
        time_zone: "Not/AZone",
        weekday: 6,
        interval_days: 7,
        start_local: "2026-08-29T19:00:00"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
    expect(lab2FixtureWeeklyDueDates(1)[0]!.toISOString()).toBe(LAB2_FIXTURE_WEEKLY_START_UTC);
    const slots = compileFinitePlan({
      frozen_post_ids: ["p1"],
      time_zone: "UTC",
      weekday: 6,
      interval_days: 7,
      start_local: "2026-08-29T19:00:00"
    });
    expect(slots[0]!.due_at).not.toBe(LAB2_FIXTURE_WEEKLY_START_UTC);
  });
});
