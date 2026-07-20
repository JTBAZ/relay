/**
 * Goal Cycle approval / materialization HTTP routes (VS7-T03).
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
import { getGoalCycle, GoalCycleNotFoundError } from "../goal-cycle-service.js";
import { diagnoseOrRepairExecutionProjections } from "../execution/goal-cycle-repair-service.js";
import { diagnoseOrRepairMaterialization } from "./goal-cycle-materialization-repair.js";
import { approveAndMaterialize } from "./goal-cycle-materialization-service.js";

export type GoalCycleMaterializationRouteContext = {
  prisma: PrismaClient | undefined;
  identityService: RequireAccountDeps["identityService"];
  buildIdem: (scope: string) => RequestHandler;
  logger?: Logger;
};

function traceIdFrom(req: Request): string {
  return req.header("x-trace-id") ?? `trace_goal_cycle_materialize_${Date.now()}`;
}

function statusForGoalCycleError(code: GoalCycleErrorCode): number {
  switch (code) {
    case "GOAL_CYCLE_ACTIVE_EXISTS":
    case "GOAL_CYCLE_VERSION_CONFLICT":
    case "GOAL_CYCLE_INVALID_STATE":
    case "GOAL_CYCLE_LIMIT_EXCEEDED":
      return 409;
    case "GOAL_CYCLE_NOT_FOUND":
      return 404;
    case "GOAL_CYCLE_RESEARCH_UNAVAILABLE":
      return 503;
    case "GOAL_CYCLE_NO_CREDIT":
      return 402;
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

function resolveApprovalKey(req: Request, body: Record<string, unknown>): string | null {
  const fromBody =
    readOptionalString(body.approval_key) ?? readOptionalString(body.idempotency_key);
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
 * Registers:
 * - POST /api/v1/creator/goal-cycles/:id/approve
 * - POST /api/v1/creator/goal-cycles/:id/materialization/repair
 */
export function registerGoalCycleMaterializationRoutes(
  app: Application,
  ctx: GoalCycleMaterializationRouteContext
): void {
  const log = ctx.logger ?? createLogger({ name: "goal-cycle-materialization" });

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
        log.error({ err, traceId }, "goal-cycle materialization route failed");
        return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
      }
    };
  };

  app.post(
    "/api/v1/creator/goal-cycles/:id/approve",
    ctx.buildIdem("creator-goal-cycle-approve"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const cycleId = String(req.params.id ?? "").trim();
      const expectedVersion = readExpectedVersion(body);
      if (expectedVersion === undefined) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_PLAN_INVALID",
          "expected_version is required.",
          [{ field: "expected_version", issue: "required" }]
        );
      }
      const approvalKey = resolveApprovalKey(req, body);
      if (!approvalKey) {
        throw new GoalCycleContractError(
          "GOAL_CYCLE_PLAN_INVALID",
          "approval_key (or Idempotency-Key) is required.",
          [{ field: "approval_key", issue: "required" }]
        );
      }

      const result = await approveAndMaterialize(prisma, {
        creatorId,
        cycleId,
        expectedVersion,
        approvalKey
      });
      const cycle = await getGoalCycle(prisma, creatorId, cycleId);

      log.info(
        {
          event: "goal_cycle_materialization_audit",
          action: "approve",
          creator_id: creatorId,
          cycle_id: cycleId,
          approval_key: approvalKey,
          idempotent: result.idempotent,
          slot_count: result.receipt.slots.length
        },
        "goal_cycle_materialization_audit"
      );

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(
        successEnvelope(
          {
            receipt: result.receipt,
            cycle,
            idempotent: result.idempotent
          },
          traceId
        )
      );
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/materialization/repair",
    ctx.buildIdem("creator-goal-cycle-materialization-repair"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const cycleId = String(req.params.id ?? "").trim();
      const approvalKey = resolveApprovalKey(req, body);
      const repair = body.repair === true || body.repair === "true" || body.repair === 1;

      const report = await diagnoseOrRepairMaterialization(prisma, {
        creatorId,
        cycleId,
        approvalKey,
        repair
      });

      log.info(
        {
          event: "goal_cycle_materialization_audit",
          action: "repair",
          creator_id: creatorId,
          cycle_id: cycleId,
          status: report.status,
          repair,
          can_retry: report.can_safely_retry_approve
        },
        "goal_cycle_materialization_audit"
      );

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ report }, traceId));
    })
  );

  app.post(
    "/api/v1/creator/goal-cycles/:id/execution/repair",
    ctx.buildIdem("creator-goal-cycle-execution-repair"),
    withCreator(async (req, res, { prisma, creatorId, traceId }) => {
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const cycleId = String(req.params.id ?? "").trim();
      const slotKey =
        typeof body.slot_key === "string" ? body.slot_key.trim() : null;
      const repair = body.repair === true || body.repair === "true" || body.repair === 1;

      const report = await diagnoseOrRepairExecutionProjections(prisma, {
        creatorId,
        cycleId,
        slotKey,
        repair
      });

      log.info(
        {
          event: "goal_cycle_execution_audit",
          action: "repair",
          creator_id: creatorId,
          cycle_id: cycleId,
          status: report.status,
          repaired: report.repaired,
          can_repair: report.can_safely_repair
        },
        "goal_cycle_execution_audit"
      );

      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ report }, traceId));
    })
  );
}
