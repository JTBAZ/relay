/**
 * Command MCP grants (RC-P3-T02). Distinct from web/extension sessions.
 * Tokens are hashed at rest. TTL is capped at 7 days.
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashOpaqueSessionToken } from "../../../identity/session-token-hash.js";
import {
  CommandContractError,
  validateCommandGrantScopes,
  type CommandGrantScope
} from "../contracts.js";

export const COMMAND_GRANT_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CommandGrantRecord = {
  id: string;
  accountId: string;
  creatorId: string;
  scopes: CommandGrantScope[];
  clientLabel: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export type CommandGrantPublic = {
  grant_id: string;
  creator_id: string;
  scopes: CommandGrantScope[];
  client_label: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type IssueCommandGrantInput = {
  accountId: string;
  creatorId: string;
  scopes?: unknown;
  clientLabel: string;
  ttlMs?: number;
  now?: Date;
};

export type CommandGrantStore = {
  issue(input: IssueCommandGrantInput): Promise<{ grant: CommandGrantPublic; token: string }>;
  list(accountId: string, creatorId: string): Promise<CommandGrantPublic[]>;
  revoke(grantId: string, accountId: string): Promise<CommandGrantPublic>;
  resolveToken(token: string, now?: Date): Promise<CommandGrantRecord | null>;
};

function toPublic(row: CommandGrantRecord): CommandGrantPublic {
  return {
    grant_id: row.id,
    creator_id: row.creatorId,
    scopes: [...row.scopes],
    client_label: row.clientLabel,
    expires_at: row.expiresAt.toISOString(),
    revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
    created_at: row.createdAt.toISOString()
  };
}

function normalizeScopes(input: unknown): CommandGrantScope[] {
  const requested = input === undefined ? ["library:read"] : input;
  const scopes = validateCommandGrantScopes(requested);
  if (!scopes.includes("library:read")) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Command grants must include library:read.",
      [{ field: "scopes", issue: "library:read_required" }]
    );
  }
  return [...new Set(scopes)];
}

function mintGrant(input: IssueCommandGrantInput): {
  row: CommandGrantRecord & { tokenHash: string };
  token: string;
} {
  const label = input.clientLabel.trim();
  if (!label) {
    throw new CommandContractError("COMMAND_VALIDATION", "client_label is required.", [
      { field: "client_label", issue: "non_empty_string" }
    ]);
  }
  const ttlMs = input.ttlMs ?? COMMAND_GRANT_MAX_TTL_MS;
  if (ttlMs <= 0 || ttlMs > COMMAND_GRANT_MAX_TTL_MS) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Grant TTL must be positive and at most 7 days.",
      [{ field: "ttl_ms", issue: "max_7d" }]
    );
  }
  const now = input.now ?? new Date();
  const token = `rcmd_${randomUUID()}`;
  return {
    token,
    row: {
      id: `cg_${randomUUID()}`,
      accountId: input.accountId,
      creatorId: input.creatorId,
      scopes: normalizeScopes(input.scopes),
      clientLabel: label,
      expiresAt: new Date(now.getTime() + ttlMs),
      revokedAt: null,
      createdAt: now,
      tokenHash: hashOpaqueSessionToken(token)
    }
  };
}

export function createMemoryCommandGrantStore(): CommandGrantStore {
  const byId = new Map<string, CommandGrantRecord & { tokenHash: string }>();

  return {
    async issue(input) {
      const { row, token } = mintGrant(input);
      byId.set(row.id, row);
      return { grant: toPublic(row), token };
    },
    async list(accountId, creatorId) {
      return [...byId.values()]
        .filter((row) => row.accountId === accountId && row.creatorId === creatorId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(toPublic);
    },
    async revoke(grantId, accountId) {
      const row = byId.get(grantId);
      if (!row || row.accountId !== accountId) {
        throw new CommandContractError("COMMAND_NOT_FOUND", "Grant not found.", [
          { field: "grant_id", issue: grantId }
        ]);
      }
      row.revokedAt = new Date();
      return toPublic(row);
    },
    async resolveToken(token, now = new Date()) {
      const hash = hashOpaqueSessionToken(token);
      for (const row of byId.values()) {
        if (row.tokenHash !== hash) continue;
        if (row.revokedAt) return null;
        if (row.expiresAt.getTime() <= now.getTime()) return null;
        return {
          id: row.id,
          accountId: row.accountId,
          creatorId: row.creatorId,
          scopes: [...row.scopes],
          clientLabel: row.clientLabel,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          createdAt: row.createdAt
        };
      }
      return null;
    }
  };
}

export function createPrismaCommandGrantStore(prisma: PrismaClient): CommandGrantStore {
  return {
    async issue(input) {
      const { row, token } = mintGrant(input);
      await prisma.commandGrant.create({
        data: {
          id: row.id,
          accountId: row.accountId,
          creatorId: row.creatorId,
          tokenHash: row.tokenHash,
          scopes: row.scopes,
          clientLabel: row.clientLabel,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt
        }
      });
      return { grant: toPublic(row), token };
    },
    async list(accountId, creatorId) {
      const rows = await prisma.commandGrant.findMany({
        where: { accountId, creatorId },
        orderBy: { createdAt: "desc" }
      });
      return rows.map((row) => ({
        grant_id: row.id,
        creator_id: row.creatorId,
        scopes: row.scopes as CommandGrantScope[],
        client_label: row.clientLabel,
        expires_at: row.expiresAt.toISOString(),
        revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
        created_at: row.createdAt.toISOString()
      }));
    },
    async revoke(grantId, accountId) {
      const row = await prisma.commandGrant.findFirst({
        where: { id: grantId, accountId }
      });
      if (!row) {
        throw new CommandContractError("COMMAND_NOT_FOUND", "Grant not found.", [
          { field: "grant_id", issue: grantId }
        ]);
      }
      const updated = await prisma.commandGrant.update({
        where: { id: row.id },
        data: { revokedAt: new Date() }
      });
      return {
        grant_id: updated.id,
        creator_id: updated.creatorId,
        scopes: updated.scopes as CommandGrantScope[],
        client_label: updated.clientLabel,
        expires_at: updated.expiresAt.toISOString(),
        revoked_at: updated.revokedAt ? updated.revokedAt.toISOString() : null,
        created_at: updated.createdAt.toISOString()
      };
    },
    async resolveToken(token, now = new Date()) {
      const row = await prisma.commandGrant.findUnique({
        where: { tokenHash: hashOpaqueSessionToken(token) }
      });
      if (!row || row.revokedAt) return null;
      if (row.expiresAt.getTime() <= now.getTime()) return null;
      return {
        id: row.id,
        accountId: row.accountId,
        creatorId: row.creatorId,
        scopes: row.scopes as CommandGrantScope[],
        clientLabel: row.clientLabel,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        createdAt: row.createdAt
      };
    }
  };
}

export function createCommandGrantStore(prisma?: PrismaClient | null): CommandGrantStore {
  return prisma ? createPrismaCommandGrantStore(prisma) : createMemoryCommandGrantStore();
}
