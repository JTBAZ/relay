/**
 * MCP tool dispatcher — calls the capability facade only (RC-P3-T01).
 * Does not enumerate Express application routes as tools.
 */
import type { PrismaClient } from "@prisma/client";
import {
  CommandContractError,
  assertCommandCapabilityAllowed,
  getRelayCommandFeatureFlags,
  selectionQueryRequestsDrafts,
  type CommandCapabilityName,
  type CommandChangeSetOp
} from "../contracts.js";
import type { CommandCapabilityFacade } from "../capability-facade.js";
import type { LoadCommandLibraryItemsOptions } from "../library-items-from-db.js";
import type { CommandLibraryItem } from "../selection.js";
import { applyCommandChangeSet, undoCommandChangeSet } from "../change-set-engine.js";
import { persistCommandChangeSet } from "../command-durable-store.js";
import { commandMcpAuthHasScopes, type CommandMcpAuth } from "./auth.js";
import { auditOriginFromAuth, type CommandAuditStore } from "./audit.js";
import { assertCommandMcpInputSafety, redactCommandMcpValue } from "./redact.js";
import { getCommandMcpToolDef } from "./tool-defs.js";

export type CommandMcpDispatchContext = {
  auth: CommandMcpAuth;
  facade: CommandCapabilityFacade;
  env?: NodeJS.ProcessEnv;
  prisma?: PrismaClient | null;
  loadLibraryItems?: (
    creatorId: string,
    options?: LoadCommandLibraryItemsOptions
  ) => Promise<readonly CommandLibraryItem[]> | readonly CommandLibraryItem[];
  auditStore?: CommandAuditStore;
  traceId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function requirePrisma(prisma: PrismaClient | null | undefined): PrismaClient {
  if (!prisma) {
    throw new CommandContractError(
      "COMMAND_FORBIDDEN",
      "Command apply requires Prisma.",
      [{ field: "prisma", issue: "missing" }]
    );
  }
  return prisma;
}

async function callFacade(
  name: CommandCapabilityName,
  args: Record<string, unknown>,
  ctx: CommandMcpDispatchContext
): Promise<unknown> {
  const facade = ctx.facade;
  const env = ctx.env ?? process.env;
  switch (name) {
    case "search_library": {
      const query = isRecord(args.query) ? args.query : args;
      const includeDrafts = selectionQueryRequestsDrafts(query);
      const items = ctx.loadLibraryItems
        ? await ctx.loadLibraryItems(ctx.auth.creatorId, { includeDrafts })
        : [];
      return facade.search_library(items, args.query ?? args, {
        creator_id: ctx.auth.creatorId
      });
    }
    case "resolve_numbered_sequence": {
      const items = Array.isArray(args.items) ? args.items : [];
      return facade.resolve_numbered_sequence(items as never);
    }
    case "preview_collection":
      return facade.preview_collection();
    case "create_or_update_collection":
      return facade.create_or_update_collection();
    case "set_collection_order":
      return facade.set_collection_order();
    case "add_post_tags":
      return facade.add_post_tags();
    case "remove_post_tags":
      return facade.remove_post_tags();
    case "create_saved_filter":
      return facade.create_saved_filter();
    case "preview_post_revision":
      return facade.preview_post_revision(args as never);
    case "revise_post":
      return facade.revise_post(args as never);
    case "preview_release_plan":
      return facade.preview_release_plan();
    case "create_release_plan":
      return facade.create_release_plan();
    case "materialize_schedule":
      return facade.materialize_schedule();
    case "prepare_destination_drafts":
      return facade.prepare_destination_drafts();
    case "preview_change_set": {
      const envelope = facade.preview_change_set(args as never);
      if (ctx.prisma) {
        await persistCommandChangeSet(ctx.prisma, ctx.auth.creatorId, envelope);
      }
      return envelope;
    }
    case "apply_change_set": {
      const prisma = requirePrisma(ctx.prisma);
      return applyCommandChangeSet(
        prisma,
        ctx.auth.creatorId,
        {
          change_set_id: String(args.change_set_id ?? "").trim(),
          resolved_post_ids: asStringList(args.resolved_post_ids),
          ops: Array.isArray(args.ops) ? (args.ops as CommandChangeSetOp[]) : undefined
        },
        env
      );
    }
    case "undo_change_set": {
      const prisma = requirePrisma(ctx.prisma);
      return undoCommandChangeSet(
        prisma,
        ctx.auth.creatorId,
        String(args.change_set_id ?? ""),
        env
      );
    }
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export async function invokeCommandMcpTool(
  name: string,
  args: unknown,
  ctx: CommandMcpDispatchContext
): Promise<unknown> {
  const record = isRecord(args) ? args : {};
  const changeSetId =
    typeof record.change_set_id === "string" && record.change_set_id.trim()
      ? record.change_set_id.trim()
      : null;
  const traceId = ctx.traceId?.trim() || "trace_command";
  let outcome = "ok";
  try {
    const capability = assertCommandCapabilityAllowed(name);
    const def = getCommandMcpToolDef(capability);
    if (!def) {
      throw new CommandContractError("COMMAND_VALIDATION", "Unknown command capability.", [
        { field: "name", issue: name }
      ]);
    }
    if (!commandMcpAuthHasScopes(ctx.auth, def.required_scopes)) {
      throw new CommandContractError(
        "COMMAND_FORBIDDEN",
        "Grant is missing a required scope for this tool.",
        [{ field: "scopes", issue: def.required_scopes.join(",") }]
      );
    }
    const env = ctx.env ?? process.env;
    const flags = getRelayCommandFeatureFlags(env);
    if (def.access === "write" && !flags.apply_enabled) {
      throw new CommandContractError(
        "COMMAND_APPLY_DISABLED",
        "Write tools require RELAY_COMMAND_APPLY_ENABLED.",
        [{ field: "RELAY_COMMAND_APPLY_ENABLED", issue: "off" }]
      );
    }
    assertCommandMcpInputSafety(capability, record);
    const result = await callFacade(capability, record, ctx);
    return redactCommandMcpValue(result);
  } catch (err) {
    outcome =
      err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "INTERNAL";
    throw err;
  } finally {
    if (ctx.auditStore) {
      await ctx.auditStore.record({
        accountId: ctx.auth.accountId ?? null,
        creatorId: ctx.auth.creatorId,
        tool: name,
        args: record,
        changeSetId,
        outcome,
        traceId,
        origin: auditOriginFromAuth(ctx.auth.origin)
      });
    }
  }
}
