/**
 * Schedule Rail Automations — connector lifecycle service (VS2 / B05).
 * Composition only: owns schedule series + distribution rule children.
 * Action runs remain on CreatorDistributionRuleRun (no AutomationRun ledger).
 *
 * @see docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md
 * @see src/autopost/automation-contract.ts
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { CreatorPlan } from "@prisma/client";
import { requireCreatorPlanAtLeast } from "../billing/creator-plan-entitlement-service.js";
import { resolvePostingGoalTimezone } from "./posting-goal-service.js";
import { ensureOccurrencesForSeries } from "./schedule-series-service.js";
import {
  AutomationContractError,
  type AutomationConnectorStatus,
  type AutomationConnectorWire,
  type AutomationDestination,
  type AutomationErrorCode,
  type AutomationMutationReceiptWire,
  type AutomationPresetKind,
  type AutomationRunHistoryWire,
  type AutomationRunStatus,
  type AutomationScheduleConfig,
  type AutomationSourceKind,
  type AutomationTriggerKind,
  isAutomationsFeatureEnabled,
  validateCreateAutomationBody,
  validatePatchAutomationBody
} from "./automation-contract.js";

/** Stored on owned distribution rule.title for create retry lookups (no mutation-key column yet). */
export const AUTOMATION_MUTATION_RULE_TITLE_PREFIX = "__relay_auto_mut:" as const;

type Db = PrismaClient | Prisma.TransactionClient;

export class AutomationServiceError extends Error {
  public override readonly name = "AutomationServiceError";
  public constructor(
    message: string,
    public readonly code: AutomationErrorCode,
    public readonly statusCode: number,
    public readonly details: Array<{ field: string; issue: string }> = []
  ) {
    super(message);
  }
}

function statusForCode(code: AutomationErrorCode): number {
  switch (code) {
    case "AUTOMATION_DISABLED":
    case "AUTOMATION_NOT_FOUND":
    case "AUTOMATION_TEMPLATE_NOT_FOUND":
      return 404;
    case "AUTOMATION_PLAN_REQUIRED":
      return 402;
    case "AUTOMATION_VERSION_CONFLICT":
      return 409;
    default:
      return 400;
  }
}

function fail(
  code: AutomationErrorCode,
  message: string,
  details: Array<{ field: string; issue: string }> = []
): never {
  throw new AutomationServiceError(message, code, statusForCode(code), details);
}

function rethrowContract(err: unknown): never {
  if (err instanceof AutomationContractError) {
    fail(err.code, err.message, err.details);
  }
  throw err;
}

async function assertAutomationsAccess(prisma: Db, creatorId: string): Promise<void> {
  if (!isAutomationsFeatureEnabled()) {
    fail("AUTOMATION_DISABLED", "Automations are disabled.");
  }
  const gate = await requireCreatorPlanAtLeast(
    prisma as PrismaClient,
    creatorId,
    CreatorPlan.autopost
  );
  if (!gate.ok) {
    fail("AUTOMATION_PLAN_REQUIRED", "Autopost plan required for Automations.");
  }
}

function mutationRuleTitle(clientMutationKey: string): string {
  return `${AUTOMATION_MUTATION_RULE_TITLE_PREFIX}${clientMutationKey}`;
}

function stripPatreonDestinations(destinations: AutomationDestination[]): string[] {
  const out = destinations.filter((d) => d !== "patreon");
  if (out.length === 0) {
    fail(
      "AUTOMATION_DESTINATION_UNLINKED",
      "target_destinations must include at least one non-Patreon destination.",
      [{ field: "target_destinations", issue: "required" }]
    );
  }
  return out;
}

function triggerForPreset(preset: AutomationPresetKind): AutomationTriggerKind {
  return preset === "preview_crosspost" ? "scheduled_occurrence" : "patreon_published";
}

function scheduleFromSeries(series: {
  cadence: string;
  interval: number;
  localTime: string;
  timezone: string;
  weekdays: number[];
  monthDays: number[];
} | null): AutomationScheduleConfig | null {
  if (!series) return null;
  return {
    cadence: series.cadence as AutomationScheduleConfig["cadence"],
    interval: series.interval,
    local_time: series.localTime,
    timezone: series.timezone,
    weekdays: series.weekdays,
    month_days: series.monthDays
  };
}

type AutomationRow = {
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
  scheduleSeries: {
    id: string;
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
  } | null;
  distributionRule: {
    id: string;
    status: string;
    offsetDays: number;
    targetDestinations: string[];
    remindMe: boolean;
    title: string | null;
  };
  previewTemplate: { id: string } | null;
};

