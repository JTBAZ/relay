import { describe, expect, it, vi } from "vitest";
import {
  buildPostbotTasksForVariant,
  persistPostbotTasksForPlan,
  updatePostbotTaskStatus,
  PostbotTaskNotFoundError
} from "../src/distribution/postbot-task-service.js";

describe("postbot-task-service", () => {
  it("builds post and schedule tasks from assistant advice", () => {
    const tasks = buildPostbotTasksForVariant({
      advice: {
        rationale: "Lead with a hook on X.",
        suggested_post_time: "2026-07-07T23:00:00.000Z"
      },
      goals: [],
      destination: "x"
    });
    expect(tasks.map((task) => task.action)).toEqual(["post", "schedule"]);
    expect(tasks[0]?.rationale).toContain("hook");
    expect(tasks[1]?.suggestedTime?.toISOString()).toBe("2026-07-07T23:00:00.000Z");
  });

  it("adds engagement and audience tasks when goals match", () => {
    const tasks = buildPostbotTasksForVariant({
      advice: { rationale: "Optimize copy." },
      goals: ["engagement_optimization", "new_audience_testing"],
      destination: "x"
    });
    expect(tasks.map((task) => task.action)).toEqual([
      "post",
      "pin_comment",
      "repost"
    ]);
  });

  it("persists tasks only for assistant-enabled variants", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        id: "task1",
        creatorId: "cr1",
        postId: "post1",
        planId: "plan1",
        variantId: "var1",
        destination: "x",
        action: "post",
        rationale: "Post when ready.",
        suggestedTime: null,
        link: null,
        status: "pending",
        createdAt: new Date("2026-07-06T12:00:00.000Z"),
        updatedAt: new Date("2026-07-06T12:00:00.000Z")
      })
      .mockResolvedValueOnce({
        id: "task2",
        creatorId: "cr1",
        postId: "post1",
        planId: "plan1",
        variantId: "var1",
        destination: "x",
        action: "schedule",
        rationale: "Schedule it.",
        suggestedTime: new Date("2026-07-07T23:00:00.000Z"),
        link: null,
        status: "pending",
        createdAt: new Date("2026-07-06T12:00:00.000Z"),
        updatedAt: new Date("2026-07-06T12:00:00.000Z")
      });
    const prisma = { postbotTask: { create } } as any;

    const created = await persistPostbotTasksForPlan(prisma, {
      creatorId: "cr1",
      postId: "post1",
      planId: "plan1",
      variants: [
        {
          id: "var1",
          destination: "x",
          assistantEnabled: true,
          advice: {
            rationale: "Post when ready.",
            suggested_post_time: "2026-07-07T23:00:00.000Z"
          }
        },
        {
          id: "var2",
          destination: "patreon",
          assistantEnabled: false,
          advice: { rationale: "Ignored." }
        }
      ],
      assistantContext: { goals: [] }
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
    expect(created[0]?.action).toBe("post");
    expect(created[1]?.action).toBe("schedule");
  });

  it("appends studio brief notes to post rationale when present", () => {
    const tasks = buildPostbotTasksForVariant({
      advice: { rationale: "Lead with a hook." },
      goals: [],
      destination: "x",
      brief_notes: "Keep tone grounded and short"
    });
    expect(tasks[0]?.rationale).toContain("Lead with a hook.");
    expect(tasks[0]?.rationale).toContain("Studio brief: Keep tone grounded and short");
  });

  it("merges studio brief goals when plan context is empty", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "task1",
      creatorId: "cr1",
      postId: "post1",
      planId: "plan1",
      variantId: "var1",
      destination: "x",
      action: "post",
      rationale: "Post when ready. Studio brief: Keep grounded",
      suggestedTime: null,
      link: null,
      status: "pending",
      createdAt: new Date("2026-07-06T12:00:00.000Z"),
      updatedAt: new Date("2026-07-06T12:00:00.000Z")
    });
    const prisma = {
      postbotTask: { create },
      creatorStudioBrief: {
        findUnique: vi.fn().mockResolvedValue({
          creatorId: "cr1",
          goals: ["engagement_optimization"],
          userNotes: "Keep grounded",
          locale: null,
          trendNote: null,
          updatedAt: new Date("2026-07-06T12:00:00.000Z")
        })
      }
    } as any;

    await persistPostbotTasksForPlan(prisma, {
      creatorId: "cr1",
      postId: "post1",
      planId: "plan1",
      variants: [
        {
          id: "var1",
          destination: "x",
          assistantEnabled: true,
          advice: { rationale: "Post when ready." }
        }
      ],
      assistantContext: { goals: [] }
    });

    expect(create).toHaveBeenCalledTimes(2); // post + pin_comment from engagement goal
    const first = create.mock.calls[0]?.[0]?.data;
    expect(first?.action).toBe("post");
    expect(first?.rationale).toContain("Studio brief: Keep grounded");
    expect(create.mock.calls[1]?.[0]?.data?.action).toBe("pin_comment");
  });

  it("updates task status for owned tasks", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({ id: "task1", creatorId: "cr1" }),
        update: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          planId: "plan1",
          variantId: "var1",
          destination: "x",
          action: "post",
          rationale: "Done.",
          suggestedTime: null,
          link: null,
          status: "done",
          createdAt: new Date("2026-07-06T12:00:00.000Z"),
          updatedAt: new Date("2026-07-06T12:01:00.000Z")
        })
      }
    } as any;

    const task = await updatePostbotTaskStatus(prisma, "cr1", "task1", "done");
    expect(task.status).toBe("done");
  });

  it("throws when task is missing", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as any;
    await expect(updatePostbotTaskStatus(prisma, "cr1", "missing", "done")).rejects.toBeInstanceOf(
      PostbotTaskNotFoundError
    );
  });
});
