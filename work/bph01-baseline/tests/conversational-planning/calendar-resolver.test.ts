import { afterEach, describe, expect, it } from "vitest";
import type { TimeSpec } from "../../src/conversational-planning/contract.js";
import type { RequestIntent } from "../../src/conversational-planning/intent.js";
import { createCalendarResolver, resolveAbsoluteTime } from "../../src/conversational-planning/calendar-resolver.js";

const base = (overrides: Partial<RequestIntent> = {}): RequestIntent => ({
  command: "add", target_handle: null, changed_fields: [], kind: "teaser",
  source_ref: { mode: "selection", id: null }, destination: "x", title_mode: "none", title_text: null,
  template_ref: { mode: "none", value: null }, enabled: true, delivery_intent: "prepare_for_creator_handoff",
  social_action: null, time_kind: "absolute_local", local_date: "2026-10-16", weekday: null,
  weekday_qualifier: null, timezone: "Europe/London", day_offset: null, target_destination: null,
  local_time: "17:30", time_text: "Friday at 17:30", request_quote: "Friday at 17:30", ...overrides
});
const clock = (receivedAtUtc: string, timezone: string | null = "Europe/London") => ({ receivedAtUtc, timezone });
const result = (intent: RequestIntent, receivedAtUtc: string, zone: string | null = "Europe/London", previous?: Extract<TimeSpec, { kind: "absolute" }>) =>
  resolveAbsoluteTime(intent, clock(receivedAtUtc, zone), zone, previous);

