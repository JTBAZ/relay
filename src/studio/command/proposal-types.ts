/**
 * Command Layer selection proposal (RC-P6-T01).
 * Process Map is the request cache; RC-P8-T04 persists via command-durable-store.
 * Gallery is not mutated by proposal APIs.
 */
import { randomUUID } from "node:crypto";
import { CommandContractError, type CommandCompactPostRecord, type CommandMatchEvidence, type ResolvedSelection } from "./contracts.js";
import type { CommandFinitePlanState } from "./finite-plan-compiler.js";
import { compactCommandLibraryItem, type CommandLibraryItem } from "./selection.js";
import { selectionChecksum } from "./selection-snapshot.js";

export const COMMAND_PROPOSAL_STAGES = ["selection_review", "selection_approved", "plan_shaping"] as const;
export type CommandProposalStage = (typeof COMMAND_PROPOSAL_STAGES)[number];

export const COMMAND_PROPOSAL_PATCH_OPS = [
  "exclude",
  "restore",
  "select_all",
  "select_none",
  "approve"
] as const;
export type CommandProposalPatchOp = (typeof COMMAND_PROPOSAL_PATCH_OPS)[number];

export type CommandSelectionProposal = {
  proposal_id: string;
  creator_id: string;
  stage: CommandProposalStage;
  instruction: string;
  snapshot: ResolvedSelection;
  records: CommandCompactPostRecord[];
  exclude_post_ids: string[];
  frozen_post_ids: string[];
  /** Checksum of `frozen_post_ids` after Approve; null while in review. */
  frozen_revision: string | null;
  /** Finite schedule plan. Null until P9 shaping starts. */
  plan?: CommandFinitePlanState | null;
  created_at: string;
  updated_at: string;
};

export type CreateSelectionProposalInput = {
  creator_id: string;
  instruction: string;
  post_ids: string[];
  warnings?: string[];
  explanation?: string;
  /** When set, must match checksum of post_ids. */
  revision?: string;
  created_at?: string;
};

function uniqueOrdered(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function pendingProposalPostIds(proposal: CommandSelectionProposal): string[] {
  const excluded = new Set(proposal.exclude_post_ids);
  return proposal.snapshot.post_ids.filter((id) => !excluded.has(id));
}

/** Frozen IDs must be a subset of snapshot IDs minus exclusions. Snapshot must be complete. */
export function validateFrozenSelection(proposal: CommandSelectionProposal): string[] {
  if (proposal.snapshot.complete !== true) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Selection catalog is truncated; a complete snapshot is required.",
      [{ field: "complete", issue: "false" }]
    );
  }
  const allowed = new Set(pendingProposalPostIds(proposal));
  const frozen = uniqueOrdered(proposal.frozen_post_ids);
  for (const id of frozen) {
    if (!allowed.has(id)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Frozen post is not in the pending selection.",
        [{ field: "frozen_post_ids", issue: id }]
      );
    }
  }
  return frozen;
}

function recordsForPostIds(
  items: readonly CommandLibraryItem[],
  postIds: readonly string[]
): CommandCompactPostRecord[] {
  const firstByPost = new Map<string, CommandLibraryItem>();
  for (const item of items) {
    if (!firstByPost.has(item.post_id)) firstByPost.set(item.post_id, item);
  }
  const records: CommandCompactPostRecord[] = [];
  const missing: string[] = [];
  for (const id of postIds) {
    const item = firstByPost.get(id);
    if (!item) {
      missing.push(id);
      continue;
    }
    records.push(compactCommandLibraryItem(item));
  }
  if (missing.length > 0) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Selection includes posts that are not in this creator’s catalog.",
      missing.map((id) => ({ field: "post_ids", issue: id }))
    );
  }
  return records;
}

