/**
 * Delayed public release preset wrapper (VS3 / B07).
 * Proves owned-rule lifecycle + shared discovery — no second worker path.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { CreatorPlan, PostSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATIONS_FEATURE_ENV } from "../../src/autopost/automation-contract.js";
import {
  AUTOMATION_MUTATION_RULE_TITLE_PREFIX,
  archiveAutomation,
  createAutomation,
  patchAutomation
} from "../../src/autopost/automation-service.js";
import {
  createDistributionRule,
  deleteDistributionRule,
  discoverDistributionRuleRuns,
  DistributionRuleValidationError,
  findAutomationIdForDistributionRule,
  isAutomationOwnedDistributionRule,
  patchDistributionRule
} from "../../src/autopost/distribution-rule-service.js";
import { AUTOMATIONS_CREATE_DELAYED_RELEASE, AUTOMATIONS_QA_PERSONA } from "./fixtures.js";

vi.mock("../../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: vi.fn()
}));

vi.mock("../../src/autopost/schedule-series-service.js", () => ({
  ensureOccurrencesForSeries: vi.fn().mockResolvedValue(0)
}));

import { requireCreatorPlanAtLeast } from "../../src/billing/creator-plan-entitlement-service.js";

const requireAutopost = vi.mocked(requireCreatorPlanAtLeast);

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

function createDelayedMemory(creatorId = AUTOMATIONS_QA_PERSONA.creator_id) {
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const automations = new Map<string, AutoRow>();
  const rules = new Map<string, RuleRow>();
  const runs = new Map<string, { ruleId: string; sourcePostId: string }>();
  const templates = new Map([[AUTOMATIONS_QA_PERSONA.preview_template_id, { id: AUTOMATIONS_QA_PERSONA.preview_template_id, creatorId }]]);

  function hydrate(row: AutoRow) {
    return {
      ...row,
      scheduleSeries: null,
      distributionRule: rules.get(row.distributionRuleId)!,
      previewTemplate: row.previewTemplateId ? { id: row.previewTemplateId } : null
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
          if (where.select) return { id: row.id };
          return hydrate(row);
        }
        return null;
      }),
      findMany: vi.fn(async () => [...automations.values()].map(hydrate)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: AutoRow = {
          id: nextId("auto"),
          creatorId: data.creatorId as string,
          presetKind: data.presetKind as string,
          status: (data.status as string) ?? "active",
          title: data.title as string,
          sourceKind: data.sourceKind as string,
          scheduleSeriesId: null,
          distributionRuleId: data.distributionRuleId as string,
          previewTemplateId: (data.previewTemplateId as string | null) ?? null,
          approvalTtlHours: (data.approvalTtlHours as number) ?? 72,
          version: 1,
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
          const row = automations.get(where.id)!;
          if (typeof data.status === "string") row.status = data.status;
          if (typeof data.title === "string") row.title = data.title;
          if (data.version && typeof data.version === "object") {
            row.version += (data.version as { increment?: number }).increment ?? 0;
          }
          row.updatedAt = new Date("2026-07-20T13:00:00.000Z");
          return hydrate(row);
        }
      )
    },
    creatorDistributionRule: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const row of rules.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.creatorId && row.creatorId !== where.creatorId) continue;
          if (where.title && row.title !== where.title) continue;
          return where.select ? { id: row.id } : row;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { status?: string; creatorId?: string } }) => {
        return [...rules.values()].filter((r) => {
          if (where?.status && r.status !== where.status) return false;
          if (where?.creatorId && r.creatorId !== where.creatorId) return false;
          return true;
        });
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
        const full = {
          ...row,
          lastError: null as string | null,
          createdAt: new Date("2026-07-20T12:00:00.000Z"),
          updatedAt: new Date("2026-07-20T12:00:00.000Z")
        };
        rules.set(row.id, row);
        return full;
      }),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = rules.get(where.id)!;
          Object.assign(row, data);
          return {
            ...row,
            lastError: null,
            createdAt: new Date("2026-07-20T12:00:00.000Z"),
            updatedAt: new Date("2026-07-20T13:00:00.000Z")
          };
        }
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        rules.delete(where.id);
      })
    },
    creatorPreviewTemplate: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; creatorId: string } }) => {
        const t = templates.get(where.id);
        return t && t.creatorId === where.creatorId ? { id: t.id } : null;
      })
    },
    creatorScheduleOccurrence: { findFirst: vi.fn(async () => null) },
    creatorDistributionRuleRun: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(
        async ({
          data
        }: {
          data: { ruleId: string; sourcePostId: string; creatorId: string };
        }) => {
          const key = `${data.ruleId}:${data.sourcePostId}`;
          if (runs.has(key)) {
            const err = new Error("Unique constraint failed");
            throw err;
          }
          runs.set(key, { ruleId: data.ruleId, sourcePostId: data.sourcePostId });
          return { id: nextId("run"), ...data };
        }
      )
    },
    post: {
      findMany: vi.fn(async () => [] as unknown[])
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(api))
  };

  return { api: api as never, automations, rules, runs };
}

describe("delayed public release wrapper (B07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env[AUTOMATIONS_FEATURE_ENV] = "true";
    requireAutopost.mockResolvedValue({ ok: true, plan: CreatorPlan.autopost });
  });

  it("creates owned delayed rule with locked trigger/transform/draftOnly and no series", async () => {
    const mem = createDelayedMemory();
    const result = await createAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      {
        ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
        client_mutation_key: null
      }
    );

    expect(result.automation.preset_kind).toBe("delayed_public_release");
    expect(result.automation.schedule_series_id).toBeNull();
    expect(result.automation.offset_days).toBe(30);

    const rule = [...mem.rules.values()][0]!;
    expect(rule.triggerKind).toBe("patreon_published");
    expect(rule.transformMode).toBe("preview");
    expect(rule.draftOnly).toBe(true);
    expect(rule.title).toBe(result.automation.title);

    expect(await isAutomationOwnedDistributionRule(mem.api, rule.id)).toBe(true);
    expect(await findAutomationIdForDistributionRule(mem.api, rule.id)).toBe(
      result.automation.automation_id
    );
  });

  it("retries create safely with client_mutation_key", async () => {
    const mem = createDelayedMemory();
    const body = {
      ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
      client_mutation_key: "mut_delayed_retry_001"
    };
    const first = await createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, body);
    const second = await createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, body);
    expect(second.receipt.created).toBe(false);
    expect(second.automation.automation_id).toBe(first.automation.automation_id);
    expect(mem.rules.size).toBe(1);
    expect([...mem.rules.values()][0]!.title).toBe(
      `${AUTOMATION_MUTATION_RULE_TITLE_PREFIX}mut_delayed_retry_001`
    );
  });

  it("syncs offset/destinations/remind/title and rejects stale version", async () => {
    const mem = createDelayedMemory();
    const created = await createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
      ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
      client_mutation_key: null
    });

    const patched = await patchAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      {
        version: 1,
        title: "45-day delay",
        offset_days: 45,
        target_destinations: ["x", "bluesky"],
        remind_me: false
      }
    );
    expect(patched.automation.version).toBe(2);
    expect(patched.automation.title).toBe("45-day delay");
    expect(patched.automation.offset_days).toBe(45);
    expect(patched.automation.remind_me).toBe(false);

    const rule = [...mem.rules.values()][0]!;
    expect(rule.title).toBe("45-day delay");
    expect(rule.offsetDays).toBe(45);
    expect(rule.targetDestinations).toEqual(["x", "bluesky"]);
    expect(rule.remindMe).toBe(false);

    await expect(
      patchAutomation(
        mem.api,
        AUTOMATIONS_QA_PERSONA.creator_id,
        created.automation.automation_id,
        { version: 1, status: "paused" }
      )
    ).rejects.toMatchObject({ code: "AUTOMATION_VERSION_CONFLICT" });
  });

  it("preserves mutation-key rule title when patching display title", async () => {
    const mem = createDelayedMemory();
    const created = await createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
      ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
      client_mutation_key: "mut_keep_key"
    });
    await patchAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      { version: 1, title: "Friendly name" }
    );
    expect([...mem.rules.values()][0]!.title).toBe(
      `${AUTOMATION_MUTATION_RULE_TITLE_PREFIX}mut_keep_key`
    );
    const renamed = await patchAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      { version: 2, title: "Friendly name 2" }
    );
    expect(renamed.automation.title).toBe("Friendly name 2");
    expect([...mem.rules.values()][0]!.title).toBe(
      `${AUTOMATION_MUTATION_RULE_TITLE_PREFIX}mut_keep_key`
    );
  });

  it("blocks legacy patch/delete on automation-owned rules; legacy unowned still works", async () => {
    const mem = createDelayedMemory();
    const owned = await createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
      ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
      client_mutation_key: null
    });
    const ownedRuleId = owned.automation.distribution_rule_id;

    await expect(
      patchDistributionRule(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, ownedRuleId, {
        offset_days: 7
      })
    ).rejects.toBeInstanceOf(DistributionRuleValidationError);

    await expect(
      deleteDistributionRule(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, ownedRuleId)
    ).rejects.toBeInstanceOf(DistributionRuleValidationError);

    const legacy = await createDistributionRule(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
      target_destinations: ["x"],
      offset_days: 14,
      title: "legacy rule"
    });
    expect(await isAutomationOwnedDistributionRule(mem.api, legacy.rule_id)).toBe(false);
    const patched = await patchDistributionRule(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      legacy.rule_id,
      { offset_days: 21 }
    );
    expect(patched.offset_days).toBe(21);
  });

  it("archive pauses owned rule; shared discover creates one run per published post", async () => {
    const mem = createDelayedMemory();
    const created = await createAutomation(mem.api, AUTOMATIONS_QA_PERSONA.creator_id, {
      ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
      client_mutation_key: null
    });

    mem.api.post.findMany = vi.fn(async () => [
      {
        id: "post_pub_1",
        versions: [{ publishedAt: new Date("2026-07-01T12:00:00.000Z"), title: "One" }]
      }
    ]);

    const first = await discoverDistributionRuleRuns(mem.api, {
      creatorId: AUTOMATIONS_QA_PERSONA.creator_id,
      now: new Date("2026-08-01T12:00:00.000Z")
    });
    expect(first.runs_created).toBe(1);

    const second = await discoverDistributionRuleRuns(mem.api, {
      creatorId: AUTOMATIONS_QA_PERSONA.creator_id,
      now: new Date("2026-08-01T12:00:00.000Z")
    });
    expect(second.runs_created).toBe(0);
    expect(mem.runs.size).toBe(1);

    await archiveAutomation(
      mem.api,
      AUTOMATIONS_QA_PERSONA.creator_id,
      created.automation.automation_id,
      1
    );
    expect([...mem.rules.values()][0]!.status).toBe("paused");

    mem.api.post.findMany = vi.fn(async () => [
      {
        id: "post_pub_2",
        versions: [{ publishedAt: new Date("2026-07-10T12:00:00.000Z"), title: "Two" }]
      }
    ]);
    const afterArchive = await discoverDistributionRuleRuns(mem.api, {
      creatorId: AUTOMATIONS_QA_PERSONA.creator_id,
      now: new Date("2026-08-15T12:00:00.000Z")
    });
    expect(afterArchive.runs_created).toBe(0);
  });

  it("does not add a second delayed-release worker or discovery path", () => {
    const root = path.resolve(__dirname, "../..");
    const worker = readFileSync(
      path.join(root, "src/autopost/distribution-rule-worker.ts"),
      "utf8"
    );
    const service = readFileSync(
      path.join(root, "src/autopost/distribution-rule-service.ts"),
      "utf8"
    );
    const autoService = readFileSync(
      path.join(root, "src/autopost/automation-service.ts"),
      "utf8"
    );

    expect(worker).toMatch(/runDistributionRulesReconcileOnce|reconcileDistributionRules/);
    expect(worker).not.toMatch(/discoverAutomation|automation_delayed|delayedReleaseWorker/i);
    expect(service).toMatch(/Single discovery authority/);
    expect(service).toMatch(/export async function discoverDistributionRuleRuns/);
    expect(autoService).not.toMatch(/discoverDistributionRuleRuns|startDistributionRulesWorker/);
    expect(PostSource.PATREON).toBe("PATREON");
  });
});
