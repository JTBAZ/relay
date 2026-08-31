/**
 * ChangeSet envelope helpers, status machine, undo payload, preview-only engine stub (RC-P1-T06).
 * Apply remains disabled unless RELAY_COMMAND_APPLY_ENABLED is on, and even then P1 does not write.
 */

import {
  COMMAND_CHANGE_SET_STATUSES,
  CommandContractError,
  type CommandCapabilityName,
  type CommandChangeSetEnvelope,
  type CommandChangeSetOp,
  type CommandChangeSetStatus,
  type CommandRiskClass,
  isCommandApplyEnabled,
  validateCommandChangeSetEnvelope
} from "./contracts.js";

export const COMMAND_CHANGE_SET_TRANSITIONS: Record<
  CommandChangeSetStatus,
  readonly CommandChangeSetStatus[]
> = {
  draft: ["validated", "failed"],
  validated: ["preview_ready", "failed"],
  preview_ready: ["apply_requested", "failed"],
  apply_requested: ["applied", "failed"],
  applied: ["undone"],
  failed: [],
  undone: []
};

export type CommandOpKind =
  | "collection_upsert"
  | "collection_order"
  | "revise_post"
  | "add_post_tags"
  | "remove_post_tags"
  | "create_saved_filter"
  | "release_plan"
  | "schedule_materialize"
  | "destination_drafts"
  | "undo";

export type CommandOp =
  | {
      kind: "collection_upsert";
      collection_id: string | null;
      title: string;
      post_ids: string[];
    }
  | {
      kind: "collection_order";
      collection_id: string;
      post_ids: string[];
    }
  | {
      kind: "revise_post";
      post_id: string;
      source: "PATREON" | "SUBSCRIBESTAR" | "RELAY";
      fields: { title?: string; description?: string };
    }
  | {
      kind: "release_plan";
      post_ids: string[];
      destination: string;
      cadence: string;
    }
  | {
      kind: "schedule_materialize";
      plan_id: string;
      post_ids: string[];
    }
  | {
      kind: "destination_drafts";
      post_ids: string[];
      destination: string;
    }
  | {
      kind: "undo";
      change_set_id: string;
    };

export type CommandUndoPayload = {
  change_set_id: string;
  before_snapshot_ref: string;
  inverses: Array<{ op_id: string; inverse: Record<string, unknown> }>;
};

export type CommandPreviewRecord = {
  envelope: CommandChangeSetEnvelope;
  resolved_post_ids_snapshot: readonly string[];
  undo: CommandUndoPayload | null;
};

const previewStore = new Map<string, CommandPreviewRecord>();

export function canTransitionChangeSetStatus(
  from: CommandChangeSetStatus,
  to: CommandChangeSetStatus
): boolean {
  return COMMAND_CHANGE_SET_TRANSITIONS[from].includes(to);
}

export function assertChangeSetTransition(
  from: CommandChangeSetStatus,
  to: CommandChangeSetStatus
): void {
  if (!canTransitionChangeSetStatus(from, to)) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Illegal ChangeSet status transition.",
      [
        { field: "from", issue: from },
        { field: "to", issue: to }
      ]
    );
  }
}

const CAPABILITY_TO_OP_KIND: Partial<Record<CommandCapabilityName, CommandOpKind>> = {
  create_or_update_collection: "collection_upsert",
  set_collection_order: "collection_order",
  revise_post: "revise_post",
  add_post_tags: "add_post_tags",
  remove_post_tags: "remove_post_tags",
  create_saved_filter: "create_saved_filter",
  create_release_plan: "release_plan",
  materialize_schedule: "schedule_materialize",
  prepare_destination_drafts: "destination_drafts",
  undo_change_set: "undo"
};

