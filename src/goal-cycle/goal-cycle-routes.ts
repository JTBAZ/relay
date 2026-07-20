/**
 * Goal Cycle HTTP routes (VS1-T03).
 * Creator-authenticated lifecycle APIs; gated by RELAY_GOAL_CYCLE_ENABLED.
 */

import type { PrismaClient } from "@prisma/client";
import type { Application, Request, RequestHandler, Response } from "express";
import type { Logger } from "pino";
import { errorEnvelope, successEnvelope } from "../contracts/api.js";
import {
  requireAccountWithRole,
  sendRelayAuthError,
  type RequireAccountDeps
} from "../identity/require-account.js";
import { createLogger } from "../lib/logger.js";
import {
  GoalCycleContractError,
  getGoalCycleFeatureFlags,
  isGoalCyclePhase,
  isGoalCycleState,
  type GoalCycleErrorCode,
  type GoalCyclePhase,
  type GoalCycleState
} from "./contracts.js";
import {
  cancelGoalCycle,
  confirmGoalCycleCompletion,
  dismissGoalCycleCompletionSuggestion,
  getActiveGoalCycle,
  getGoalCycle,
  GoalCycleNotFoundError,
  listGoalCycles,
  patchGoalCycleCheckpoint,
  startGoalCycle,
  suggestGoalCycleCompletion
} from "./goal-cycle-service.js";
import {
  getTrendResearchStatus,
  startTrendResearch
} from "./trends/trend-research-service.js";
import { enqueueGoalCycleTrendResearchJob } from "./trends/trend-research-worker.js";
import { reconcileApprovedSourcesForCycle } from "../analytics/goal-cycle-attribution-service.js";
import {
  getPaidSupportFacts,
  snapshotCycleAttribution,
  type PaidSupportWindowInput
} from "../analytics/goal-cycle-paid-support-facts.js";
import type { LiftWindowStats } from "../analytics/goal-cycle-lift.js";

function traceIdFrom(req: Request): string {
  return req.header("x-trace-id") ?? `trace_goal_cycle_${Date.now()}`;
}

function statusForGoalCycleError(code: GoalCycleErrorCode): number {
  switch (code) {
    case "GOAL_CYCLE_ACTIVE_EXISTS":
    case "GOAL_CYCLE_VERSION_CONFLICT":
    case "GOAL_CYCLE_INVALID_STATE":
      return 409;
    case "GOAL_CYCLE_NOT_FOUND":
      return 404;
    case "GOAL_CYCLE_RESEARCH_UNAVAILABLE":
      return 503;
    case "GOAL_CYCLE_NO_CREDIT":
      return 402;
    case "GOAL_CYCLE_MATERIALIZATION_FAILED":
      return 500;
    default:
      return 400;
  }
}

function sendGoalCycleError(res: Response, err: unknown, traceId: string): boolean {
  if (err instanceof GoalCycleNotFoundError) {
    res
      .status(404)
      .json(errorEnvelope("GOAL_CYCLE_NOT_FOUND", err.message, traceId));
    return true;
  }
  if (err instanceof GoalCycleContractError) {
    res
      .status(statusForGoalCycleError(err.code))
      .json(errorEnvelope(err.code, err.message, traceId, err.details));
    return true;
  }
  return false;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readLiftWindowStats(value: unknown): LiftWindowStats | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const start_day = readOptionalString(row.start_day);
  const end_day = readOptionalString(row.end_day);
  if (!start_day || !end_day) return null;
  const complete_days = Number(row.complete_days);
  const coverage_ratio = Number(row.coverage_ratio);
  const paid_support_event_count = Number(row.paid_support_event_count);
  if (
    !Number.isFinite(complete_days) ||
    !Number.isFinite(coverage_ratio) ||
    !Number.isFinite(paid_support_event_count)
  ) {
    return null;
  }
  return {
    start_day,
    end_day,
    complete_days: Math.floor(complete_days),
    coverage_ratio,
    paid_support_event_count: Math.floor(paid_support_event_count)
  };
}

function readPaidSupportWindows(body: Record<string, unknown>): PaidSupportWindowInput | undefined {
  const raw = body.windows;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const windows = raw as Record<string, unknown>;
  const baseline = readLiftWindowStats(windows.baseline);
  const observation = readLiftWindowStats(windows.observation);
  if (!baseline || !observation) return undefined;
  return { baseline, observation };
}

function resolveIdempotencyKey(req: Request, body: Record<string, unknown>): string | null {
  const fromBody = readOptionalString(body.idempotency_key);
  if (fromBody) return fromBody.slice(0, 128);
  const fromHeader = readOptionalString(req.header("idempotency-key"));
  return fromHeader ? fromHeader.slice(0, 128) : null;
}

export type GoalCycleRouteContext = {
  prisma: PrismaClient | undefined;
  identityService: RequireAccountDeps["identityService"];
  buildIdem: (scope: string) => RequestHandler;
  logger?: Logger;
};

type CreatorHandler = (
  req: Request,
  res: Response,
  ctx: { prisma: PrismaClient; creatorId: string; traceId: string }
) => Promise<void | Response>;

