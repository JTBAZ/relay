/**
 * Autopost Social Playbooks — apply versioned templates as reminder events + Autopost drafts.
 * V1 anchors relative offsets to Make a Post due_at; no platform-side auto execution.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { CreatorPlan } from "@prisma/client";
import { requireCreatorPlanAtLeast } from "../billing/creator-plan-entitlement-service.js";
import { createScheduledPostForRail } from "../distribution/schedule-rail-service.js";
import {
  isSocialPlaybookTemplateKey,
  resolvePlaybookDueAt,
  type ApplySocialPlaybookBody,
  type SocialPlaybookRunWire,
  type SocialPlaybookStepWire,
  type SocialPlaybookTemplateWire
} from "./social-playbook-contract.js";
import {
  getSocialPlaybookTemplate,
  listSocialPlaybookTemplatesWire
} from "./social-playbook-templates.js";

export const SOCIAL_PLAYBOOKS_FEATURE_ENV = "RELAY_FEATURE_SOCIAL_PLAYBOOKS";

export function isSocialPlaybooksFeatureEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = (env[SOCIAL_PLAYBOOKS_FEATURE_ENV] ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export class SocialPlaybookValidationError extends Error {
  public override readonly name = "SocialPlaybookValidationError";
  public readonly statusCode = 400;
  public constructor(message: string) {
    super(message);
  }
}

export class SocialPlaybookPlanRequiredError extends Error {
  public override readonly name = "SocialPlaybookPlanRequiredError";
  public readonly statusCode = 402;
  public readonly required_plan = "autopost";
  public constructor(message = "Autopost plan required for follow-up playbooks.") {
    super(message);
  }
}

export class SocialPlaybookFeatureDisabledError extends Error {
  public override readonly name = "SocialPlaybookFeatureDisabledError";
  public readonly statusCode = 404;
  public constructor(message = "Social playbooks are disabled.") {
    super(message);
  }
}

const DESTINATIONS = new Set(["patreon", "x", "deviantart", "bluesky"]);

async function assertAutopost(prisma: PrismaClient, creatorId: string): Promise<void> {
  if (!isSocialPlaybooksFeatureEnabled()) {
    throw new SocialPlaybookFeatureDisabledError();
  }
  const gate = await requireCreatorPlanAtLeast(prisma, creatorId, CreatorPlan.autopost);
  if (!gate.ok) {
    throw new SocialPlaybookPlanRequiredError();
  }
}

function toStepWire(row: {
  id: string;
  stepIndex: number;
  actionKey: string;
  executionMode: string;
  eventType: string;
  plannedFormat: string | null;
  offsetMinutes: number;
  title: string;
  note: string | null;
  dueAt: Date;
  enabled: boolean;
  status: string;
  materializedEventId: string | null;
  materializedTaskId: string | null;
  materializedDraftId: string | null;
  materializedPostId: string | null;
}): SocialPlaybookStepWire {
  return {
    step_id: row.id,
    step_index: row.stepIndex,
    action_key: row.actionKey as SocialPlaybookStepWire["action_key"],
    execution_mode: row.executionMode as SocialPlaybookStepWire["execution_mode"],
    event_type: row.eventType as SocialPlaybookStepWire["event_type"],
    planned_format: (row.plannedFormat as SocialPlaybookStepWire["planned_format"]) ?? null,
    offset_minutes: row.offsetMinutes,
    title: row.title,
    note: row.note,
    due_at: row.dueAt.toISOString(),
    enabled: row.enabled,
    status: row.status,
    materialized_event_id: row.materializedEventId,
    materialized_task_id: row.materializedTaskId,
    materialized_draft_id: row.materializedDraftId,
    materialized_post_id: row.materializedPostId
  };
}

function toRunWire(
  run: {
    id: string;
    creatorId: string;
    templateKey: string;
    templateVersion: number;
    label: string;
    status: string;
    anchorPostId: string;
    anchorTaskId: string | null;
    anchorDueAt: Date;
    destination: string;
    remindMe: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  steps: Parameters<typeof toStepWire>[0][]
): SocialPlaybookRunWire {
  return {
    run_id: run.id,
    creator_id: run.creatorId,
    template_key: run.templateKey as SocialPlaybookRunWire["template_key"],
    template_version: run.templateVersion,
    label: run.label,
    status: run.status,
    anchor_post_id: run.anchorPostId,
    anchor_task_id: run.anchorTaskId,
    anchor_due_at: run.anchorDueAt.toISOString(),
    destination: run.destination,
    remind_me: run.remindMe,
    steps: steps
      .slice()
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map(toStepWire),
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString()
  };
}

export function listSocialPlaybookTemplates(): SocialPlaybookTemplateWire[] {
  return listSocialPlaybookTemplatesWire();
}

export type PlaybookRailMeta = {
  playbook_run_id: string;
  playbook_label: string;
  playbook_action_key: string;
  plan_label: string;
  plan_index: number;
  plan_total: number;
};

/**
 * Batch-load playbook rail metadata for materialized event / task ids.
 */
