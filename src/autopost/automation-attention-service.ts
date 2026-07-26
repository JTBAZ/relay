/**
 * AUT-VS5 — Automations rail attention: approval deep links + custom events + rail meta.
 * Reuses CreatorScheduleEvent (manual_event) and schedule_reminder:manual: — no new rail source.
 * B13: deliver reconcile notification intents + dismiss attention events on terminal run status.
 */

import type { PrismaClient } from "@prisma/client";
import {
  createCreatorScheduleEvent,
  CreatorScheduleEventValidationError
} from "../distribution/creator-schedule-event-service.js";
import { resolveRelayWebBase } from "../distribution/schedule-reminder-extension-api.js";
import { createOrClusterNotification } from "../patron/notification-service.js";
import { resolveCreatorAccountIdForRelayCreator } from "../patron/creator-notification-target.js";
import type { AutomationNotificationIntent } from "./automation-reconcile-service.js";

export type AutomationRailMeta = {
  automation_id: string;
  automation_title: string;
  preset_kind: string;
  /** planned trigger tick vs prepared approval work */
  automation_state: "planned" | "awaiting_review";
  automation_run_id?: string | null;
  draft_id?: string | null;
  expires_at?: string | null;
  source_post_id?: string | null;
};

/** Opaque Studio deep link — draft/run ids only (no private media URLs or bodies). */
export function buildAutomationApprovalDeepLink(args: {
  draftId: string;
  runId: string;
  automationId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const base = resolveRelayWebBase(args.env ?? process.env);
  const q = new URLSearchParams({
    draft_id: args.draftId.trim(),
    automation_run_id: args.runId.trim(),
    automation_id: args.automationId.trim()
  });
  return `${base}/studio/autopost?${q.toString()}`;
}

export type EnsureAutomationAttentionEventResult = {
  event_id: string;
  created: boolean;
  deep_link: string;
};

/**
 * Create or reuse one custom attention event for an automation-owned prepared run.
 * Idempotent on run.materializedEventId.
 */
export async function ensureAutomationAttentionEventForRun(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    runId: string;
    now?: Date;
  }
): Promise<EnsureAutomationAttentionEventResult | null> {
  const run = await prisma.creatorDistributionRuleRun.findFirst({
    where: { id: args.runId, creatorId: args.creatorId },
    select: {
      id: true,
      draftId: true,
      dueAt: true,
      status: true,
      ruleId: true,
      sourcePostId: true,
      expiresAt: true,
      materializedEventId: true,
      rule: { select: { remindMe: true, title: true } }
    }
  });
  if (!run?.draftId) return null;
  if (run.status !== "materialized" && run.status !== "pending") return null;

  const automation = await prisma.creatorAutomation.findFirst({
    where: {
      distributionRuleId: run.ruleId,
      creatorId: args.creatorId,
      status: { not: "archived" }
    },
    select: { id: true, title: true }
  });
  if (!automation) return null;

  if (run.materializedEventId) {
    const existing = await prisma.creatorScheduleEvent.findFirst({
      where: { id: run.materializedEventId, creatorId: args.creatorId }
    });
    if (existing) {
      const deepLink = buildAutomationApprovalDeepLink({
        draftId: run.draftId,
        runId: run.id,
        automationId: automation.id
      });
      return { event_id: existing.id, created: false, deep_link: deepLink };
    }
  }

  const deepLink = buildAutomationApprovalDeepLink({
    draftId: run.draftId,
    runId: run.id,
    automationId: automation.id
  });
  const title = `Review ${automation.title.trim() || "preview"} preview`.slice(0, 200);
  const remindMe = run.rule.remindMe !== false;

  let created;
  try {
    created = await createCreatorScheduleEvent(prisma, args.creatorId, {
      event_type: "custom",
      due_at: run.dueAt.toISOString(),
      title,
      note: `automation_run:${run.id};source_post:${run.sourcePostId}`,
      remind_me: remindMe,
      external_url: deepLink
    });
  } catch (err) {
    if (err instanceof CreatorScheduleEventValidationError) {
      throw err;
    }
    throw err;
  }
  if (!created.ok) return null;

  await prisma.creatorDistributionRuleRun.updateMany({
    where: {
      id: run.id,
      creatorId: args.creatorId,
      materializedEventId: null
    },
    data: { materializedEventId: created.event.id }
  });
  // Race: another worker may have won — reload
  const fresh = await prisma.creatorDistributionRuleRun.findUnique({
    where: { id: run.id },
    select: { materializedEventId: true }
  });
  const eventId = fresh?.materializedEventId ?? created.event.id;
  return {
    event_id: eventId,
    created: eventId === created.event.id,
    deep_link: deepLink
  };
}