async function nextOccurrenceAt(prisma: Db, seriesId: string | null): Promise<Date | null> {
  if (!seriesId) return null;
  const row = await prisma.creatorScheduleOccurrence.findFirst({
    where: { seriesId, status: { in: ["planned", "materialized"] } },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true }
  });
  return row?.dueAt ?? null;
}

async function latestRunForRule(
  prisma: Db,
  ruleId: string
): Promise<{ id: string; status: string } | null> {
  return prisma.creatorDistributionRuleRun.findFirst({
    where: { ruleId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true }
  });
}

function mapConnectorWire(
  row: AutomationRow,
  nextOcc: Date | null,
  latestRun: { id: string; status: string } | null
): AutomationConnectorWire {
  const preset = row.presetKind as AutomationPresetKind;
  return {
    automation_id: row.id,
    creator_id: row.creatorId,
    preset_kind: preset,
    status: row.status as AutomationConnectorStatus,
    title: row.title,
    source_kind: row.sourceKind as AutomationSourceKind,
    trigger_kind: triggerForPreset(preset),
    schedule: scheduleFromSeries(row.scheduleSeries),
    offset_days:
      preset === "delayed_public_release" ? row.distributionRule.offsetDays : null,
    target_destinations: row.distributionRule.targetDestinations as AutomationDestination[],
    preview_template_id: row.previewTemplateId,
    schedule_series_id: row.scheduleSeriesId,
    distribution_rule_id: row.distributionRuleId,
    series_materialization_kind: row.scheduleSeries
      ? (row.scheduleSeries.materializationKind as AutomationConnectorWire["series_materialization_kind"])
      : null,
    approval_ttl_hours: row.approvalTtlHours,
    remind_me: row.distributionRule.remindMe,
    version: row.version,
    next_occurrence_at: nextOcc?.toISOString() ?? null,
    latest_run_id: latestRun?.id ?? null,
    latest_run_status: (latestRun?.status as AutomationRunStatus | undefined) ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

const automationInclude = {
  scheduleSeries: true,
  distributionRule: true,
  previewTemplate: { select: { id: true } }
} as const;

async function loadAutomation(
  prisma: Db,
  creatorId: string,
  automationId: string
): Promise<AutomationRow> {
  const row = await prisma.creatorAutomation.findFirst({
    where: { id: automationId, creatorId },
    include: automationInclude
  });
  if (!row) {
    fail("AUTOMATION_NOT_FOUND", "Automation not found.");
  }
  return row as AutomationRow;
}

async function toWire(prisma: Db, row: AutomationRow): Promise<AutomationConnectorWire> {
  const [nextOcc, latestRun] = await Promise.all([
    nextOccurrenceAt(prisma, row.scheduleSeriesId),
    latestRunForRule(prisma, row.distributionRuleId)
  ]);
  return mapConnectorWire(row, nextOcc, latestRun);
}

async function findByMutationKey(
  prisma: Db,
  creatorId: string,
  clientMutationKey: string
): Promise<AutomationRow | null> {
  const rule = await prisma.creatorDistributionRule.findFirst({
    where: {
      creatorId,
      title: mutationRuleTitle(clientMutationKey)
    },
    select: { id: true }
  });
  if (!rule) return null;
  const row = await prisma.creatorAutomation.findFirst({
    where: { creatorId, distributionRuleId: rule.id },
    include: automationInclude
  });
  return (row as AutomationRow | null) ?? null;
}

async function assertTemplateOwned(
  prisma: Db,
  creatorId: string,
  templateId: string | null,
  required: boolean
): Promise<void> {
  if (!templateId) {
    if (required) {
      fail("AUTOMATION_TEMPLATE_NOT_FOUND", "preview_template_id is required.", [
        { field: "preview_template_id", issue: "required" }
      ]);
    }
    return;
  }
  const tpl = await prisma.creatorPreviewTemplate.findFirst({
    where: { id: templateId, creatorId },
    select: { id: true }
  });
  if (!tpl) {
    fail("AUTOMATION_TEMPLATE_NOT_FOUND", "Preview template not found.", [
      { field: "preview_template_id", issue: "not_found" }
    ]);
  }
}

export type CreateAutomationResult = {
  automation: AutomationConnectorWire;
  receipt: AutomationMutationReceiptWire;
};

/**
 * Create a connector + owned children. Retry-safe when `client_mutation_key` is set.
 */
export async function createAutomation(
  prisma: PrismaClient,
  creatorId: string,
  rawBody: unknown
): Promise<CreateAutomationResult> {
  await assertAutomationsAccess(prisma, creatorId);

  let body: ReturnType<typeof validateCreateAutomationBody>;
  try {
    body = validateCreateAutomationBody(rawBody);
  } catch (err) {
    rethrowContract(err);
  }

  if (body.client_mutation_key) {
    const existing = await findByMutationKey(prisma, creatorId, body.client_mutation_key);
    if (existing) {
      const wire = await toWire(prisma, existing);
      return {
        automation: wire,
        receipt: {
          automation_id: wire.automation_id,
          version: wire.version,
          status: wire.status,
          client_mutation_key: body.client_mutation_key,
          schedule_series_id: wire.schedule_series_id,
          distribution_rule_id: wire.distribution_rule_id,
          created: false
        }
      };
    }
  }

  await assertTemplateOwned(
    prisma,
    creatorId,
    body.preview_template_id,
    body.preset_kind === "preview_crosspost"
  );

  const targets = stripPatreonDestinations(body.target_destinations);
  const ruleTitle = body.client_mutation_key
    ? mutationRuleTitle(body.client_mutation_key)
    : body.title;

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (body.client_mutation_key) {
        const raced = await findByMutationKey(tx, creatorId, body.client_mutation_key);
        if (raced) return { row: raced, created: false as const };
      }

      const rule = await tx.creatorDistributionRule.create({
        data: {
          creatorId,
          status: "active",
          triggerKind: "patreon_published",
          offsetDays:
            body.preset_kind === "delayed_public_release" ? (body.offset_days ?? 30) : 0,
          targetDestinations: targets,
          transformMode: "preview",
          remindMe: body.remind_me,
          draftOnly: true,
          title: ruleTitle
        }
      });

      let scheduleSeriesId: string | null = null;
      if (body.preset_kind === "preview_crosspost" && body.schedule) {
        const timezone = resolvePostingGoalTimezone(body.schedule.timezone);
        const series = await tx.creatorScheduleSeries.create({
          data: {
            creatorId,
            status: "active",
            cadence: body.schedule.cadence,
            interval: body.schedule.interval,
            localTime: body.schedule.local_time,
            timezone,
            weekdays: body.schedule.weekdays,
            monthDays: body.schedule.month_days,
            plannedFormat: "image",
            destinations: targets,
            remindMe: body.remind_me,
            titleHint: body.title,
            startsAt: new Date(),
            materializationKind: "automation_trigger"
          }
        });
        scheduleSeriesId = series.id;
        // Planned ticks only — do not reconcile into blank Relay posts (VS4 owns trigger behavior).
        await ensureOccurrencesForSeries(tx as PrismaClient, series.id);
      }

      const automation = await tx.creatorAutomation.create({
        data: {
          creatorId,
          presetKind: body.preset_kind,
          status: "active",
          title: body.title,
          sourceKind: body.source_kind,
          scheduleSeriesId,
          distributionRuleId: rule.id,
          previewTemplateId: body.preview_template_id,
          approvalTtlHours: body.approval_ttl_hours,
          version: 1
        },
        include: automationInclude
      });

      return { row: automation as AutomationRow, created: true as const };
    });

    const wire = await toWire(prisma, created.row);
    return {
      automation: wire,
      receipt: {
        automation_id: wire.automation_id,
        version: wire.version,
        status: wire.status,
        client_mutation_key: body.client_mutation_key,
        schedule_series_id: wire.schedule_series_id,
        distribution_rule_id: wire.distribution_rule_id,
        created: created.created
      }
    };
  } catch (err) {
    if (err instanceof AutomationServiceError) throw err;
    if (err instanceof AutomationContractError) rethrowContract(err);
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|Unique constraint/i.test(message) && body.client_mutation_key) {
      const existing = await findByMutationKey(prisma, creatorId, body.client_mutation_key);
      if (existing) {
        const wire = await toWire(prisma, existing);
        return {
          automation: wire,
          receipt: {
            automation_id: wire.automation_id,
            version: wire.version,
            status: wire.status,
            client_mutation_key: body.client_mutation_key,
            schedule_series_id: wire.schedule_series_id,
            distribution_rule_id: wire.distribution_rule_id,
            created: false
          }
        };
      }
    }
    throw err;
  }
}