export function buildSelectionProposalFromPreview(
  items: readonly CommandLibraryItem[],
  input: CreateSelectionProposalInput
): CommandSelectionProposal {
  const creatorId = input.creator_id.trim();
  const postIds = uniqueOrdered(input.post_ids);
  if (!creatorId) {
    throw new CommandContractError("COMMAND_VALIDATION", "creator_id is required.", [
      { field: "creator_id", issue: "empty" }
    ]);
  }
  if (postIds.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "Selection is empty.", [
      { field: "post_ids", issue: "empty" }
    ]);
  }
  const records = recordsForPostIds(items, postIds);
  const revision = selectionChecksum(postIds);
  if (input.revision && input.revision.trim() !== revision) {
    throw new CommandContractError(
      "COMMAND_STALE_SELECTION",
      "Selection revision no longer matches the frozen snapshot.",
      [{ field: "revision", issue: "stale" }]
    );
  }
  const createdAt = input.created_at ?? new Date().toISOString();
  const snapshot: ResolvedSelection = {
    post_ids: postIds,
    explanation: (input.explanation ?? "").trim() || `Selection of ${postIds.length} posts`,
    warnings: [...(input.warnings ?? [])],
    match_evidence: records.map((r) => {
      const posted = Boolean(r.destination_flags.x || r.destination_flags.patreon);
      const fields: CommandMatchEvidence["fields"] = posted ? ["destination"] : [];
      return { post_id: r.post_id, fields };
    }),
    revision,
    complete: true,
    creator_id: creatorId,
    created_at: createdAt
  };
  return {
    proposal_id: `pr_${randomUUID()}`,
    creator_id: creatorId,
    stage: "selection_review",
    instruction: input.instruction,
    snapshot,
    records,
    exclude_post_ids: [],
    frozen_post_ids: [],
    frozen_revision: null,
    created_at: createdAt,
    updated_at: createdAt
  };
}

export function isCommandProposalPatchOp(value: string): value is CommandProposalPatchOp {
  return (COMMAND_PROPOSAL_PATCH_OPS as readonly string[]).includes(value);
}

function exclusionsInSnapshotOrder(proposal: CommandSelectionProposal, excluded: ReadonlySet<string>): string[] {
  return proposal.snapshot.post_ids.filter((id) => excluded.has(id));
}

function requireSnapshotPostIds(proposal: CommandSelectionProposal, postIds: readonly string[]): string[] {
  const ids = uniqueOrdered(postIds);
  const snapshot = new Set(proposal.snapshot.post_ids);
  for (const id of ids) {
    if (!snapshot.has(id)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Post is not in this selection proposal.",
        [{ field: "post_ids", issue: id }]
      );
    }
  }
  return ids;
}

function requireMutableReview(proposal: CommandSelectionProposal): void {
  if (proposal.stage !== "selection_review") {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Selection is frozen. Exclude or restore requires a new selection review.",
      [{ field: "stage", issue: proposal.stage }]
    );
  }
}

/**
 * After Approve, candidate IDs may only be a subset of `frozen_post_ids`.
 * New library hits (including previously excluded snapshot IDs) need a new selection review.
 */
export function assertNoFrozenExpansion(
  proposal: CommandSelectionProposal,
  candidatePostIds: readonly string[]
): void {
  if (proposal.stage !== "selection_approved") return;
  const frozen = new Set(proposal.frozen_post_ids);
  for (const id of uniqueOrdered(candidatePostIds)) {
    if (!frozen.has(id)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Frozen selection cannot admit new library hits.",
        [{ field: "frozen_post_ids", issue: id }]
      );
    }
  }
}

function touchProposal(
  proposal: CommandSelectionProposal,
  patch: Partial<CommandSelectionProposal>
): CommandSelectionProposal {
  return {
    ...proposal,
    ...patch,
    updated_at: new Date().toISOString()
  };
}

function approveSelectionProposalRecord(
  proposal: CommandSelectionProposal,
  store: CommandSelectionProposalStore
): CommandSelectionProposal {
  if (proposal.stage === "selection_approved") {
    return proposal;
  }
  const frozen = pendingProposalPostIds(proposal);
  if (frozen.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "Cannot approve an empty selection.", [
      { field: "frozen_post_ids", issue: "empty" }
    ]);
  }
  const next: CommandSelectionProposal = touchProposal(proposal, {
    stage: "selection_approved",
    frozen_post_ids: frozen,
    frozen_revision: selectionChecksum(frozen)
  });
  validateFrozenSelection(next);
  return store.put(next);
}

