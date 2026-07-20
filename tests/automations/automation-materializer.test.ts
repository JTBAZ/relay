/**
 * AUT-VS3-T02 — prepared-draft materializer (owned + legacy parity).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_TEMPLATE_SCHEMA_VERSION } from "../../src/distribution/preview-template-config.js";
import {
  materializeAutomationOwnedDistributionRun,
  materializeLegacyDistributionRun,
  teaserExcerpt
} from "../../src/autopost/automation-materializer.js";
import { materializeDueDistributionRuns } from "../../src/autopost/distribution-rule-service.js";
import { AUTOMATIONS_QA_PERSONA, AUTOMATIONS_QA_POSTS } from "./fixtures.js";

vi.mock("../../src/autopost/autopost-draft-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/autopost/autopost-draft-service.js")>();
  return {
    ...actual,
    saveAutopostDraft: vi.fn()
  };
});

vi.mock("../../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: vi.fn().mockResolvedValue({ ok: true })
}));

import { saveAutopostDraft } from "../../src/autopost/autopost-draft-service.js";

const mockedSave = vi.mocked(saveAutopostDraft);

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const TEMPLATE_ID = AUTOMATIONS_QA_PERSONA.preview_template_id;
const POST_ID = AUTOMATIONS_QA_POSTS.newest_with_image.post_id;
const MEDIA_ID = AUTOMATIONS_QA_POSTS.newest_with_image.media_id!;

function validTemplateConfig() {
  return {
    schemaVersion: PREVIEW_TEMPLATE_SCHEMA_VERSION,
    preset: "tight_crop",
    aspectKey: "1:1",
    compositionId: "blur_plug",
    compositionProps: { handle: "@qa" },
    compositionVariantIndex: null,
    overlayDoc: { textLayers: [], graphicLayers: [], logoLayers: [] },
    templateOptions: { platformId: "x", backgroundMode: "crop", relayBranding: false },
    destination: { selectedDestinationId: "x", customDestinationUrl: null }
  };
}

type RunRow = {
  id: string;
  creatorId: string;
  ruleId: string;
  sourcePostId: string;
  status: string;
  draftId: string | null;
  planId: string | null;
  failureReason: string | null;
  previewTemplateSnapshot: unknown;
  expiresAt: Date | null;
  materializedAt: Date | null;
  updatedAt: Date;
};

function createMaterializerMemory(options?: {
  mediaIds?: string[];
  templateConfig?: unknown | null;
  templateMissing?: boolean;
  automationArchived?: boolean;
}) {
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const now = new Date("2026-07-20T12:00:00.000Z");

  const rule = {
    id: "rule_owned_1",
    creatorId: CREATOR,
    title: "Delayed",
    targetDestinations: ["x", "bluesky"],
    transformMode: "preview",
    draftOnly: true,
    lastError: null as string | null
  };

  const automation = {
    id: "auto_1",
    creatorId: CREATOR,
    distributionRuleId: rule.id,
    previewTemplateId: TEMPLATE_ID,
    approvalTtlHours: 72,
    status: options?.automationArchived ? "archived" : "active"
  };

  const run: RunRow = {
    id: "run_1",
    creatorId: CREATOR,
    ruleId: rule.id,
    sourcePostId: POST_ID,
    status: "pending",
    draftId: null,
    planId: null,
    failureReason: null,
    previewTemplateSnapshot: null,
    expiresAt: null,
    materializedAt: null,
    updatedAt: now
  };

  const mediaIds = options?.mediaIds ?? [MEDIA_ID];
  const templateConfig =
    options?.templateConfig === undefined ? validTemplateConfig() : options.templateConfig;

  const draftsCreated: Array<{ workspace: Record<string, unknown> }> = [];

  mockedSave.mockImplementation(async (_prisma, creatorId, input) => {
    const draftId = nextId("draft");
    draftsCreated.push({ workspace: (input.workspace ?? {}) as Record<string, unknown> });
    return {
      draft_id: draftId,
      creator_id: creatorId,
      status: "nudged",
      media_ids: [],
      title: input.title ?? null,
      body_text: input.body_text ?? null,
      style_profile_id: null,
      intent: input.intent ?? null,
      performance_goal_id: null,
      composer_step: input.composer_step ?? "draft-post",
      workspace: input.workspace ?? {},
      enhancements: {},
      distribution_log: {},
      published_post_id: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
  });

  const prisma = {
    postVersion: {
      findFirst: vi.fn(async () => ({
        title: "QA Post",
        description: "Long body for teaser clipping and preview.",
        mediaIds
      }))
    },
    creatorAutomation: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.distributionRuleId && where.distributionRuleId !== rule.id) return null;
        if (where.id && where.id !== automation.id) return null;
        if (where.creatorId && where.creatorId !== CREATOR) return null;
        const statusFilter = where.status as { not?: string } | string | undefined;
        if (statusFilter && typeof statusFilter === "object" && statusFilter.not === "archived") {
          if (automation.status === "archived") return null;
        }
        if (where.select && (where.select as { id?: boolean }).id) {
          return { id: automation.id };
        }
        return {
          id: automation.id,
          approvalTtlHours: automation.approvalTtlHours,
          previewTemplateId: automation.previewTemplateId
        };
      })
    },
    creatorPreviewTemplate: {
      findFirst: vi.fn(async () => {
        if (options?.templateMissing) return null;
        return { id: TEMPLATE_ID, config: templateConfig };
      })
    },
    creatorDistributionRuleRun: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id && where.id !== run.id) return null;
        if (where.creatorId && where.creatorId !== CREATOR) return null;
        return { ...run, rule: { ...rule } };
      }),
      findUnique: vi.fn(async () => ({
        status: run.status,
        draftId: run.draftId
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(run, data);
        return run;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string; status: string };
          data: Record<string, unknown>;
        }) => {
          if (run.id !== where.id || run.status !== where.status) return { count: 0 };
          Object.assign(run, data);
          return { count: 1 };
        }
      ),
      findMany: vi.fn(async () => [{ ...run, rule: { ...rule } }])
    },
    creatorDistributionRule: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.lastError === "string" || data.lastError === null) {
          rule.lastError = data.lastError as string | null;
        }
        return rule;
      })
    }
  };

  return { prisma: prisma as any, run, rule, automation, draftsCreated, now };
}

describe("teaserExcerpt", () => {
  it("matches legacy clipping", () => {
    expect(teaserExcerpt("Title", null)).toBe("Preview: Title");
    expect(teaserExcerpt("T", "  hello   world  ")).toBe("hello world");
  });
});

describe("materializeLegacyDistributionRun", () => {
  beforeEach(() => {
    mockedSave.mockReset();
  });

  it("preserves legacy workspace shape and empty media draft", async () => {
    const { prisma, draftsCreated, now } = createMaterializerMemory();
    // Force legacy path by making ownership lookup return null via empty automation find
    prisma.creatorAutomation.findFirst = vi.fn().mockResolvedValue(null);

    const result = await materializeLegacyDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      now
    });

    expect(result.status).toBe("materialized");
    expect(result.draft_id).toBeTruthy();
    expect(mockedSave).toHaveBeenCalledTimes(1);
    const workspace = draftsCreated[0]!.workspace;
    expect(workspace).toEqual({
      selected_destinations: ["x", "bluesky"],
      planned_format: "mixed",
      source_post_id: POST_ID,
      automation_rule_id: "rule_owned_1",
      transform_mode: "preview"
    });
    expect(workspace).not.toHaveProperty("automation_id");
    expect(mockedSave.mock.calls[0]![2].media_ids).toEqual([]);
  });

  it("allows missing source media (legacy parity)", async () => {
    const { prisma, now } = createMaterializerMemory({ mediaIds: [] });
    const result = await materializeLegacyDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      now
    });
    expect(result.status).toBe("materialized");
  });
});

describe("materializeAutomationOwnedDistributionRun", () => {
  beforeEach(() => {
    mockedSave.mockReset();
  });

  it("snapshots template, sets correlation + expiresAt, one draft, no plan", async () => {
    const { prisma, run, draftsCreated, now } = createMaterializerMemory();
    const result = await materializeAutomationOwnedDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      automationId: "auto_1",
      now
    });

    expect(result.status).toBe("materialized");
    expect(result.draft_id).toBeTruthy();
    expect(run.status).toBe("materialized");
    expect(run.planId).toBeNull();
    expect(run.previewTemplateSnapshot).toMatchObject({
      schemaVersion: PREVIEW_TEMPLATE_SCHEMA_VERSION,
      preset: "tight_crop"
    });
    expect(run.expiresAt?.toISOString()).toBe(
      new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
    );
    expect(draftsCreated[0]!.workspace).toMatchObject({
      automation_id: "auto_1",
      automation_run_id: "run_1",
      distribution_rule_run_id: "run_1",
      preview_template_id: TEMPLATE_ID,
      source_post_id: POST_ID,
      automation_rule_id: "rule_owned_1",
      needs_preview: true
    });
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when already materialized", async () => {
    const { prisma, run, now } = createMaterializerMemory();
    run.status = "materialized";
    run.draftId = "draft_existing";
    const result = await materializeAutomationOwnedDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      automationId: "auto_1",
      now
    });
    expect(result).toEqual({
      status: "already_materialized",
      run_id: "run_1",
      draft_id: "draft_existing"
    });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("fails with AUTOMATION_SOURCE_MEDIA_REQUIRED when source has no media", async () => {
    const { prisma, run, now } = createMaterializerMemory({ mediaIds: [] });
    const result = await materializeAutomationOwnedDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      automationId: "auto_1",
      now
    });
    expect(result.status).toBe("failed");
    expect(result.failure_code).toBe("AUTOMATION_SOURCE_MEDIA_REQUIRED");
    expect(run.status).toBe("failed");
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("fails with AUTOMATION_TEMPLATE_NOT_FOUND when template missing", async () => {
    const { prisma, run, now } = createMaterializerMemory({ templateMissing: true });
    const result = await materializeAutomationOwnedDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      automationId: "auto_1",
      now
    });
    expect(result.status).toBe("failed");
    expect(result.failure_code).toBe("AUTOMATION_TEMPLATE_NOT_FOUND");
    expect(run.failureReason).toMatch(/^AUTOMATION_TEMPLATE_NOT_FOUND:/);
  });

  it("fails with AUTOMATION_NO_ELIGIBLE_POST when source version missing", async () => {
    const mem = createMaterializerMemory();
    mem.prisma.postVersion.findFirst = vi.fn().mockResolvedValue(null);
    const result = await materializeAutomationOwnedDistributionRun(mem.prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      automationId: "auto_1",
      now: mem.now
    });
    expect(result.failure_code).toBe("AUTOMATION_NO_ELIGIBLE_POST");
  });

  it("concurrent finalize: losing updateMany returns already_materialized", async () => {
    const { prisma, run, now } = createMaterializerMemory();
    prisma.creatorDistributionRuleRun.updateMany = vi.fn(async () => ({ count: 0 }));
    prisma.creatorDistributionRuleRun.findUnique = vi.fn(async () => ({
      status: "materialized" as const,
      draftId: "draft_winner"
    }));

    const result = await materializeAutomationOwnedDistributionRun(prisma, {
      runId: "run_1",
      creatorId: CREATOR,
      automationId: "auto_1",
      now
    });
    expect(result.status).toBe("already_materialized");
    expect(result.draft_id).toBe("draft_winner");
    expect(run.status).toBe("pending"); // loser did not overwrite
  });
});

describe("materializeDueDistributionRuns routing", () => {
  beforeEach(() => {
    mockedSave.mockReset();
    process.env.RELAY_FEATURE_DISTRIBUTION_RULES = "true";
  });

  it("routes owned runs through owned materializer", async () => {
    const { prisma, now, run } = createMaterializerMemory();
    const result = await materializeDueDistributionRuns(prisma, { now, creatorId: CREATOR });
    expect(result).toEqual({ materialized: 1, failed: 0 });
    expect(run.previewTemplateSnapshot).toBeTruthy();
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it("routes unowned runs through legacy materializer", async () => {
    const { prisma, now, run, draftsCreated } = createMaterializerMemory();
    prisma.creatorAutomation.findFirst = vi.fn().mockResolvedValue(null);
    const result = await materializeDueDistributionRuns(prisma, { now, creatorId: CREATOR });
    expect(result.materialized).toBe(1);
    expect(run.previewTemplateSnapshot).toBeNull();
    expect(draftsCreated[0]!.workspace).not.toHaveProperty("automation_id");
  });
});