describe("resolveAbsoluteTime", () => {
  it("resolves an explicit local date/time to exact local and UTC values", () => {
    expect(result(base(), "2026-10-15T12:00:00.000Z")).toEqual({ kind: "resolved", time: {
      kind: "absolute", at_utc: "2026-10-16T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-16T17:30"
    } });
  });

  it("uses the supplied IANA zone for another region", () => {
    const intent = base({ timezone: "America/New_York", local_date: "2026-01-15", local_time: "09:15" });
    expect(result(intent, "2026-01-01T00:00:00Z", "America/New_York")).toMatchObject({ kind: "resolved", time: {
      at_utc: "2026-01-15T14:15:00.000Z", timezone: "America/New_York", local: "2026-01-15T09:15"
    } });
  });

  it("allows an unqualified weekday today only while its resolved instant is future", () => {
    const intent = base({ time_kind: "weekday", local_date: null, weekday: "thursday", weekday_qualifier: null, local_time: "18:00" });
    expect(result(intent, "2026-10-15T16:00:00Z")).toMatchObject({ kind: "resolved", time: { local: "2026-10-15T18:00", at_utc: "2026-10-15T17:00:00.000Z" } });
    expect(result(intent, "2026-10-15T17:00:00Z")).toMatchObject({ kind: "resolved", time: { local: "2026-10-22T18:00", at_utc: "2026-10-22T17:00:00.000Z" } });
  });

  it("clarifies for a past this-week weekday and resolves next into the following ISO week", () => {
    const thisFriday = base({ time_kind: "weekday", local_date: null, weekday: "friday", weekday_qualifier: "this", local_time: "09:00" });
    expect(result(thisFriday, "2026-10-16T10:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    const nextFriday = base({ time_kind: "weekday", local_date: null, weekday: "friday", weekday_qualifier: "next", local_time: "09:00" });
    expect(result(nextFriday, "2026-10-15T12:00:00Z")).toMatchObject({ kind: "resolved", time: { local: "2026-10-23T09:00", at_utc: "2026-10-23T08:00:00.000Z" } });
  });

  it("handles ISO week and calendar year rollover", () => {
    const nextSunday = base({ time_kind: "weekday", local_date: null, weekday: "sunday", weekday_qualifier: "next", local_time: "10:00" });
    expect(result(nextSunday, "2026-12-31T12:00:00Z")).toMatchObject({ kind: "resolved", time: { local: "2027-01-10T10:00", at_utc: "2027-01-10T10:00:00.000Z" } });
    const upcomingFriday = base({ time_kind: "weekday", local_date: null, weekday: "friday", weekday_qualifier: null, local_time: "17:30" });
    expect(result(upcomingFriday, "2026-12-31T12:00:00Z")).toMatchObject({ kind: "resolved", time: { local: "2027-01-01T17:30" } });
  });

  it("advances a nonexistent spring wall time to the first valid same-day minute", () => {
    const gap = base({ local_date: "2026-03-29", local_time: "01:30" });
    expect(result(gap, "2026-03-01T00:00:00Z")).toEqual({ kind: "resolved", time: {
      kind: "absolute", at_utc: "2026-03-29T01:00:00.000Z", timezone: "Europe/London", local: "2026-03-29T02:00"
    } });
  });

  it("chooses the earlier UTC occurrence in a fall fold", () => {
    const fold = base({ local_date: "2026-10-25", local_time: "01:30" });
    expect(result(fold, "2026-10-01T00:00:00Z")).toEqual({ kind: "resolved", time: {
      kind: "absolute", at_utc: "2026-10-25T00:30:00.000Z", timezone: "Europe/London", local: "2026-10-25T01:30"
    } });
  });

  it("rejects impossible calendar dates, missing time or zone, invalid clock, and model-zone mismatch", () => {
    expect(result(base({ local_date: "2026-02-30" }), "2026-02-01T00:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base({ local_time: null }), "2026-10-15T12:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base({ local_time: "25:99" }), "2026-10-15T12:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base(), "not-a-clock")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base(), "2026-02-30T12:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base(), "2026-10-15T12:00:00Z", null)).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base(), "2026-10-15T12:00:00Z", "Invalid/Zone")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(base({ timezone: "America/New_York" }), "2026-10-15T12:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(resolveAbsoluteTime(base(), clock("2026-10-15T12:00:00Z", "America/New_York"), "Europe/London")).toEqual({ kind: "clarification", reason: "unknown_time" });
  });

  it("inherits only a previously confirmed local time in the frozen zone", () => {
    const weekday = base({ time_kind: "weekday", local_date: null, weekday: "friday", weekday_qualifier: null, local_time: null });
    const confirmed = { kind: "absolute", at_utc: "2026-10-14T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-14T17:30" } as const;
    expect(result(weekday, "2026-10-15T12:00:00Z", "Europe/London", confirmed)).toMatchObject({ kind: "resolved", time: { local: "2026-10-16T17:30" } });
    expect(result(weekday, "2026-10-15T12:00:00Z")).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(weekday, "2026-10-15T12:00:00Z", "Europe/London", { ...confirmed, timezone: "UTC" })).toEqual({ kind: "clarification", reason: "unknown_time" });
  });

  it("inherits a coherent confirmed time for an explicit date and rejects incoherent prior time", () => {
    const explicitDate = base({ local_date: "2026-10-20", local_time: null });
    const confirmed = { kind: "absolute", at_utc: "2026-10-14T16:30:00.000Z", timezone: "Europe/London", local: "2026-10-14T17:30" } as const;
    expect(result(explicitDate, "2026-10-15T12:00:00Z", "Europe/London", confirmed)).toMatchObject({
      kind: "resolved", time: { local: "2026-10-20T17:30", at_utc: "2026-10-20T16:30:00.000Z" }
    });
    expect(result(explicitDate, "2026-10-15T12:00:00Z", "Europe/London", { ...confirmed, at_utc: "2026-02-30T16:30:00Z" })).toEqual({ kind: "clarification", reason: "unknown_time" });
    expect(result(explicitDate, "2026-10-15T12:00:00Z", "Europe/London", { ...confirmed, local: "2026-10-14T18:30" })).toEqual({ kind: "clarification", reason: "unknown_time" });
  });

  it("does not depend on the host process timezone and exposes the compiler adapter", async () => {
    const previousTz = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Honolulu";
      const first = result(base(), "2026-10-15T12:00:00Z");
      process.env.TZ = "Asia/Tokyo";
      expect(result(base(), "2026-10-15T12:00:00Z")).toEqual(first);
      const resolved = await createCalendarResolver().resolve({ request: base(), requestClock: clock("2026-10-15T12:00:00Z") });
      expect(resolved).toEqual(first.kind === "resolved" ? first.time : null);
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});
