/**
 * AUT-VS8-T01 — Integrated Automations acceptance matrix (B19).
 * Composes frozen fixtures + existing services; diagnoses only (no production behavior changes).
 *
 * @see docs/qa/AUTOMATIONS_ACCEPTANCE.md
 * @see docs/studio/automation-build-plans/09-VS8-INTEGRATION-ROLLOUT.md
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTOMATIONS_AU_TRACE,
  AUTOMATIONS_CREATE_DELAYED_RELEASE,
  AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
  AUTOMATIONS_QA_PERSONA,
  AUTOMATIONS_QA_POSTS,
  AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT,
  type AutomationsAcceptanceId
} from "./fixtures.js";
import {
  automationRunIdempotencyKeyForOccurrence,
  isAutomationsFeatureEnabled,
  AUTOMATIONS_FEATURE_ENV
} from "../../src/autopost/automation-contract.js";
import { buildAutomationApprovalDeepLink } from "../../src/autopost/automation-attention-service.js";
import { reminderIdForManualEvent } from "../../src/distribution/creator-schedule-event-contract.js";
import { buildAutomationPlanCreateBody } from "../../web/lib/automation-approval.js";
import {
  createOrGetAutomationRunForOccurrence,
  prepareAutomationOccurrenceWork
} from "../../src/autopost/automation-reconcile-service.js";

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

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

const mockedMaterialize = vi.mocked(materializeAutomationOwnedDistributionRun);
const mockedResolve = vi.mocked(resolveLatestEligiblePatreonPost);

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const AUTO = "auto_vs8_1";
const RULE = "rule_vs8_1";
const SERIES = "series_vs8_1";
const OCC = "occ_vs8_1";
const POST = AUTOMATIONS_QA_POSTS.newest_with_image.post_id;
const PUBLISHED = new Date(AUTOMATIONS_QA_POSTS.newest_with_image.published_at);

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

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
            throw new Error("Unique constraint failed on idempotency_key");
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

describe("VS8 integrated matrix — harness anchors (AUT-VS8-T01)", () => {
  it("AU trace owns every AU-01…AU-12", () => {
    const ids: AutomationsAcceptanceId[] = [
      "AU-01",
      "AU-02",
      "AU-03",
      "AU-04",
      "AU-05",
      "AU-06",
      "AU-07",
      "AU-08",
      "AU-09",
      "AU-10",
      "AU-11",
      "AU-12"
    ];
    for (const id of ids) {
      expect(AUTOMATIONS_AU_TRACE[id]?.primary_owner).toBeTruthy();
    }
  });

  it("feature flag defaults OFF (AU-12)", () => {
    const prev = process.env[AUTOMATIONS_FEATURE_ENV];
    delete process.env[AUTOMATIONS_FEATURE_ENV];
    expect(isAutomationsFeatureEnabled()).toBe(false);
    if (prev !== undefined) process.env[AUTOMATIONS_FEATURE_ENV] = prev;
  });

  it("create bodies freeze AU-02 / AU-11 shapes", () => {
    expect(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.preset_kind).toBe("preview_crosspost");
    expect(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.preview_template_id).toBeTruthy();
    expect(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.schedule).toBeTruthy();
    expect(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.client_mutation_key).toBeTruthy();

    expect(AUTOMATIONS_CREATE_DELAYED_RELEASE.preset_kind).toBe("delayed_public_release");
    expect(AUTOMATIONS_CREATE_DELAYED_RELEASE.offset_days).toBeTypeOf("number");
    expect(AUTOMATIONS_CREATE_DELAYED_RELEASE).not.toHaveProperty("schedule");
  });

  it("legacy regression anchors remain named (AU-12)", () => {
    expect(AUTOMATIONS_QA_PERSONA.legacy.schedule_series_id).toMatch(/^series_legacy_/);
    expect(AUTOMATIONS_QA_PERSONA.legacy.distribution_rule_id).toMatch(/^rule_legacy_/);
    expect(AUTOMATIONS_QA_PERSONA.legacy.social_playbook_id).toMatch(/^playbook_legacy_/);
  });
});

describe("VS8 matrix — AU-04→06 prepare path under reconcile", () => {
  it("resolves one source, creates one run, materializes one draft (AU-04/AU-06)", async () => {
    mockedResolve.mockReset();
    mockedMaterialize.mockReset();
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
      run.draftId = "draft_vs8_1";
      return { status: "materialized", run_id: run.id, draft_id: "draft_vs8_1" };
    });

    const result = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC,
      now: new Date("2026-07-20T14:00:00.000Z")
    });

    expect(result.status).toBe("materialized");
    if (result.status === "materialized" || result.status === "already_materialized") {
      expect(result.draft_id).toBe("draft_vs8_1");
      expect(result.source_post_id).toBe(POST);
    }
    expect(runs.size).toBe(1);
    expect(mockedMaterialize).toHaveBeenCalledTimes(1);
  });

  it("skips when no new eligible post (AU-05)", async () => {
    mockedResolve.mockReset();
    mockedMaterialize.mockReset();
    const { prisma, runs } = createReconcileMemory();
    mockedResolve.mockResolvedValue({
      ok: false,
      code: "AUTOMATION_NO_ELIGIBLE_POST"
    });

    const result = await prepareAutomationOccurrenceWork(prisma, {
      creatorId: CREATOR,
      automationId: AUTO,
      occurrenceId: OCC,
      now: new Date("2026-07-20T14:00:00.000Z")
    });

    expect(result.status).toBe("no_eligible_post");
    if (result.status === "no_eligible_post") {
      expect(result.code).toBe("AUTOMATION_NO_ELIGIBLE_POST");
    }
    expect(runs.size).toBe(0);
    expect(mockedMaterialize).not.toHaveBeenCalled();
  });
});

describe("VS8 matrix — AU-07/08/09 deep-link and plan ordering", () => {
  it("rail and toast share the same approval deep-link params (AU-07)", () => {
    const draftId = "draft_vs8";
    const runId = "run_vs8";
    const automationId = "auto_vs8";
    const eventId = "evt_vs8";

    const deep = buildAutomationApprovalDeepLink({
      draftId,
      runId,
      automationId,
      env: { RELAY_PUBLIC_WEB_BASE_URL: "https://relay.test" }
    });
    expect(deep).toContain(`draft_id=${draftId}`);
    expect(deep).toContain(`automation_run_id=${runId}`);
    expect(deep).toContain(`automation_id=${automationId}`);
    expect(deep).not.toMatch(/media_url|private|caption/i);

    const packet = reminderIdForManualEvent(eventId);
    expect(packet).toBe(`schedule_reminder:manual:${eventId}`);

    expect(AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT.draft_id).toBeTruthy();
    expect(AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT.existing_plan_id).toBeNull();
  });

  it("rejects plan create before preview_media_id (AU-09)", () => {
    expect(() =>
      buildAutomationPlanCreateBody({
        destinations: ["x"],
        draftId: "draft_1",
        previewMediaId: null
      })
    ).toThrow(/preview_media_id is required/);
  });

  it("includes preview_media_id after export (AU-09)", () => {
    const body = buildAutomationPlanCreateBody({
      destinations: ["x", "patreon"],
      draftId: "draft_1",
      previewMediaId: "media_preview_1"
    });
    expect(body.preview_media_id).toBe("media_preview_1");
    expect(body.needs_preview).toBe(true);
  });
});

describe("VS8 matrix — suite inventory (AU-01…AU-12 evidence map)", () => {
  const suites: Array<{ au: AutomationsAcceptanceId; paths: string[] }> = [
    {
      au: "AU-01",
      paths: ["tests/web/automations-modal.test.tsx", "tests/web/automations-flow.test.tsx"]
    },
    {
      au: "AU-02",
      paths: [
        "tests/automations/automation-service.test.ts",
        "tests/web/automations-flow.test.tsx"
      ]
    },
    { au: "AU-03", paths: ["tests/automations/trigger-series.test.ts"] },
    {
      au: "AU-04",
      paths: [
        "tests/automations/source-resolver.test.ts",
        "tests/automations/automation-reconcile.test.ts",
        "tests/automations/concurrency.test.ts"
      ]
    },
    {
      au: "AU-05",
      paths: [
        "tests/automations/automation-reconcile.test.ts",
        "tests/automations/automation-attention.test.ts"
      ]
    },
    {
      au: "AU-06",
      paths: [
        "tests/automations/automation-materializer.test.ts",
        "tests/automations/automation-reconcile.test.ts"
      ]
    },
    { au: "AU-07", paths: ["tests/automations/automation-attention.test.ts"] },
    {
      au: "AU-08",
      paths: [
        "tests/automations/automation-approval.test.ts",
        "tests/web/automation-previewizer.test.tsx"
      ]
    },
    {
      au: "AU-09",
      paths: [
        "tests/automations/automation-approval.test.ts",
        "tests/web/automation-previewizer.test.tsx"
      ]
    },
    {
      au: "AU-10",
      paths: [
        "tests/automations/automation-service.test.ts",
        "tests/automations/automation-reconcile.test.ts",
        "tests/web/automations-flow.test.tsx"
      ]
    },
    { au: "AU-11", paths: ["tests/automations/delayed-release.test.ts"] },
    {
      au: "AU-12",
      paths: [
        "tests/automations/spine-characterization.test.ts",
        "tests/automations/contracts.test.ts",
        "tests/automations/integration.test.ts"
      ]
    }
  ];

  it("required evidence files exist for each AU", () => {
    for (const row of suites) {
      for (const rel of row.paths) {
        expect(existsSync(join(repoRoot, rel)), `${row.au} missing ${rel}`).toBe(true);
      }
    }
  });

  it("no CreatorAutomationRun / automation_occurrence shadow ledger (AU-12)", () => {
    const rail = readSrc("src/distribution/schedule-rail-service.ts");
    expect(rail).not.toMatch(/automation_occurrence/);
    expect(rail).not.toMatch(/CreatorAutomationRun/);
    const web = readSrc("web/lib/schedule-rail-data.ts");
    expect(web).not.toMatch(/automation_occurrence/);
  });

  it("approval overlay remains the single UI adapter (AU-07/09)", () => {
    const host = readSrc("web/app/components/schedule-rail/StudioScheduleRail.tsx");
    expect(host).toMatch(/AutomationApprovalOverlay/);
    const modal = readSrc("web/app/components/automations/ScheduleRailAutomationsModal.tsx");
    expect(modal).not.toMatch(/from ["']@\/app\/components\/automations\/AutomationApprovalOverlay["']/);
  });
});

describe("VS8 matrix — occurrence idempotency key (AU-04)", () => {
  it("occurrence key is stable for concurrent workers", () => {
    const a = automationRunIdempotencyKeyForOccurrence(OCC);
    const b = automationRunIdempotencyKeyForOccurrence(OCC);
    expect(a).toBe(b);
    expect(a).toContain(OCC);
  });

  it("createOrGet recovers existing run on retry", async () => {
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
    const second = await createOrGetAutomationRunForOccurrence(prisma, args);
    expect(first.run_id).toBe(second.run_id);
    expect(runs.size).toBe(1);
  });
});