/**
 * Registers Goal Cycle creator routes. When the feature flag is off, handlers return 404.
 */
export function registerGoalCycleRoutes(app: Application, ctx: GoalCycleRouteContext): void {
  const log = ctx.logger ?? createLogger({ name: "goal-cycle" });

  const withCreator = (handler: CreatorHandler) => {
    return async (req: Request, res: Response) => {
      const traceId = traceIdFrom(req);
      if (!getGoalCycleFeatureFlags().enabled) {
        return res
          .status(404)
          .json(errorEnvelope("NOT_FOUND", "Goal Cycle is not enabled.", traceId));
      }
      if (!ctx.prisma) {
        return res
          .status(503)
          .json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
      }
      try {
        const { context } = await requireAccountWithRole(
          req,
          { prisma: ctx.prisma, identityService: ctx.identityService },
          "creator"
        );
        const creatorId = context.primaryRelayCreatorId?.trim();
        if (!creatorId) {
          return res.status(404).json(
            errorEnvelope(
              "NOT_FOUND",
              "No creator studio — call POST /api/v1/creator/workspace first.",
              traceId
            )
          );
        }
        await handler(req, res, { prisma: ctx.prisma, creatorId, traceId });
      } catch (err) {
        if (sendRelayAuthError(res, err, traceId)) return;
        if (sendGoalCycleError(res, err, traceId)) return;
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    };
  };

  const audit = (
    action: string,
    fields: {
      creatorId: string;
      cycleId?: string;
      state?: string;
      version?: number;
      allowReview?: boolean;
    }
  ) => {
    log.info(
      {
        event: "goal_cycle_audit",
        action,
        creator_id: fields.creatorId,
        cycle_id: fields.cycleId ?? null,
        state: fields.state ?? null,
        version: fields.version ?? null,
        allow_review: fields.allowReview ?? null
      },
      "goal_cycle_audit"
    );
  };

  app.post(
    "/api/v1/creator/goal-cycles",
    ctx.buildIdem("creator-goal-cycle-start"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cycle = await startGoalCycle(prisma, creatorId, {
        goal_kind: body.goal_kind as never,
        break_mode: (body.break_mode as never) ?? null,
        time_zone: readOptionalString(body.time_zone) ?? readOptionalString(body.timezone),
        context:
          body.context && typeof body.context === "object" && !Array.isArray(body.context)
            ? (body.context as Record<string, unknown>)
            : null,
        idempotency_key: resolveIdempotencyKey(req, body)
      });
      audit("start", {
        creatorId,
        cycleId: cycle.cycle_id,
        state: cycle.state,
        version: cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.get(
    "/api/v1/creator/goal-cycles/active",
    withCreator(async (_req, res, { prisma, creatorId, traceId }) => {
      const cycle = await getActiveGoalCycle(prisma, creatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.get(
    "/api/v1/creator/goal-cycles",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cursor = readOptionalString(req.query.cursor);
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : undefined;
      const result = await listGoalCycles(prisma, creatorId, { cursor, limit });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope(result, traceId));
    })
  );

  app.get(
    "/api/v1/creator/goal-cycles/:id",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycle = await getGoalCycle(prisma, creatorId, String(req.params.id ?? ""));
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.patch(
    "/api/v1/creator/goal-cycles/:id/checkpoint",
    ctx.buildIdem("creator-goal-cycle-checkpoint"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const expectedRaw = body.expected_version;
      const expected_version =
        typeof expectedRaw === "number"
          ? expectedRaw
          : typeof expectedRaw === "string"
            ? Number(expectedRaw)
            : NaN;
      const phase = isGoalCyclePhase(body.phase) ? (body.phase as GoalCyclePhase) : undefined;
      const state = isGoalCycleState(body.state) ? (body.state as GoalCycleState) : undefined;
      if (body.phase != null && phase === undefined) {
        throw new GoalCycleContractError("GOAL_CYCLE_INVALID_STATE", "Invalid phase.", [
          { field: "phase", issue: "invalid" }
        ]);
      }
      if (body.state != null && state === undefined) {
        throw new GoalCycleContractError("GOAL_CYCLE_INVALID_STATE", "Invalid state.", [
          { field: "state", issue: "invalid" }
        ]);
      }
      const cycle = await patchGoalCycleCheckpoint(prisma, creatorId, String(req.params.id ?? ""), {
        expected_version,
        phase,
        state,
        context:
          body.context === undefined
            ? undefined
            : body.context && typeof body.context === "object" && !Array.isArray(body.context)
              ? (body.context as Record<string, unknown>)
              : null,
        progress_message_code: readOptionalString(body.progress_message_code)
      });
      audit("checkpoint", {
        creatorId,
        cycleId: cycle.cycle_id,
        state: cycle.state,
        version: cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/cancel",
    ctx.buildIdem("creator-goal-cycle-cancel"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cycle = await cancelGoalCycle(
        prisma,
        creatorId,
        String(req.params.id ?? ""),
        readOptionalString(body.reason)
      );
      audit("cancel", {
        creatorId,
        cycleId: cycle.cycle_id,
        state: cycle.state,
        version: cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  /** Service/internal authenticated path — creator session required; not a Dream UX primary control. */
  app.post(
    "/api/v1/creator/goal-cycles/:id/suggest-completion",
    ctx.buildIdem("creator-goal-cycle-suggest-completion"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowReview =
        body.allow_review === true ||
        body.allow_review === "1" ||
        body.allowReview === true;
      const cycle = await suggestGoalCycleCompletion(
        prisma,
        creatorId,
        String(req.params.id ?? ""),
        { allowReview }
      );
      audit("suggest_completion", {
        creatorId,
        cycleId: cycle.cycle_id,
        state: cycle.state,
        version: cycle.version,
        allowReview
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/dismiss-completion",
    ctx.buildIdem("creator-goal-cycle-dismiss-completion"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycle = await dismissGoalCycleCompletionSuggestion(
        prisma,
        creatorId,
        String(req.params.id ?? "")
      );
      audit("dismiss_completion", {
        creatorId,
        cycleId: cycle.cycle_id,
        state: cycle.state,
        version: cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/confirm-completion",
    ctx.buildIdem("creator-goal-cycle-confirm-completion"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycle = await confirmGoalCycleCompletion(
        prisma,
        creatorId,
        String(req.params.id ?? "")
      );
      audit("confirm_completion", {
        creatorId,
        cycleId: cycle.cycle_id,
        state: cycle.state,
        version: cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/research",
    ctx.buildIdem("creator-goal-cycle-research"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const cycleId = String(req.params.id ?? "").trim();
      const topic = readOptionalString(body.topic);
      if (!topic) {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "topic is required.", traceId));
      }
      const requestId =
        resolveIdempotencyKey(req, body) ??
        readOptionalString(body.request_id) ??
        `research_${Date.now()}`;
      const inline =
        body.inline === true ||
        body.inline === "1" ||
        getGoalCycleFeatureFlags().trend_mode !== "live";

      if (!inline) {
        await enqueueGoalCycleTrendResearchJob({
          creatorId,
          cycleId,
          requestId,
          topic,
          locale: readOptionalString(body.locale),
          geography: readOptionalString(body.geography),
          window: readOptionalString(body.window) ?? "7d",
          traceId
        });
        await startTrendResearch(prisma, {
          creatorId,
          cycleId,
          topic,
          locale: readOptionalString(body.locale),
          geography: readOptionalString(body.geography),
          window: readOptionalString(body.window) ?? "7d",
          requestId,
          creatorContext:
            body.creator_context &&
            typeof body.creator_context === "object" &&
            !Array.isArray(body.creator_context)
              ? (body.creator_context as Record<string, unknown>)
              : {},
          inline: false
        });
        const status = await getTrendResearchStatus(prisma, creatorId, cycleId, requestId);
        audit("research_enqueue", { creatorId, cycleId });
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(202).json(successEnvelope({ research: status }, traceId));
      }

      const status = await startTrendResearch(prisma, {
        creatorId,
        cycleId,
        topic,
        locale: readOptionalString(body.locale),
        geography: readOptionalString(body.geography),
        window: readOptionalString(body.window) ?? "7d",
        requestId,
        creatorContext:
          body.creator_context &&
          typeof body.creator_context === "object" &&
          !Array.isArray(body.creator_context)
            ? (body.creator_context as Record<string, unknown>)
            : {},
        inline: true
      });
      audit("research_complete", { creatorId, cycleId });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ research: status }, traceId));
    })
  );

  app.get(
    "/api/v1/creator/goal-cycles/:id/research",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const requestId = readOptionalString(req.query.request_id);
      const status = await getTrendResearchStatus(prisma, creatorId, cycleId, requestId);
      // Never expose CoT / raw provider text — status already strips evidence.
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ research: status }, traceId));
    })
  );

  // VS4-T05: attribution summary is read-only — never reconciles on GET.
  app.get(
    "/api/v1/creator/goal-cycles/:id/attribution",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      await getGoalCycle(prisma, creatorId, cycleId);
      const facts = await getPaidSupportFacts(prisma, creatorId, cycleId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ facts }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/attribution/refresh",
    ctx.buildIdem("creator-goal-cycle-attribution-refresh"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      await getGoalCycle(prisma, creatorId, cycleId);

      const reconcile = await reconcileApprovedSourcesForCycle(prisma, creatorId, cycleId);
      const windows = readPaidSupportWindows(body);
      const targetThresholdRaw = body.target_threshold;
      const targetThreshold =
        typeof targetThresholdRaw === "number" && Number.isFinite(targetThresholdRaw)
          ? targetThresholdRaw
          : null;
      const { snapshot_id, facts } = await snapshotCycleAttribution(prisma, creatorId, cycleId, {
        windowKey: readOptionalString(body.window_key) ?? "active",
        windows,
        targetLabel: readOptionalString(body.target_label) ?? undefined,
        targetThreshold,
        reasonDeterministicUnavailable: readOptionalString(body.reason_deterministic_unavailable) ?? undefined
      });

      audit("attribution_refresh", { creatorId, cycleId });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            snapshot_id,
            reconcile,
            facts
          },
          traceId
        )
      );
    })
  );
}