function snapshotEquals(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function riskForCapability(capability: CommandCapabilityName): CommandRiskClass {
  if (capability === "apply_change_set" || capability === "undo_change_set") return "execute_undo";
  if (
    capability === "create_or_update_collection" ||
    capability === "set_collection_order" ||
    capability === "add_post_tags" ||
    capability === "remove_post_tags" ||
    capability === "create_saved_filter" ||
    capability === "create_release_plan" ||
    capability === "materialize_schedule" ||
    capability === "prepare_destination_drafts"
  ) {
    return "execute_undo";
  }
  return "review";
}

export function capabilityToOpKind(capability: CommandCapabilityName): CommandOpKind | null {
  return CAPABILITY_TO_OP_KIND[capability] ?? null;
}

function defaultUndo(envelope: CommandChangeSetEnvelope): CommandUndoPayload | null {
  if (!envelope.before_snapshot_ref) return null;
  return {
    change_set_id: envelope.change_set_id,
    before_snapshot_ref: envelope.before_snapshot_ref,
    inverses: envelope.ops.map((op) => ({ op_id: op.op_id, inverse: {} }))
  };
}

export type PreviewChangeSetInput = {
  change_set_id: string;
  idempotency_key: string;
  instruction: string;
  resolved_post_ids: string[];
  ops: CommandChangeSetOp[];
  expected_revisions?: Record<string, string | number>;
  before_snapshot_ref?: string | null;
  access_implications?: string[];
  created_at?: string;
  updated_at?: string;
};

const ISO_NOW_FALLBACK = "2026-08-27T15:00:00.000Z";

/**
 * Validates ops against contracts and freezes resolved_post_ids so later apply
 * cannot silently retarget.
 */
export function previewChangeSet(input: PreviewChangeSetInput): CommandChangeSetEnvelope {
  const created_at = input.created_at ?? ISO_NOW_FALLBACK;
  const envelope = validateCommandChangeSetEnvelope({
    change_set_id: input.change_set_id,
    idempotency_key: input.idempotency_key,
    instruction: input.instruction,
    resolved_post_ids: input.resolved_post_ids,
    ops: input.ops.map((op) => ({
      ...op,
      risk_class: op.risk_class ?? riskForCapability(op.capability)
    })),
    expected_revisions: input.expected_revisions ?? {},
    before_snapshot_ref: input.before_snapshot_ref ?? `snap_${input.change_set_id}`,
    after_summary: null,
    access_implications: input.access_implications ?? [],
    status: "preview_ready",
    created_at,
    updated_at: input.updated_at ?? created_at
  });

  const snapshot = Object.freeze([...envelope.resolved_post_ids]);
  previewStore.set(envelope.change_set_id, {
    envelope,
    resolved_post_ids_snapshot: snapshot,
    undo: defaultUndo(envelope)
  });
  return envelope;
}

export function getPreviewRecord(changeSetId: string): CommandPreviewRecord | null {
  return previewStore.get(changeSetId) ?? null;
}

/** Hydrate a preview/apply envelope after process restart (RC-P8-T04). */
export function putPreviewRecord(record: CommandPreviewRecord): void {
  previewStore.set(record.envelope.change_set_id, {
    envelope: record.envelope,
    resolved_post_ids_snapshot: Object.freeze([...record.resolved_post_ids_snapshot]),
    undo: record.undo
  });
}

/** Test helper — not part of the HTTP surface. */
export function clearChangeSetPreviewStore(): void {
  previewStore.clear();
}

export type ApplyChangeSetInput = {
  change_set_id: string;
  resolved_post_ids: string[];
};

export function applyChangeSet(
  input: ApplyChangeSetInput,
  env: NodeJS.ProcessEnv = process.env
): CommandChangeSetEnvelope {
  if (!isCommandApplyEnabled(env)) {
    throw new CommandContractError(
      "COMMAND_APPLY_DISABLED",
      "ChangeSet apply is disabled until RELAY_COMMAND_APPLY_ENABLED is on.",
      [{ field: "RELAY_COMMAND_APPLY_ENABLED", issue: "off" }]
    );
  }
  const record = previewStore.get(input.change_set_id);
  if (!record) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "ChangeSet preview not found.", [
      { field: "change_set_id", issue: input.change_set_id }
    ]);
  }
  if (!snapshotEquals(record.resolved_post_ids_snapshot, input.resolved_post_ids)) {
    throw new CommandContractError(
      "COMMAND_STALE_SELECTION",
      "resolved_post_ids no longer match the preview snapshot.",
      [{ field: "resolved_post_ids", issue: "stale" }]
    );
  }
  assertChangeSetTransition(record.envelope.status, "apply_requested");
  const next: CommandChangeSetEnvelope = {
    ...record.envelope,
    status: "apply_requested"
  };
  previewStore.set(input.change_set_id, { ...record, envelope: next });
  return next;
}

export function undoChangeSet(
  changeSetId: string,
  env: NodeJS.ProcessEnv = process.env
): CommandUndoPayload {
  if (!isCommandApplyEnabled(env)) {
    throw new CommandContractError(
      "COMMAND_APPLY_DISABLED",
      "ChangeSet undo is disabled until RELAY_COMMAND_APPLY_ENABLED is on.",
      [{ field: "RELAY_COMMAND_APPLY_ENABLED", issue: "off" }]
    );
  }
  const record = previewStore.get(changeSetId);
  if (!record?.undo) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "ChangeSet undo payload not found.", [
      { field: "change_set_id", issue: changeSetId }
    ]);
  }
  return record.undo;
}

export function commandChangeSetStatuses(): readonly CommandChangeSetStatus[] {
  return COMMAND_CHANGE_SET_STATUSES;
}