export async function listAutomations(
  prisma: PrismaClient,
  creatorId: string
): Promise<AutomationConnectorWire[]> {
  await assertAutomationsAccess(prisma, creatorId);
  const rows = await prisma.creatorAutomation.findMany({
    where: { creatorId },
    include: automationInclude,
    orderBy: { updatedAt: "desc" }
  });
  const out: AutomationConnectorWire[] = [];
  for (const row of rows) {
    out.push(await toWire(prisma, row as AutomationRow));
  }
  return out;
}

export async function getAutomation(
  prisma: PrismaClient,
  creatorId: string,
  automationId: string
): Promise<AutomationConnectorWire> {
  await assertAutomationsAccess(prisma, creatorId);
  const row = await loadAutomation(prisma, creatorId, automationId);
  // Missing template stays repairable: keep preview_template_id; do not cross-creator substitute.
  return toWire(prisma, row);
}

export async function patchAutomation(
  prisma: PrismaClient,
  creatorId: string,
  automationId: string,
  rawBody: unknown
): Promise<CreateAutomationResult> {
  await assertAutomationsAccess(prisma, creatorId);

  let body: ReturnType<typeof validatePatchAutomationBody>;
  try {
    body = validatePatchAutomationBody(rawBody);
  } catch (err) {
    rethrowContract(err);
  }

  const existing = await loadAutomation(prisma, creatorId, automationId);
  if (body.version !== existing.version) {
    fail("AUTOMATION_VERSION_CONFLICT", "Automation version conflict.", [
      { field: "version", issue: "conflict" }
    ]);
  }

  if (body.preview_template_id !== undefined && body.preview_template_id !== null) {
    await assertTemplateOwned(prisma, creatorId, body.preview_template_id, false);
  }

  const nextStatus = body.status ?? (existing.status as AutomationConnectorStatus);
  if (nextStatus === "archived") {
    return archiveAutomation(prisma, creatorId, automationId, body.version);
  }

  const targets =
    body.target_destinations !== undefined
      ? stripPatreonDestinations(body.target_destinations)
      : null;

  const updated = await prisma.$transaction(async (tx) => {
    const current = await loadAutomation(tx, creatorId, automationId);
    if (body.version !== current.version) {
      fail("AUTOMATION_VERSION_CONFLICT", "Automation version conflict.", [
        { field: "version", issue: "conflict" }
      ]);
    }

    const autoData: Prisma.CreatorAutomationUpdateInput = {
      version: { increment: 1 }
    };
    if (body.title !== undefined && body.title !== null) autoData.title = body.title;
    if (body.status) autoData.status = body.status;
    if (body.approval_ttl_hours !== undefined) {
      autoData.approvalTtlHours = body.approval_ttl_hours;
    }
    if (body.preview_template_id !== undefined) {
      autoData.previewTemplate =
        body.preview_template_id === null
          ? { disconnect: true }
          : { connect: { id: body.preview_template_id } };
    }

    const ruleData: Prisma.CreatorDistributionRuleUpdateInput = {};
    if (body.status === "paused") ruleData.status = "paused";
    if (body.status === "active") ruleData.status = "active";
    if (targets) ruleData.targetDestinations = targets;
    if (body.remind_me !== undefined) ruleData.remindMe = body.remind_me;
    if (
      body.offset_days !== undefined &&
      current.presetKind === "delayed_public_release" &&
      body.offset_days !== null
    ) {
      ruleData.offsetDays = body.offset_days;
    }
    // Sync display title onto owned rule unless title holds the create mutation-key token.
    if (body.title !== undefined && body.title !== null) {
      const ruleTitle = current.distributionRule.title;
      if (
        !ruleTitle ||
        !ruleTitle.startsWith(AUTOMATION_MUTATION_RULE_TITLE_PREFIX)
      ) {
        ruleData.title = body.title;
      }
    }

    const seriesData: Prisma.CreatorScheduleSeriesUpdateInput = {};
    if (body.status === "paused") seriesData.status = "paused";
    if (body.status === "active") seriesData.status = "active";
    if (body.remind_me !== undefined) seriesData.remindMe = body.remind_me;
    if (targets) seriesData.destinations = targets;
    if (body.title !== undefined && body.title !== null) {
      seriesData.titleHint = body.title;
    }
    if (body.schedule && current.presetKind === "preview_crosspost") {
      seriesData.cadence = body.schedule.cadence;
      seriesData.interval = body.schedule.interval;
      seriesData.localTime = body.schedule.local_time;
      seriesData.timezone = resolvePostingGoalTimezone(body.schedule.timezone);
      seriesData.weekdays = body.schedule.weekdays;
      seriesData.monthDays = body.schedule.month_days;
    }

    await tx.creatorDistributionRule.update({
      where: { id: current.distributionRuleId },
      data: ruleData
    });

    if (current.scheduleSeriesId && Object.keys(seriesData).length > 0) {
      await tx.creatorScheduleSeries.update({
        where: { id: current.scheduleSeriesId },
        data: seriesData
      });
      if (body.schedule) {
        await ensureOccurrencesForSeries(tx as PrismaClient, current.scheduleSeriesId);
      }
    }

    return tx.creatorAutomation.update({
      where: { id: automationId },
      data: autoData,
      include: automationInclude
    });
  });

  const wire = await toWire(prisma, updated as AutomationRow);
  return {
    automation: wire,
    receipt: {
      automation_id: wire.automation_id,
      version: wire.version,
      status: wire.status,
      client_mutation_key: null,
      schedule_series_id: wire.schedule_series_id,
      distribution_rule_id: wire.distribution_rule_id,
      created: false
    }
  };
}

