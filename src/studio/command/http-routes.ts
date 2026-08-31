/**
 * Flag-gated Command Layer HTTP (RC-P2-T09).
 * POST /api/v1/creator/command/preview and /apply — session-matched, no publish.
 */
import type { PrismaClient } from "@prisma/client";
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { errorEnvelope, successEnvelope } from "../../contracts/api.js";
import type { IdentityService } from "../../identity/identity-service.js";
import { sendRelayAuthError } from "../../identity/require-account.js";
import { CommandContractError, getRelayCommandFeatureFlags, isCommandPostSource } from "./contracts.js";
import { publicCommandFlags } from "./flags.js";
import { previewChangeSet, clearChangeSetPreviewStore } from "./change-set-types.js";
import {
  applyCommandChangeSet,
  undoCommandChangeSet,
  clearCommandEngineUndoStore
} from "./change-set-engine.js";
import {
  deleteDurableCommandStateForCreator,
  deleteSelectionProposalRow,
  hydrateSelectionProposalsFromDb,
  persistCommandChangeSet,
  persistSelectionProposal
} from "./command-durable-store.js";
import { deleteCommandIdempotencyForCreator } from "./command-idempotency-store.js";
import { resolveCreatorCommandContext } from "./creator-context.js";
import { beginCommandIdempotency, recordCommandIdempotency, createCommandIdempotencyStore } from "./idempotency.js";
import { createCommandAuditStore } from "./mcp/audit.js";
import {
  interpretLab2HarnessInstruction,
  parseCommandHarnessSurface,
  shouldUseLab2FixtureInterpret
} from "../eval/command-harness-interpret.js";
import { interpretCreatorHarnessInstruction } from "../eval/command-harness-interpret-creator.js";
import { loadCommandLibraryItemsFromDb } from "./library-items-from-db.js";
import {
  cancelSelectionProposal,
  clearSelectionProposalStore,
  findActiveSelectionProposal,
  getSelectionProposal,
  isCommandProposalPatchOp,
  patchSelectionProposal,
  upsertSelectionProposalFromPreview
} from "./proposal-types.js";
import { refineSelectionProposal } from "./command-proposal-refine.js";
import { refineCommandPlan } from "./command-plan-refine.js";
import {
  applyPlanPatch,
  compileFinitePlanChangeSet,
  isCommandPlanPatchOp,
  isFinitePlanApplyKind,
  previewFinitePlan
} from "./proposal-patch.js";
import {
  collectionMetaFromOps,
  compileStockOperation,
  ORGANIZE_APPLY_SCHEDULE_BLOCKED,
  type CommandCompilerPostSource
} from "./operation-compiler.js";
import {
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_TITLE
} from "../lab2/corpus-spec.js";
import { restoreStudioLab2PlaygroundBaseline } from "../lab2/seed-studio-lab2.js";

export type RelayCommandHttpDeps = {
  prisma: PrismaClient | null | undefined;
  identityService: IdentityService;
};

function traceIdFrom(req: Request): string {
  const header = req.header("x-trace-id")?.trim();
  return header || `trace_${randomUUID()}`;
}

function mapCommandError(err: unknown, traceId: string) {
  if (err instanceof CommandContractError) {
    const status =
      err.code === "COMMAND_FORBIDDEN"
        ? 403
        : err.code === "COMMAND_NOT_FOUND"
          ? 404
          : err.code === "COMMAND_APPLY_DISABLED"
            ? 409
            : 400;
    return { status, body: errorEnvelope(err.code, err.message, traceId, err.details) };
  }
  return {
    status: 500,
    body: errorEnvelope("INTERNAL", err instanceof Error ? err.message : "Command failed.", traceId)
  };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function compilerPostsFromBody(body: Record<string, unknown>): CommandCompilerPostSource[] | undefined {
  if (!Array.isArray(body.posts)) return undefined;
  const posts: CommandCompilerPostSource[] = [];
  for (const row of body.posts) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const postId = typeof rec.post_id === "string" ? rec.post_id.trim() : "";
    if (!postId || !isCommandPostSource(rec.source)) continue;
    posts.push({ post_id: postId, source: rec.source });
  }
  return posts;
}