export type PatchSelectionProposalInput = {
  creator_id: string;
  proposal_id: string;
  op: CommandProposalPatchOp;
  post_ids?: string[];
};

export function patchSelectionProposal(
  input: PatchSelectionProposalInput,
  store: CommandSelectionProposalStore = defaultStore
): CommandSelectionProposal {
  const proposalId = input.proposal_id.trim();
  const creatorId = input.creator_id.trim();
  const existing = store.get(proposalId);
  if (!existing || existing.creator_id !== creatorId) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "Selection proposal not found.", [
      { field: "proposal_id", issue: proposalId }
    ]);
  }
  if (input.op === "approve") {
    return approveSelectionProposalRecord(existing, store);
  }
  requireMutableReview(existing);
  if (input.op === "select_all") {
    return store.put(touchProposal(existing, { exclude_post_ids: [] }));
  }
  if (input.op === "select_none") {
    return store.put(
      touchProposal(existing, { exclude_post_ids: [...existing.snapshot.post_ids] })
    );
  }
  const ids = requireSnapshotPostIds(existing, input.post_ids ?? []);
  if (ids.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "post_ids is required.", [
      { field: "post_ids", issue: "empty" }
    ]);
  }
  const excluded = new Set(existing.exclude_post_ids);
  if (input.op === "exclude") {
    for (const id of ids) excluded.add(id);
  } else {
    for (const id of ids) excluded.delete(id);
  }
  return store.put(
    touchProposal(existing, { exclude_post_ids: exclusionsInSnapshotOrder(existing, excluded) })
  );
}

export type CommandSelectionProposalStore = {
  put(proposal: CommandSelectionProposal): CommandSelectionProposal;
  get(proposalId: string): CommandSelectionProposal | undefined;
  findOpenByCreatorRevision(creatorId: string, revision: string): CommandSelectionProposal | undefined;
  findActiveByCreator(creatorId: string): CommandSelectionProposal | undefined;
  cancel(proposalId: string, creatorId: string): CommandSelectionProposal;
  clear(): void;
};

export function createSelectionProposalStore(): CommandSelectionProposalStore {
  const byId = new Map<string, CommandSelectionProposal>();
  return {
    put(proposal) {
      byId.set(proposal.proposal_id, proposal);
      return proposal;
    },
    get(proposalId) {
      return byId.get(proposalId);
    },
    findOpenByCreatorRevision(creatorId, revision) {
      for (const proposal of byId.values()) {
        if (proposal.creator_id !== creatorId || proposal.snapshot.revision !== revision) continue;
        if (proposal.stage === "selection_review") return proposal;
      }
      return undefined;
    },
    findActiveByCreator(creatorId) {
      for (const proposal of byId.values()) {
        if (proposal.creator_id === creatorId) return proposal;
      }
      return undefined;
    },
    cancel(proposalId, creatorId) {
      const existing = byId.get(proposalId);
      if (!existing || existing.creator_id !== creatorId) {
        throw new CommandContractError("COMMAND_NOT_FOUND", "Selection proposal not found.", [
          { field: "proposal_id", issue: proposalId }
        ]);
      }
      byId.delete(proposalId);
      return existing;
    },
    clear() {
      byId.clear();
    }
  };
}

const defaultStore = createSelectionProposalStore();

export function getSelectionProposalStore(): CommandSelectionProposalStore {
  return defaultStore;
}

export function rememberSelectionProposal(proposal: CommandSelectionProposal): CommandSelectionProposal {
  return defaultStore.put(proposal);
}

export function clearSelectionProposalStore(): void {
  defaultStore.clear();
}

export const ACTIVE_SELECTION_PROPOSAL_EXISTS =
  "An active selection proposal already exists. Discard it first.";

