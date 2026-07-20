/**
 * VS8-T04 / T06 — completion sync + partial recovery (backend).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  deriveSlotStatusFromTaskStatuses,
  deriveSlotStatusFromVariantStatuses,
  syncGoalCycleDestinationCompletion,
  completeBoundedGoalCycleTask
} from "../../src/goal-cycle/execution/goal-cycle-execution-service.js";
import { diagnoseOrRepairExecutionProjections } from "../../src/goal-cycle/execution/goal-cycle-repair-service.js";
import { formatDueLocal } from "../../src/goal-cycle/execution/goal-cycle-due-packet.js";
import { PHASE5_DUE_PACKET_COMPAT_FIXTURE } from "../../src/goal-cycle/fixtures/due-packets.js";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";

vi.mock("../../src/goal-cycle/goal-cycle-store.js", () => ({
  findGoalCycleForCreator: vi.fn()
}));

import { findGoalCycleForCreator } from "../../src/goal-cycle/goal-cycle-store.js";

const mockedFindCycle = vi.mocked(findGoalCycleForCreator);

describe("VS8-T04 slot status derivation", () => {
  it("publishes slot only when all destinations posted", () => {
    expect(deriveSlotStatusFromVariantStatuses(["posted", "pending"])).toBe("media_ready");
    expect(deriveSlotStatusFromVariantStatuses(["posted", "posted"])).toBe("published");
    expect(deriveSlotStatusFromVariantStatuses(["failed", "failed"])).toBe("failed");
    expect(deriveSlotStatusFromVariantStatuses(["posted", "failed"])).toBe("media_ready");
  });

  it("publishes bounded slot only when all tasks done", () => {
    expect(deriveSlotStatusFromTaskStatuses(["done", "pending"])).toBe("materialized");
    expect(deriveSlotStatusFromTaskStatuses(["done", "done"])).toBe("published");
  });
});

describe("VS8-T04 syncGoalCycleDestinationCompletion", () => {
  it("completes one destination without publishing the slot", async () => {
    const taskUpdate = vi.fn().mockResolvedValue({});
    const slotUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "att_patreon",
          status: "posted",
          variantId: "var_patreon",
          postId: "post1",
          destination: "patreon",
          completedAt: new Date()
        })
      },
      postDistributionVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "var_patreon",
          status: "posted",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        findMany: vi.fn().mockResolvedValue([
          { status: "posted" },
          { status: "handed_off" }
        ])
      },
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_patreon",
          status: "pending",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        update: taskUpdate
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "slot1",
          mediaState: "ready"
        }),
        update: slotUpdate
      },
      postDistributionPlan: {
        update: vi.fn()
      }
    } as unknown as PrismaClient;

    const out = await syncGoalCycleDestinationCompletion(prisma, {
      creatorId: "cr1",
      attemptId: "att_patreon",
      finalStatus: "posted"
    });

    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: "task_patreon" },
      data: { status: "done", reminderSentAt: expect.any(Date) }
    });
    expect(out.slot_status).toBe("media_ready");
    expect(out.idempotent).toBe(false);
    expect(slotUpdate).toHaveBeenCalledWith({
      where: { id: "slot1" },
      data: { status: "media_ready" }
    });
  });

  it("marks slot published when all destinations posted", async () => {
    const slotUpdate = vi.fn().mockResolvedValue({});
    const planUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "att_x",
          status: "posted",
          variantId: "var_x",
          postId: "post1",
          destination: "x",
          completedAt: new Date()
        })
      },
      postDistributionVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "var_x",
          status: "posted",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ status: "posted" }, { status: "posted" }])
          .mockResolvedValueOnce([{ status: "posted" }, { status: "posted" }])
      },
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_x",
          status: "pending",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        update: vi.fn().mockResolvedValue({})
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({ id: "slot1", mediaState: "ready" }),
        update: slotUpdate
      },
      postDistributionPlan: {
        update: planUpdate
      }
    } as unknown as PrismaClient;

    const out = await syncGoalCycleDestinationCompletion(prisma, {
      creatorId: "cr1",
      attemptId: "att_x",
      finalStatus: "posted"
    });

    expect(out.slot_status).toBe("published");
    expect(out.plan_status).toBe("completed");
    expect(planUpdate).toHaveBeenCalledWith({
      where: { id: "plan1" },
      data: { status: "completed" }
    });
  });

  it("is idempotent when attempt+task already complete", async () => {
    const taskUpdate = vi.fn();
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "att1",
          status: "posted",
          variantId: "var1",
          postId: "post1",
          destination: "patreon",
          completedAt: new Date()
        })
      },
      postDistributionVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "var1",
          status: "posted",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        findMany: vi.fn().mockResolvedValue([{ status: "posted" }])
      },
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          status: "done",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        update: taskUpdate
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({ id: "slot1", mediaState: "ready" }),
        update: vi.fn().mockResolvedValue({})
      }
    } as unknown as PrismaClient;

    const out = await syncGoalCycleDestinationCompletion(prisma, {
      creatorId: "cr1",
      attemptId: "att1",
      finalStatus: "posted"
    });
    expect(out.idempotent).toBe(true);
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("failed destination leaves successful siblings intact and task retryable", async () => {
    const variantUpdate = vi.fn().mockResolvedValue({});
    const taskUpdate = vi.fn();
    const prisma = {
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "att_x",
          status: "failed",
          variantId: "var_x",
          postId: "post1",
          destination: "x",
          completedAt: new Date()
        })
      },
      postDistributionVariant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "var_x",
          status: "handed_off",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        update: variantUpdate,
        findMany: vi.fn().mockResolvedValue([
          { status: "posted" },
          { status: "failed" }
        ])
      },
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_x",
          status: "pending",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        update: taskUpdate
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({ id: "slot1", mediaState: "ready" }),
        update: vi.fn().mockResolvedValue({})
      },
      postDistributionPlan: {
        update: vi.fn()
      }
    } as unknown as PrismaClient;

    const out = await syncGoalCycleDestinationCompletion(prisma, {
      creatorId: "cr1",
      attemptId: "att_x",
      finalStatus: "failed"
    });

    expect(variantUpdate).toHaveBeenCalledWith({
      where: { id: "var_x" },
      data: { status: "failed" }
    });
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(out.slot_status).toBe("media_ready");
  });
});

describe("VS8-T04 bounded multi-dest upkeep", () => {
  it("publishes slot only after all upkeep tasks are done", async () => {
    const slotUpdate = vi.fn().mockResolvedValue({});
    let taskFindMany = [{ status: "done" }, { status: "pending" }];
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_a",
          creatorId: "cr1",
          postId: "post_existing",
          planId: "plan_up",
          action: "repost",
          status: "pending",
          goalCycleCampaignKey: "gc_camp_cycle_up"
        }),
        findMany: vi.fn().mockImplementation(() => Promise.resolve(taskFindMany)),
        update: vi.fn().mockResolvedValue({})
      },
      creatorGoalCycle: {
        findFirst: vi.fn().mockResolvedValue({ breakMode: "social_upkeep" })
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "slot_up",
          format: "existing_post_upkeep",
          intent: "social_upkeep",
          downstreamTaskIds: ["task_a", "task_b"]
        }),
        update: slotUpdate
      },
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([{ status: "draft" }, { status: "draft" }])
      },
      postDistributionPlan: { update: vi.fn() }
    } as unknown as PrismaClient;

    const first = await completeBoundedGoalCycleTask(prisma, {
      creatorId: "cr1",
      taskId: "task_a"
    });
    expect(first.slot_status).toBe("materialized");

    taskFindMany = [{ status: "done" }, { status: "done" }];
    prisma.postbotTask.findFirst = vi.fn().mockResolvedValue({
      id: "task_b",
      creatorId: "cr1",
      postId: "post_existing",
      planId: "plan_up",
      action: "repost",
      status: "pending",
      goalCycleCampaignKey: "gc_camp_cycle_up"
    });

    const second = await completeBoundedGoalCycleTask(prisma, {
      creatorId: "cr1",
      taskId: "task_b"
    });
    expect(second.slot_status).toBe("published");
  });

  it("never marks publish tasks done via bounded path", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_pub",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "pending",
          goalCycleCampaignKey: "gc_camp_c"
        })
      },
      creatorGoalCycle: {
        findFirst: vi.fn().mockResolvedValue({ breakMode: null })
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({ format: "image_post", intent: "hook" })
      }
    } as unknown as PrismaClient;

    await expect(
      completeBoundedGoalCycleTask(prisma, { creatorId: "cr1", taskId: "task_pub" })
    ).rejects.toBeInstanceOf(GoalCycleContractError);
  });
});

describe("VS8-T06 execution repair", () => {
  beforeEach(() => {
    mockedFindCycle.mockReset();
    mockedFindCycle.mockResolvedValue({
      id: "cycle1",
      creatorId: "cr1"
    } as never);
  });

  it("detects stale attempt_posted_task_pending and repairs", async () => {
    const taskUpdate = vi.fn().mockResolvedValue({});
    const slotUpdate = vi.fn().mockResolvedValue({});
    const syncAttemptFind = vi.fn().mockResolvedValue({
      id: "att1",
      status: "posted",
      variantId: "var1",
      postId: "post1",
      destination: "patreon",
      completedAt: new Date()
    });

    const prisma = {
      creatorGoalCycleSlot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "slot_row",
            slotKey: "slot_1",
            status: "materialized",
            mediaState: "ready",
            cycleId: "cycle1",
            downstreamPostId: "post1",
            downstreamPlanId: "plan1",
            downstreamVariantIds: ["var1"],
            downstreamTaskIds: ["task1"],
            goalCycleCampaignKey: "gc_camp_cycle1"
          }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "slot_row",
          mediaState: "ready"
        }),
        update: slotUpdate
      },
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "var1",
            destination: "patreon",
            status: "posted",
            planId: "plan1"
          }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "var1",
          status: "posted",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        })
      },
      postbotTask: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "task1",
            destination: "patreon",
            status: "pending",
            variantId: "var1"
          }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "task1",
          status: "pending",
          planId: "plan1",
          postId: "post1",
          goalCycleCampaignKey: "gc_camp_cycle1"
        }),
        update: taskUpdate
      },
      postDistributionAttempt: {
        findFirst: syncAttemptFind
      },
      postDistributionPlan: {
        update: vi.fn().mockResolvedValue({})
      }
    } as unknown as PrismaClient;

    const diagnosed = await diagnoseOrRepairExecutionProjections(prisma, {
      creatorId: "cr1",
      cycleId: "cycle1",
      repair: false
    });
    expect(diagnosed.status).toBe("stale_projections");
    expect(diagnosed.can_safely_repair).toBe(true);
    expect(diagnosed.slots_observed[0]?.issues.join(" ")).toMatch(
      /attempt_posted_task_pending/
    );

    const repaired = await diagnoseOrRepairExecutionProjections(prisma, {
      creatorId: "cr1",
      cycleId: "cycle1",
      repair: true
    });
    expect(repaired.repaired).toBe(true);
    expect(taskUpdate).toHaveBeenCalled();
  });

  it("flags missing linkage without rematerializing", async () => {
    const prisma = {
      creatorGoalCycleSlot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "slot_row",
            slotKey: "slot_1",
            status: "materialized",
            mediaState: "missing",
            cycleId: "cycle1",
            downstreamPostId: "post1",
            downstreamPlanId: "plan1",
            downstreamVariantIds: ["var_missing"],
            downstreamTaskIds: ["task_missing"],
            goalCycleCampaignKey: "gc_camp_cycle1"
          }
        ])
      },
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([])
      },
      postbotTask: {
        findMany: vi.fn().mockResolvedValue([])
      },
      postDistributionAttempt: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    const report = await diagnoseOrRepairExecutionProjections(prisma, {
      creatorId: "cr1",
      cycleId: "cycle1",
      repair: true
    });
    expect(report.status).toBe("missing_linkage");
    expect(report.repaired).toBe(false);
    expect(report.can_safely_repair).toBe(false);
  });
});

describe("VS8-T06 DST + Phase 5 compat", () => {
  it("formats due_local across US DST spring-forward boundary", () => {
    // 2026-03-08 02:00 local does not exist; 07:00 UTC → 02:00 EST before jump,
    // 08:00 UTC → 04:00 EDT after jump.
    const before = formatDueLocal(new Date("2026-03-08T06:30:00.000Z"), "America/New_York");
    const after = formatDueLocal(new Date("2026-03-08T08:30:00.000Z"), "America/New_York");
    expect(before).toBe("2026-03-08T01:30:00");
    expect(after).toBe("2026-03-08T04:30:00");
  });

  it("Phase 5 compat fixture still omits Goal Cycle overlay keys", () => {
    expect(PHASE5_DUE_PACKET_COMPAT_FIXTURE.goal_cycle_id).toBeUndefined();
    expect(PHASE5_DUE_PACKET_COMPAT_FIXTURE.campaign_key).toBeUndefined();
    expect(PHASE5_DUE_PACKET_COMPAT_FIXTURE.task_kind).toBeUndefined();
  });
});
