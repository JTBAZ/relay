/**
 * Automations connector schema characterization (VS1 / B03).
 * Static proofs — no production migrate deploy. Relation/idempotency DB proofs are B04.
 *
 * @see docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS,
  automationRunIdempotencyKeyForRulePost
} from "../../src/autopost/automation-contract.js";

const ROOT = path.resolve(__dirname, "../..");

function readRepo(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const SCHEMA = readRepo("prisma/schema.prisma");
const MIGRATION = readRepo(
  "prisma/migrations/20260720070000_creator_automations_connector/migration.sql"
);

describe("automations schema — CreatorAutomation connector", () => {
  it("adds CreatorAutomation without a parallel run ledger", () => {
    expect(SCHEMA).toMatch(/model CreatorAutomation\b/);
    expect(SCHEMA).toMatch(/@@map\("creator_automations"\)/);
    expect(SCHEMA).not.toMatch(/model CreatorAutomationRun\b/);
    expect(MIGRATION).not.toMatch(/creator_automation_runs/);
  });

  it("enforces one-to-one ownership of series and distribution rule", () => {
    expect(SCHEMA).toMatch(/scheduleSeriesId\s+String\?\s+@unique/);
    expect(SCHEMA).toMatch(/distributionRuleId\s+String\s+@unique/);
    expect(SCHEMA).toMatch(/onDelete:\s*SetNull/);
    expect(SCHEMA).toMatch(/onDelete:\s*Restrict/);
    expect(MIGRATION).toMatch(/creator_automations_schedule_series_id_key/);
    expect(MIGRATION).toMatch(/creator_automations_distribution_rule_id_key/);
    expect(MIGRATION).toMatch(/ON DELETE RESTRICT/);
    expect(MIGRATION).toMatch(/ON DELETE SET NULL/);
  });

  it("defaults approval TTL to 72h and version to 1", () => {
    expect(AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS).toBe(72);
    expect(SCHEMA).toMatch(/approvalTtlHours\s+Int\s+@default\(72\)/);
    expect(SCHEMA).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(MIGRATION).toMatch(/DEFAULT 72/);
  });

  it("does not duplicate cadence or destination authorities on the connector", () => {
    const modelBlock = SCHEMA.match(
      /model CreatorAutomation \{[\s\S]*?\n\}/
    )?.[0];
    expect(modelBlock).toBeTruthy();
    expect(modelBlock!).not.toMatch(/\bcadence\b/);
    expect(modelBlock!).not.toMatch(/\bweekdays\b/);
    expect(modelBlock!).not.toMatch(/\boffsetDays\b/);
    expect(modelBlock!).not.toMatch(/\btargetDestinations\b/);
    expect(modelBlock!).not.toMatch(/\blastProcessedPostId\b/);
  });
});

describe("automations schema — series + rule-run extensions", () => {
  it("adds materialization_kind defaulting to post_draft for legacy series", () => {
    expect(SCHEMA).toMatch(
      /enum CreatorScheduleSeriesMaterializationKind\s*\{[\s\S]*?post_draft[\s\S]*?automation_trigger/
    );
    expect(SCHEMA).toMatch(
      /materializationKind CreatorScheduleSeriesMaterializationKind @default\(post_draft\)/
    );
    expect(MIGRATION).toMatch(/DEFAULT 'post_draft'/);
    expect(MIGRATION).toMatch(/materialization_kind/);
  });

  it("extends rule-run status with expired|cancelled and keeps existing unique", () => {
    expect(SCHEMA).toMatch(
      /enum CreatorDistributionRuleRunStatus\s*\{[\s\S]*?expired[\s\S]*?cancelled/
    );
    expect(SCHEMA).toMatch(/@@unique\(\[ruleId, sourcePostId\]\)/);
    expect(MIGRATION).toMatch(/ADD VALUE IF NOT EXISTS 'expired'/);
    expect(MIGRATION).toMatch(/ADD VALUE IF NOT EXISTS 'cancelled'/);
  });

  it("adds unique idempotency_key with rule:post backfill matching contract helper", () => {
    expect(SCHEMA).toMatch(/idempotencyKey\s+String\s+@default\(""\)\s+@map\("idempotency_key"\)/);
    expect(SCHEMA).toMatch(/@@unique\(\[idempotencyKey\]\)/);
    expect(MIGRATION).toMatch(
      /idempotency_key.*=.*'rule:' \|\| "rule_id" \|\| ':post:' \|\| "source_post_id"/
    );
    expect(MIGRATION).toMatch(/relay_distribution_rule_run_idempotency_key/);
    expect(automationRunIdempotencyKeyForRulePost("rule_a", "post_b")).toBe(
      "rule:rule_a:post:post_b"
    );
  });

  it("correlates runs to occurrence + manual event without cascading deletes", () => {
    expect(SCHEMA).toMatch(/scheduleOccurrenceId\s+String\?/);
    expect(SCHEMA).toMatch(/materializedEventId\s+String\?/);
    expect(SCHEMA).toMatch(/previewTemplateSnapshot\s+Json\?/);
    expect(SCHEMA).toMatch(/expiresAt\s+DateTime\?/);
    expect(SCHEMA).toMatch(/completedAt\s+DateTime\?/);
    expect(MIGRATION).toMatch(
      /creator_distribution_rule_runs_schedule_occurrence_id_fkey[\s\S]*ON DELETE SET NULL/
    );
    expect(MIGRATION).toMatch(
      /creator_distribution_rule_runs_materialized_event_id_fkey[\s\S]*ON DELETE SET NULL/
    );
  });

  it("enables RLS on creator_automations without permissive policies", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE public\.creator_automations ENABLE ROW LEVEL SECURITY/
    );
    expect(MIGRATION).not.toMatch(/CREATE POLICY/);
  });

  it("documents no production apply / no legacy adoption into connectors", () => {
    expect(MIGRATION).toMatch(/Do not apply to production/);
    expect(MIGRATION).toMatch(/Does NOT adopt existing series\/rules/);
  });
});

describe("automations schema — DMMF / client relation surface (B04)", () => {
  it("exposes CreatorAutomation on generated Prisma client without AutomationRun", async () => {
    const { Prisma } = await import("@prisma/client");
    const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
    expect(models).toContain("CreatorAutomation");
    expect(models).not.toContain("CreatorAutomationRun");

    const automation = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === "CreatorAutomation"
    )!;
    const fieldNames = automation.fields.map((f) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "scheduleSeriesId",
        "distributionRuleId",
        "previewTemplateId",
        "approvalTtlHours",
        "version",
        "scheduleSeries",
        "distributionRule",
        "previewTemplate"
      ])
    );
    expect(fieldNames).not.toContain("cadence");
    expect(fieldNames).not.toContain("offsetDays");

    expect(automation.fields.find((f) => f.name === "scheduleSeries")!.type).toBe(
      "CreatorScheduleSeries"
    );
    expect(automation.fields.find((f) => f.name === "distributionRule")!.type).toBe(
      "CreatorDistributionRule"
    );
    expect(automation.fields.find((f) => f.name === "previewTemplate")!.type).toBe(
      "CreatorPreviewTemplate"
    );
    // Uniqueness is enforced in SQL + integration proofs (Prisma 7 DMMF omits isUnique).
    expect(SCHEMA).toMatch(/scheduleSeriesId\s+String\?\s+@unique/);
    expect(SCHEMA).toMatch(/distributionRuleId\s+String\s+@unique/);
  });

  it("marks rule-run idempotencyKey and TTL statuses on generated client", async () => {
    const {
      Prisma,
      CreatorDistributionRuleRunStatus,
      CreatorScheduleSeriesMaterializationKind
    } = await import("@prisma/client");
    const run = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === "CreatorDistributionRuleRun"
    )!;
    const fieldNames = run.fields.map((f) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "idempotencyKey",
        "scheduleOccurrenceId",
        "materializedEventId",
        "previewTemplateSnapshot",
        "expiresAt",
        "completedAt"
      ])
    );
    expect(SCHEMA).toMatch(/@@unique\(\[idempotencyKey\]\)/);
    expect(SCHEMA).toMatch(/@@unique\(\[ruleId, sourcePostId\]\)/);

    expect(CreatorDistributionRuleRunStatus).toMatchObject({
      pending: "pending",
      skipped: "skipped",
      expired: "expired",
      cancelled: "cancelled"
    });
    expect(CreatorScheduleSeriesMaterializationKind).toEqual({
      post_draft: "post_draft",
      automation_trigger: "automation_trigger"
    });
  });
});
