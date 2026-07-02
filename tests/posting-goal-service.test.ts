import { describe, expect, it, vi } from "vitest";
import {
  PostSource,
  PostUpstreamStatus,
  MediaIngestOrigin,
  MediaProcessingStatus
} from "@prisma/client";
import {
  DEFAULT_MONTHLY_POST_TARGET,
  DRAFT_PUBLISHED_AT,
  PostingGoalNotFoundError,
  PostingGoalValidationError,
  computePaceStatus,
  countRelayNativePostsInWindow,
  creatorLocalMonthWindow,
  creatorLocalPeriodKey,
  getCreatorPostingGoal,
  getCreatorPostingGoalStatus,
  putCreatorPostingGoal,
  resolvePostingGoalTimezone,
  skipCreatorPostingNudge,
  skipCurrentCreatorPostingNudge,
  snoozeCreatorPostingNudge,
  snoozeCurrentCreatorPostingNudge,
  zonedMidnightUtc
} from "../src/autopost/posting-goal-service.js";

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("posting-goal-service helpers", () => {
  it("resolves invalid timezone to UTC", () => {
    expect(resolvePostingGoalTimezone("Not/AZone")).toBe("UTC");
    expect(resolvePostingGoalTimezone("America/New_York")).toBe("America/New_York");
  });

  it("builds creator-local month windows in UTC", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    expect(creatorLocalPeriodKey(now, "UTC")).toBe("2026-06");
    const window = creatorLocalMonthWindow(now, "UTC");
    expect(window.key).toBe("2026-06");
    expect(window.start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("finds zoned midnight for America/New_York", () => {
    const start = zonedMidnightUtc(2026, 6, 1, "America/New_York");
    expect(start.toISOString()).toBe("2026-06-01T04:00:00.000Z");
  });

  it("computes pace status states", () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    expect(
      computePaceStatus({
        postsThisMonth: 1,
        monthlyPostTarget: 1,
        bonusNudgesEnabled: false,
        stagedMediaCount: 0,
        now,
        timeZone: "UTC"
      })
    ).toBe("complete");
    expect(
      computePaceStatus({
        postsThisMonth: 1,
        monthlyPostTarget: 1,
        bonusNudgesEnabled: true,
        stagedMediaCount: 2,
        now,
        timeZone: "UTC"
      })
    ).toBe("bonus_available");
    expect(
      computePaceStatus({
        postsThisMonth: 0,
        monthlyPostTarget: 1,
        bonusNudgesEnabled: false,
        stagedMediaCount: 0,
        now,
        timeZone: "UTC"
      })
    ).toBe("behind");
  });
});

describe("posting-goal-service reads and writes", () => {
  it("returns default goal when no row exists", async () => {
    const prisma = prismaStub({
      creatorPostingGoal: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    });
    const goal = await getCreatorPostingGoal(prisma, "cr1");
    expect(goal.monthly_post_target).toBe(DEFAULT_MONTHLY_POST_TARGET);
    expect(goal.is_default).toBe(true);
    expect(goal.updated_at).toBeNull();
  });

  it("validates monthly_post_target on put", async () => {
    const prisma = prismaStub({
      creatorPostingGoal: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn()
      }
    });
    await expect(
      putCreatorPostingGoal(prisma, "cr1", { monthly_post_target: 0 })
    ).rejects.toBeInstanceOf(PostingGoalValidationError);
    await expect(
      putCreatorPostingGoal(prisma, "cr1", { monthly_post_target: 32 })
    ).rejects.toBeInstanceOf(PostingGoalValidationError);
  });

  it("round-trips put then get", async () => {
    const stored = {
      creatorId: "cr1",
      monthlyPostTarget: 3,
      bonusNudgesEnabled: true,
      timezone: "America/New_York",
      enabled: true,
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    };
    const prisma = prismaStub({
      creatorPostingGoal: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(stored)
      }
    });
    const saved = await putCreatorPostingGoal(prisma, "cr1", {
      monthly_post_target: 3,
      bonus_nudges_enabled: true,
      timezone: "America/New_York"
    });
    expect(saved.monthly_post_target).toBe(3);
    expect(saved.bonus_nudges_enabled).toBe(true);
    expect(saved.is_default).toBe(false);
  });

  it("counts only Relay-native published posts in the month window", async () => {
    const prisma = prismaStub({
      post: {
        count: vi.fn().mockResolvedValue(2)
      }
    });
    const window = creatorLocalMonthWindow(new Date("2026-06-15T00:00:00.000Z"), "UTC");
    await countRelayNativePostsInWindow(prisma, "cr1", window);
    expect(prisma.post.count).toHaveBeenCalledWith({
      where: {
        creatorId: "cr1",
        source: PostSource.RELAY,
        upstreamStatus: PostUpstreamStatus.active,
        versions: {
          some: {
            publishedAt: {
              gt: DRAFT_PUBLISHED_AT,
              gte: window.start,
              lt: window.end
            }
          }
        }
      }
    });
  });

  it("returns status shape with staged media count and null nudge", async () => {
    const prisma = prismaStub({
      creatorPostingGoal: {
        findUnique: vi.fn().mockResolvedValue({
          creatorId: "cr1",
          monthlyPostTarget: 2,
          bonusNudgesEnabled: false,
          timezone: "UTC",
          enabled: true,
          updatedAt: new Date("2026-06-01T00:00:00.000Z")
        })
      },
      post: { count: vi.fn().mockResolvedValue(1) },
      mediaAsset: { count: vi.fn().mockResolvedValue(4) },
      creatorPostingNudge: { findMany: vi.fn().mockResolvedValue([]) }
    });
    const status = await getCreatorPostingGoalStatus(
      prisma,
      "cr1",
      new Date("2026-06-10T00:00:00.000Z")
    );
    expect(status.posts_this_month).toBe(1);
    expect(status.remaining).toBe(1);
    expect(status.staged_media_count).toBe(4);
    expect(status.period.key).toBe("2026-06");
    expect(status.active_nudge).toBeNull();
    expect(prisma.mediaAsset.count).toHaveBeenCalledWith({
      where: {
        creatorId: "cr1",
        ingestOrigin: { in: [MediaIngestOrigin.DISCORD, MediaIngestOrigin.RELAY_UPLOAD] },
        primaryPostId: null,
        autopostDraftId: null,
        processingStatus: MediaProcessingStatus.READY
      }
    });
  });
});

