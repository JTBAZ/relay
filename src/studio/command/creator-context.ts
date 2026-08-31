/**
 * Creator capability context (RC-P1-T07 / T08).
 * Account → primaryRelayCreatorId, fail closed without Prisma.
 * MCP grants live on `command_grants` (RC-P3-T02), not SessionKind.mcp.
 * Grant CRUD still authenticates with the creator's web/extension session.
 *
 * Isolation canonical tests: tests/relay-creator-tenant-authz.test.ts
 * (body.creator_id must equal Account.primaryRelayCreatorId).
 */

import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../identity/identity-service.js";
import { loadAccountContextForSession } from "../../identity/require-account.js";
import { CommandContractError, type CommandGrantScope } from "./contracts.js";

export type CommandCreatorContext = {
  accountId: string;
  creatorId: string;
  traceId: string;
  /** Playground / web-session scopes. MCP tool calls use the grant's hashed scopes. */
  scopes: CommandGrantScope[];
};

/**
 * P2 playground decision (RC-P1-T08): do not add HTTP `publish: false`.
 * Keep POST /api/v1/relay/posts DRAFT_NOT_SUPPORTED. Imported Lab 2 renames use
 * presentation PATCH. Native Lab 2 posts are created with publish:true.
 * Native revise uses an append-PostVersion service behind routePostRevision
 * (write layer native_version) — not draft HTTP.
 */
export const COMMAND_P2_NATIVE_DRAFT_HTTP = "keep_draft_not_supported" as const;

const DEFAULT_PLAYGROUND_SCOPES: CommandGrantScope[] = [
  "library:read",
  "drafts:write",
  "collections:write",
  "schedule:write",
  "command:apply"
];

function forbidden(message: string, field: string, issue: string): never {
  throw new CommandContractError("COMMAND_FORBIDDEN", message, [{ field, issue }]);
}

export type ResolveCreatorCommandContextInput = {
  prisma: PrismaClient | null | undefined;
  /** Injected account for tests; HTTP later uses token + identityService. */
  account?: { accountId: string; primaryRelayCreatorId: string | null } | null;
  token?: string;
  identityService?: Pick<IdentityService, "resolveSession">;
  requestedCreatorId?: string | null;
  traceId?: string;
  scopes?: CommandGrantScope[];
};

/**
 * Resolve command tenancy. Missing Prisma fails closed — do not copy
 * `requireAccountMatchesCreator`'s `if (!config.prisma) return true` skip.
 */
export async function resolveCreatorCommandContext(
  input: ResolveCreatorCommandContextInput
): Promise<CommandCreatorContext> {
  if (!input.prisma) {
    forbidden("Command context requires Prisma.", "prisma", "missing");
  }

  let accountId = input.account?.accountId?.trim() ?? "";
  let creatorId = input.account?.primaryRelayCreatorId?.trim() ?? "";

  if (input.token) {
    if (!input.identityService) {
      forbidden("Command context requires identityService when token is set.", "identityService", "missing");
    }
    const session = await input.identityService.resolveSession(input.token);
    if (!session) {
      forbidden("Invalid or expired session.", "token", "invalid");
    }
    const ctx = await loadAccountContextForSession(input.prisma, session);
    if (!ctx) {
      forbidden("Session is not linked to an account.", "account", "missing");
    }
    accountId = ctx.accountId;
    creatorId = ctx.primaryRelayCreatorId?.trim() ?? "";
  }

  if (!accountId) {
    forbidden("Authentication required.", "account", "missing");
  }
  if (!creatorId) {
    forbidden("Account has no creator workspace.", "creator_id", "missing");
  }

  const requested = input.requestedCreatorId?.trim() ?? "";
  if (requested && requested !== creatorId) {
    forbidden(
      "creator_id does not match the authenticated creator account.",
      "creator_id",
      "mismatch"
    );
  }

  return {
    accountId,
    creatorId,
    traceId: input.traceId?.trim() || "trace_command",
    scopes: input.scopes ?? DEFAULT_PLAYGROUND_SCOPES
  };
}