/**
 * Archive stops future discovery; retains runs/drafts/events/history.
 * Idempotent when already archived at the expected version.
 */
export async function archiveAutomation(
  prisma: PrismaClient,
  creatorId: string,
  automationId: string,
  expectedVersion?: number
): Promise<CreateAutomationResult> {
  await assertAutomationsAccess(prisma, creatorId);
  const existing = await loadAutomation(prisma, creatorId, automationId);

  if (expectedVersion !== undefined && expectedVersion !== existing.version) {
    fail("AUTOMATION_VERSION_CONFLICT", "Automation version conflict.", [
      { field: "version", issue: "conflict" }
    ]);
  }

  if (existing.status === "archived") {
    const wire = await toWire(prisma, existing);
    return {
      automation: wire,
      receipt: {
        automation_id: wire.automation_id,
        version: wire.version,
        status: wire.status,
        client_mutation_key: null,
        schedule_series_id: wire.schedule_series_id,
        distribution_rule_id: wire.distribution_rule_id,
        created: false
      }
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await loadAutomation(tx, creatorId, automationId);
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      fail("AUTOMATION_VERSION_CONFLICT", "Automation version conflict.", [
        { field: "version", issue: "conflict" }
      ]);
    }
    if (current.status === "archived") {
      return current;
    }

    await tx.creatorDistributionRule.update({
      where: { id: current.distributionRuleId },
      data: { status: "paused" }
    });
    if (current.scheduleSeriesId) {
      await tx.creatorScheduleSeries.update({
        where: { id: current.scheduleSeriesId },
        data: { status: "ended" }
      });
    }

    return tx.creatorAutomation.update({
      where: { id: automationId },
      data: { status: "archived", version: { increment: 1 } },
      include: automationInclude
    });
  });

  const wire = await toWire(prisma, updated as AutomationRow);
  return {
    automation: wire,
    receipt: {
      automation_id: wire.automation_id,
      version: wire.version,
      status: wire.status,
      client_mutation_key: null,
      schedule_series_id: wire.schedule_series_id,
      distribution_rule_id: wire.distribution_rule_id,
      created: false
    }
  };
}

export async function listAutomationRuns(
  prisma: PrismaClient,
  creatorId: string,
  automationId: string
): Promise<AutomationRunHistoryWire[]> {
  await assertAutomationsAccess(prisma, creatorId);
  const automation = await loadAutomation(prisma, creatorId, automationId);
  const runs = await prisma.creatorDistributionRuleRun.findMany({
    where: { ruleId: automation.distributionRuleId, creatorId },
    orderBy: { createdAt: "desc" }
  });
  return runs.map((run) => ({
    run_id: run.id,
    automation_id: automation.id,
    creator_id: run.creatorId,
    status: run.status as AutomationRunStatus,
    source_post_id: run.sourcePostId,
    schedule_occurrence_id: run.scheduleOccurrenceId,
    draft_id: run.draftId,
    materialized_event_id: run.materializedEventId,
    plan_id: run.planId,
    due_at: run.dueAt.toISOString(),
    expires_at: run.expiresAt?.toISOString() ?? null,
    idempotency_key: run.idempotencyKey,
    failure_reason: run.failureReason,
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    completed_at: run.completedAt?.toISOString() ?? null
  }));
}
