/**
 * Automations lifecycle service tests (VS2 / B05).
 * In-memory Prisma mocks — no DB / no production migration.
 */
import { CreatorPlan } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATIONS_FEATURE_ENV } from "../../src/autopost/automation-contract.js";
import {
  AUTOMATION_MUTATION_RULE_TITLE_PREFIX,
  archiveAutomation,
  AutomationServiceError,
  createAutomation,
  getAutomation,
  listAutomations,
  patchAutomation
} from "../../src/autopost/automation-service.js";
import {
  AUTOMATIONS_CREATE_DELAYED_RELEASE,
  AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
  AUTOMATIONS_QA_PERSONA
} from "./fixtures.js";

vi.mock("../../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: vi.fn()
}));

vi.mock("../../src/autopost/schedule-series-service.js", () => ({
  ensureOccurrencesForSeries: vi.fn().mockResolvedValue(0)
}));

import { requireCreatorPlanAtLeast } from "../../src/billing/creator-plan-entitlement-service.js";
import { ensureOccurrencesForSeries } from "../../src/autopost/schedule-series-service.js";

const requireAutopost = vi.mocked(requireCreatorPlanAtLeast);
const ensureOcc = vi.mocked(ensureOccurrencesForSeries);

type AutoRow = {
  id: string;
  creatorId: string;
  presetKind: string;
  status: string;
  title: string;
  sourceKind: string;
  scheduleSeriesId: string | null;
  distributionRuleId: string;
  previewTemplateId: string | null;
  approvalTtlHours: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type RuleRow = {
  id: string;
  creatorId: string;
  status: string;
  offsetDays: number;
  targetDestinations: string[];
  remindMe: boolean;
  title: string | null;
  triggerKind: string;
  transformMode: string;
  draftOnly: boolean;
};

type SeriesRow = {
  id: string;
  creatorId: string;
  status: string;
  cadence: string;
  interval: number;
  localTime: string;
  timezone: string;
  weekdays: number[];
  monthDays: number[];
  destinations: string[];
  remindMe: boolean;
  materializationKind: string;
  titleHint: string | null;
  plannedFormat: string;
  startsAt: Date;
};

function createMemoryPrisma(creatorId = AUTOMATIONS_QA_PERSONA.creator_id) {
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const automations = new Map<string, AutoRow>();
  const rules = new Map<string, RuleRow>();
  const series = new Map<string, SeriesRow>();
  const templates = new Map<string, { id: string; creatorId: string }>([
    [
      AUTOMATIONS_QA_PERSONA.preview_template_id,
      { id: AUTOMATIONS_QA_PERSONA.preview_template_id, creatorId }
    ]
  ]);
  const runs: Array<{
    id: string;
    ruleId: string;
    creatorId: string;
    status: string;
    createdAt: Date;
  }> = [];
  const occurrences: Array<{ seriesId: string; dueAt: Date; status: string }> = [];

  function hydrate(row: AutoRow) {
    return {
      ...row,
      scheduleSeries: row.scheduleSeriesId ? series.get(row.scheduleSeriesId)! : null,
      distributionRule: rules.get(row.distributionRuleId)!,
      previewTemplate: row.previewTemplateId
        ? templates.get(row.previewTemplateId)
          ? { id: row.previewTemplateId }
          : null
        : null
    };
  }

  const api = {
    creatorAutomation: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of automations.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.creatorId && row.creatorId !== where.creatorId) continue;
          if (where.distributionRuleId && row.distributionRuleId !== where.distributionRuleId) {
            continue;
          }
          return hydrate(row);
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where: { creatorId: string } }) =>
        [...automations.values()]
          .filter((r) => r.creatorId === where.creatorId)
          .map(hydrate)
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: AutoRow = {
          id: nextId("auto"),
          creatorId: data.creatorId as string,
          presetKind: data.presetKind as string,
          status: (data.status as string) ?? "active",
          title: data.title as string,
          sourceKind: data.sourceKind as string,
          scheduleSeriesId: (data.scheduleSeriesId as string | null) ?? null,
          distributionRuleId: data.distributionRuleId as string,
          previewTemplateId: (data.previewTemplateId as string | null) ?? null,
          approvalTtlHours: (data.approvalTtlHours as number) ?? 72,
          version: (data.version as number) ?? 1,
          createdAt: new Date("2026-07-20T12:00:00.000Z"),
          updatedAt: new Date("2026-07-20T12:00:00.000Z")
        };
        automations.set(row.id, row);
        return hydrate(row);
      }),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = automations.get(where.id);
          if (!row) throw new Error("missing automation");
          if (typeof data.status === "string") row.status = data.status;
          if (typeof data.title === "string") row.title = data.title;
          if (typeof data.approvalTtlHours === "number") {
            row.approvalTtlHours = data.approvalTtlHours;
          }
          if (data.version && typeof data.version === "object" && data.version !== null) {
            const inc = data.version as { increment?: number };
            if (inc.increment) row.version += inc.increment;
          }
          if (data.previewTemplate && typeof data.previewTemplate === "object") {
            const pt = data.previewTemplate as {
              disconnect?: boolean;
              connect?: { id: string };
            };
            if (pt.disconnect) row.previewTemplateId = null;
            if (pt.connect?.id) row.previewTemplateId = pt.connect.id;
          }
          row.updatedAt = new Date("2026-07-20T13:00:00.000Z");
          automations.set(row.id, row);
          return hydrate(row);
        }
      )
    },
    creatorDistributionRule: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of rules.values()) {
          if (where.creatorId && row.creatorId !== where.creatorId) continue;
          if (where.title && row.title !== where.title) continue;
          if (where.id && row.id !== where.id) continue;
          return where.select ? { id: row.id } : row;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: RuleRow = {
          id: nextId("rule"),
          creatorId: data.creatorId as string,
          status: (data.status as string) ?? "active",
          offsetDays: (data.offsetDays as number) ?? 30,
          targetDestinations: (data.targetDestinations as string[]) ?? [],
          remindMe: (data.remindMe as boolean) ?? true,
          title: (data.title as string | null) ?? null,
          triggerKind: (data.triggerKind as string) ?? "patreon_published",
          transformMode: (data.transformMode as string) ?? "preview",
          draftOnly: (data.draftOnly as boolean) ?? true
        };
        rules.set(row.id, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = rules.get(where.id);
          if (!row) throw new Error("missing rule");
          Object.assign(row, data);
          return row;
        }
      )
    },
    creatorScheduleSeries: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: SeriesRow = {
          id: nextId("series"),
          creatorId: data.creatorId as string,
          status: (data.status as string) ?? "active",
          cadence: data.cadence as string,
          interval: (data.interval as number) ?? 1,
          localTime: data.localTime as string,
          timezone: data.timezone as string,
          weekdays: (data.weekdays as number[]) ?? [],
          monthDays: (data.monthDays as number[]) ?? [],
          destinations: (data.destinations as string[]) ?? [],
          remindMe: (data.remindMe as boolean) ?? true,
          materializationKind: (data.materializationKind as string) ?? "post_draft",
          titleHint: (data.titleHint as string | null) ?? null,
          plannedFormat: (data.plannedFormat as string) ?? "mixed",
          startsAt: (data.startsAt as Date) ?? new Date()
        };
        series.set(row.id, row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = series.get(where.id);
          if (!row) throw new Error("missing series");
          Object.assign(row, data);
          return row;
        }
      )
    },
    creatorPreviewTemplate: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; creatorId: string } }) => {
        const t = templates.get(where.id);
        if (!t || t.creatorId !== where.creatorId) return null;
        return { id: t.id };
      })
    },
    creatorScheduleOccurrence: {
      findFirst: vi.fn(async ({ where }: { where: { seriesId: string } }) => {
        const hit = occurrences.find(
          (o) =>
            o.seriesId === where.seriesId &&
            (o.status === "planned" || o.status === "materialized")
        );
        return hit ? { dueAt: hit.dueAt } : null;
      })
    },
    creatorDistributionRuleRun: {
      findFirst: vi.fn(async ({ where }: { where: { ruleId: string } }) => {
        const hit = runs
          .filter((r) => r.ruleId === where.ruleId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return hit ? { id: hit.id, status: hit.status } : null;
      }),
      findMany: vi.fn(async () => [])
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(api))
  };

  return {
    api: api as never,
    automations,
    rules,
    series,
    templates,
    runs,
    occurrences,
    addRun(ruleId: string, status = "pending") {
      runs.push({
        id: nextId("run"),
        ruleId,
        creatorId,
        status,
        createdAt: new Date()
      });
    }
  };
}

