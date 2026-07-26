/**
 * Automations VS1 / B04 — relation + idempotency proofs against a real DB.
 *
 * Skips when DATABASE_URL is missing or `creator_automations` is absent.
 * Opt-in for CI/local ephemeral DB: apply migration then run this file.
 * Never auto-migrate the linked Supabase/production project from this suite.
 *
 * @see docs/studio/automation-build-plans/02-VS1-CONNECTOR-SCHEMA.md
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  automationRunIdempotencyKeyForOccurrence,
  automationRunIdempotencyKeyForRulePost
} from "../../src/autopost/automation-contract.js";
import { prisma } from "../../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const RUN_ID = randomUUID().slice(0, 8);
const CREATOR = `auto_schema_b04_${RUN_ID}`;

let tablesReady = false;
let skipReason = "not checked";

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function isFkRestrict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";
}

async function wipeCreator(creatorId: string): Promise<void> {
  await prisma.creatorAutomation.deleteMany({ where: { creatorId } });
  await prisma.creatorDistributionRuleRun.deleteMany({ where: { creatorId } });
  await prisma.creatorDistributionRule.deleteMany({ where: { creatorId } });
  await prisma.creatorScheduleOccurrence.deleteMany({ where: { creatorId } });
  await prisma.creatorScheduleSeries.deleteMany({ where: { creatorId } });
  await prisma.creatorScheduleEvent.deleteMany({ where: { creatorId } });
  await prisma.creatorPreviewTemplate.deleteMany({ where: { creatorId } });
}

async function createSeries(creatorId: string, titleHint: string) {
  return prisma.creatorScheduleSeries.create({
    data: {
      creatorId,
      cadence: "weekly",
      localTime: "10:00",
      timezone: "America/New_York",
      weekdays: [4],
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      titleHint
    }
  });
}

async function createRule(creatorId: string, title: string) {
  return prisma.creatorDistributionRule.create({
    data: {
      creatorId,
      title,
      targetDestinations: ["x"],
      offsetDays: 30
    }
  });
}

describe.skipIf(!hasDatabaseUrl)(
  "Automations schema relations (VS1-T02, real DB)",
  () => {
    beforeAll(async () => {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
        "SELECT to_regclass('public.creator_automations')::text AS t"
      );
      tablesReady = Boolean(rows[0]?.t);
      skipReason = tablesReady
        ? ""
        : "creator_automations not present — apply 20260720070000_creator_automations_connector on a non-prod DB (human gate; do not migrate linked Supabase from agents)";
      if (tablesReady) {
        await wipeCreator(CREATOR);
      }
    } catch (err) {
      tablesReady = false;
      skipReason = `database unreachable (${err instanceof Error ? err.message : String(err)})`;
    }
  }, 60_000);

    afterAll(async () => {
      if (!tablesReady) return;
      await wipeCreator(CREATOR);
    }, 60_000);

    it("defaults legacy series to post_draft and backfills rule:post idempotency via trigger", async (ctx) => {
      if (!tablesReady) ctx.skip(skipReason);
      await wipeCreator(CREATOR);

      const series = await createSeries(CREATOR, "legacy series");
      expect(series.materializationKind).toBe("post_draft");

      const rule = await createRule(CREATOR, "legacy rule");
      const run = await prisma.creatorDistributionRuleRun.create({
        data: {
          ruleId: rule.id,
          creatorId: CREATOR,
          sourcePostId: `post_${RUN_ID}_a`,
          sourcePublishedAt: new Date("2026-07-10T12:00:00.000Z"),
          dueAt: new Date("2026-08-09T12:00:00.000Z")
          // idempotencyKey omitted → Prisma default "" → DB trigger fills
        }
      });

      expect(run.idempotencyKey).toBe(
        automationRunIdempotencyKeyForRulePost(rule.id, `post_${RUN_ID}_a`)
      );
    }, 60_000);

    it("enforces one-to-one ownership on distribution_rule_id and schedule_series_id", async (ctx) => {
      if (!tablesReady) ctx.skip(skipReason);
      await wipeCreator(CREATOR);

      const series = await createSeries(CREATOR, "owned series");
      await prisma.creatorScheduleSeries.update({
        where: { id: series.id },
        data: { materializationKind: "automation_trigger" }
      });
      const rule = await createRule(CREATOR, "owned rule");
      const otherRule = await createRule(CREATOR, "other rule");

      const auto = await prisma.creatorAutomation.create({
        data: {
          creatorId: CREATOR,
          presetKind: "preview_crosspost",
          title: "Owned",
          sourceKind: "latest_patreon_post",
          scheduleSeriesId: series.id,
          distributionRuleId: rule.id
        }
      });

      await expect(
        prisma.creatorAutomation.create({
          data: {
            creatorId: CREATOR,
            presetKind: "preview_crosspost",
            title: "Dup rule",
            sourceKind: "latest_patreon_post",
            distributionRuleId: rule.id
          }
        })
      ).rejects.toSatisfy(isUniqueViolation);

      await expect(
        prisma.creatorAutomation.create({
          data: {
            creatorId: CREATOR,
            presetKind: "delayed_public_release",
            title: "Dup series",
            sourceKind: "triggering_patreon_post",
            scheduleSeriesId: series.id,
            distributionRuleId: otherRule.id
          }
        })
      ).rejects.toSatisfy(isUniqueViolation);

      expect(auto.distributionRuleId).toBe(rule.id);
    }, 60_000);

    it("SetNulls preview template and series; Restricts deleting an owned rule", async (ctx) => {
      if (!tablesReady) ctx.skip(skipReason);
      await wipeCreator(CREATOR);

      const template = await prisma.creatorPreviewTemplate.create({
        data: {
          creatorId: CREATOR,
          name: "QA template",
          config: { version: 1, layout: "single" }
        }
      });
      const series = await createSeries(CREATOR, "tpl series");
      const rule = await createRule(CREATOR, "tpl rule");
      const auto = await prisma.creatorAutomation.create({
        data: {
          creatorId: CREATOR,
          presetKind: "preview_crosspost",
          title: "Template link",
          sourceKind: "latest_patreon_post",
          scheduleSeriesId: series.id,
          distributionRuleId: rule.id,
          previewTemplateId: template.id
        }
      });

      await prisma.creatorPreviewTemplate.delete({ where: { id: template.id } });
      const afterTpl = await prisma.creatorAutomation.findUniqueOrThrow({
        where: { id: auto.id }
      });
      expect(afterTpl.previewTemplateId).toBeNull();

      await prisma.creatorScheduleSeries.delete({ where: { id: series.id } });
      const afterSeries = await prisma.creatorAutomation.findUniqueOrThrow({
        where: { id: auto.id }
      });
      expect(afterSeries.scheduleSeriesId).toBeNull();

      await expect(
        prisma.creatorDistributionRule.delete({ where: { id: rule.id } })
      ).rejects.toSatisfy(isFkRestrict);
    }, 60_000);

    it("archive keeps run history; no CreatorAutomationRun table", async (ctx) => {
      if (!tablesReady) ctx.skip(skipReason);
      await wipeCreator(CREATOR);

      const rule = await createRule(CREATOR, "history rule");
      const auto = await prisma.creatorAutomation.create({
        data: {
          creatorId: CREATOR,
          presetKind: "delayed_public_release",
          title: "Archive me",
          sourceKind: "triggering_patreon_post",
          distributionRuleId: rule.id
        }
      });
      const run = await prisma.creatorDistributionRuleRun.create({
        data: {
          ruleId: rule.id,
          creatorId: CREATOR,
          sourcePostId: `post_${RUN_ID}_hist`,
          sourcePublishedAt: new Date("2026-07-01T00:00:00.000Z"),
          dueAt: new Date("2026-07-31T00:00:00.000Z"),
          status: "pending",
          idempotencyKey: automationRunIdempotencyKeyForRulePost(
            rule.id,
            `post_${RUN_ID}_hist`
          )
        }
      });

      await prisma.creatorAutomation.update({
        where: { id: auto.id },
        data: { status: "archived" }
      });

      const still = await prisma.creatorDistributionRuleRun.findUniqueOrThrow({
        where: { id: run.id }
      });
      expect(still.id).toBe(run.id);
      expect(still.status).toBe("pending");

      const missing = await prisma.$queryRawUnsafe<Array<{ t: string | null }>>(
        "SELECT to_regclass('public.creator_automation_runs')::text AS t"
      );
      expect(missing[0]?.t).toBeNull();
    }, 60_000);

    it("rejects duplicate occurrence keys and duplicate action-run idempotency keys", async (ctx) => {
      if (!tablesReady) ctx.skip(skipReason);
      await wipeCreator(CREATOR);

      const series = await createSeries(CREATOR, "occ series");
      const occ = await prisma.creatorScheduleOccurrence.create({
        data: {
          seriesId: series.id,
          creatorId: CREATOR,
          occurrenceKey: "2026-07-23",
          dueAt: new Date("2026-07-23T14:00:00.000Z")
        }
      });

      await expect(
        prisma.creatorScheduleOccurrence.create({
          data: {
            seriesId: series.id,
            creatorId: CREATOR,
            occurrenceKey: "2026-07-23",
            dueAt: new Date("2026-07-23T14:00:00.000Z")
          }
        })
      ).rejects.toSatisfy(isUniqueViolation);

      const rule = await createRule(CREATOR, "idem rule");
      const key = automationRunIdempotencyKeyForOccurrence(occ.id);
      await prisma.creatorDistributionRuleRun.create({
        data: {
          ruleId: rule.id,
          creatorId: CREATOR,
          sourcePostId: `post_${RUN_ID}_occ1`,
          sourcePublishedAt: new Date("2026-07-20T00:00:00.000Z"),
          dueAt: occ.dueAt,
          scheduleOccurrenceId: occ.id,
          idempotencyKey: key,
          status: "pending"
        }
      });

      await expect(
        prisma.creatorDistributionRuleRun.create({
          data: {
            ruleId: rule.id,
            creatorId: CREATOR,
            sourcePostId: `post_${RUN_ID}_occ2`,
            sourcePublishedAt: new Date("2026-07-21T00:00:00.000Z"),
            dueAt: occ.dueAt,
            scheduleOccurrenceId: occ.id,
            idempotencyKey: key,
            status: "pending"
          }
        })
      ).rejects.toSatisfy(isUniqueViolation);

      await expect(
        prisma.creatorDistributionRuleRun.create({
          data: {
            ruleId: rule.id,
            creatorId: CREATOR,
            sourcePostId: `post_${RUN_ID}_occ1`,
            sourcePublishedAt: new Date("2026-07-20T00:00:00.000Z"),
            dueAt: occ.dueAt,
            idempotencyKey: automationRunIdempotencyKeyForRulePost(
              rule.id,
              `post_${RUN_ID}_other`
            )
          }
        })
      ).rejects.toSatisfy(isUniqueViolation);
    }, 60_000);

    it("accepts expired|cancelled run statuses and creator-scoped connector joins", async (ctx) => {
      if (!tablesReady) ctx.skip(skipReason);
      await wipeCreator(CREATOR);

      const rule = await createRule(CREATOR, "status rule");
      await prisma.creatorAutomation.create({
        data: {
          creatorId: CREATOR,
          presetKind: "delayed_public_release",
          title: "Statuses",
          sourceKind: "triggering_patreon_post",
          distributionRuleId: rule.id
        }
      });

      const expired = await prisma.creatorDistributionRuleRun.create({
        data: {
          ruleId: rule.id,
          creatorId: CREATOR,
          sourcePostId: `post_${RUN_ID}_exp`,
          sourcePublishedAt: new Date("2026-07-01T00:00:00.000Z"),
          dueAt: new Date("2026-07-02T00:00:00.000Z"),
          status: "expired",
          expiresAt: new Date("2026-07-05T00:00:00.000Z"),
          idempotencyKey: automationRunIdempotencyKeyForRulePost(
            rule.id,
            `post_${RUN_ID}_exp`
          )
        }
      });
      const cancelled = await prisma.creatorDistributionRuleRun.create({
        data: {
          ruleId: rule.id,
          creatorId: CREATOR,
          sourcePostId: `post_${RUN_ID}_can`,
          sourcePublishedAt: new Date("2026-07-03T00:00:00.000Z"),
          dueAt: new Date("2026-07-04T00:00:00.000Z"),
          status: "cancelled",
          completedAt: new Date("2026-07-04T01:00:00.000Z"),
          idempotencyKey: automationRunIdempotencyKeyForRulePost(
            rule.id,
            `post_${RUN_ID}_can`
          )
        }
      });

      expect(expired.status).toBe("expired");
      expect(cancelled.status).toBe("cancelled");

      const joined = await prisma.creatorAutomation.findMany({
        where: { creatorId: CREATOR },
        include: {
          distributionRule: { include: { runs: true } },
          scheduleSeries: true,
          previewTemplate: true
        }
      });
      expect(joined).toHaveLength(1);
      expect(joined[0]!.distributionRule.runs).toHaveLength(2);
      expect(joined[0]!.creatorId).toBe(CREATOR);
    }, 60_000);
  }
);