export async function loadPlaybookRailMetaByMaterializedIds(
  prisma: PrismaClient,
  creatorId: string,
  ids: { eventIds: string[]; taskIds: string[] }
): Promise<Map<string, PlaybookRailMeta>> {
  const eventIds = [...new Set(ids.eventIds.filter(Boolean))];
  const taskIds = [...new Set(ids.taskIds.filter(Boolean))];
  if (eventIds.length === 0 && taskIds.length === 0) return new Map();

  const or: Prisma.CreatorSocialPlaybookStepWhereInput[] = [];
  if (eventIds.length) or.push({ materializedEventId: { in: eventIds } });
  if (taskIds.length) or.push({ materializedTaskId: { in: taskIds } });
  if (or.length === 0) return new Map();

  const steps = await prisma.creatorSocialPlaybookStep.findMany({
    where: {
      creatorId,
      OR: or
    },
    include: {
      run: { select: { id: true, label: true } }
    }
  });

  const runTotals = new Map<string, number>();
  for (const s of steps) {
    if (!s.enabled) continue;
    runTotals.set(s.runId, (runTotals.get(s.runId) ?? 0) + 1);
  }

  // Prefer counting enabled steps from DB for accurate totals
  const enabledCounts = await prisma.creatorSocialPlaybookStep.groupBy({
    by: ["runId"],
    where: {
      runId: { in: [...new Set(steps.map((s) => s.runId))] },
      enabled: true,
      status: { in: ["materialized", "pending"] }
    },
    _count: { _all: true }
  });
  for (const row of enabledCounts) {
    runTotals.set(row.runId, row._count._all);
  }

  const out = new Map<string, PlaybookRailMeta>();
  for (const s of steps) {
    const meta: PlaybookRailMeta = {
      playbook_run_id: s.run.id,
      playbook_label: s.run.label,
      playbook_action_key: s.actionKey,
      plan_label: s.run.label,
      plan_index: s.stepIndex,
      plan_total: runTotals.get(s.runId) ?? s.stepIndex
    };
    if (s.materializedEventId) out.set(s.materializedEventId, meta);
    if (s.materializedTaskId) out.set(s.materializedTaskId, meta);
  }
  return out;
}

async function loadRunWire(
  prisma: PrismaClient,
  runId: string
): Promise<SocialPlaybookRunWire | null> {
  const run = await prisma.creatorSocialPlaybookRun.findUnique({
    where: { id: runId },
    include: { steps: true }
  });
  if (!run) return null;
  return toRunWire(run, run.steps);
}

/**
 * Apply a locked template to a Make a Post anchor.
 * Idempotent on (creatorId, templateKey, anchorPostId).
 */
