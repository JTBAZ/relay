/**
 * Postgres persistence for Command Layer proposals, ChangeSet envelopes, and engine undo.
 * Memory maps remain the request cache. Load-on-miss hydrates after API restart (RC-P8-T04).
 * Idempotency snapshots live in command_idempotency_keys (RC-P8-T05).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CommandChangeSetEnvelope, CommandChangeSetOp, CommandChangeSetStatus } from "./contracts.js";
import {
  COMMAND_CHANGE_SET_STATUSES,
  isCommandCapabilityName,
  isCommandRiskClass
} from "./contracts.js";
import type { CommandPreviewRecord } from "./change-set-types.js";
import type { CommandSelectionProposal } from "./proposal-types.js";
import { findActiveSelectionProposal, rememberSelectionProposal } from "./proposal-types.js";
import { parseFinitePlanState } from "./proposal-patch.js";

function isMissingRelation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "P2021" || code === "P2022" || code === "P2010" || code === "P2003") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist in the current database/i.test(msg);
}

/** Null until probed; false after HUMAN-MIGRATE tables are confirmed absent. */
let durableTablesPresent: boolean | null = null;

function markDurableTablesMissing(): void {
  durableTablesPresent = false;
}

function swallowIfMissing(err: unknown): boolean {
  if (!isMissingRelation(err)) return false;
  markDurableTablesMissing();
  return true;
}

function durableEnabled(): boolean {
  return durableTablesPresent !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseOps(value: unknown): CommandChangeSetOp[] | null {
  if (!Array.isArray(value)) return null;
  const ops: CommandChangeSetOp[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    if (!isCommandCapabilityName(row.capability) || !isCommandRiskClass(row.risk_class)) return null;
    if (typeof row.op_id !== "string" || !Array.isArray(row.target_ids)) return null;
    ops.push({
      op_id: row.op_id,
      capability: row.capability,
      risk_class: row.risk_class,
      target_ids: asStringList(row.target_ids),
      payload: isRecord(row.payload) ? row.payload : {}
    });
  }
  return ops;
}

function parseExpectedRevisions(value: unknown): Record<string, string | number> {
  if (!isRecord(value)) return {};
  const out: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number") out[key] = raw;
  }
  return out;
}

function parseStatus(value: string): CommandChangeSetStatus {
  return (COMMAND_CHANGE_SET_STATUSES as readonly string[]).includes(value)
    ? (value as CommandChangeSetStatus)
    : "preview_ready";
}