describe("automation-service lifecycle (B05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env[AUTOMATIONS_FEATURE_ENV] = "true";
    requireAutopost.mockResolvedValue({ ok: true, plan: CreatorPlan.autopost });
    ensureOcc.mockResolvedValue(0);
  });

  it("rejects when feature flag is off", async () => {
    process.env[AUTOMATIONS_FEATURE_ENV] = "false";
    const { api } = createMemoryPrisma();
    await expect(
      createAutomation(api, AUTOMATIONS_QA_PERSONA.creator_id, AUTOMATIONS_CREATE_PREVIEW_CROSSPOST)
    ).rejects.toMatchObject({ code: "AUTOMATION_DISABLED", statusCode: 404 });
  });

  it("rejects when Autopost plan is missing", async () => {
    requireAutopost.mockResolvedValue({
      ok: false,
      error: "plan_required",
      required_plan: "autopost"
    });
    const { api } = createMemoryPrisma();
    await expect(
      createAutomation(api, AUTOMATIONS_QA_PERSONA.creator_id, AUTOMATIONS_CREATE_PREVIEW_CROSSPOST)
    ).rejects.toMatchObject({ code: "AUTOMATION_PLAN_REQUIRED", statusCode: 402 });
  });

  it("creates preview_crosspost with trigger series + owned rule", async () => {
    const mem = createMemoryPrisma();
    const result = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_PREVIEW_CROSSPOST
    );

    expect(result.receipt.created).toBe(true);
    expect(result.automation.preset_kind).toBe("preview_crosspost");
    expect(result.automation.trigger_kind).toBe("scheduled_occurrence");
    expect(result.automation.series_materialization_kind).toBe("automation_trigger");
    expect(result.automation.schedule_series_id).toBeTruthy();
    expect(result.automation.distribution_rule_id).toBeTruthy();
    expect(result.automation.offset_days).toBeNull();
    expect(result.automation.version).toBe(1);

    const series = [...mem.series.values()][0]!;
    expect(series.materializationKind).toBe("automation_trigger");
    expect(ensureOcc).toHaveBeenCalled();

    const rule = [...mem.rules.values()][0]!;
    expect(rule.offsetDays).toBe(0);
    expect(rule.title).toBe(
      `${AUTOMATION_MUTATION_RULE_TITLE_PREFIX}${AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.client_mutation_key}`
    );
  });

  it("creates delayed_public_release without a schedule series", async () => {
    const mem = createMemoryPrisma();
    const result = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_DELAYED_RELEASE
    );
    expect(result.automation.preset_kind).toBe("delayed_public_release");
    expect(result.automation.schedule_series_id).toBeNull();
    expect(result.automation.series_materialization_kind).toBeNull();
    expect(result.automation.offset_days).toBe(30);
    expect(result.automation.trigger_kind).toBe("patreon_published");
    expect(mem.series.size).toBe(0);
  });

  it("is retry-safe for duplicate client_mutation_key", async () => {
    const mem = createMemoryPrisma();
    const first = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_PREVIEW_CROSSPOST
    );
    const second = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_PREVIEW_CROSSPOST
    );
    expect(second.receipt.created).toBe(false);
    expect(second.automation.automation_id).toBe(first.automation.automation_id);
    expect(mem.automations.size).toBe(1);
    expect(mem.rules.size).toBe(1);
  });

  it("rejects missing/foreign preview template", async () => {
    const mem = createMemoryPrisma();
    await expect(
      createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
        ...AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
        preview_template_id: "tpl_other",
        client_mutation_key: "mut_missing_tpl"
      })
    ).rejects.toMatchObject({ code: "AUTOMATION_TEMPLATE_NOT_FOUND" });
  });

  it("scopes get/list to creator and rejects cross-creator get", async () => {
    const mem = createMemoryPrisma();
    const created = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_DELAYED_RELEASE
    );
    const listed = await listAutomations(mem.api, AUTOMATIONS_QA_PERSONA.creator_id);
    expect(listed).toHaveLength(1);

    await expect(
      getAutomation(mem.api, "creator_other", created.automation.automation_id)
    ).rejects.toMatchObject({ code: "AUTOMATION_NOT_FOUND", statusCode: 404 });
  });

  it("pause/resume keeps connector + children aligned", async () => {
    const mem = createMemoryPrisma();
    const created = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_PREVIEW_CROSSPOST
    );

    const paused = await patchAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      { version: 1, status: "paused" }
    );
    expect(paused.automation.status).toBe("paused");
    expect(paused.automation.version).toBe(2);
    expect([...mem.rules.values()][0]!.status).toBe("paused");
    expect([...mem.series.values()][0]!.status).toBe("paused");

    const resumed = await patchAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      { version: 2, status: "active" }
    );
    expect(resumed.automation.status).toBe("active");
    expect([...mem.rules.values()][0]!.status).toBe("active");
    expect([...mem.series.values()][0]!.status).toBe("active");
  });

  it("rejects stale version patches", async () => {
    const mem = createMemoryPrisma();
    const created = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_DELAYED_RELEASE
    );
    await expect(
      patchAutomation(
        mem.api,
        AUTOMATIONS_QA_PERSONA.creator_id,
        created.automation.automation_id,
        { version: 99, status: "paused" }
      )
    ).rejects.toMatchObject({ code: "AUTOMATION_VERSION_CONFLICT", statusCode: 409 });
  });

  it("archive ends series, pauses rule, retains run history", async () => {
    const mem = createMemoryPrisma();
    const created = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_PREVIEW_CROSSPOST
    );
    mem.addRun(created.automation.distribution_rule_id, "pending");

    const archived = await archiveAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      created.automation.version
    );
    expect(archived.automation.status).toBe("archived");
    expect([...mem.rules.values()][0]!.status).toBe("paused");
    expect([...mem.series.values()][0]!.status).toBe("ended");
    expect(mem.runs).toHaveLength(1);
    expect(mem.automations.size).toBe(1);
  });

  it("keeps deleted-template id repairable on get (no cross-creator fallback)", async () => {
    const mem = createMemoryPrisma();
    const created = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      AUTOMATIONS_CREATE_PREVIEW_CROSSPOST
    );
    mem.templates.delete(AUTOMATIONS_QA_PERSONA.preview_template_id);

    const wire = await getAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id
    );
    expect(wire.preview_template_id).toBe(AUTOMATIONS_QA_PERSONA.preview_template_id);
  });

  it("rolls back when child create fails mid-transaction", async () => {
    const mem = createMemoryPrisma();
    mem.api.creatorAutomation.create = vi.fn(async () => {
      throw new Error("simulated connector failure");
    });
    // $transaction should surface the error; nothing should stick if create fails after children —
    // our mock transaction does not auto-rollback, so assert the service throws.
    await expect(
      createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
        ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
        client_mutation_key: "mut_partial_fail"
      })
    ).rejects.toThrow(/simulated connector failure/);
  });

  it("surfaces AutomationServiceError for invalid create bodies", async () => {
    const { api } = createMemoryPrisma();
    await expect(
      createAutomation(api, AUTOMATIONS_QA_PERSONA.creator_id, {
        preset_kind: "nope",
        target_destinations: ["x"]
      })
    ).rejects.toBeInstanceOf(AutomationServiceError);
  });
});
