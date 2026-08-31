/**
 * Command Layer tool audit (RC-P3-T02).
 * Never stores prompts, provider excerpts, tokens, private URLs, or patron identity.
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashCommandBody } from "../idempotency.js";

export const COMMAND_AUDIT_ORIGINS = ["mcp", "harness"] as const;
export type CommandAuditOrigin = (typeof COMMAND_AUDIT_ORIGINS)[number];

export type CommandAuditRecord = {
  id: string;
  accountId: string | null;
  creatorId: string;
  tool: string;
  inputHash: string;
  changeSetId: string | null;
  outcome: string;
  traceId: string;
  origin: CommandAuditOrigin;
  createdAt: Date;
};

export type CommandAuditInput = {
  accountId?: string | null;
  creatorId: string;
  tool: string;
  args: unknown;
  changeSetId?: string | null;
  outcome: string;
  traceId: string;
  origin: CommandAuditOrigin;
};

export type CommandAuditStore = {
  record(input: CommandAuditInput): Promise<CommandAuditRecord>;
  listForCreator(creatorId: string): Promise<CommandAuditRecord[]>;
};

export function hashCommandAuditInput(args: unknown): string {
  return hashCommandBody(args);
}

function assertAuditOrigin(origin: string): CommandAuditOrigin {
  if (origin === "mcp" || origin === "harness") return origin;
  throw new Error(`Invalid command audit origin: ${origin}`);
}

function buildAuditRecord(input: CommandAuditInput): CommandAuditRecord {
  return {
    id: `ca_${randomUUID()}`,
    accountId: input.accountId?.trim() || null,
    creatorId: input.creatorId,
    tool: input.tool,
    inputHash: hashCommandAuditInput(input.args),
    changeSetId: input.changeSetId ?? null,
    outcome: input.outcome,
    traceId: input.traceId,
    origin: assertAuditOrigin(input.origin),
    createdAt: new Date()
  };
}

export function createMemoryCommandAuditStore(): CommandAuditStore {
  const rows: CommandAuditRecord[] = [];
  return {
    async record(input) {
      const row = buildAuditRecord(input);
      rows.push(row);
      return row;
    },
    async listForCreator(creatorId) {
      return rows.filter((row) => row.creatorId === creatorId);
    }
  };
}

export function createPrismaCommandAuditStore(prisma: PrismaClient): CommandAuditStore {
  return {
    async record(input) {
      const row = buildAuditRecord(input);
      await prisma.commandAuditEvent.create({
        data: {
          id: row.id,
          accountId: row.accountId,
          creatorId: row.creatorId,
          tool: row.tool,
          inputHash: row.inputHash,
          changeSetId: row.changeSetId,
          outcome: row.outcome,
          traceId: row.traceId,
          origin: row.origin
        }
      });
      return row;
    },
    async listForCreator(creatorId) {
      const rows = await prisma.commandAuditEvent.findMany({
        where: { creatorId },
        orderBy: { createdAt: "desc" }
      });
      return rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        creatorId: row.creatorId,
        tool: row.tool,
        inputHash: row.inputHash,
        changeSetId: row.changeSetId,
        outcome: row.outcome,
        traceId: row.traceId,
        origin: row.origin as CommandAuditOrigin,
        createdAt: row.createdAt
      }));
    }
  };
}

export function createCommandAuditStore(prisma?: PrismaClient | null): CommandAuditStore {
  return prisma ? createPrismaCommandAuditStore(prisma) : createMemoryCommandAuditStore();
}

export function auditOriginFromAuth(origin: string): CommandAuditOrigin {
  return origin === "harness" ? "harness" : "mcp";
}