describe("posting-goal nudge transitions", () => {
  it("snoozes an owned nudge", async () => {
    const existing = {
      id: "n1",
      creatorId: "cr1",
      periodKey: "2026-06",
      nudgeType: "posting_goal",
      status: "active",
      snoozedUntil: null,
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    };
    const prisma = prismaStub({
      creatorPostingNudge: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...existing,
            status: data.status,
            snoozedUntil: data.snoozedUntil,
            updatedAt: new Date("2026-06-02T00:00:00.000Z")
          })
        )
      }
    });
    const now = new Date("2026-06-01T00:00:00.000Z");
    const nudge = await snoozeCreatorPostingNudge(
      prisma,
      "cr1",
      "n1",
      "2026-06-08T00:00:00.000Z",
      now
    );
    expect(nudge.status).toBe("snoozed");
    expect(nudge.snoozed_until).toBe("2026-06-08T00:00:00.000Z");
  });

  it("skip is idempotent", async () => {
    const existing = {
      id: "n1",
      creatorId: "cr1",
      periodKey: "2026-06",
      nudgeType: "posting_goal",
      status: "skipped",
      snoozedUntil: null,
      updatedAt: new Date("2026-06-01T00:00:00.000Z")
    };
    const prisma = prismaStub({
      creatorPostingNudge: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn()
      }
    });
    const nudge = await skipCreatorPostingNudge(prisma, "cr1", "n1");
    expect(nudge.status).toBe("skipped");
    expect(prisma.creatorPostingNudge.update).not.toHaveBeenCalled();
  });

  it("throws when nudge is not owned by creator", async () => {
    const prisma = prismaStub({
      creatorPostingNudge: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    });
    await expect(skipCreatorPostingNudge(prisma, "cr1", "missing")).rejects.toBeInstanceOf(
      PostingGoalNotFoundError
    );
  });

  it("creates a current-month nudge when skipping without an existing row", async () => {
    const now = new Date("2026-06-10T00:00:00.000Z");
    const created = {
      id: "n-new",
      creatorId: "cr1",
      periodKey: "2026-06",
      nudgeType: "posting_goal",
      status: "active",
      snoozedUntil: null,
      updatedAt: now
    };
    const prisma = prismaStub({
      creatorPostingGoal: {
        findUnique: vi.fn().mockResolvedValue({
          creatorId: "cr1",
          monthlyPostTarget: 1,
          bonusNudgesEnabled: false,
          timezone: "UTC",
          enabled: true,
          updatedAt: now
        })
      },
      post: { count: vi.fn().mockResolvedValue(0) },
      mediaAsset: { count: vi.fn().mockResolvedValue(0) },
      creatorPostingNudge: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue(created),
        findFirst: vi.fn().mockResolvedValue(created),
        update: vi.fn().mockResolvedValue({ ...created, status: "skipped" })
      }
    });
    const nudge = await skipCurrentCreatorPostingNudge(prisma, "cr1", now);
    expect(nudge.status).toBe("skipped");
    expect(prisma.creatorPostingNudge.upsert).toHaveBeenCalled();
  });
});
