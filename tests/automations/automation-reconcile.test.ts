/**
 * AUT-VS4-T02 — occurrence-linked run create/get + shared materializer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrGetAutomationRunForOccurrence,
  expireStaleAutomationRuns,
  prepareAutomationOccurrenceWork,
  reconcileAutomations
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

describe("reconcileAutomations (AUT-VS4-T03)", () => {
  const NOW = new Date("2026-07-20T15:00:00.000Z");

  beforeEach(() => {
    mockedMaterialize.mockReset();
    mockedResolve.mockReset();
    process.env.RELAY_FEATURE_AUTOMATIONS = "true";
  });

  function createCoordinatorMemory(opts?: {
    awaitingRun?: { id: string; status: string } | null;
    staleRuns?: Array<{ id: string; expiresAt: Date; status: string }>;
    dueOccurrences?: Array<{ id: string; status: string }>;
  }) {
    const occs = new Map(
      (opts?.dueOccurrences ?? [{ id: OCC, status: "planned" }]).map((o) => [
        o.id,
        {
          id: o.id,
          seriesId: SERIES,
          creatorId: CREATOR,
          dueAt: new Date("2026-07-20T14:00:00.000Z"),
          status: o.status,
          draftId: null as string | null,
          failureReason: null as string | null,
          materializedAt: null as Date | null
        }
      ])
    );
    const runs = new Map(
      (opts?.staleRuns ?? []).map((r) => [
        r.id,
        {
          id: r.id,
          creatorId: CREATOR,
          ruleId: RULE,
          status: r.status,
          expiresAt: r.expiresAt,
          scheduleOccurrenceId: OCC as string | null
        }
      ])
    );
    let awaiting = opts?.awaitingRun ?? null;

    const prisma = {
      creatorDistributionRuleRun: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          // expire sweep
          if (where.status === "materialized" && where.expiresAt) {
            return [...runs.values()]
              .filter((r) => r.status === "materialized" && r.expiresAt <= NOW)
              .map((r) => ({
                id: r.id,
                creatorId: r.creatorId,
                ruleId: r.ruleId,
                scheduleOccurrenceId: r.scheduleOccurrenceId
              }));
          }
          return [];
        }),
        findFirst: vi.fn(async () => awaiting),
        updateMany: vi.fn(
          async ({
            where,
            data
          }: {
            where: { id: string; status: string };
            data: Record<string, unknown>;
          }) => {
            const row = runs.get(where.id);
            if (!row || row.status !== where.status) return { count: 0 };
            Object.assign(row, data);
            return { count: 1 };
          }
        ),
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: "run_new",
            ruleId: data.ruleId as string,
            creatorId: data.creatorId as string,
            sourcePostId: data.sourcePostId as string,
            idempotencyKey: data.idempotencyKey as string,
            scheduleOccurrenceId: data.scheduleOccurrenceId as string,
            status: "pending",
            draftId: null
          };
          return row;
        })
      },
      creatorAutomation: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          if (where.distributionRuleId === RULE || where.id === AUTO) {
            return {
              id: AUTO,
              distributionRuleId: RULE,
              scheduleSeriesId: SERIES,
              creatorId: CREATOR
            };
          }
          return null;
        }),
        findMany: vi.fn(async () => [
          {
            id: AUTO,
            creatorId: CREATOR,
            distributionRuleId: RULE,
            scheduleSeriesId: SERIES
          }
        ])
      },
      creatorScheduleOccurrence: {
        findMany: vi.fn(async () =>
          [...occs.values()]
            .filter((o) => o.status === "planned")
            .map((o) => ({
              id: o.id,
              seriesId: o.seriesId,
              creatorId: o.creatorId,
              dueAt: o.dueAt
            }))
        ),
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const row = occs.get(where.id as string);
          if (!row) return null;
          return {
            ...row,
            series: { materializationKind: "automation_trigger", status: "active" }
          };
        }),
        updateMany: vi.fn(
          async ({
            where,
            data
          }: {
            where: { id: string; status: string };
            data: Record<string, unknown>;
          }) => {
            const row = occs.get(where.id);
            if (!row || row.status !== where.status) return { count: 0 };
            Object.assign(row, data);
            return { count: 1 };
          }
        )
      }
    };

    return { prisma: prisma as any, occs, runs, setAwaiting: (v: typeof awaiting) => (awaiting = v) };
  }

  it("flag-off performs no discovery/materialization and preserves prepared runs", async () => {
    process.env.RELAY_FEATURE_AUTOMATIONS = "false";
    const preparedId = "run_prepared_keep";
    const { prisma, runs, occs } = createCoordinatorMemory({
      awaitingRun: { id: preparedId, status: "materialized" },
      staleRuns: [
        {
          id: preparedId,
          status: "materialized",
          // Future expiry — must not be swept while flag is off either.
          expiresAt: new Date("2026-07-23T14:00:00.000Z")
        }
      ]
    });
    const result = await reconcileAutomations(prisma, { now: NOW });
    expect(result).toMatchObject({
      expired: 0,
      claimed: 0,
      materialized: 0,
      skipped_no_post: 0,
      skipped_awaiting_review: 0,
      failed: 0
    });
    expect(result.notification_intents).toEqual([]);
    expect(mockedResolve).not.toHaveBeenCalled();
    expect(runs.get(preparedId)?.status).toBe("materialized");
    expect(occs.get(OCC)?.status).toBe("planned");
  });

  it("skips due occurrence while awaiting review without creating work", async () => {
    const { prisma, occs } = createCoordinatorMemory({
      awaitingRun: { id: "run_open", status: "materialized" }
    });
    const result = await reconcileAutomations(prisma, { now: NOW });
    expect(result.skipped_awaiting_review).toBe(1);
    expect(occs.get(OCC)!.status).toBe("skipped");
    expect(occs.get(OCC)!.failureReason).toBe("awaiting_review");
    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it("marks no-new-post skipped and emits deduped notification intent", async () => {
    const { prisma, occs } = createCoordinatorMemory({ awaitingRun: null });
    mockedResolve.mockResolvedValue({ ok: false, code: "AUTOMATION_NO_ELIGIBLE_POST" });
    const result = await reconcileAutomations(prisma, { now: NOW });
    expect(result.skipped_no_post).toBe(1);
    expect(occs.get(OCC)!.status).toBe("skipped");
    expect(result.notification_intents).toEqual([
      {
        kind: "automation_no_new_post",
        creator_id: CREATOR,
        automation_id: AUTO,
        occurrence_id: OCC,
        dedupe_key: `automation_no_new_post:occurrence:${OCC}`
      }
    ]);
  });

  it("expires stale materialized runs idempotently", async () => {
    const { prisma, runs } = createCoordinatorMemory({
      dueOccurrences: [],
      staleRuns: [
        {
          id: "run_stale",
          status: "materialized",
          expiresAt: new Date("2026-07-19T00:00:00.000Z")
        }
      ]
    });
    const first = await expireStaleAutomationRuns(prisma, { now: NOW });
    expect(first.expired).toBe(1);
    expect(runs.get("run_stale")!.status).toBe("expired");
    expect(first.notification_intents[0]?.dedupe_key).toBe(
      "automation_approval_expired:run:run_stale"
    );
    const second = await expireStaleAutomationRuns(prisma, { now: NOW });
    expect(second.expired).toBe(0);
  });

  it("materializes due occurrence and recovers after crash (already planned→materialized)", async () => {
    const { prisma, occs } = createCoordinatorMemory({ awaitingRun: null });
    mockedResolve.mockResolvedValue({
      ok: true,
      source: {
        post_id: POST,
        published_at: PUBLISHED,
        media_ids: ["m1"],
        has_image_media: true
      }
    });
    mockedMaterialize.mockResolvedValue({
      status: "materialized",
      run_id: "run_new",
      draft_id: "draft_1"
    });
    const first = await reconcileAutomations(prisma, { now: NOW });
    expect(first.materialized).toBe(1);
    expect(occs.get(OCC)!.status).toBe("materialized");
    expect(occs.get(OCC)!.draftId).toBe("draft_1");

    // Second pass: occurrence no longer planned → nothing claimed
    const second = await reconcileAutomations(prisma, { now: NOW });
    expect(second.claimed).toBe(0);
    expect(second.materialized).toBe(0);
  });
});