export async function applySocialPlaybook(
  prisma: PrismaClient,
  creatorId: string,
  body: ApplySocialPlaybookBody
): Promise<SocialPlaybookRunWire> {
  const id = creatorId.trim();
  await assertAutopost(prisma, id);

  if (!isSocialPlaybookTemplateKey(body.template_key)) {
    throw new SocialPlaybookValidationError("Unknown playbook template_key.");
  }
  const template = getSocialPlaybookTemplate(body.template_key);
  if (!template) {
    throw new SocialPlaybookValidationError("Unknown playbook template_key.");
  }

  const anchorPostId = body.anchor_post_id?.trim();
  if (!anchorPostId) {
    throw new SocialPlaybookValidationError("anchor_post_id is required.");
  }
  const destination = String(body.destination ?? "")
    .trim()
    .toLowerCase();
  if (!DESTINATIONS.has(destination)) {
    throw new SocialPlaybookValidationError(
      "destination must be patreon, x, deviantart, or bluesky."
    );
  }

  const anchorDueAt = new Date(body.anchor_due_at);
  if (Number.isNaN(anchorDueAt.getTime())) {
    throw new SocialPlaybookValidationError("anchor_due_at must be a valid date-time.");
  }

  const post = await prisma.post.findFirst({
    where: { id: anchorPostId, creatorId: id },
    select: { id: true }
  });
  if (!post) {
    throw new SocialPlaybookValidationError("Anchor post not found.");
  }

  const existing = await prisma.creatorSocialPlaybookRun.findUnique({
    where: {
      creatorId_templateKey_anchorPostId: {
        creatorId: id,
        templateKey: body.template_key,
        anchorPostId
      }
    },
    include: { steps: true }
  });
  if (existing) {
    return toRunWire(existing, existing.steps);
  }

  const destinationsRaw = Array.isArray(body.destinations) ? body.destinations : [destination];
  const destinations = [
    ...new Set(
      destinationsRaw
        .map((d) => String(d ?? "").trim().toLowerCase())
        .filter((d) => DESTINATIONS.has(d))
    )
  ];
  if (!destinations.includes(destination)) destinations.unshift(destination);

  const overrideByIndex = new Map(
    (body.step_overrides ?? []).map((o) => [o.step_index, o] as const)
  );
  const remindMe = body.remind_me !== false;
  const anchorTaskId = body.anchor_task_id?.trim() || null;

  // Create run + step shells first (skipped vs enabled), then materialize.
  const run = await prisma.creatorSocialPlaybookRun.create({
    data: {
      creatorId: id,
      templateKey: template.template_key,
      templateVersion: template.version,
      label: template.label,
      status: "applied",
      anchorPostId,
      anchorTaskId,
      anchorDueAt,
      destination,
      destinations,
      remindMe,
      steps: {
        create: template.atoms.map((atom) => {
          const ov = overrideByIndex.get(atom.step_index);
          const enabled = ov?.enabled !== false;
          const title = (ov?.title?.trim() || atom.default_title).slice(0, 200);
          const note =
            ov && "note" in ov
              ? ov.note?.trim() || null
              : atom.default_note;
          const dueAt = resolvePlaybookDueAt(anchorDueAt, atom.offset_minutes);
          return {
            creatorId: id,
            stepIndex: atom.step_index,
            actionKey: atom.action_key,
            executionMode: atom.execution_mode,
            eventType: atom.event_type,
            plannedFormat: atom.planned_format ?? null,
            offsetMinutes: atom.offset_minutes,
            title,
            note,
            dueAt,
            enabled,
            status: enabled ? "pending" : "skipped",
            atomSnapshot: {
              action_key: atom.action_key,
              label: atom.label,
              execution_mode: atom.execution_mode,
              event_type: atom.event_type,
              planned_format: atom.planned_format ?? null,
              destination_policy: atom.destination_policy,
              offset_minutes: atom.offset_minutes,
              default_title: atom.default_title,
              default_note: atom.default_note,
              step_index: atom.step_index
            }
          };
        })
      }
    },
    include: { steps: true }
  });

  // Materialize enabled steps outside the create transaction so draft creation can use services helpers.
  const sorted = run.steps.slice().sort((a, b) => a.stepIndex - b.stepIndex);
  for (const step of sorted) {
    if (!step.enabled) continue;
    try {
      if (step.executionMode === "draft") {
        const draftDests =
          step.atomSnapshot &&
          typeof step.atomSnapshot === "object" &&
          !Array.isArray(step.atomSnapshot) &&
          (step.atomSnapshot as { destination_policy?: string }).destination_policy ===
            "anchor_all"
            ? destinations
            : [destination];
        const item = await createScheduledPostForRail(prisma, id, {
          scheduled_for: step.dueAt.toISOString(),
          destinations: draftDests,
          destination,
          title: step.title,
          note: step.note ?? undefined,
          notify: remindMe,
          planned_format: (step.plannedFormat as "text" | "image" | "video" | "mixed") || "mixed"
        });
        await prisma.creatorSocialPlaybookStep.update({
          where: { id: step.id },
          data: {
            status: "materialized",
            materializedTaskId: item.id,
            materializedDraftId: item.draft_id ?? null,
            materializedPostId: item.post_id ?? null
          }
        });
      } else {
        // Reminder atom — allow missing published URL (draft posts aren't live yet).
        const event = await prisma.creatorScheduleEvent.create({
          data: {
            creatorId: id,
            eventType: step.eventType as
              | "engage_comments"
              | "pin_comment"
              | "repost"
              | "make_post"
              | "schedule_post"
              | "custom",
            destination,
            title: step.title,
            note: step.note,
            dueAt: step.dueAt,
            postId: anchorPostId,
            externalUrl: null,
            remindMe
          }
        });
        await prisma.creatorSocialPlaybookStep.update({
          where: { id: step.id },
          data: {
            status: "materialized",
            materializedEventId: event.id,
            materializedPostId: anchorPostId
          }
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.creatorSocialPlaybookStep.update({
        where: { id: step.id },
        data: {
          status: "failed",
          failureReason: message.slice(0, 500)
        }
      });
    }
  }

  const wired = await loadRunWire(prisma, run.id);
  if (!wired) {
    throw new SocialPlaybookValidationError("Playbook run missing after apply.");
  }
  return wired;
}
