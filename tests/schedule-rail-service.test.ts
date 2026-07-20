import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { MediaIngestOrigin } from "@prisma/client";
import {
  attachMediaToScheduleRailEvent,
  classifyRailStatus,
  computeNeedsMedia,
  countMediaIds,
  createScheduledPostForRail,
  groupScheduleRailItems,
  isPostMediaEmpty,
  resolveTaskDueAt,
  ScheduleRailNotFoundError,
  ScheduleRailValidationError,
  type ScheduleRailEventItem
} from "../src/distribution/schedule-rail-service.js";

vi.mock("../src/relay/create-relay-post.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/relay/create-relay-post.js")>();
  return {
    ...mod,
    createRelayPostTransaction: vi.fn()
  };
});

vi.mock("../src/autopost/autopost-draft-service.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/autopost/autopost-draft-service.js")>();
  return {
    ...mod,
    saveAutopostDraft: vi.fn()
  };
});

import { createRelayPostTransaction } from "../src/relay/create-relay-post.js";
import { saveAutopostDraft } from "../src/autopost/autopost-draft-service.js";

const mockedCreateRelayPost = vi.mocked(createRelayPostTransaction);
const mockedSaveAutopostDraft = vi.mocked(saveAutopostDraft);

describe("schedule-rail-service helpers", () => {
  it("prefers variant scheduledFor over suggestedTime", () => {
    const scheduled = new Date("2026-07-15T12:00:00.000Z");
    const suggested = new Date("2026-07-14T12:00:00.000Z");
    expect(resolveTaskDueAt({ suggestedTime: suggested, scheduledFor: scheduled })).toEqual(
      scheduled
    );
    expect(resolveTaskDueAt({ suggestedTime: suggested, scheduledFor: null })).toEqual(suggested);
    expect(resolveTaskDueAt({ suggestedTime: null, scheduledFor: null })).toBeNull();
  });

  it("classifies status for rail display", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    expect(classifyRailStatus("dismissed", null, now)).toBe("dismissed");
    expect(classifyRailStatus("done", null, now)).toBe("done");
    expect(classifyRailStatus("pending", new Date("2026-07-16T00:00:00.000Z"), now)).toBe(
      "overdue"
    );
    expect(classifyRailStatus("pending", new Date("2026-07-18T00:00:00.000Z"), now)).toBe(
      "pending"
    );
    expect(classifyRailStatus("pending", null, now)).toBe("pending");
  });

  it("treats empty media ids as armed-eligible", () => {
    expect(isPostMediaEmpty(null)).toBe(true);
    expect(isPostMediaEmpty([])).toBe(true);
    expect(isPostMediaEmpty(["", "  "])).toBe(true);
    expect(isPostMediaEmpty(["media_1"])).toBe(false);
  });

  it("computeNeedsMedia only for pending post with empty media", () => {
    expect(
      computeNeedsMedia({ action: "post", taskStatus: "pending", mediaIds: [] })
    ).toBe(true);
    expect(
      computeNeedsMedia({ action: "post", taskStatus: "pending", mediaIds: ["m1"] })
    ).toBe(false);
    expect(
      computeNeedsMedia({ action: "repost", taskStatus: "pending", mediaIds: [] })
    ).toBe(false);
    expect(
      computeNeedsMedia({ action: "post", taskStatus: "done", mediaIds: [] })
    ).toBe(false);
    expect(
      computeNeedsMedia({ action: "post", taskStatus: "dismissed", mediaIds: [] })
    ).toBe(false);
    expect(
      computeNeedsMedia({
        action: "post",
        taskStatus: "pending",
        mediaIds: [],
        plannedFormat: "text"
      })
    ).toBe(false);
    expect(
      computeNeedsMedia({
        action: "post",
        taskStatus: "pending",
        mediaIds: [],
        plannedFormat: "image"
      })
    ).toBe(true);
  });

  it("countMediaIds ignores blanks", () => {
    expect(countMediaIds(null)).toBe(0);
    expect(countMediaIds(["", "a", "  ", "b"])).toBe(2);
  });
});

function baseEvent(
  overrides: Partial<ScheduleRailEventItem> &
    Pick<ScheduleRailEventItem, "id" | "task_id" | "variant_id" | "post_id" | "destination" | "at">
): ScheduleRailEventItem {
  return {
    action: "post",
    title: "Drop",
    rationale: null,
    link: null,
    notify: true,
    plan_label: null,
    status: "pending",
    needs_media: true,
    media_count: 0,
    ...overrides
  };
}