/**
 * Batch meta for planned recurrence_occurrence rows (series → automation).
 * Map keyed by series_id and occurrence_id when provided.
 */
export async function loadAutomationRailMetaForSeriesIds(
  prisma: PrismaClient,
  creatorId: string,
  seriesIds: string[]
): Promise<Map<string, AutomationRailMeta>> {
  const ids = [...new Set(seriesIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const rows = await prisma.creatorAutomation.findMany({
    where: {
      creatorId,
      scheduleSeriesId: { in: ids },
      status: { not: "archived" }
    },
    select: {
      id: true,
      title: true,
      presetKind: true,
      scheduleSeriesId: true
    }
  });

  const out = new Map<string, AutomationRailMeta>();
  for (const row of rows) {
    if (!row.scheduleSeriesId) continue;
    out.set(row.scheduleSeriesId, {
      automation_id: row.id,
      automation_title: row.title,
      preset_kind: row.presetKind,
      automation_state: "planned"
    });
  }
  return out;
}

/**
 * Batch meta for manual_event rows keyed by CreatorScheduleEvent id (materializedEventId).
 */
export async function loadAutomationRailMetaForEventIds(
  prisma: PrismaClient,
  creatorId: string,
  eventIds: string[]
): Promise<Map<string, AutomationRailMeta>> {
  const ids = [...new Set(eventIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const runs = await prisma.creatorDistributionRuleRun.findMany({
    where: {
      creatorId,
      materializedEventId: { in: ids },
      status: { in: ["pending", "materialized"] }
    },
    select: {
      id: true,
      draftId: true,
      expiresAt: true,
      sourcePostId: true,
      materializedEventId: true,
      ruleId: true
    }
  });
  if (runs.length === 0) return new Map();

  const ruleIds = [...new Set(runs.map((r) => r.ruleId))];
  const automations = await prisma.creatorAutomation.findMany({
    where: {
      creatorId,
      distributionRuleId: { in: ruleIds },
      status: { not: "archived" }
    },
    select: {
      id: true,
      title: true,
      presetKind: true,
      distributionRuleId: true
    }
  });
  const autoByRule = new Map(automations.map((a) => [a.distributionRuleId, a]));

  const out = new Map<string, AutomationRailMeta>();
  for (const run of runs) {
    const auto = autoByRule.get(run.ruleId);
    if (!auto || !run.materializedEventId) continue;
    out.set(run.materializedEventId, {
      automation_id: auto.id,
      automation_title: auto.title,
      preset_kind: auto.presetKind,
      automation_state: "awaiting_review",
      automation_run_id: run.id,
      draft_id: run.draftId,
      expires_at: run.expiresAt?.toISOString() ?? null,
      source_post_id: run.sourcePostId
    });
  }
  return out;
}

/**
 * Repair path: ensure attention events for materialized automation runs missing event ids.
 */
export async function ensureMissingAutomationAttentionEvents(
  prisma: PrismaClient,
  args: { creatorId: string; limit?: number }
): Promise<number> {
  const runs = await prisma.creatorDistributionRuleRun.findMany({
    where: {
      creatorId: args.creatorId,
      status: "materialized",
      draftId: { not: null },
      materializedEventId: null
    },
    orderBy: { dueAt: "asc" },
    take: args.limit ?? 20,
    select: { id: true, ruleId: true }
  });
  let created = 0;
  for (const run of runs) {
    const owned = await prisma.creatorAutomation.findFirst({
      where: { distributionRuleId: run.ruleId, creatorId: args.creatorId },
      select: { id: true }
    });
    if (!owned) continue;
    const result = await ensureAutomationAttentionEventForRun(prisma, {
      creatorId: args.creatorId,
      runId: run.id
    });
    if (result?.created) created += 1;
  }
  return created;
}

/**
 * Dismiss the attention event for a run so it leaves sticky due delivery (AU-10).
 * Idempotent: only pending → dismissed.
 */
export async function dismissAutomationAttentionEventForRun(
  prisma: PrismaClient,
  args: { creatorId: string; runId: string; now?: Date }
): Promise<{ dismissed: boolean; event_id: string | null }> {
  const run = await prisma.creatorDistributionRuleRun.findFirst({
    where: { id: args.runId, creatorId: args.creatorId },
    select: { materializedEventId: true }
  });
  const eventId = run?.materializedEventId ?? null;
  if (!eventId) return { dismissed: false, event_id: null };

  const now = args.now ?? new Date();
  const updated = await prisma.creatorScheduleEvent.updateMany({
    where: {
      id: eventId,
      creatorId: args.creatorId,
      status: "pending"
    },
    data: { status: "dismissed", updatedAt: now }
  });
  return { dismissed: updated.count === 1, event_id: eventId };
}

/**
 * Sync attention event when a run reaches a terminal awaiting-review exit.
 * Opening a toast must not call this — only status transitions.
 */
export async function syncAutomationAttentionEventToRunStatus(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    runId: string;
    runStatus: string;
    now?: Date;
  }
): Promise<{ dismissed: boolean; event_id: string | null }> {
  if (
    args.runStatus !== "expired" &&
    args.runStatus !== "cancelled" &&
    args.runStatus !== "completed"
  ) {
    return { dismissed: false, event_id: null };
  }
  return dismissAutomationAttentionEventForRun(prisma, {
    creatorId: args.creatorId,
    runId: args.runId,
    now: args.now
  });
}

/**
 * Deliver one reconcile notification intent via createOrClusterNotification.
 * sourceEventId = intent.dedupe_key (once-ever). No private media/body URLs in payload.
 */
export async function deliverAutomationNotificationIntent(
  prisma: PrismaClient,
  intent: AutomationNotificationIntent
): Promise<{ delivered: boolean; notification_id: string | null }> {
  const recipientCreatorAccountId = await resolveCreatorAccountIdForRelayCreator(
    prisma,
    intent.creator_id
  );
  if (!recipientCreatorAccountId) {
    return { delivered: false, notification_id: null };
  }

  const kind =
    intent.kind === "automation_no_new_post"
      ? ("automation_no_new_post" as const)
      : ("automation_approval_expired" as const);

  const row = await createOrClusterNotification(prisma, {
    recipientCreatorAccountId,
    relayCreatorId: intent.creator_id,
    kind,
    clusterKey: null,
    sourceEventId: intent.dedupe_key,
    payload: {
      automation_id: intent.automation_id,
      ...(intent.occurrence_id ? { occurrence_id: intent.occurrence_id } : {}),
      ...(intent.run_id ? { run_id: intent.run_id } : {})
    }
  });
  return { delivered: true, notification_id: row.id };
}

/**
 * Deliver all intents from a reconcile cycle (idempotent per dedupe_key).
 */
export async function deliverAutomationNotificationIntents(
  prisma: PrismaClient,
  intents: AutomationNotificationIntent[]
): Promise<{ delivered: number }> {
  let delivered = 0;
  for (const intent of intents) {
    const result = await deliverAutomationNotificationIntent(prisma, intent);
    if (result.delivered) delivered += 1;
  }
  return { delivered };
}
