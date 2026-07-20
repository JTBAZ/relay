/**
 * Goal Cycle outcome / reflection / learning HTTP routes (VS9-T05).
 */

import type { PrismaClient } from "@prisma/client";
import type { Application, Request, RequestHandler, Response } from "express";
import type { Logger } from "pino";
import { errorEnvelope, successEnvelope } from "../../contracts/api.js";
import {
  requireAccountWithRole,
  sendRelayAuthError,
  type RequireAccountDeps
} from "../../identity/require-account.js";
import { createLogger } from "../../lib/logger.js";
import {
  GoalCycleContractError,
  getGoalCycleFeatureFlags,
  type GoalCycleErrorCode
} from "../contracts.js";
import { GoalCycleNotFoundError, getGoalCycle } from "../goal-cycle-service.js";
import {
  acceptGoalCycleLearning,
  getGoalCycleLearningProposal,
  proposeGoalCycleLearning,
  rejectGoalCycleLearning,
  saveGoalCycleReflection
} from "./goal-cycle-learning-service.js";
import {
  getGoalCycleOutcomeSnapshot,
  refreshGoalCycleOutcomeSnapshot,
  outcomeSummaryFromSnapshot
} from "./goal-cycle-outcome-service.js";

export type OutcomeRouteContext = {
  prisma: PrismaClient | null | undefined;
  identityService: RequireAccountDeps["identityService"];
  buildIdem: (scope: string) => RequestHandler;
  logger?: Logger;
};

function traceIdFrom(req: Request): string {
  return req.header("x-trace-id") ?? `trace_goal_cycle_outcome_${Date.now()}`;
}

function statusForGoalCycleError(code: GoalCycleErrorCode): number {
  switch (code) {
    case "GOAL_CYCLE_ACTIVE_EXISTS":
    case "GOAL_CYCLE_VERSION_CONFLICT":
    case "GOAL_CYCLE_INVALID_STATE":
      return 409;
    case "GOAL_CYCLE_NOT_FOUND":
      return 404;
    case "GOAL_CYCLE_NO_CREDIT":
      return 402;
    default:
      return 400;
  }
}

function sendGoalCycleError(res: Response, err: unknown, traceId: string): boolean {
  if (err instanceof GoalCycleNotFoundError) {
    res.status(404).json(errorEnvelope("GOAL_CYCLE_NOT_FOUND", err.message, traceId));
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

type CreatorHandler = (
  req: Request,
  res: Response,
  ctx: { prisma: PrismaClient; creatorId: string; traceId: string }
) => Promise<unknown>;

export function registerGoalCycleOutcomeRoutes(app: Application, ctx: OutcomeRouteContext): void {
  const log = ctx.logger ?? createLogger({ name: "goal-cycle-outcome" });

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

  const audit = (action: string, fields: { creatorId: string; cycleId: string }) => {
    log.info(
      {
        event: "goal_cycle_outcome_audit",
        action,
        creator_id: fields.creatorId,
        cycle_id: fields.cycleId
      },
      "goal_cycle_outcome_audit"
    );
  };

  /** Full outcome snapshot + reflection + learning (GET is side-effect free). */
  app.get(
    "/api/v1/creator/goal-cycles/:id/outcome",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      const snapshot = await getGoalCycleOutcomeSnapshot(prisma, creatorId, cycleId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            cycle_id: cycle.cycle_id,
            summary: cycle.outcome,
            snapshot,
            reflection: cycle.reflection,
            learning: cycle.learning
          },
          traceId
        )
      );
    })
  );

  /** Idempotent outcome refresh — never terminalizes. */
  app.post(
    "/api/v1/creator/goal-cycles/:id/outcome/refresh",
    ctx.buildIdem("creator-goal-cycle-outcome-refresh"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const snapshot = await refreshGoalCycleOutcomeSnapshot(prisma, creatorId, cycleId);
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      audit("outcome_refresh", { creatorId, cycleId: cycle.cycle_id });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            cycle,
            snapshot,
            summary: outcomeSummaryFromSnapshot(snapshot)
          },
          traceId
        )
      );
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/reflection",
    ctx.buildIdem("creator-goal-cycle-reflection"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const body = (req.body ?? {}) as Record<string, unknown>;
      const raw =
        body.reflection === null
          ? null
          : typeof body.reflection === "string"
            ? body.reflection
            : null;
      if (body.reflection !== null && typeof body.reflection !== "string") {
        return res
          .status(400)
          .json(errorEnvelope("VALIDATION_ERROR", "reflection must be a string or null.", traceId));
      }
      const saved = await saveGoalCycleReflection(prisma, creatorId, cycleId, raw);
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      audit("reflection_save", { creatorId, cycleId });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle, reflection: saved.reflection }, traceId));
    })
  );

  app.get(
    "/api/v1/creator/goal-cycles/:id/learning",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const learning = await getGoalCycleLearningProposal(prisma, creatorId, cycleId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ learning }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/learning/propose",
    ctx.buildIdem("creator-goal-cycle-learning-propose"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const learning = await proposeGoalCycleLearning(prisma, creatorId, cycleId);
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      audit("learning_propose", { creatorId, cycleId });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle, learning }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/learning/accept",
    ctx.buildIdem("creator-goal-cycle-learning-accept"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const learning = await acceptGoalCycleLearning(prisma, creatorId, cycleId);
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      audit("learning_accept", { creatorId, cycleId });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle, learning }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/learning/reject",
    ctx.buildIdem("creator-goal-cycle-learning-reject"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "");
      const learning = await rejectGoalCycleLearning(prisma, creatorId, cycleId);
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      audit("learning_reject", { creatorId, cycleId });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle, learning }, traceId));
    })
  );
}