export function upsertSelectionProposalFromPreview(
  items: readonly CommandLibraryItem[],
  input: CreateSelectionProposalInput,
  store: CommandSelectionProposalStore = defaultStore
): CommandSelectionProposal {
  const built = buildSelectionProposalFromPreview(items, input);
  const existing = store.findOpenByCreatorRevision(built.creator_id, built.snapshot.revision);
  if (existing) return existing;
  const other = store.findActiveByCreator(built.creator_id);
  if (other) {
    throw new CommandContractError("COMMAND_VALIDATION", ACTIVE_SELECTION_PROPOSAL_EXISTS, [
      { field: "proposal_id", issue: other.proposal_id },
      { field: "instruction", issue: other.instruction }
    ]);
  }
  return store.put(built);
}

export function cancelSelectionProposal(
  proposalId: string,
  creatorId: string,
  store: CommandSelectionProposalStore = defaultStore
): CommandSelectionProposal {
  return store.cancel(proposalId, creatorId);
}

export function findActiveSelectionProposal(
  creatorId: string,
  store: CommandSelectionProposalStore = defaultStore
): CommandSelectionProposal | undefined {
  return store.findActiveByCreator(creatorId.trim());
}

export function getSelectionProposal(
  proposalId: string,
  creatorId: string,
  store: CommandSelectionProposalStore = defaultStore
): CommandSelectionProposal {
  const existing = store.get(proposalId.trim());
  if (!existing || existing.creator_id !== creatorId.trim()) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "Selection proposal not found.", [
      { field: "proposal_id", issue: proposalId.trim() }
    ]);
  }
  return existing;
}

export type PlannerSelectionPatchInput = {
  creator_id: string;
  proposal_id?: string;
  op: "exclude" | "restore";
  post_ids?: string[];
  already_posted?: boolean;
};

/**
 * Planner-only membership patch. After Approve, exclude may shrink the frozen
 * set; restore and new library hits stay forbidden (new selection review).
 */
export function applyPlannerSelectionPatch(
  input: PlannerSelectionPatchInput,
  store: CommandSelectionProposalStore = defaultStore
): CommandSelectionProposal {
  const creatorId = input.creator_id.trim();
  const existing = input.proposal_id?.trim()
    ? getSelectionProposal(input.proposal_id, creatorId, store)
    : store.findActiveByCreator(creatorId);
  if (!existing) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "No active selection proposal to patch. Preview a selection first.",
      [{ field: "proposal_id", issue: "missing" }]
    );
  }

  let ids = uniqueOrdered(input.post_ids ?? []);
  if (input.already_posted) {
    const posted = existing.records
      .filter((row) => Boolean(row.destination_flags.x || row.destination_flags.patreon))
      .map((row) => row.post_id);
    const allowed =
      existing.stage === "selection_approved" || existing.stage === "plan_shaping"
        ? new Set(existing.frozen_post_ids)
        : new Set(existing.snapshot.post_ids);
    ids = uniqueOrdered([...ids, ...posted.filter((id) => allowed.has(id))]);
  }

  if (existing.stage === "selection_review") {
    return patchSelectionProposal(
      {
        creator_id: creatorId,
        proposal_id: existing.proposal_id,
        op: input.op,
        post_ids: ids
      },
      store
    );
  }

  if (input.op !== "exclude") {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Selection is frozen. Restore requires a new selection review.",
      [{ field: "stage", issue: existing.stage }]
    );
  }
  const frozen = new Set(existing.frozen_post_ids);
  for (const id of ids) {
    if (!frozen.has(id)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Frozen selection cannot admit new library hits.",
        [{ field: "frozen_post_ids", issue: id }]
      );
    }
  }
  if (ids.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "post_ids is required.", [
      { field: "post_ids", issue: "empty" }
    ]);
  }
  const excluded = new Set(existing.exclude_post_ids);
  for (const id of ids) excluded.add(id);
  const frozenNext = existing.frozen_post_ids.filter((id) => !excluded.has(id));
  if (frozenNext.length === 0) {
    throw new CommandContractError("COMMAND_VALIDATION", "Cannot empty a frozen selection.", [
      { field: "frozen_post_ids", issue: "empty" }
    ]);
  }
  return store.put(
    touchProposal(existing, {
      exclude_post_ids: exclusionsInSnapshotOrder(existing, excluded),
      frozen_post_ids: frozenNext,
      frozen_revision: selectionChecksum(frozenNext)
    })
  );
}