function compileApplyFromApprovedProposal(
  creatorId: string,
  body: Record<string, unknown>,
  changeSetId: string
): { change_set_id: string; resolved_post_ids: string[]; ops: ReturnType<typeof compileStockOperation>["ops"] } {
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
  const proposal = getSelectionProposal(proposalId, creatorId);
  if (proposal.stage !== "selection_approved" && proposal.stage !== "plan_shaping") {
    throw new CommandContractError("COMMAND_VALIDATION", "Selection is not approved.", [
      { field: "proposal_id", issue: "not_approved" }
    ]);
  }
  const kind =
    typeof body.operation_kind === "string" && body.operation_kind.trim()
      ? body.operation_kind.trim()
      : "create_or_update_collection";
  if (isFinitePlanApplyKind(kind)) {
    if (!getRelayCommandFeatureFlags().schedule_plan_enabled) {
      throw new CommandContractError("COMMAND_VALIDATION", ORGANIZE_APPLY_SCHEDULE_BLOCKED, [
        { field: "kind", issue: kind }
      ]);
    }
    const compiled = compileFinitePlanChangeSet(proposal);
    return {
      change_set_id: changeSetId,
      resolved_post_ids: compiled.resolved_post_ids,
      ops: compiled.ops
    };
  }
  const compiled = compileStockOperation({
    kind,
    frozen_post_ids: proposal.frozen_post_ids,
    frozen_revision: proposal.frozen_revision ?? "",
    expected_revision: typeof body.expected_revision === "string" ? body.expected_revision : "",
    collection_id: typeof body.collection_id === "string" ? body.collection_id : null,
    collection_title:
      typeof body.collection_title === "string" ? body.collection_title : collectionMetaFromOps([]).collection_title,
    tag_ids: asStringList(body.tag_ids),
    title: typeof body.title === "string" ? body.title : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    everywhere: body.everywhere === true,
    posts: compilerPostsFromBody(body),
    filter_name: typeof body.filter_name === "string" ? body.filter_name : undefined,
    filter_query:
      body.filter_query && typeof body.filter_query === "object" && !Array.isArray(body.filter_query)
        ? (body.filter_query as {
            q?: string;
            tag_ids?: string[];
            tier_ids?: string[];
            media_type?: string;
            published_after?: string;
            published_before?: string;
          })
        : undefined
  });
  return {
    change_set_id: changeSetId,
    resolved_post_ids: compiled.resolved_post_ids,
    ops: compiled.ops
  };
}

