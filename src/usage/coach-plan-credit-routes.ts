/**
 * Coach Plan credit HTTP routes (VS2-T04).
 */

import type { PrismaClient } from "@prisma/client";
import type { Application, Request, Response } from "express";
import { errorEnvelope, successEnvelope } from "../contracts/api.js";
import {
  requireAccountWithRole,
  sendRelayAuthError,
  type RequireAccountDeps
} from "../identity/require-account.js";
import { getGoalCycleFeatureFlags } from "../goal-cycle/contracts.js";
import { getCoachPlanCreditStatus } from "./coach-plan-credit-service.js";

function traceIdFrom(req: Request): string {
  return req.header("x-trace-id") ?? `trace_coach_plan_credit_${Date.now()}`;
}

export type CoachPlanCreditRouteContext = {
  prisma: PrismaClient | undefined;
  identityService: RequireAccountDeps["identityService"];
};

export function registerCoachPlanCreditRoutes(
  app: Application,
  ctx: CoachPlanCreditRouteContext
): void {
  app.get("/api/v1/creator/coach-plan-credits", async (req: Request, res: Response) => {
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
      const credits = await getCoachPlanCreditStatus(ctx.prisma, creatorId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(successEnvelope({ credits }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      return res.status(500).json(errorEnvelope("INTERNAL", (err as Error).message, traceId));
    }
  });
}
