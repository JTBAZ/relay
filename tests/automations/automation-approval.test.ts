/**
 * AUT-VS6-T02 — approval-context service + plan ordering.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATIONS_FEATURE_ENV } from "../../src/autopost/automation-contract.js";
import {
  correlateAutomationRunPlan,
  getAutomationApprovalContext
} from "../../src/autopost/automation-service.js";
import { AUTOMATIONS_QA_PERSONA, AUTOMATIONS_QA_POSTS } from "./fixtures.js";

vi.mock("../../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: vi.fn()
}));

vi.mock("../../src/autopost/automation-materializer.js", () => ({
  loadDistributionRunSourceVersion: vi.fn()
}));

import { requireCreatorPlanAtLeast } from "../../src/billing/creator-plan-entitlement-service.js";
import { loadDistributionRunSourceVersion } from "../../src/autopost/automation-materializer.js";

const mockedGate = vi.mocked(requireCreatorPlanAtLeast);
const mockedSource = vi.mocked(loadDistributionRunSourceVersion);

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const AUTO = "auto_approval_1";
const RULE = "rule_approval_1";
const RUN = "run_approval_1";
const DRAFT = "draft_approval_1";
const POST = AUTOMATIONS_QA_POSTS.newest_with_image.post_id;
const MEDIA = AUTOMATIONS_QA_POSTS.newest_with_image.media_id;

describe("getAutomationApprovalContext", () => {
  beforeEach(() => {
    process.env[AUTOMATIONS_FEATURE_ENV] = "true";
    mockedGate.mockResolvedValue({ ok: true } as never);
    mockedSource.mockResolvedValue({
      title: "Post",
      description: null,
      mediaIds: [MEDIA]
    });
  });

  it("returns wire context for a materialized run", async () => {
    const prisma = {
      creatorAutomation: {
        findFirst: vi.fn(async () => ({
          id: AUTO,
          creatorId: CREATOR,
          presetKind: "preview_crosspost",
          status: "active",
          title: "Weekly",
          sourceKind: "latest_patreon_post",
          scheduleSeriesId: "series_1",
          distributionRuleId: RULE,
          previewTemplateId: "tpl_1",
          approvalTtlHours: 72,
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          scheduleSeries: null,
          distributionRule: {
            id: RULE,
            status: "active",
            offsetDays: 0,
            targetDestinations: ["x", "bluesky"],
            remindMe: true,
            title: "Rule"
          },
          previewTemplate: { id: "tpl_1" }
        }))
      },
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({
          id: RUN,
          creatorId: CREATOR,
          ruleId: RULE,
          status: "materialized",
          draftId: DRAFT,
          sourcePostId: POST,
          planId: null,
          expiresAt: new Date("2026-07-25T00:00:00.000Z"),
          previewTemplateSnapshot: {
            schemaVersion: 1,
            preset: "tight_crop"
          }
        }))
      },
      postDistributionAttempt: { findFirst: vi.fn() }
    };

    const ctx = await getAutomationApprovalContext(prisma as never, CREATOR, AUTO, RUN, {
      now: new Date("2026-07-20T00:00:00.000Z")
    });
    expect(ctx.automation_id).toBe(AUTO);
    expect(ctx.run_id).toBe(RUN);
    expect(ctx.draft_id).toBe(DRAFT);
    expect(ctx.source_media_id).toBe(MEDIA);
    expect(ctx.source_image_export_path).toContain(`/export/media/${CREATOR}/${MEDIA}/content`);
    expect(ctx.target_destinations).toEqual(["x", "bluesky"]);
    expect(ctx.existing_plan_id).toBeNull();
    expect(ctx.version).toBe(2);
  });

  it("rejects expired approvals", async () => {
    const prisma = {
      creatorAutomation: {
        findFirst: vi.fn(async () => ({
          id: AUTO,
          creatorId: CREATOR,
          presetKind: "preview_crosspost",
          status: "active",
          title: "Weekly",
          sourceKind: "latest_patreon_post",
          scheduleSeriesId: null,
          distributionRuleId: RULE,
          previewTemplateId: null,
          approvalTtlHours: 72,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          scheduleSeries: null,
          distributionRule: {
            id: RULE,
            status: "active",
            offsetDays: 0,
            targetDestinations: ["x"],
            remindMe: true,
            title: "Rule"
          },
          previewTemplate: null
        }))
      },
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({
          id: RUN,
          creatorId: CREATOR,
          ruleId: RULE,
          status: "materialized",
          draftId: DRAFT,
          sourcePostId: POST,
          planId: null,
          expiresAt: new Date("2026-07-19T00:00:00.000Z"),
          previewTemplateSnapshot: null
        }))
      }
    };

    await expect(
      getAutomationApprovalContext(prisma as never, CREATOR, AUTO, RUN, {
        now: new Date("2026-07-20T00:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: "AUTOMATION_APPROVAL_EXPIRED", statusCode: 410 });
  });
});

describe("correlateAutomationRunPlan", () => {
  beforeEach(() => {
    process.env[AUTOMATIONS_FEATURE_ENV] = "true";
    mockedGate.mockResolvedValue({ ok: true } as never);
  });

  it("sets planId when still null", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      creatorAutomation: {
        findFirst: vi.fn(async () => ({
          id: AUTO,
          creatorId: CREATOR,
          presetKind: "preview_crosspost",
          status: "active",
          title: "Weekly",
          sourceKind: "latest_patreon_post",
          scheduleSeriesId: null,
          distributionRuleId: RULE,
          previewTemplateId: null,
          approvalTtlHours: 72,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          scheduleSeries: null,
          distributionRule: {
            id: RULE,
            status: "active",
            offsetDays: 0,
            targetDestinations: ["x"],
            remindMe: true,
            title: "Rule"
          },
          previewTemplate: null
        }))
      },
      creatorDistributionRuleRun: { updateMany }
    };
    const result = await correlateAutomationRunPlan(prisma as never, CREATOR, {
      automationId: AUTO,
      runId: RUN,
      planId: "plan_1"
    });
    expect(result.correlated).toBe(true);
    expect(updateMany).toHaveBeenCalled();
  });
});

describe("completeAutomationRunFromHandoff / cancelAutomationRun (B16)", () => {
  beforeEach(() => {
    process.env[AUTOMATIONS_FEATURE_ENV] = "true";
    mockedGate.mockResolvedValue({ ok: true } as never);
  });

  function automationRow() {
    return {
      id: AUTO,
      creatorId: CREATOR,
      presetKind: "preview_crosspost",
      status: "active",
      title: "Weekly",
      sourceKind: "latest_patreon_post",
      scheduleSeriesId: null,
      distributionRuleId: RULE,
      previewTemplateId: null,
      approvalTtlHours: 72,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduleSeries: null,
      distributionRule: {
        id: RULE,
        status: "active",
        offsetDays: 0,
        targetDestinations: ["x"],
        remindMe: true,
        title: "Rule"
      },
      previewTemplate: null
    };
  }

  function runRow(overrides: Record<string, unknown> = {}) {
    return {
      id: RUN,
      creatorId: CREATOR,
      ruleId: RULE,
      status: "materialized",
      draftId: DRAFT,
      sourcePostId: POST,
      planId: "plan_1",
      scheduleOccurrenceId: null,
      materializedEventId: "evt_1",
      dueAt: new Date("2026-07-20T14:00:00.000Z"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      idempotencyKey: "k1",
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      ...overrides
    };
  }

  it("rejects complete without a durable attempt", async () => {
    const { completeAutomationRunFromHandoff } = await import(
      "../../src/autopost/automation-service.js"
    );
    const prisma = {
      creatorAutomation: { findFirst: vi.fn(async () => automationRow()) },
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => runRow())
      },
      postDistributionAttempt: { findFirst: vi.fn(async () => null) }
    };
    await expect(
      completeAutomationRunFromHandoff(prisma as never, CREATOR, {
        automationId: AUTO,
        runId: RUN
      })
    ).rejects.toMatchObject({ code: "AUTOMATION_NOT_FOUND" });
  });

  it("completes after extension handoff attempt and is idempotent", async () => {
    const { completeAutomationRunFromHandoff } = await import(
      "../../src/autopost/automation-service.js"
    );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const row = runRow();
    const completed = { ...row, status: "completed", completedAt: new Date() };
    const prisma = {
      creatorAutomation: { findFirst: vi.fn(async () => automationRow()) },
      creatorDistributionRuleRun: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(completed),
        findFirstOrThrow: vi.fn(async () => completed),
        updateMany
      },
      postDistributionAttempt: {
        findFirst: vi.fn(async () => ({
          id: "att_1",
          status: "started",
          destination: "x"
        }))
      },
      creatorScheduleEvent: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };

    const first = await completeAutomationRunFromHandoff(prisma as never, CREATOR, {
      automationId: AUTO,
      runId: RUN,
      attemptId: "att_1"
    });
    expect(first.applied).toBe(true);
    expect(first.run.status).toBe("completed");

    const second = await completeAutomationRunFromHandoff(prisma as never, CREATOR, {
      automationId: AUTO,
      runId: RUN,
      attemptId: "att_1"
    });
    expect(second.applied).toBe(false);
  });

  it("cancels without destroying draft/plan and is idempotent", async () => {
    const { cancelAutomationRun } = await import("../../src/autopost/automation-service.js");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const row = runRow({ planId: "plan_1", draftId: DRAFT });
    const cancelled = { ...row, status: "cancelled", completedAt: new Date() };
    const prisma = {
      creatorAutomation: { findFirst: vi.fn(async () => automationRow()) },
      creatorDistributionRuleRun: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(cancelled),
        findFirstOrThrow: vi.fn(async () => cancelled),
        updateMany
      },
      creatorScheduleEvent: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };

    const first = await cancelAutomationRun(prisma as never, CREATOR, {
      automationId: AUTO,
      runId: RUN
    });
    expect(first.applied).toBe(true);
    expect(first.run.status).toBe("cancelled");
    expect(first.run.draft_id).toBe(DRAFT);
    expect(first.run.plan_id).toBe("plan_1");

    const second = await cancelAutomationRun(prisma as never, CREATOR, {
      automationId: AUTO,
      runId: RUN
    });
    expect(second.applied).toBe(false);
  });
});