describe("groupScheduleRailItems", () => {
  it("groups two tasks same post/time into one event with two destinations", () => {
    const at = "2026-07-20T15:00:00.000Z";
    const grouped = groupScheduleRailItems([
      baseEvent({
        id: "t1",
        task_id: "t1",
        variant_id: "v1",
        post_id: "p1",
        destination: "patreon",
        at
      }),
      baseEvent({
        id: "t2",
        task_id: "t2",
        variant_id: "v2",
        post_id: "p1",
        destination: "x",
        at
      })
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.id).toMatch(/^grp_p1_/);
    expect(grouped[0]!.destinations).toHaveLength(2);
    expect(grouped[0]!.destinations?.map((d) => d.destination).sort()).toEqual(["patreon", "x"]);
    expect(grouped[0]!.status).toBe("pending");
  });

  it("does not group different scheduled times", () => {
    const grouped = groupScheduleRailItems([
      baseEvent({
        id: "t1",
        task_id: "t1",
        variant_id: "v1",
        post_id: "p1",
        destination: "patreon",
        at: "2026-07-20T15:00:00.000Z"
      }),
      baseEvent({
        id: "t2",
        task_id: "t2",
        variant_id: "v2",
        post_id: "p1",
        destination: "x",
        at: "2026-07-20T16:00:00.000Z"
      })
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.every((g) => g.id === g.task_id)).toBe(true);
  });

  it("keeps group pending with mixed chip statuses when partially done", () => {
    const at = "2026-07-20T15:00:00.000Z";
    const grouped = groupScheduleRailItems([
      baseEvent({
        id: "t1",
        task_id: "t1",
        variant_id: "v1",
        post_id: "p1",
        destination: "patreon",
        at,
        status: "done"
      }),
      baseEvent({
        id: "t2",
        task_id: "t2",
        variant_id: "v2",
        post_id: "p1",
        destination: "x",
        at,
        status: "pending"
      })
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.status).toBe("pending");
    expect(grouped[0]!.task_id).toBe("t2");
    expect(grouped[0]!.destinations?.find((d) => d.destination === "patreon")?.status).toBe(
      "done"
    );
    expect(grouped[0]!.destinations?.find((d) => d.destination === "x")?.status).toBe("pending");
  });

  it("marks group done only when every child is done", () => {
    const at = "2026-07-20T15:00:00.000Z";
    const grouped = groupScheduleRailItems([
      baseEvent({
        id: "t1",
        task_id: "t1",
        variant_id: "v1",
        post_id: "p1",
        destination: "patreon",
        at,
        status: "done"
      }),
      baseEvent({
        id: "t2",
        task_id: "t2",
        variant_id: "v2",
        post_id: "p1",
        destination: "bluesky",
        at,
        status: "done"
      })
    ]);
    expect(grouped[0]!.status).toBe("done");
  });
});

describe("createScheduledPostForRail", () => {
  beforeEach(() => {
    mockedCreateRelayPost.mockReset();
    mockedSaveAutopostDraft.mockReset();
    mockedSaveAutopostDraft.mockResolvedValue({
      draft_id: "draft_sched_1",
      creator_id: "cr1",
      status: "nudged",
      media_ids: [],
      title: "Scheduled post",
      body_text: null,
      style_profile_id: null,
      intent: "Scheduled from Studio calendar",
      performance_goal_id: null,
      composer_step: "pick-media",
      workspace: { selected_destinations: ["patreon"] },
      enhancements: {},
      distribution_log: {},
      published_post_id: null,
      created_at: "2026-07-20T15:00:00.000Z",
      updated_at: "2026-07-20T15:00:00.000Z"
    });
  });

  it("rejects invalid scheduled_for", async () => {
    await expect(
      createScheduledPostForRail({} as PrismaClient, "cr1", {
        scheduled_for: "not-a-date"
      })
    ).rejects.toBeInstanceOf(ScheduleRailValidationError);
  });

  it("rejects unknown destination", async () => {
    await expect(
      createScheduledPostForRail({} as PrismaClient, "cr1", {
        scheduled_for: "2026-07-20T15:00:00.000Z",
        destination: "myspace"
      })
    ).rejects.toBeInstanceOf(ScheduleRailValidationError);
  });

  it("creates post + plan/variant/task and returns needs_media event", async () => {
    mockedCreateRelayPost.mockResolvedValue({
      post: {
        id: "post_new",
        campaignId: "camp1",
        creatorId: "cr1",
        source: "RELAY",
        isPublic: true,
        requiredTierId: null
      },
      version: {
        id: "ver1",
        versionSeq: 1,
        upstreamRevision: "v1",
        title: "Scheduled post",
        description: null,
        publishedAt: new Date("2026-07-20T15:00:00.000Z"),
        tagIds: [],
        tierIds: [],
        mediaIds: []
      }
    });

    const planCreate = vi.fn().mockResolvedValue({ id: "plan1" });
    const variantCreate = vi.fn().mockResolvedValue({ id: "var1" });
    const taskCreate = vi.fn().mockResolvedValue({
      id: "task1",
      creatorId: "cr1",
      postId: "post_new",
      planId: "plan1",
      variantId: "var1",
      destination: "patreon",
      action: "post",
      rationale: "Scheduled from the Studio calendar. Drop media here when the art is ready.",
      suggestedTime: new Date("2026-07-20T15:00:00.000Z"),
      link: null,
      remindMe: true,
      status: "pending"
    });

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          postDistributionPlan: { create: planCreate },
          postDistributionVariant: { create: variantCreate },
          postbotTask: { create: taskCreate }
        })
      )
    } as unknown as PrismaClient;

    const event = await createScheduledPostForRail(prisma, "cr1", {
      scheduled_for: "2026-07-20T15:00:00.000Z",
      title: "July drop",
      note: "Ready soon"
    });

    expect(mockedCreateRelayPost).toHaveBeenCalledOnce();
    expect(mockedCreateRelayPost.mock.calls[0]?.[2]).toMatchObject({
      creatorId: "cr1",
      title: "July drop",
      mediaIds: [],
      publish: false
    });
    expect(mockedSaveAutopostDraft).toHaveBeenCalledOnce();
    expect(mockedSaveAutopostDraft.mock.calls[0]?.[2]).toMatchObject({
      media_ids: [],
      status: "nudged",
      composer_step: "pick-media",
      workspace: { selected_destinations: ["patreon"] }
    });
    expect(planCreate).toHaveBeenCalledOnce();
    expect(planCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      sourceDraftId: "draft_sched_1",
      postId: "post_new"
    });
    expect(variantCreate).toHaveBeenCalledOnce();
    expect(taskCreate).toHaveBeenCalledOnce();
    expect(event).toMatchObject({
      task_id: "task1",
      post_id: "post_new",
      action: "post",
      status: "pending",
      needs_media: true,
      media_count: 0,
      destination: "patreon",
      at: "2026-07-20T15:00:00.000Z",
      draft_id: "draft_sched_1"
    });
    expect(event.destinations).toEqual([
      expect.objectContaining({
        destination: "patreon",
        task_id: "task1",
        variant_id: "var1",
        status: "pending"
      })
    ]);
  });

  it("text planned_format skips needs_media and uses draft-post composer step", async () => {
    mockedCreateRelayPost.mockResolvedValue({
      post: {
        id: "post_text",
        campaignId: "camp1",
        creatorId: "cr1",
        source: "RELAY",
        isPublic: true,
        requiredTierId: null
      },
      version: {
        id: "ver1",
        versionSeq: 1,
        upstreamRevision: "v1",
        title: "Text post",
        description: null,
        publishedAt: new Date("2026-07-20T15:00:00.000Z"),
        tagIds: [],
        tierIds: [],
        mediaIds: []
      }
    });

    const planCreate = vi.fn().mockResolvedValue({ id: "plan_text" });
    const variantCreate = vi.fn().mockResolvedValue({ id: "var_text" });
    const taskCreate = vi.fn().mockResolvedValue({
      id: "task_text",
      creatorId: "cr1",
      postId: "post_text",
      planId: "plan_text",
      variantId: "var_text",
      destination: "x",
      action: "post",
      rationale: "text",
      suggestedTime: new Date("2026-07-20T15:00:00.000Z"),
      link: null,
      remindMe: true,
      status: "pending"
    });

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          postDistributionPlan: { create: planCreate },
          postDistributionVariant: { create: variantCreate },
          postbotTask: { create: taskCreate }
        })
      )
    } as unknown as PrismaClient;

    const event = await createScheduledPostForRail(prisma, "cr1", {
      scheduled_for: "2026-07-20T15:00:00.000Z",
      title: "Text post",
      destinations: ["x"],
      planned_format: "text"
    });

    expect(mockedSaveAutopostDraft.mock.calls[0]?.[2]).toMatchObject({
      composer_step: "draft-post",
      workspace: {
        selected_destinations: ["x"],
        planned_format: "text"
      }
    });
    expect(planCreate.mock.calls[0]?.[0]?.data.assistantPlan).toMatchObject({
      source: "schedule_rail_manual",
      planned_format: "text"
    });
    expect(event.needs_media).toBe(false);
    expect(event.draft_id).toBe("draft_sched_1");
  });

  it("creates N variants/tasks for multi destinations and returns a grouped event", async () => {
    mockedCreateRelayPost.mockResolvedValue({
      post: {
        id: "post_multi",
        campaignId: "camp1",
        creatorId: "cr1",
        source: "RELAY",
        isPublic: true,
        requiredTierId: null
      },
      version: {
        id: "ver1",
        versionSeq: 1,
        upstreamRevision: "v1",
        title: "Multi drop",
        description: null,
        publishedAt: new Date("2026-07-20T15:00:00.000Z"),
        tagIds: [],
        tierIds: [],
        mediaIds: []
      }
    });

    let variantN = 0;
    let taskN = 0;
    const planCreate = vi.fn().mockResolvedValue({ id: "plan_m" });
    const variantCreate = vi.fn().mockImplementation(async ({ data }: { data: { destination: string } }) => {
      variantN += 1;
      return { id: `var_${data.destination}` };
    });
    const taskCreate = vi.fn().mockImplementation(async ({ data }: { data: { destination: string; variantId: string; postId: string } }) => {
      taskN += 1;
      return {
        id: `task_${data.destination}`,
        creatorId: "cr1",
        postId: data.postId,
        planId: "plan_m",
        variantId: data.variantId,
        destination: data.destination,
        action: "post",
        rationale: "Ready soon",
        suggestedTime: new Date("2026-07-20T15:00:00.000Z"),
        link: null,
        remindMe: true,
        status: "pending"
      };
    });

    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          postDistributionPlan: { create: planCreate },
          postDistributionVariant: { create: variantCreate },
          postbotTask: { create: taskCreate }
        })
      )
    } as unknown as PrismaClient;

    const event = await createScheduledPostForRail(prisma, "cr1", {
      scheduled_for: "2026-07-20T15:00:00.000Z",
      title: "Multi drop",
      note: "Ready soon",
      destinations: ["patreon", "x"]
    });

    expect(planCreate).toHaveBeenCalledOnce();
    expect(planCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      sourceDraftId: "draft_sched_1"
    });
    expect(variantCreate).toHaveBeenCalledTimes(2);
    expect(taskCreate).toHaveBeenCalledTimes(2);
    expect(mockedSaveAutopostDraft.mock.calls[0]?.[2]).toMatchObject({
      workspace: { selected_destinations: ["patreon", "x"] }
    });
    expect(event.id).toMatch(/^grp_post_multi_/);
    expect(event.destinations).toHaveLength(2);
    expect(event.destinations?.map((d) => d.destination).sort()).toEqual(["patreon", "x"]);
    expect(event.needs_media).toBe(true);
    expect(event.draft_id).toBe("draft_sched_1");
  });
});

