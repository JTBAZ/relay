import { describe, expect, it, vi } from "vitest";
import {
  createActivePostingNudgeIfAbsent,
  hasBlockingCreatorPostingNudge
} from "../src/autopost/posting-goal-service.js";
import {
  postingGoalNudgeRepeatEveryMsFromEnv,
  processPostingGoalNudgeForCreator,
  runPostingGoalNudgeOnce
} from "../src/autopost/posting-goal-nudge-worker.js";

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

const goalRow = {
  creatorId: "cr1",
  monthlyPostTarget: 1,
  bonusNudgesEnabled: true,
  timezone: "UTC",
  enabled: true
};

const now = new Date("2026-06-10T00:00:00.000Z");

describe("posting-goal nudge worker", () => {
  it("creates a posting_goal nudge when behind target and none exists", async () => {
    const create = vi.fn().mockResolvedValue({ id: "n1" });
    const prisma = prismaStub({
      post: { count: vi.fn().mockResolvedValue(0) },
      mediaAsset: { count: vi.fn().mockResolvedValue(0) },
      creatorPostingNudge: {
        findMany: vi.fn().mockResolvedValue([]),
        create
      }
    });

    const result = await processPostingGoalNudgeForCreator(prisma, goalRow, now);
    expect(result.posting_goal_nudge_created).toBe(true);
    expect(result.bonus_post_nudge_created).toBe(false);
    expect(create).toHaveBeenCalledWith({
      data: {
        creatorId: "cr1",
        periodKey: "2026-06",
        nudgeType: "posting_goal",
        status: "active"
      }
    });
  });

  it("is idempotent when a blocking posting_goal nudge already exists", async () => {
    const create = vi.fn();
    const prisma = prismaStub({
      post: { count: vi.fn().mockResolvedValue(0) },
      mediaAsset: { count: vi.fn().mockResolvedValue(0) },
      creatorPostingNudge: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "n1",
            nudgeType: "posting_goal",
            status: "active",
            snoozedUntil: null
          }
        ]),
        create
      }
    });

    const result = await processPostingGoalNudgeForCreator(prisma, goalRow, now);
    expect(result.posting_goal_nudge_created).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not recreate a skipped posting_goal nudge in the same month", async () => {
    const create = vi.fn();
    const prisma = prismaStub({
      post: { count: vi.fn().mockResolvedValue(0) },
      mediaAsset: { count: vi.fn().mockResolvedValue(0) },
      creatorPostingNudge: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "n1",
            nudgeType: "posting_goal",
            status: "skipped",
            snoozedUntil: null
          }
        ]),
        create
      }
    });

    const result = await processPostingGoalNudgeForCreator(prisma, goalRow, now);
    expect(result.posting_goal_nudge_created).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a separate bonus_post nudge when target is met and bonus media exists", async () => {
    const create = vi.fn().mockResolvedValue({ id: "bonus1" });
    const prisma = prismaStub({
      post: { count: vi.fn().mockResolvedValue(1) },
      mediaAsset: { count: vi.fn().mockResolvedValue(3) },
      creatorPostingNudge: {
        findMany: vi.fn().mockResolvedValue([]),
        create
      }
    });

    const result = await processPostingGoalNudgeForCreator(prisma, goalRow, now);
    expect(result.posting_goal_nudge_created).toBe(false);
    expect(result.bonus_post_nudge_created).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        creatorId: "cr1",
        periodKey: "2026-06",
        nudgeType: "bonus_post",
        status: "active"
      }
    });
  });

  it("scans enabled goals in runPostingGoalNudgeOnce", async () => {
    const create = vi.fn().mockResolvedValue({ id: "n1" });
    const prisma = prismaStub({
      creatorPostingGoal: {
        findMany: vi.fn().mockResolvedValue([goalRow])
      },
      post: { count: vi.fn().mockResolvedValue(0) },
      mediaAsset: { count: vi.fn().mockResolvedValue(0) },
      creatorPostingNudge: {
        findMany: vi.fn().mockResolvedValue([]),
        create
      }
    });

    const summary = await runPostingGoalNudgeOnce(prisma, { now });
    expect(summary.creators_scanned).toBe(1);
    expect(summary.posting_goal_nudges_created).toBe(1);
  });

  it("defaults posting goal nudge interval to daily and disables on 0", () => {
    expect(postingGoalNudgeRepeatEveryMsFromEnv({})).toBe(24 * 60 * 60 * 1000);
    expect(postingGoalNudgeRepeatEveryMsFromEnv({ RELAY_POSTING_GOAL_NUDGE_MS: "0" })).toBeNull();
    expect(
      postingGoalNudgeRepeatEveryMsFromEnv({ RELAY_POSTING_GOAL_NUDGE_MS: "120000" })
    ).toBe(120_000);
  });
});

describe("posting-goal nudge blocking helpers", () => {
  it("treats active snooze windows as blocking", () => {
    expect(
      hasBlockingCreatorPostingNudge(
        [
          {
            nudgeType: "posting_goal",
            status: "snoozed",
            snoozedUntil: new Date("2026-06-20T00:00:00.000Z")
          }
        ],
        "posting_goal",
        now
      )
    ).toBe(true);
  });

  it("createActivePostingNudgeIfAbsent ignores unique races", async () => {
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const prisma = prismaStub({ creatorPostingNudge: { create } });
    const created = await createActivePostingNudgeIfAbsent(
      prisma,
      "cr1",
      "2026-06",
      "posting_goal",
      [],
      now
    );
    expect(created).toBe(false);
  });
});
