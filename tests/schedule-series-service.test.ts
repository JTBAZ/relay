import { describe, expect, it } from "vitest";
import {
  enumerateOccurrenceKeysWithTime,
  twoMonthHorizonEnd,
  MATERIALIZE_LEAD_DAYS
} from "../src/autopost/schedule-series-service.js";
import {
  scheduleSeriesRepeatEveryMsFromEnv,
  DEFAULT_SCHEDULE_SERIES_INTERVAL_MS
} from "../src/autopost/schedule-series-worker.js";
import {
  distributionRulesRepeatEveryMsFromEnv,
  DEFAULT_DISTRIBUTION_RULES_INTERVAL_MS
} from "../src/autopost/distribution-rule-worker.js";
import { RELAY_JOB_QUEUE_NAMES, ALL_RELAY_JOB_QUEUE_NAMES } from "../src/jobs/queue-names.js";

describe("schedule-series occurrence expansion", () => {
  it("enumerates weekly days inside the two-month horizon", () => {
    const startsAt = new Date("2026-07-01T14:00:00.000Z");
    const horizon = twoMonthHorizonEnd(startsAt, "UTC");
    const rows = enumerateOccurrenceKeysWithTime({
      cadence: "weekly",
      interval: 1,
      weekdays: [3], // Wednesday
      monthDays: [],
      timezone: "UTC",
      startsAt,
      endsAt: null,
      horizonEnd: horizon,
      hour: 14,
      minute: 0
    });
    expect(rows.length).toBeGreaterThan(4);
    expect(rows.every((r) => r.dueAt.getTime() < horizon.getTime())).toBe(true);
    expect(rows[0]?.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("clamps monthly day 31 to short months", () => {
    const startsAt = new Date("2026-01-31T15:00:00.000Z");
    const horizon = twoMonthHorizonEnd(startsAt, "UTC");
    const rows = enumerateOccurrenceKeysWithTime({
      cadence: "monthly",
      interval: 1,
      weekdays: [],
      monthDays: [31],
      timezone: "UTC",
      startsAt,
      endsAt: null,
      horizonEnd: horizon,
      hour: 15,
      minute: 0
    });
    const feb = rows.find((r) => r.key.startsWith("2026-02-"));
    expect(feb?.key).toBe("2026-02-28");
  });

  it("twoMonthHorizonEnd is exclusive start of month +2", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const end = twoMonthHorizonEnd(now, "UTC");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("exposes seven-day materialize lead constant", () => {
    expect(MATERIALIZE_LEAD_DAYS).toBe(7);
  });
});

describe("autopost routine workers env", () => {
  it("defaults schedule series interval to 1h", () => {
    expect(scheduleSeriesRepeatEveryMsFromEnv({})).toBe(DEFAULT_SCHEDULE_SERIES_INTERVAL_MS);
    expect(scheduleSeriesRepeatEveryMsFromEnv({ RELAY_AUTOPOST_SCHEDULE_SERIES_MS: "0" })).toBeNull();
    expect(
      scheduleSeriesRepeatEveryMsFromEnv({ RELAY_AUTOPOST_SCHEDULE_SERIES_MS: "120000" })
    ).toBe(120000);
  });

  it("defaults distribution rules interval to 1h", () => {
    expect(distributionRulesRepeatEveryMsFromEnv({})).toBe(
      DEFAULT_DISTRIBUTION_RULES_INTERVAL_MS
    );
    expect(
      distributionRulesRepeatEveryMsFromEnv({ RELAY_AUTOPOST_DISTRIBUTION_RULES_MS: "0" })
    ).toBeNull();
  });

  it("registers queue names in ALL_RELAY_JOB_QUEUE_NAMES", () => {
    expect(ALL_RELAY_JOB_QUEUE_NAMES).toContain(RELAY_JOB_QUEUE_NAMES.AUTOPOST_SCHEDULE_SERIES);
    expect(ALL_RELAY_JOB_QUEUE_NAMES).toContain(
      RELAY_JOB_QUEUE_NAMES.AUTOPOST_DISTRIBUTION_RULES
    );
  });
});