function envelopeFromRow(row: {
  id: string;
  idempotencyKey: string;
  instruction: string;
  status: string;
  resolvedPostIds: string[];
  opsJson: Prisma.JsonValue;
  expectedRevisionsJson: Prisma.JsonValue;
  beforeSnapshotRef: string | null;
  afterSummary: string | null;
  accessImplications: string[];
  createdAt: Date;
  updatedAt: Date;
}): CommandChangeSetEnvelope | null {
  const ops = parseOps(row.opsJson);
  if (!ops) return null;
  return {
    change_set_id: row.id,
    idempotency_key: row.idempotencyKey,
    instruction: row.instruction,
    resolved_post_ids: [...row.resolvedPostIds],
    ops,
    expected_revisions: parseExpectedRevisions(row.expectedRevisionsJson),
    before_snapshot_ref: row.beforeSnapshotRef,
    after_summary: row.afterSummary,
    access_implications: [...row.accessImplications],
    status: parseStatus(row.status),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function canWriteProposals(prisma: PrismaClient): boolean {
  return durableEnabled() && typeof prisma.commandSelectionProposal?.upsert === "function";
}

function canWriteChangeSets(prisma: PrismaClient): boolean {
  return durableEnabled() && typeof prisma.commandChangeSet?.upsert === "function";
}

function canWriteUndos(prisma: PrismaClient): boolean {
  return durableEnabled() && typeof prisma.commandChangeSetUndo?.upsert === "function";
}

const FINITE_PLAN_SNAPSHOT_KEY = "__finite_plan";

function snapshotJsonWithPlan(proposal: CommandSelectionProposal): Prisma.InputJsonValue {
  return {
    ...proposal.snapshot,
    [FINITE_PLAN_SNAPSHOT_KEY]: proposal.plan ?? null
  } as unknown as Prisma.InputJsonValue;
}

function splitSnapshotJson(json: Record<string, unknown>): {
  snapshot: CommandSelectionProposal["snapshot"];
  plan: CommandSelectionProposal["plan"];
} {
  const plan = parseFinitePlanState(json[FINITE_PLAN_SNAPSHOT_KEY]);
  const rest = { ...json };
  delete rest[FINITE_PLAN_SNAPSHOT_KEY];
  return { snapshot: rest as CommandSelectionProposal["snapshot"], plan };
}

function parseProposalStage(raw: string): CommandSelectionProposal["stage"] {
  if (raw === "selection_approved" || raw === "plan_shaping") return raw;
  return "selection_review";
}

export async function persistSelectionProposal(
  prisma: PrismaClient,
  proposal: CommandSelectionProposal
): Promise<void> {
  if (!canWriteProposals(prisma)) return;
  try {
    const existing = await prisma.commandSelectionProposal.findUnique({
      where: { creatorId: proposal.creator_id }
    });
    if (existing && existing.id !== proposal.proposal_id) {
      await prisma.commandSelectionProposal.delete({ where: { id: existing.id } });
    }
    await prisma.commandSelectionProposal.upsert({
      where: { id: proposal.proposal_id },
      create: {
        id: proposal.proposal_id,
        creatorId: proposal.creator_id,
        stage: proposal.stage,
        instruction: proposal.instruction,
        snapshotJson: snapshotJsonWithPlan(proposal),
        recordsJson: proposal.records as unknown as Prisma.InputJsonValue,
        excludePostIds: proposal.exclude_post_ids,
        frozenPostIds: proposal.frozen_post_ids,
        frozenRevision: proposal.frozen_revision,
        snapshotRevision: proposal.snapshot.revision,
        createdAt: new Date(proposal.created_at),
        updatedAt: new Date(proposal.updated_at)
      },
      update: {
        stage: proposal.stage,
        instruction: proposal.instruction,
        snapshotJson: snapshotJsonWithPlan(proposal),
        recordsJson: proposal.records as unknown as Prisma.InputJsonValue,
        excludePostIds: proposal.exclude_post_ids,
        frozenPostIds: proposal.frozen_post_ids,
        frozenRevision: proposal.frozen_revision,
        snapshotRevision: proposal.snapshot.revision,
        updatedAt: new Date(proposal.updated_at)
      }
    });
  } catch (err) {
    if (swallowIfMissing(err)) return;
    throw err;
  }
}

export async function loadSelectionProposalForCreator(
  prisma: PrismaClient,
  creatorId: string
): Promise<CommandSelectionProposal | null> {
  if (!durableEnabled() || typeof prisma.commandSelectionProposal?.findUnique !== "function") return null;
  try {
    const row = await prisma.commandSelectionProposal.findUnique({
      where: { creatorId }
    });
    if (!row || !isRecord(row.snapshotJson) || !Array.isArray(row.recordsJson)) return null;
    const split = splitSnapshotJson(row.snapshotJson);
    return {
      proposal_id: row.id,
      creator_id: row.creatorId,
      stage: parseProposalStage(row.stage),
      instruction: row.instruction,
      snapshot: split.snapshot,
      records: row.recordsJson as CommandSelectionProposal["records"],
      exclude_post_ids: [...row.excludePostIds],
      frozen_post_ids: [...row.frozenPostIds],
      frozen_revision: row.frozenRevision,
      plan: split.plan,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString()
    };
  } catch (err) {
    if (swallowIfMissing(err)) return null;
    throw err;
  }
}

export async function hydrateSelectionProposalsFromDb(
  prisma: PrismaClient,
  creatorId: string
): Promise<void> {
  if (findActiveSelectionProposal(creatorId)) return;
  const loaded = await loadSelectionProposalForCreator(prisma, creatorId);
  if (loaded) rememberSelectionProposal(loaded);
}

export async function deleteSelectionProposalRow(
  prisma: PrismaClient,
  proposalId: string,
  creatorId: string
): Promise<void> {
  if (!durableEnabled() || typeof prisma.commandSelectionProposal?.deleteMany !== "function") return;
  try {
    await prisma.commandSelectionProposal.deleteMany({
      where: { id: proposalId, creatorId }
    });
  } catch (err) {
    if (swallowIfMissing(err)) return;
    throw err;
  }
}

export async function persistCommandChangeSet(
  prisma: PrismaClient,
  creatorId: string,
  envelope: CommandChangeSetEnvelope
): Promise<void> {
  if (!canWriteChangeSets(prisma)) return;
  try {
    await prisma.commandChangeSet.upsert({
      where: { id: envelope.change_set_id },
      create: {
        id: envelope.change_set_id,
        creatorId,
        idempotencyKey: envelope.idempotency_key,
        instruction: envelope.instruction,
        status: envelope.status,
        resolvedPostIds: [...envelope.resolved_post_ids],
        opsJson: envelope.ops as unknown as Prisma.InputJsonValue,
        expectedRevisionsJson: envelope.expected_revisions as unknown as Prisma.InputJsonValue,
        beforeSnapshotRef: envelope.before_snapshot_ref,
        afterSummary: envelope.after_summary,
        accessImplications: envelope.access_implications,
        createdAt: new Date(envelope.created_at),
        updatedAt: new Date(envelope.updated_at)
      },
      update: {
        creatorId,
        idempotencyKey: envelope.idempotency_key,
        instruction: envelope.instruction,
        status: envelope.status,
        resolvedPostIds: [...envelope.resolved_post_ids],
        opsJson: envelope.ops as unknown as Prisma.InputJsonValue,
        expectedRevisionsJson: envelope.expected_revisions as unknown as Prisma.InputJsonValue,
        beforeSnapshotRef: envelope.before_snapshot_ref,
        afterSummary: envelope.after_summary,
        accessImplications: envelope.access_implications,
        updatedAt: new Date(envelope.updated_at)
      }
    });
  } catch (err) {
    if (swallowIfMissing(err)) return;
    throw err;
  }
}

export async function loadDurablePreviewRecord(
  prisma: PrismaClient,
  changeSetId: string,
  creatorId: string
): Promise<CommandPreviewRecord | null> {
  if (!durableEnabled() || typeof prisma.commandChangeSet?.findFirst !== "function") return null;
  try {
    const row = await prisma.commandChangeSet.findFirst({
      where: { id: changeSetId, creatorId }
    });
    if (!row) return null;
    const envelope = envelopeFromRow(row);
    if (!envelope) return null;
    return {
      envelope,
      resolved_post_ids_snapshot: Object.freeze([...envelope.resolved_post_ids]),
      undo: envelope.before_snapshot_ref
        ? {
            change_set_id: envelope.change_set_id,
            before_snapshot_ref: envelope.before_snapshot_ref,
            inverses: envelope.ops.map((op) => ({ op_id: op.op_id, inverse: {} }))
          }
        : null
    };
  } catch (err) {
    if (swallowIfMissing(err)) return null;
    throw err;
  }
}

export async function persistCommandEngineUndo(
  prisma: PrismaClient,
  state: { change_set_id: string; creator_id: string } & Record<string, unknown>
): Promise<void> {
  if (!canWriteUndos(prisma)) return;
  try {
    await prisma.commandChangeSetUndo.upsert({
      where: { changeSetId: state.change_set_id },
      create: {
        changeSetId: state.change_set_id,
        creatorId: state.creator_id,
        stateJson: state as unknown as Prisma.InputJsonValue
      },
      update: {
        creatorId: state.creator_id,
        stateJson: state as unknown as Prisma.InputJsonValue
      }
    });
  } catch (err) {
    if (swallowIfMissing(err)) return;
    throw err;
  }
}

export async function loadCommandEngineUndo(
  prisma: PrismaClient,
  changeSetId: string,
  creatorId: string
): Promise<unknown | null> {
  if (!durableEnabled() || typeof prisma.commandChangeSetUndo?.findFirst !== "function") return null;
  try {
    const row = await prisma.commandChangeSetUndo.findFirst({
      where: { changeSetId, creatorId }
    });
    return row?.stateJson ?? null;
  } catch (err) {
    if (swallowIfMissing(err)) return null;
    throw err;
  }
}

export async function markCommandChangeSetUndone(
  prisma: PrismaClient,
  changeSetId: string,
  creatorId: string
): Promise<void> {
  if (!durableEnabled()) return;
  try {
    if (typeof prisma.commandChangeSetUndo?.deleteMany === "function") {
      await prisma.commandChangeSetUndo.deleteMany({ where: { changeSetId, creatorId } });
    }
    if (typeof prisma.commandChangeSet?.updateMany === "function") {
      await prisma.commandChangeSet.updateMany({
        where: { id: changeSetId, creatorId },
        data: { status: "undone" }
      });
    }
  } catch (err) {
    if (swallowIfMissing(err)) return;
    throw err;
  }
}

export async function deleteDurableCommandStateForCreator(
  prisma: PrismaClient,
  creatorId: string
): Promise<void> {
  if (!durableEnabled()) return;
  try {
    if (typeof prisma.commandChangeSet?.deleteMany === "function") {
      await prisma.commandChangeSet.deleteMany({ where: { creatorId } });
    }
    if (typeof prisma.commandSelectionProposal?.deleteMany === "function") {
      await prisma.commandSelectionProposal.deleteMany({ where: { creatorId } });
    }
  } catch (err) {
    if (swallowIfMissing(err)) return;
    throw err;
  }
}