describe("attachMediaToScheduleRailEvent", () => {
  it("rejects empty media_ids", async () => {
    await expect(
      attachMediaToScheduleRailEvent({} as PrismaClient, "cr1", "task1", [])
    ).rejects.toBeInstanceOf(ScheduleRailValidationError);
  });

  it("rejects task owned by another creator", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    await expect(
      attachMediaToScheduleRailEvent(prisma, "cr1", "task_other", ["m1"])
    ).rejects.toBeInstanceOf(ScheduleRailNotFoundError);
  });

  it("rejects non-post actions", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          action: "repost",
          status: "pending"
        })
      }
    } as unknown as PrismaClient;

    await expect(
      attachMediaToScheduleRailEvent(prisma, "cr1", "task1", ["m1"])
    ).rejects.toBeInstanceOf(ScheduleRailValidationError);
  });

  it("rejects non-pending tasks", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "done"
        })
      }
    } as unknown as PrismaClient;

    await expect(
      attachMediaToScheduleRailEvent(prisma, "cr1", "task1", ["m1"])
    ).rejects.toBeInstanceOf(ScheduleRailValidationError);
  });

  it("rejects media that does not belong to the creator", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "pending"
        })
      },
      postVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ver1",
          postId: "post1",
          mediaIds: []
        })
      },
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    await expect(
      attachMediaToScheduleRailEvent(prisma, "cr1", "task1", ["foreign_m"])
    ).rejects.toBeInstanceOf(ScheduleRailValidationError);
  });

  it("attaches eligible media to empty version and clears needs_media", async () => {
    const mediaRow = {
      id: "m1",
      creatorId: "cr1",
      ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
      currentStorageKey: "uploads/m1.jpg",
      postIds: [] as string[],
      primaryPostId: null as string | null,
      autopostDraftId: null
    };
    const versionUpdate = vi.fn().mockResolvedValue({});
    const mediaUpdate = vi.fn().mockResolvedValue({});
    const mediaFindUnique = vi.fn().mockResolvedValue(mediaRow);

    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "pending"
        })
      },
      postVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ver1",
          postId: "post1",
          mediaIds: []
        })
      },
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue(mediaRow),
        findUniqueOrThrow: mediaFindUnique
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          postVersion: { update: versionUpdate },
          mediaAsset: {
            findUniqueOrThrow: mediaFindUnique,
            update: mediaUpdate
          }
        })
      )
    } as unknown as PrismaClient;

    const result = await attachMediaToScheduleRailEvent(prisma, "cr1", "task1", ["m1"]);

    expect(result).toEqual({
      task_id: "task1",
      post_id: "post1",
      needs_media: false,
      media_count: 1,
      media_ids: ["m1"],
      media_state: "ready",
      readiness_errors: [],
      mode: "append"
    });
    expect(versionUpdate).toHaveBeenCalledWith({
      where: { id: "ver1" },
      data: { mediaIds: ["m1"] }
    });
  });

  it("replaces media set and unlinks removed assets", async () => {
    const mediaRow = {
      id: "m2",
      creatorId: "cr1",
      ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
      currentStorageKey: "uploads/m2.jpg",
      postIds: [] as string[],
      primaryPostId: null as string | null,
      autopostDraftId: null
    };
    const oldMedia = {
      id: "m1",
      creatorId: "cr1",
      postIds: ["post1"],
      primaryPostId: "post1"
    };
    const versionUpdate = vi.fn().mockResolvedValue({});
    const mediaUpdate = vi.fn().mockResolvedValue({});

    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "pending",
          goalCycleCampaignKey: null
        })
      },
      postVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ver1",
          postId: "post1",
          mediaIds: ["m1"]
        })
      },
      mediaAsset: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === "m2") return Promise.resolve(mediaRow);
          if (where.id === "m1") return Promise.resolve(oldMedia);
          return Promise.resolve(null);
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(mediaRow)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          postVersion: { update: versionUpdate },
          mediaAsset: {
            findUniqueOrThrow: vi.fn().mockResolvedValue(mediaRow),
            findFirst: vi.fn().mockResolvedValue(oldMedia),
            update: mediaUpdate
          }
        })
      )
    } as unknown as PrismaClient;

    const result = await attachMediaToScheduleRailEvent(prisma, "cr1", "task1", ["m2"], {
      mode: "replace"
    });
    expect(result.mode).toBe("replace");
    expect(result.media_ids).toEqual(["m2"]);
    expect(versionUpdate).toHaveBeenCalledWith({
      where: { id: "ver1" },
      data: { mediaIds: ["m2"] }
    });
  });

  it("removes all media from a pending post event", async () => {
    const versionUpdate = vi.fn().mockResolvedValue({});
    const mediaUpdate = vi.fn().mockResolvedValue({});
    const oldMedia = {
      id: "m1",
      creatorId: "cr1",
      postIds: ["post1"],
      primaryPostId: "post1"
    };

    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "pending",
          goalCycleCampaignKey: null
        })
      },
      postVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ver1",
          postId: "post1",
          mediaIds: ["m1"]
        })
      },
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue(oldMedia)
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          postVersion: { update: versionUpdate },
          mediaAsset: {
            findFirst: vi.fn().mockResolvedValue(oldMedia),
            update: mediaUpdate
          }
        })
      )
    } as unknown as PrismaClient;

    const result = await attachMediaToScheduleRailEvent(prisma, "cr1", "task1", [], {
      mode: "remove"
    });
    expect(result).toMatchObject({
      mode: "remove",
      needs_media: true,
      media_count: 0,
      media_ids: [],
      media_state: "missing",
      readiness_errors: ["attach_media"]
    });
  });
});
