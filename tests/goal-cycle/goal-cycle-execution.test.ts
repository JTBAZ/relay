/**
 * VS8-T01 / T02 / T03 — due packet + execution helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  GOAL_CYCLE_DUE_PACKET_VERSION,
  buildGoalCycleDuePacketFields,
  formatDueLocal,
  isAllowedReminderDeepLink,
  mapGoalCycleTaskKind,
  parseGoalCycleIdFromCampaignKey,
  sanitizeReminderDeepLink
} from "../../src/goal-cycle/execution/goal-cycle-due-packet.js";
import {
  buildPublishConfirmationPath,
  classifyGoalCycleMaterializationMode,
  completeBoundedGoalCycleTask,
  deriveMediaStateFromIds,
  resolveGoalCycleTaskKindFromSlot,
  upkeepActionForFormat
} from "../../src/goal-cycle/execution/goal-cycle-execution-service.js";
import {
  GOAL_CYCLE_DUE_PACKET_FIXTURES,
  GOAL_CYCLE_DUE_PACKET_ACTIVE_REST_FIXTURE,
  GOAL_CYCLE_DUE_PACKET_MISSING_MEDIA_FIXTURE,
  GOAL_CYCLE_DUE_PACKET_PUBLISH_FIXTURE,
  GOAL_CYCLE_DUE_PACKET_UPKEEP_FIXTURE,
  PHASE5_DUE_PACKET_COMPAT_FIXTURE
} from "../../src/goal-cycle/fixtures/due-packets.js";
import type { ScheduleReminderPacket } from "../../src/distribution/schedule-reminder-extension-api.js";
import { GoalCycleContractError } from "../../src/goal-cycle/contracts.js";

const PHASE5_KEYS = [
  "reminder_id",
  "task_id",
  "variant_id",
  "post_id",
  "destination",
  "action",
  "title",
  "open_url",
  "due_at",
  "plan_label",
  "media_ready",
  "primary_cta",
  "secondary_cta"
] as const;

const GC_OVERLAY_KEYS = [
  "goal_cycle_id",
  "goal_cycle_slot_id",
  "campaign_key",
  "relay_post_id",
  "distribution_plan_id",
  "rail_event_id",
  "task_kind",
  "due_local",
  "time_zone",
  "media_requirements",
  "instructions"
] as const;

describe("VS8-T01 Goal Cycle due packet", () => {
  it("freezes packet version id", () => {
    expect(GOAL_CYCLE_DUE_PACKET_VERSION).toBe("goal-cycle-due-v1");
    expect(GOAL_CYCLE_DUE_PACKET_FIXTURES.fixture_id).toBe(GOAL_CYCLE_DUE_PACKET_VERSION);
  });

  it("parses cycle id from campaign key", () => {
    expect(parseGoalCycleIdFromCampaignKey("gc_camp_cycle_dream_seed")).toBe("cycle_dream_seed");
    expect(parseGoalCycleIdFromCampaignKey("legacy_key")).toBeNull();
    expect(parseGoalCycleIdFromCampaignKey("")).toBeNull();
  });

  it("maps task kinds from break mode", () => {
    expect(mapGoalCycleTaskKind({ breakMode: null })).toBe("publish");
    expect(mapGoalCycleTaskKind({ breakMode: "social_upkeep" })).toBe("social_upkeep");
    expect(mapGoalCycleTaskKind({ breakMode: "active_rest" })).toBe("active_rest");
    expect(mapGoalCycleTaskKind({ breakMode: null, slotMode: "upkeep_task" })).toBe(
      "social_upkeep"
    );
  });

  it("formats creator-local due time without inventing offsets", () => {
    const due = new Date("2026-07-20T23:00:00.000Z");
    const local = formatDueLocal(due, "America/New_York");
    expect(local).toMatch(/^2026-07-20T19:00:00$/);
  });

  it("builds overlay fields with media requirements when not ready", () => {
    const fields = buildGoalCycleDuePacketFields({
      cycleId: "c1",
      slotId: "slot_1",
      campaignKey: "gc_camp_c1",
      postId: "p1",
      planId: "plan1",
      taskId: "task1",
      taskKind: "publish",
      dueAt: new Date("2026-07-20T23:00:00.000Z"),
      timeZone: "America/New_York",
      mediaReady: false,
      destinationLabel: "Patreon"
    });
    expect(fields.goal_cycle_id).toBe("c1");
    expect(fields.rail_event_id).toBe("task1");
    expect(fields.media_requirements).toEqual(["attach_media"]);
    expect(fields.instructions).toMatch(/Attach media/);
  });

  it("allowlists Relay + destination hosts and strips dangerous schemes", () => {
    expect(isAllowedReminderDeepLink("http://localhost:3000/studio", "patreon")).toBe(true);
    expect(isAllowedReminderDeepLink("https://www.patreon.com/posts/1", "patreon")).toBe(true);
    expect(isAllowedReminderDeepLink("https://x.com/home", "x")).toBe(true);
    expect(isAllowedReminderDeepLink("https://evil.example/phish", "patreon")).toBe(false);
    expect(isAllowedReminderDeepLink("javascript:alert(1)", "patreon")).toBe(false);
    expect(isAllowedReminderDeepLink("data:text/html,hi", "patreon")).toBe(false);
    expect(isAllowedReminderDeepLink("file:///etc/passwd", "patreon")).toBe(false);
    expect(sanitizeReminderDeepLink("javascript:alert(1)", "patreon")).toBeNull();
    expect(sanitizeReminderDeepLink("https://x.com/home", "patreon")).toBeNull();
    expect(sanitizeReminderDeepLink("https://x.com/home", "x")).toBe("https://x.com/home");
  });

  it("publish fixture carries Goal Cycle overlay and safe CTAs", () => {
    const p = GOAL_CYCLE_DUE_PACKET_PUBLISH_FIXTURE;
    expect(p.task_kind).toBe("publish");
    expect(p.goal_cycle_id).toBeTruthy();
    expect(p.campaign_key).toMatch(/^gc_camp_/);
    expect(p.media_ready).toBe(true);
    expect(p.media_requirements).toEqual([]);
    expect(p.instructions).not.toMatch(/patron|email|password/i);
    expect(p.primary_cta.url).toMatch(/^http:\/\/localhost:3000\//);
  });

  it("missing-media fixture requires attach_media", () => {
    const p = GOAL_CYCLE_DUE_PACKET_MISSING_MEDIA_FIXTURE;
    expect(p.media_ready).toBe(false);
    expect(p.media_requirements).toContain("attach_media");
    expect(p.instructions).toMatch(/Attach media/);
  });

  it("upkeep and active-rest fixtures never masquerade as publish-ready posts", () => {
    expect(GOAL_CYCLE_DUE_PACKET_UPKEEP_FIXTURE.task_kind).toBe("social_upkeep");
    expect(GOAL_CYCLE_DUE_PACKET_UPKEEP_FIXTURE.instructions).toMatch(/without publishing/);
    expect(GOAL_CYCLE_DUE_PACKET_ACTIVE_REST_FIXTURE.task_kind).toBe("active_rest");
    expect(GOAL_CYCLE_DUE_PACKET_ACTIVE_REST_FIXTURE.instructions).toMatch(/no new publish/);
  });

  it("Phase 5 compat fixture omits Goal Cycle overlay keys", () => {
    const p = PHASE5_DUE_PACKET_COMPAT_FIXTURE as ScheduleReminderPacket &
      Record<string, unknown>;
    for (const key of PHASE5_KEYS) {
      expect(key in p).toBe(true);
    }
    for (const key of GC_OVERLAY_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(p, key)).toBe(false);
    }
  });

  it("exports all frozen fixtures under versioned bag", () => {
    expect(GOAL_CYCLE_DUE_PACKET_FIXTURES.publish.goal_cycle_id).toBeTruthy();
    expect(GOAL_CYCLE_DUE_PACKET_FIXTURES.missing_media.media_requirements).toContain(
      "attach_media"
    );
    expect(GOAL_CYCLE_DUE_PACKET_FIXTURES.social_upkeep.task_kind).toBe("social_upkeep");
    expect(GOAL_CYCLE_DUE_PACKET_FIXTURES.active_rest.task_kind).toBe("active_rest");
    expect(GOAL_CYCLE_DUE_PACKET_FIXTURES.phase5_compat.goal_cycle_id).toBeUndefined();
  });
});

describe("VS8-T02 / T03 execution helpers", () => {
  it("classifies upkeep formats as upkeep_task materialization", () => {
    expect(
      classifyGoalCycleMaterializationMode({ format: "existing_post_upkeep" })
    ).toBe("upkeep_task");
    expect(classifyGoalCycleMaterializationMode({ format: "image_post" })).toBe("new_post");
    expect(upkeepActionForFormat("upkeep_pin")).toBe("pin_comment");
    expect(upkeepActionForFormat("existing_post_upkeep")).toBe("repost");
  });

  it("resolves task kinds from slot format/intent", () => {
    expect(
      resolveGoalCycleTaskKindFromSlot({ format: "existing_post_upkeep" })
    ).toBe("social_upkeep");
    expect(resolveGoalCycleTaskKindFromSlot({ format: "sketch_page" })).toBe("active_rest");
    expect(resolveGoalCycleTaskKindFromSlot({ format: "image_post" })).toBe("publish");
  });

  it("derives media states and publish confirmation paths", () => {
    expect(deriveMediaStateFromIds([])).toBe("missing");
    expect(deriveMediaStateFromIds(["m1"])).toBe("ready");
    expect(deriveMediaStateFromIds([], { notRequired: true })).toBe("not_required");
    expect(buildPublishConfirmationPath({ variantId: "var_1" })).toContain(
      "variant_id=var_1"
    );
  });

  it("completes upkeep tasks without distribution handoff", async () => {
    const update = vi.fn().mockResolvedValue({});
    const slotUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_up",
          creatorId: "cr1",
          postId: "post_existing",
          planId: "plan_up",
          action: "repost",
          status: "pending",
          goalCycleCampaignKey: "gc_camp_cycle_up"
        }),
        findMany: vi.fn().mockResolvedValue([{ status: "done" }]),
        update
      },
      creatorGoalCycle: {
        findFirst: vi.fn().mockResolvedValue({ breakMode: "social_upkeep" })
      },
      creatorGoalCycleSlot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "slot_row",
          format: "existing_post_upkeep",
          intent: "social_upkeep",
          downstreamTaskIds: ["task_up"]
        }),
        update: slotUpdate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      postDistributionVariant: {
        findMany: vi.fn().mockResolvedValue([{ status: "draft" }])
      },
      postDistributionPlan: {
        update: vi.fn().mockResolvedValue({})
      }
    } as unknown as PrismaClient;

    const out = await completeBoundedGoalCycleTask(prisma, {
      creatorId: "cr1",
      taskId: "task_up"
    });
    expect(out).toEqual({
      task_id: "task_up",
      task_kind: "social_upkeep",
      status: "done",
      slot_status: "published"
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "task_up" },
      data: { status: "done", reminderSentAt: expect.any(Date) }
    });
    expect(slotUpdate).toHaveBeenCalled();
  });

  it("rejects publish tasks on bounded complete path", async () => {
    const prisma = {
      postbotTask: {
        findFirst: vi.fn().mockResolvedValue({
          id: "task_pub",
          creatorId: "cr1",
          postId: "post1",
          action: "post",
          status: "pending",
          goalCycleCampaignKey: "gc_camp_cycle_pub"
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