export function registerRelayCommandHttpRoutes(app: Express, deps: RelayCommandHttpDeps): void {
  const commandIdempotency = createCommandIdempotencyStore(deps.prisma);
  app.get("/api/v1/creator/command/flags", (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    return res.status(200).json(successEnvelope({ flags: publicCommandFlags() }, traceId));
  });

  app.post("/api/v1/creator/command/preview", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      const envelope = previewChangeSet({
        change_set_id: typeof body.change_set_id === "string" ? body.change_set_id : `cs_${traceId}`,
        idempotency_key: typeof body.idempotency_key === "string" ? body.idempotency_key : `idemp_${traceId}`,
        instruction: typeof body.instruction === "string" ? body.instruction : "preview",
        resolved_post_ids: Array.isArray(body.resolved_post_ids)
          ? body.resolved_post_ids.filter((x): x is string => typeof x === "string")
          : [],
        ops: Array.isArray(body.ops) ? (body.ops as never) : []
      });
      await persistCommandChangeSet(deps.prisma, ctx.creatorId, envelope);
      return res.status(200).json(successEnvelope({ envelope }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/apply", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const idempotencyKey =
      (typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : "") ||
      (typeof body.idempotency_key === "string" ? body.idempotency_key : "");
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      if (idempotencyKey) {
        const begun = await beginCommandIdempotency(commandIdempotency, {
          scope: `command-apply:${ctx.creatorId}`,
          key: idempotencyKey,
          body
        });
        if (begun.state === "replay") {
          return res.status(begun.snapshot.status).json(begun.snapshot.body);
        }
        if (begun.state === "in_flight") {
          return res.status(409).json(errorEnvelope("COMMAND_VALIDATION", "Apply is already in flight.", traceId));
        }
      }
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const changeSetId =
        typeof body.change_set_id === "string" && body.change_set_id.trim()
          ? body.change_set_id.trim()
          : `cs_${traceId}`;
      const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
      const applyInput = proposalId
        ? compileApplyFromApprovedProposal(ctx.creatorId, body, changeSetId)
        : {
            change_set_id: changeSetId,
            resolved_post_ids: Array.isArray(body.resolved_post_ids)
              ? body.resolved_post_ids.filter((x): x is string => typeof x === "string")
              : [],
            ops: Array.isArray(body.ops) ? (body.ops as never) : undefined
          };
      const envelope = await applyCommandChangeSet(deps.prisma, ctx.creatorId, applyInput);
      if (proposalId) {
        try {
          cancelSelectionProposal(proposalId, ctx.creatorId);
        } catch {
          /* already gone */
        }
        await deleteSelectionProposalRow(deps.prisma, proposalId, ctx.creatorId);
      }
      const payload = successEnvelope({ envelope, audit: { capability: "apply_change_set", creator_id: ctx.creatorId } }, traceId);
      if (idempotencyKey) {
        await recordCommandIdempotency(commandIdempotency, {
          scope: `command-apply:${ctx.creatorId}`,
          key: idempotencyKey,
          body,
          status: 200,
          responseBody: payload
        });
      }
      return res.status(200).json(payload);
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/undo", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const changeSetId = typeof body.change_set_id === "string" ? body.change_set_id.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      const undo = await undoCommandChangeSet(deps.prisma, ctx.creatorId, changeSetId);
      return res.status(200).json(successEnvelope({ undo }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/harness/interpret", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const instruction = typeof body.instruction === "string" ? body.instruction : "";
    const clarificationChoice =
      typeof body.clarification_choice === "string" ? body.clarification_choice : undefined;
    const surface = parseCommandHarnessSurface(body.surface);
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    const auditStore = createCommandAuditStore(deps.prisma);
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      const useFixture = shouldUseLab2FixtureInterpret(surface, ctx.creatorId);
      const result = useFixture
        ? interpretLab2HarnessInstruction({
            instruction,
            clarification_choice: clarificationChoice
          })
        : await interpretCreatorHarnessInstruction({
            creatorId: ctx.creatorId,
            instruction,
            clarification_choice: clarificationChoice,
            items: await loadCommandLibraryItemsFromDb(deps.prisma, ctx.creatorId)
          });
      try {
        await auditStore.record({
          accountId: ctx.accountId,
          creatorId: ctx.creatorId,
          tool: "harness_interpret",
          args: {
            scenario_id: result.kind === "error" ? null : result.scenario_id,
            has_clarification_choice: Boolean(clarificationChoice)
          },
          changeSetId: result.kind === "preview" ? result.change_set_id : null,
          outcome: result.kind === "error" ? result.code : result.kind,
          traceId,
          origin: "harness"
        });
      } catch {
        /* audit table may be absent until HUMAN-MIGRATE */
      }
      return res.status(200).json(successEnvelope({ result }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.get("/api/v1/creator/command/selection-proposal", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Selection review is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const rawQuery = req.query.creator_id;
    const creatorId = typeof rawQuery === "string" ? rawQuery.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const proposal = findActiveSelectionProposal(ctx.creatorId) ?? null;
      return res.status(200).json(successEnvelope({ proposal }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/selection-proposal", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Selection review is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const instruction = typeof body.instruction === "string" ? body.instruction : "";
    const postIds = Array.isArray(body.post_ids)
      ? body.post_ids.filter((x): x is string => typeof x === "string")
      : [];
    const warnings = Array.isArray(body.warnings)
      ? body.warnings.filter((x): x is string => typeof x === "string")
      : [];
    const explanation = typeof body.explanation === "string" ? body.explanation : undefined;
    const revision = typeof body.revision === "string" ? body.revision : undefined;
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      const items = await loadCommandLibraryItemsFromDb(deps.prisma, ctx.creatorId);
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const proposal = upsertSelectionProposalFromPreview(items, {
        creator_id: ctx.creatorId,
        instruction,
        post_ids: postIds,
        warnings,
        explanation,
        revision
      });
      await persistSelectionProposal(deps.prisma, proposal);
      return res.status(200).json(successEnvelope({ proposal }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/selection-proposal/cancel", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Selection review is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const cancelled = cancelSelectionProposal(proposalId, ctx.creatorId);
      await deleteSelectionProposalRow(deps.prisma, cancelled.proposal_id, ctx.creatorId);
      return res.status(200).json(successEnvelope({ cancelled: true, proposal_id: cancelled.proposal_id }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/selection-proposal/patch", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Selection review is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const opRaw = typeof body.op === "string" ? body.op.trim() : "";
    const postIds = Array.isArray(body.post_ids)
      ? body.post_ids.filter((x): x is string => typeof x === "string")
      : undefined;
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      if (!isCommandProposalPatchOp(opRaw)) {
        throw new CommandContractError("COMMAND_VALIDATION", "Unknown selection proposal op.", [
          { field: "op", issue: opRaw || "empty" }
        ]);
      }
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const proposal = patchSelectionProposal({
        creator_id: ctx.creatorId,
        proposal_id: proposalId,
        op: opRaw,
        post_ids: postIds
      });
      await persistSelectionProposal(deps.prisma, proposal);
      return res.status(200).json(successEnvelope({ proposal }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/selection-proposal/refine", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Selection review is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const instruction = typeof body.instruction === "string" ? body.instruction : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      const items = await loadCommandLibraryItemsFromDb(deps.prisma, ctx.creatorId);
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const refined = await refineSelectionProposal({
        creatorId: ctx.creatorId,
        proposalId,
        instruction,
        items,
        collections:
          ctx.creatorId === STUDIO_LAB2_CREATOR_ID
            ? [
                {
                  collection_id: STUDIO_LAB2_DEFAULT_COLLECTION_ID,
                  title: STUDIO_LAB2_DEFAULT_COLLECTION_TITLE
                }
              ]
            : undefined
      });
      await persistSelectionProposal(deps.prisma, refined.proposal);
      return res.status(200).json(
        successEnvelope(
          {
            proposal: refined.proposal,
            summary: refined.summary,
            op: refined.op,
            post_ids: refined.post_ids
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.get("/api/v1/creator/command/plan-proposal", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled || !flags.schedule_plan_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Schedule plan is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const creatorId = typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    const proposalId = typeof req.query.proposal_id === "string" ? req.query.proposal_id.trim() : "";
    const timeZone = typeof req.query.time_zone === "string" ? req.query.time_zone.trim() : "";
    const startLocal = typeof req.query.start_local === "string" ? req.query.start_local.trim() : "";
    const weekday = typeof req.query.weekday === "string" ? req.query.weekday.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const proposal = proposalId
        ? getSelectionProposal(proposalId, ctx.creatorId)
        : findActiveSelectionProposal(ctx.creatorId);
      if (!proposal) {
        throw new CommandContractError("COMMAND_NOT_FOUND", "Selection proposal not found.", [
          { field: "proposal_id", issue: proposalId || "active" }
        ]);
      }
      const preview = previewFinitePlan(proposal, {
        time_zone: timeZone || undefined,
        weekday: weekday || undefined,
        start_local: startLocal || undefined
      });
      return res.status(200).json(
        successEnvelope(
          {
            proposal_id: proposal.proposal_id,
            stage: proposal.stage,
            persisted: preview.persisted,
            plan: preview.plan,
            slots: preview.slots
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/plan-proposal/patch", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled || !flags.schedule_plan_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Schedule plan is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const opRaw = typeof body.op === "string" ? body.op.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      if (!isCommandPlanPatchOp(opRaw) && opRaw !== "add_post_id" && opRaw !== "publish_external" && opRaw !== "set_write_layer") {
        throw new CommandContractError("COMMAND_VALIDATION", "Unknown plan patch op.", [
          { field: "op", issue: opRaw || "empty" }
        ]);
      }
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const patched = applyPlanPatch({
        creator_id: ctx.creatorId,
        proposal_id: proposalId,
        op: opRaw,
        expected_version: typeof body.expected_version === "number" ? body.expected_version : undefined,
        weekday: typeof body.weekday === "string" || typeof body.weekday === "number" ? body.weekday : undefined,
        interval_days: typeof body.interval_days === "number" ? body.interval_days : undefined,
        start_local: typeof body.start_local === "string" ? body.start_local : undefined,
        time_zone: typeof body.time_zone === "string" ? body.time_zone : undefined,
        post_id: typeof body.post_id === "string" ? body.post_id : undefined,
        due_at: typeof body.due_at === "string" ? body.due_at : undefined
      });
      await persistSelectionProposal(deps.prisma, patched.proposal);
      return res.status(200).json(
        successEnvelope(
          {
            proposal: patched.proposal,
            plan: patched.plan,
            slots: patched.slots
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/plan-proposal/refine", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.selection_ux_enabled || !flags.schedule_plan_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Schedule plan is disabled.", traceId));
    }
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const instruction = typeof body.instruction === "string" ? body.instruction : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      const items = await loadCommandLibraryItemsFromDb(deps.prisma, ctx.creatorId);
      await hydrateSelectionProposalsFromDb(deps.prisma, ctx.creatorId);
      const refined = await refineCommandPlan({
        creatorId: ctx.creatorId,
        proposalId,
        instruction,
        items
      });
      await persistSelectionProposal(deps.prisma, refined.proposal);
      return res.status(200).json(
        successEnvelope(
          {
            proposal: refined.proposal,
            plan: refined.plan,
            slots: refined.slots,
            summary: refined.summary,
            op: refined.op
          },
          traceId
        )
      );
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/lab2/reset-baseline", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    if (!deps.prisma) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    const token =
      typeof req.headers.authorization === "string" && req.headers.authorization.toLowerCase().startsWith("bearer ")
        ? req.headers.authorization.slice(7).trim()
        : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: token || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId
      });
      if (ctx.creatorId !== STUDIO_LAB2_CREATOR_ID) {
        throw new CommandContractError(
          "COMMAND_FORBIDDEN",
          "Baseline reset is only for the Lab 2 playground.",
          [{ field: "creator_id", issue: ctx.creatorId }]
        );
      }
      const restored = await restoreStudioLab2PlaygroundBaseline(deps.prisma, {
        creatorId: ctx.creatorId
      });
      await deleteDurableCommandStateForCreator(deps.prisma, ctx.creatorId);
      await deleteCommandIdempotencyForCreator(deps.prisma, ctx.creatorId);
      clearCommandEngineUndoStore();
      clearChangeSetPreviewStore();
      clearSelectionProposalStore();
      return res.status(200).json(successEnvelope({ restored }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      if (err instanceof Error && /playground reset in production/i.test(err.message)) {
        return res.status(403).json(errorEnvelope("COMMAND_FORBIDDEN", err.message, traceId));
      }
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });
}
