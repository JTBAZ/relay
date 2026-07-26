/**
 * Goal Cycle planner HTTP routes (VS5-T05).
 * Questions, generate, revise, manual-edit, and plan hydration.
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
import {
  getGoalCycle,
  GoalCycleNotFoundError
} from "../goal-cycle-service.js";
import {
  answerPlannerQuestions,
  applyManualPlanEdit,
  generateInitialGoalCyclePlan,
  proposePlannerQuestions,
  reviseGoalCyclePlan
} from "./goal-cycle-planner-service.js";

export type GoalCyclePlannerRouteContext = {
  prisma: PrismaClient | undefined;
  identityService: RequireAccountDeps["identityService"];
  buildIdem: (scope: string) => RequestHandler;
  logger?: Logger;
};

function traceIdFrom(req: Request): string {
  return req.header("x-trace-id") ?? `trace_goal_cycle_planner_${Date.now()}`;
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
    case "GOAL_CYCLE_LIMIT_EXCEEDED":
      return 409;
    case "GOAL_CYCLE_DESTINATION_UNLINKED":
      return 400;
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

function resolveIdempotencyKey(req: Request, body: Record<string, unknown>): string | null {
  const fromBody = readOptionalString(body.idempotency_key);
  if (fromBody) return fromBody.slice(0, 128);
  const fromHeader = readOptionalString(req.header("idempotency-key"));
  return fromHeader ? fromHeader.slice(0, 128) : null;
}

function readExpectedVersion(body: Record<string, unknown>): number | undefined {
  const raw = body.expected_version;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (n >= 1) return n;
  }
  return undefined;
}

type CreatorHandler = (
  req: Request,
  res: Response,
  ctx: { prisma: PrismaClient; creatorId: string; traceId: string }
) => Promise<void | Response>;

/**
 * Registers planner endpoints under /api/v1/creator/goal-cycles/:id/planner/*
 */
export function registerGoalCyclePlannerRoutes(
  app: Application,
  ctx: GoalCyclePlannerRouteContext
): void {
  const log = ctx.logger ?? createLogger({ name: "goal-cycle-planner" });

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
    fields: { creatorId: string; cycleId?: string; version?: number }
  ) => {
    log.info(
      {
        event: "goal_cycle_planner_audit",
        action,
        creator_id: fields.creatorId,
        cycle_id: fields.cycleId ?? null,
        version: fields.version ?? null
      },
      "goal_cycle_planner_audit"
    );
  };

  // GET hydrate — plan + progress; never mutates.
  app.get(
    "/api/v1/creator/goal-cycles/:id/planner",
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            cycle,
            plan: cycle.plan,
            progress: cycle.progress
          },
          traceId
        )
      );
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/planner/questions",
    ctx.buildIdem("creator-goal-cycle-planner-questions"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const idempotencyKey =
        resolveIdempotencyKey(req, body) ?? `planner_q_${cycleId}_${Date.now()}`;
      const expectedVersion = readExpectedVersion(body);
      const result = await proposePlannerQuestions(prisma, {
        creatorId,
        cycleId,
        idempotencyKey,
        expectedVersion,
        deterministicOnly: body.deterministic_only === true
      });
      audit("planner_questions", {
        creatorId,
        cycleId,
        version: result.cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            questions: result.questions,
            cycle: result.cycle,
            idempotent: result.idempotent
          },
          traceId
        )
      );
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/planner/answers",
    ctx.buildIdem("creator-goal-cycle-planner-answers"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const expectedVersion = readExpectedVersion(body);
      if (expectedVersion == null) {
        return res.status(400).json(
          errorEnvelope("GOAL_CYCLE_VERSION_CONFLICT", "expected_version is required.", traceId, [
            { field: "expected_version", issue: "required" }
          ])
        );
      }
      const answersRaw = Array.isArray(body.answers) ? body.answers : [];
      const answers = answersRaw
        .map((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return null;
          const r = row as Record<string, unknown>;
          const id = readOptionalString(r.id);
          const answer = readOptionalString(r.answer);
          if (!id || !answer) return null;
          return { id, answer };
        })
        .filter((a): a is { id: string; answer: string } => a != null);

      const cycle = await answerPlannerQuestions(prisma, {
        creatorId,
        cycleId,
        expectedVersion,
        answers
      });
      audit("planner_answers", { creatorId, cycleId, version: cycle.version });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ cycle }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/planner/generate",
    ctx.buildIdem("creator-goal-cycle-planner-generate"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const idempotencyKey =
        resolveIdempotencyKey(req, body) ?? `planner_gen_${cycleId}_${Date.now()}`;
      const result = await generateInitialGoalCyclePlan(prisma, {
        creatorId,
        cycleId,
        idempotencyKey,
        expectedVersion: readExpectedVersion(body),
        skipQuestions: body.skip_questions === true,
        forceFallback: body.force_fallback === true
      });
      audit("planner_generate", {
        creatorId,
        cycleId,
        version: result.cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            plan: result.plan,
            cycle: result.cycle,
            ai_used: result.ai_used,
            fallback: result.fallback,
            idempotent: result.idempotent
          },
          traceId
        )
      );
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/planner/revise",
    ctx.buildIdem("creator-goal-cycle-planner-revise"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const idempotencyKey =
        resolveIdempotencyKey(req, body) ?? `planner_rev_${cycleId}_${Date.now()}`;
      const revisionNote = readOptionalString(body.revision_note);
      if (!revisionNote) {
        return res.status(400).json(
          errorEnvelope("GOAL_CYCLE_PLAN_INVALID", "revision_note is required.", traceId, [
            { field: "revision_note", issue: "required" }
          ])
        );
      }
      const result = await reviseGoalCyclePlan(prisma, {
        creatorId,
        cycleId,
        idempotencyKey,
        expectedVersion: readExpectedVersion(body),
        revision_note: revisionNote,
        forceFallback: body.force_fallback === true
      });
      audit("planner_revise", {
        creatorId,
        cycleId,
        version: result.cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            plan: result.plan,
            cycle: result.cycle,
            ai_used: result.ai_used,
            fallback: result.fallback,
            ai_revision_count: result.ai_revision_count,
            idempotent: result.idempotent
          },
          traceId
        )
      );
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/planner/manual-edit",
    ctx.buildIdem("creator-goal-cycle-planner-manual-edit"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const cycleId = String(req.params.id ?? "").trim();
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const idempotencyKey =
        resolveIdempotencyKey(req, body) ?? `planner_manual_${cycleId}_${Date.now()}`;
      if (body.plan == null) {
        return res.status(400).json(
          errorEnvelope("GOAL_CYCLE_PLAN_INVALID", "plan is required.", traceId, [
            { field: "plan", issue: "required" }
          ])
        );
      }
      const result = await applyManualPlanEdit(prisma, {
        creatorId,
        cycleId,
        idempotencyKey,
        expectedVersion: readExpectedVersion(body),
        plan: body.plan
      });
      audit("planner_manual_edit", {
        creatorId,
        cycleId,
        version: result.cycle.version
      });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            plan: result.plan,
            cycle: result.cycle,
            idempotent: result.idempotent
          },
          traceId
        )
      );
    })
  );
}
