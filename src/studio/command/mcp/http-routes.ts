/**
 * Flag-gated Command MCP HTTP (RC-P3-T01 / T02).
 * POST /api/v1/creator/command/mcp — JSON-RPC 2.0.
 * GET/POST grant issue-list-revoke uses the creator web session, not the MCP token.
 */
import type { PrismaClient } from "@prisma/client";
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { errorEnvelope, successEnvelope } from "../../../contracts/api.js";
import type { IdentityService } from "../../../identity/identity-service.js";
import { sendRelayAuthError } from "../../../identity/require-account.js";
import { commandCapabilityFacade } from "../capability-facade.js";
import { CommandContractError, getRelayCommandFeatureFlags } from "../contracts.js";
import { resolveCreatorCommandContext } from "../creator-context.js";
import { loadCommandLibraryItemsFromDb } from "../library-items-from-db.js";
import { createCommandAuditStore, type CommandAuditStore } from "./audit.js";
import { resolveCommandMcpAuth, type CommandMcpAuth } from "./auth.js";
import { createCommandGrantStore, type CommandGrantStore } from "./grant-store.js";
import { handleCommandMcpJsonRpc } from "./jsonrpc.js";

export type RelayCommandMcpHttpDeps = {
  prisma: PrismaClient | null | undefined;
  identityService?: IdentityService;
  grantStore?: CommandGrantStore;
  auditStore?: CommandAuditStore;
};

function traceIdFrom(req: Request): string {
  const header = req.header("x-trace-id")?.trim();
  return header || `trace_${randomUUID()}`;
}

function bearerFrom(req: Request): string {
  return typeof req.headers.authorization === "string" &&
    req.headers.authorization.toLowerCase().startsWith("bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
}

function mapCommandError(err: unknown, traceId: string) {
  if (err instanceof CommandContractError) {
    const status =
      err.code === "COMMAND_FORBIDDEN"
        ? 403
        : err.code === "COMMAND_NOT_FOUND"
          ? 404
          : 400;
    return { status, body: errorEnvelope(err.code, err.message, traceId, err.details) };
  }
  return {
    status: 500,
    body: errorEnvelope("INTERNAL", err instanceof Error ? err.message : "Command grant failed.", traceId)
  };
}

export function registerRelayCommandMcpHttpRoutes(
  app: Express,
  deps: RelayCommandMcpHttpDeps
): void {
  const grantStore = deps.grantStore ?? createCommandGrantStore(deps.prisma);
  const auditStore = deps.auditStore ?? createCommandAuditStore(deps.prisma);

  app.get("/api/v1/creator/command/grants", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma || !deps.identityService) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const bodyCreator =
      typeof req.query.creator_id === "string" ? req.query.creator_id.trim() : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: bearerFrom(req) || undefined,
        identityService: deps.identityService,
        requestedCreatorId: bodyCreator || undefined,
        traceId
      });
      const grants = await grantStore.list(ctx.accountId, ctx.creatorId);
      return res.status(200).json(successEnvelope({ grants }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/grants", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma || !deps.identityService) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: bearerFrom(req) || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId || undefined,
        traceId
      });
      const ttlMs =
        typeof body.ttl_ms === "number"
          ? body.ttl_ms
          : typeof body.ttl_ms === "string"
            ? Number(body.ttl_ms)
            : undefined;
      const issued = await grantStore.issue({
        accountId: ctx.accountId,
        creatorId: ctx.creatorId,
        scopes: body.scopes,
        clientLabel: typeof body.client_label === "string" ? body.client_label : "",
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : undefined
      });
      return res.status(201).json(successEnvelope(issued, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/grants/revoke", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command layer is disabled.", traceId));
    }
    if (!deps.prisma || !deps.identityService) {
      return res.status(503).json(errorEnvelope("SERVICE_UNAVAILABLE", "Database not configured.", traceId));
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const grantId = typeof body.grant_id === "string" ? body.grant_id.trim() : "";
    const creatorId = typeof body.creator_id === "string" ? body.creator_id.trim() : "";
    try {
      const ctx = await resolveCreatorCommandContext({
        prisma: deps.prisma,
        token: bearerFrom(req) || undefined,
        identityService: deps.identityService,
        requestedCreatorId: creatorId || undefined,
        traceId
      });
      const grant = await grantStore.revoke(grantId, ctx.accountId);
      return res.status(200).json(successEnvelope({ grant }, traceId));
    } catch (err) {
      if (sendRelayAuthError(res, err, traceId)) return;
      const mapped = mapCommandError(err, traceId);
      return res.status(mapped.status).json(mapped.body);
    }
  });

  app.post("/api/v1/creator/command/mcp", async (req: Request, res: Response) => {
    const traceId = traceIdFrom(req);
    const flags = getRelayCommandFeatureFlags();
    if (!flags.layer_enabled || !flags.mcp_enabled) {
      return res.status(404).json(errorEnvelope("NOT_FOUND", "Command MCP is disabled.", traceId));
    }
    let auth: CommandMcpAuth;
    try {
      auth = await resolveCommandMcpAuth({
        authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
        creatorIdHeader:
          typeof req.headers["x-relay-creator-id"] === "string"
            ? req.headers["x-relay-creator-id"]
            : undefined,
        grantStore
      });
    } catch (err) {
      if (err instanceof CommandContractError) {
        const status = err.code === "COMMAND_FORBIDDEN" ? 403 : 400;
        return res.status(status).json(errorEnvelope(err.code, err.message, traceId, err.details));
      }
      return res.status(500).json(errorEnvelope("INTERNAL", "MCP auth failed.", traceId));
    }
    const rpc = await handleCommandMcpJsonRpc((req.body ?? {}) as never, {
      auth,
      facade: commandCapabilityFacade,
      prisma: deps.prisma,
      auditStore,
      traceId,
      loadLibraryItems: async (creatorId, options) => {
        if (!deps.prisma) {
          throw new CommandContractError("COMMAND_FORBIDDEN", "Command MCP requires Prisma.", [
            { field: "prisma", issue: "missing" }
          ]);
        }
        return loadCommandLibraryItemsFromDb(deps.prisma, creatorId, options);
      }
    });
    return res.status(200).json(rpc);
  });
}
