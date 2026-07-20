/**
 * AUT-VS4-T02 — occurrence-linked run create/get + shared materializer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrGetAutomationRunForOccurrence,
  prepareAutomationOccurrenceWork
} from "../../src/autopost/automation-reconcile-service.js";
import { automationRunIdempotencyKeyForOccurrence } from "../../src/autopost/automation-contract.js";
import { AUTOMATIONS_QA_PERSONA, AUTOMATIONS_QA_POSTS } from "./fixtures.js";

vi.mock("../../src/autopost/automation-materializer.js", () => ({
  materializeAutomationOwnedDistributionRun: vi.fn()
}));

vi.mock("../../src/autopost/automation-source-resolver.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/autopost/automation-source-resolver.js")>();
  return {
    ...actual,
    resolveLatestEligiblePatreonPost: vi.fn()
  };
});

import { materializeAutomationOwnedDistributionRun } from "../../src/autopost/automation-materializer.js";
import { resolveLatestEligiblePatreonPost } from "../../src/autopost/automation-source-resolver.js";

const mockedMaterialize = vi.mocked(materializeAutomationOwnedDistributionRun);
const mockedResolve = vi.mocked(resolveLatestEligiblePatreonPost);

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const AUTO = "auto_1";
const RULE = "rule_1";
const SERIES = "series_1";
const OCC = "occ_1";
const POST = AUTOMATIONS_QA_POSTS.newest_with_image.post_id;
const PUBLISHED = new Date(AUTOMATIONS_QA_POSTS.newest_with_image.published_at);

function createReconcileMemory() {
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const runs = new Map<
    string,
    {
      id: string;
      ruleId: string;
      creatorId: string;
      sourcePostId: string;
      idempotencyKey: string;
      scheduleOccurrenceId: string | null;
      status: string;
      draftId: string | null;
    }
  >();

  const prisma = {
    creatorAutomation: {
      findFirst: vi.fn(async () => ({
        id: AUTO,
        distributionRuleId: RULE,
        scheduleSeriesId: SERIES
      }))
    },
    creatorScheduleOccurrence: {
      findFirst: vi.fn(async () => ({
        id: OCC,
        dueAt: new Date("2026-07-20T14:00:00.000Z"),
        status: "planned",
        series: { materializationKind: "automation_trigger", status: "active" }
      }))
    },
    creatorDistributionRuleRun: {
      findUnique: vi.fn(
        async ({
          where
        }: {
          where:
            | { idempotencyKey: string }
            | { ruleId_sourcePostId: { ruleId: string; sourcePostId: string } };
        }) => {
          if ("idempotencyKey" in where) {
            for (const row of runs.values()) {
              if (row.idempotencyKey === where.idempotencyKey) return row;
            }
            return null;
          }
          const pair = where.ruleId_sourcePostId;
          for (const row of runs.values()) {
            if (row.ruleId === pair.ruleId && row.sourcePostId === pair.sourcePostId) return row;
          }
          return null;
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = data.idempotencyKey as string;
        for (const row of runs.values()) {
          if (row.idempotencyKey === key) {
            const err = new Error("Unique constraint failed on idempotency_key");
            throw err;
          }
          if (row.ruleId === data.ruleId && row.sourcePostId === data.sourcePostId) {
            throw new Error("Unique constraint failed on ruleId_sourcePostId");
          }
        }
        const row = {
          id: nextId("run"),
          ruleId: data.ruleId as string,
          creatorId: data.creatorId as string,
          sourcePostId: data.sourcePostId as string,
          idempotencyKey: key,
          scheduleOccurrenceId: (data.scheduleOccurrenceId as string) ?? null,
          status: (data.status as string) ?? "pending",
          draftId: null
        };
        runs.set(row.id, row);
        return row;
      })
    }
  };

  return { prisma: prisma as any, runs };
}

describe("createOrGetAutomationRunForOccurrence", () => {
  it("creates once and returns existing on retry / concurrent race", async () => {
    const { prisma, runs } = createReconcileMemory();
    const args = {
      creatorId: CREATOR,
      distributionRuleId: RULE,
      occurrenceId: OCC,
      sourcePostId: POST,
      sourcePublishedAt: PUBLISHED,
      dueAt: new Date("2026-07-20T14:00:00.000Z")
    };

    const first = await createOrGetAutomationRunForOccurrence(prisma, args);
    expect(first.created).toBe(true);
    expect(first.idempotency_key).toBe(automationRunIdempotencyKeyForOccurrence(OCC));
    expect(runs.size).toBe(1);

    const second = await createOrGetAutomationRunForOccurrence(prisma, args);
    expect(second.created).toBe(false);
    expect(second.run_id).toBe(first.run_id);
    expect(runs.size).toBe(1);

    // Simulate concurrent create race: create throws, findUnique recovers.
    prisma.creatorDistributionRuleRun.create = vi.fn(async () => {
      throw new Error("Unique constraint failed");
    });
    const raced = await createOrGetAutomationRunForOccurrence(prisma, args);
    expect(raced.created).toBe(false);
    expect(raced.run_id).toBe(first.run_id);
  });
});

describe("prepareAutomationOccurrenceWork", () => {
  beforeEach(() => {
    mockedMaterialize.mockReset();
    mockedResolve.mockReset();
  });

  it("resolves source, creates one run, materializes one draft", async () => {
    const { prisma, runs } = createReconcileMemory();
    mockedResolve.mockResolvedValue({
      ok: true,
      source: {
        post_id: POST,
        published_at: PUBLISHED,
        media_ids: [AUTOMATIONS_QA_POSTS.newest_with_image.media_id!],
        has_image_media: true
      }
    });
    mockedMaterialize.mockImplementation(async (_p, args) => {
      const run = [...runs.values()].find((r) => r.id === args.runId)!;
      run.status = "materialized";
      run.draftId = "draft_1";
      return {
        status: "materialized",
        run_id: run.id,
        draft_id: "draft_1"
      };
    });

    const result = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC,
      now: new Date("2026-07-20T14:00:00.000Z")
    });

    expect(result.status).toBe("materialized");
    if (result.status === "materialized" || result.status === "already_materialized") {
      expect(result.draft_id).toBe("draft_1");
      expect(result.source_post_id).toBe(POST);
      expect(result.created_run).toBe(true);
    }
    expect(runs.size).toBe(1);
    expect(mockedMaterialize).toHaveBeenCalledTimes(1);
    expect(mockedMaterialize.mock.calls[0]![1]).toMatchObject({
      automationId: AUTO,
      creatorId: CREATOR
    });
  });

  it("process retry returns already_materialized without second draft", async () => {
    const { prisma, runs } = createReconcileMemory();
    mockedResolve.mockResolvedValue({
      ok: true,
      source: {
        post_id: POST,
        published_at: PUBLISHED,
        media_ids: ["m1"],
        has_image_media: true
      }
    });
    let calls = 0;
    mockedMaterialize.mockImplementation(async (_p, args) => {
      calls += 1;
      const run = [...runs.values()].find((r) => r.id === args.runId)!;
      if (calls === 1) {
        run.status = "materialized";
        run.draftId = "draft_1";
        return { status: "materialized", run_id: run.id, draft_id: "draft_1" };
      }
      return { status: "already_materialized", run_id: run.id, draft_id: "draft_1" };
    });

    const first = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC
    });
    const second = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC
    });

    expect(first.status).toBe("materialized");
    expect(second.status).toBe("already_materialized");
    expect(runs.size).toBe(1);
    expect(mockedMaterialize).toHaveBeenCalledTimes(2);
  });

  it("returns no_eligible_post without creating a run", async () => {
    const { prisma, runs } = createReconcileMemory();
    mockedResolve.mockResolvedValue({ ok: false, code: "AUTOMATION_NO_ELIGIBLE_POST" });

    const result = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC
    });
    expect(result).toEqual({
      status: "no_eligible_post",
      code: "AUTOMATION_NO_ELIGIBLE_POST"
    });
    expect(runs.size).toBe(0);
    expect(mockedMaterialize).not.toHaveBeenCalled();
  });

  it("missing image creates run and surfaces source_media_required", async () => {
    const { prisma, runs } = createReconcileMemory();
    mockedResolve.mockResolvedValue({
      ok: false,
      code: "AUTOMATION_SOURCE_MEDIA_REQUIRED",
      source: {
        post_id: "post_no_media",
        published_at: PUBLISHED,
        media_ids: [],
        has_image_media: false
      }
    });
    mockedMaterialize.mockResolvedValue({
      status: "failed",
      run_id: "run_x",
      draft_id: null,
      failure_code: "AUTOMATION_SOURCE_MEDIA_REQUIRED",
      failure_reason: "AUTOMATION_SOURCE_MEDIA_REQUIRED: preview_transform_requires_source_media"
    });

    const result = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC
    });
    expect(result.status).toBe("source_media_required");
    expect(runs.size).toBe(1);
    expect(mockedMaterialize).toHaveBeenCalled();
  });
});
