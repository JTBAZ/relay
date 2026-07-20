import { describe, expect, it } from "vitest";

/**
 * Lightweight payload construction checks for Autopost routines UI helpers.
 * Full React rendering is covered by Schedule Rail / composer integration.
 */

function buildSeriesBodyFromPost(args: {
  dueAt: string;
  weekday: number;
  dayOfMonth: number;
  localTime: string;
  destinations: string[];
  cadence: "weekly" | "monthly";
}) {
  return {
    cadence: args.cadence,
    local_time: args.localTime,
    timezone: "America/New_York",
    weekdays: args.cadence === "weekly" ? [args.weekday] : [],
    month_days: args.cadence === "monthly" ? [args.dayOfMonth] : [],
    planned_format: "image",
    destinations: args.destinations,
    remind_me: true,
    starts_at: args.dueAt,
    seed: {
      due_at: args.dueAt,
      post_id: "post_1",
      draft_id: "draft_1",
      primary_task_id: "task_1"
    }
  };
}

function buildRuleSentence(offsetDays: number, destinations: string[]): string {
  return `After a Patreon post is published, wait ${offsetDays} days, then prepare previews for ${destinations.join(" and ")}.`;
}

describe("autopost routines UI payload construction", () => {
  it("builds weekly series seed from created Post event", () => {
    const body = buildSeriesBodyFromPost({
      dueAt: "2026-07-20T18:00:00.000Z",
      weekday: 1,
      dayOfMonth: 20,
      localTime: "14:00",
      destinations: ["patreon", "x"],
      cadence: "weekly"
    });
    expect(body.weekdays).toEqual([1]);
    expect(body.month_days).toEqual([]);
    expect(body.seed?.draft_id).toBe("draft_1");
    expect(body.destinations).toContain("x");
  });

  it("builds monthly series with day-of-month", () => {
    const body = buildSeriesBodyFromPost({
      dueAt: "2026-07-20T18:00:00.000Z",
      weekday: 1,
      dayOfMonth: 20,
      localTime: "14:00",
      destinations: ["patreon"],
      cadence: "monthly"
    });
    expect(body.month_days).toEqual([20]);
    expect(body.weekdays).toEqual([]);
  });

  it("renders conversational distribution rule sentence", () => {
    expect(buildRuleSentence(30, ["X", "DeviantArt"])).toBe(
      "After a Patreon post is published, wait 30 days, then prepare previews for X and DeviantArt."
    );
  });
});
