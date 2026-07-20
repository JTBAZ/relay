/**
 * VS0-T01 — read-only characterization of Coach → distribution → PostBot → rail → extension.
 * Documents reusable seams and semantic conflicts for VS7/VS8. Does not change production behavior.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COACH_REVIEW_ASSISTANT_MODE,
  assertCoachProposeAllowed,
  clearCoachReviewCheckpoint,
  finalizeAssistantPlanFromCheckpoint,
  patchCoachReviewProgress,
  saveCoachReviewCheckpoint
} from "../../src/distribution/coach-checkpoint-service.js";
import { proposeCoachAttackPlans } from "../../src/distribution/coach-propose-service.js";
import {
  createPostDistributionPlan,
  completeDistributionAttempt,
  startDistributionHandoff
} from "../../src/distribution/post-distribution-service.js";
import {
  buildPostbotTasksForVariant,
  persistPostbotTasksForPlan,
  updatePostbotTaskStatus
} from "../../src/distribution/postbot-task-service.js";
import {
  attachMediaToScheduleRailEvent,
  createScheduledPostForRail,
  getCreatorScheduleRail,
  isPostMediaEmpty,
  resolveTaskDueAt
} from "../../src/distribution/schedule-rail-service.js";
import {
  listDueScheduleReminders,
  markScheduleReminderPresented,
  type ScheduleReminderPacket
} from "../../src/distribution/schedule-reminder-extension-api.js";
import { DRAFT_PUBLISHED_AT } from "../../src/autopost/posting-goal-service.js";
import { DISTRIBUTION_DESTINATIONS } from "../../src/distribution/platform-destinations.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("Goal Cycle spine characterization (VS0-T01)", () => {
  it("exposes reusable Coach checkpoint seams (single-post Attack Review)", () => {
    expect(COACH_REVIEW_ASSISTANT_MODE).toBe("coach_review");
    expect(typeof saveCoachReviewCheckpoint).toBe("function");
    expect(typeof patchCoachReviewProgress).toBe("function");
    expect(typeof clearCoachReviewCheckpoint).toBe("function");
    expect(typeof assertCoachProposeAllowed).toBe("function");
    expect(typeof finalizeAssistantPlanFromCheckpoint).toBe("function");
    expect(typeof proposeCoachAttackPlans).toBe("function");
  });

  it("exposes distribution plan / handoff / complete seams used after approval", () => {
    expect(typeof createPostDistributionPlan).toBe("function");
    expect(typeof startDistributionHandoff).toBe("function");
    expect(typeof completeDistributionAttempt).toBe("function");
    expect(DISTRIBUTION_DESTINATIONS).toEqual(
      expect.arrayContaining(["patreon", "x", "deviantart", "bluesky"])
    );
  });

  it("exposes PostBot task build/persist/status seams", () => {
    expect(typeof buildPostbotTasksForVariant).toBe("function");
    expect(typeof persistPostbotTasksForPlan).toBe("function");
    expect(typeof updatePostbotTaskStatus).toBe("function");
    const tasks = buildPostbotTasksForVariant({
      advice: { rationale: "Ship it", suggested_post_time: "2026-07-20T23:00:00.000Z" },
      destination: "patreon"
    });
    expect(tasks.some((t) => t.action === "post")).toBe(true);
    expect(tasks.some((t) => t.action === "schedule")).toBe(true);
  });

  it("exposes schedule rail create/list/media and due-time helpers", () => {
    expect(typeof getCreatorScheduleRail).toBe("function");
    expect(typeof createScheduledPostForRail).toBe("function");
    expect(typeof attachMediaToScheduleRailEvent).toBe("function");
    expect(isPostMediaEmpty([])).toBe(true);
    expect(isPostMediaEmpty(["media_1"])).toBe(false);
    const due = resolveTaskDueAt({
      suggestedTime: new Date("2026-07-20T12:00:00.000Z"),
      scheduledFor: new Date("2026-07-21T12:00:00.000Z")
    });
    expect(due?.toISOString()).toBe("2026-07-21T12:00:00.000Z");
  });

  it("exposes extension due-reminder packet seams with additive Goal Cycle overlay (VS8-T01)", () => {
    expect(typeof listDueScheduleReminders).toBe("function");
    expect(typeof markScheduleReminderPresented).toBe("function");
    const packetKeys: Array<keyof ScheduleReminderPacket> = [
      "reminder_id",
      "task_id",
      "post_id",
      "destination",
      "action",
      "due_at",
      "media_ready",
      "primary_cta",
      "goal_cycle_id",
      "campaign_key",
      "task_kind"
    ];
    for (const key of packetKeys) {
      expect(key).toBeTruthy();
    }
    const apiSrc = readSrc("src/distribution/schedule-reminder-extension-api.ts");
    expect(apiSrc).toMatch(/goal_cycle_id\?/);
    expect(apiSrc).toMatch(/campaign_key\?/);
    expect(apiSrc).toMatch(/sanitizeReminderDeepLink/);
  });

  it("records unpublished-state: Post.publishState + nullable publishedAt (VS7-T01)", () => {
    expect(DRAFT_PUBLISHED_AT.getTime()).toBe(0);
    const createSrc = readSrc("src/relay/create-relay-post.ts");
    expect(createSrc).toMatch(/PostPublishState\.draft/);
    expect(createSrc).toMatch(/publishedAt = null/);
    expect(createSrc).toMatch(/source:\s*PostSource\.RELAY/);
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(/enum PostPublishState/);
    expect(schema).toMatch(/publishState/);
    expect(schema).toMatch(/publishedAt\s+DateTime\?/);
  });

  it("records posting-goal counts exclude publishState=draft", () => {
    const goalSrc = readSrc("src/autopost/posting-goal-service.ts");
    expect(goalSrc).toMatch(/publishState:\s*PostPublishState\.published/);
    expect(goalSrc).toMatch(/publishedAt:\s*\{[\s\S]*not:\s*null/);
  });

  it("records rail manual create already materializes Relay draft + plan + variant + task", () => {
    const railSrc = readSrc("src/distribution/schedule-rail-service.ts");
    expect(railSrc).toMatch(/createRelayPostTransaction/);
    expect(railSrc).toMatch(/publish:\s*false/);
    expect(railSrc).toMatch(/postDistributionPlan\.create/);
    expect(railSrc).toMatch(/postDistributionVariant\.create/);
    expect(railSrc).toMatch(/postbotTask\.create|PostbotTask/);
  });

  it("records creator-confirm boundary: completeDistributionAttempt is explicit, not autonomous", () => {
    const distSrc = readSrc("src/distribution/post-distribution-service.ts");
    expect(distSrc).toMatch(/export async function completeDistributionAttempt/);
    expect(distSrc).toMatch(/export async function startDistributionHandoff/);
    // Extension form-fill path — no auto-publish clicker in distribution service.
    expect(distSrc).not.toMatch(/auto.?publish|clickPublish|autonomous.?publish/i);
  });

  it("records Coach checkpoint is post-scoped, not multi-slot Goal Cycle scoped (VS1/VS5 gap)", () => {
    const checkpointSrc = readSrc("src/distribution/coach-checkpoint-service.ts");
    expect(checkpointSrc).toMatch(/postId/);
    expect(checkpointSrc).not.toMatch(/goalCycle|goal_cycle/);
    expect(checkpointSrc).toMatch(/assistantMode:\s*COACH_REVIEW_ASSISTANT_MODE|COACH_REVIEW_ASSISTANT_MODE/);
  });

  it("names VS7/VS8 conflict inventory for Delta Out", () => {
    const conflicts = {
      unpublished_semantics:
        "VS7-T01: Post.publishState draft|published + nullable PostVersion.publishedAt; epoch sentinel retired for new drafts.",
      posting_goal_count:
        "countRelayNativePostsInWindow requires publishState=published and non-null publishedAt in window.",
      coach_checkpoint_scope:
        "Coach Attack Review checkpoints are one post_id + coach_review plan stub; Goal Cycle needs cycle-scoped checkpoints (VS1).",
      materialization_path:
        "createScheduledPostForRail already creates draft post+plan+variant+task for one event; Goal Cycle approval must reuse primitives transactionally for 0–8 slots with receipt/idempotency (VS7).",
      extension_packet:
        "VS8-T01: ScheduleReminderPacket optional goal_cycle_id/slot/campaign_key + task_kind; Phase 5 packets omit overlay.",
      media_later:
        "Rail and reminders already support media_ready / needs_media; Goal Cycle slots must map onto that (VS8).",
      human_confirm:
        "startDistributionHandoff + completeDistributionAttempt remain the publish boundary; Goal Cycle must not add autonomous publish."
    };
    expect(Object.keys(conflicts).length).toBeGreaterThanOrEqual(6);
    expect(conflicts.unpublished_semantics).toMatch(/publishState/);
    expect(conflicts.extension_packet).toMatch(/VS8/);
  });
});
