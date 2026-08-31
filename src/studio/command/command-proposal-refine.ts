/**
 * Conversational refinement of an open selection proposal (P7 workbench).
 * Planner may only exclude/restore IDs already in the snapshot.
 */
import { getRelayCommandFeatureFlags } from "./flags.js";
import {
  COMMAND_ERROR_CODES,
  CommandContractError,
  isCommandDestinationKey,
  type CommandCompactPostRecord,
  type CommandDestinationKey,
  type CommandErrorCode
} from "./contracts.js";
import {
  planCommandSelection,
  type CommandPlannerGenerateFn
} from "./command-semantic-planner.js";
import {
  applyPlannerSelectionPatch,
  getSelectionProposal,
  type CommandSelectionProposal,
  type CommandSelectionProposalStore
} from "./proposal-types.js";
import type { CommandLibraryItem } from "./selection.js";

export const SELECTION_REFINE_NEW_SELECTION_MESSAGE =
  "That looks like a new selection. Type it in Studio Command if you want to replace this set.";

export const SELECTION_REFINE_PLANNER_UNAVAILABLE =
  "Planner unavailable. Drop or restore tiles, or use the cleanup buttons.";

const ALREADY_ON_DEST =
  /\b(?:remove|drop)\b.{0,80}?\balready(?: posted)? on (x|twitter|patreon|deviantart|bluesky)\b/i;

const DEST_LABEL: Record<CommandDestinationKey, string> = {
  x: "X",
  patreon: "Patreon",
  deviantart: "DeviantArt",
  bluesky: "Bluesky"
};

export type RefineSelectionProposalInput = {
  creatorId: string;
  proposalId: string;
  instruction: string;
  items: readonly CommandLibraryItem[];
  generate?: CommandPlannerGenerateFn;
  plannerEnabled?: boolean;
  collections?: Array<{ collection_id: string; title: string }>;
  store?: CommandSelectionProposalStore;
};

export type RefineSelectionProposalResult = {
  proposal: CommandSelectionProposal;
  summary: string;
  op: "exclude" | "restore";
  post_ids: string[];
};

function destinationLabel(dest: string): string {
  return DEST_LABEL[dest as CommandDestinationKey] ?? dest;
}

export function nonePostedOnDestinationMessage(dest: CommandDestinationKey): string {
  return `None of these are marked as already on ${destinationLabel(dest)}.`;
}

export function alreadyDroppedOnDestinationMessage(dest: CommandDestinationKey): string {
  return `Pieces already on ${destinationLabel(dest)} are already dropped.`;
}

/** Bounded posted-cleanup phrase. Does not call the planner. */
export function parsePostedCleanupInstruction(instruction: string): CommandDestinationKey | null {
  const match = instruction.trim().match(ALREADY_ON_DEST);
  if (!match) return null;
  const raw = match[1]?.toLowerCase() ?? "";
  if (raw === "twitter" || raw === "x") return "x";
  return isCommandDestinationKey(raw) ? raw : null;
}

function applyPostedCleanup(
  existing: CommandSelectionProposal,
  dest: CommandDestinationKey,
  store: CommandSelectionProposalStore | undefined
): RefineSelectionProposalResult {
  const allowed =
    existing.stage === "selection_approved"
      ? new Set(existing.frozen_post_ids)
      : new Set(existing.snapshot.post_ids);
  const postedIds = existing.records
    .filter((row) => Boolean(row.destination_flags[dest]) && allowed.has(row.post_id))
    .map((row) => row.post_id);
  const excluded = new Set(existing.exclude_post_ids);
  const remaining = postedIds.filter((id) => !excluded.has(id));
  if (postedIds.length === 0) {
    return {
      proposal: existing,
      summary: nonePostedOnDestinationMessage(dest),
      op: "exclude",
      post_ids: []
    };
  }
  if (remaining.length === 0) {
    return {
      proposal: existing,
      summary: alreadyDroppedOnDestinationMessage(dest),
      op: "exclude",
      post_ids: []
    };
  }
  const beforeExclude = [...existing.exclude_post_ids];
  const proposal = applyPlannerSelectionPatch(
    {
      creator_id: existing.creator_id,
      proposal_id: existing.proposal_id,
      op: "exclude",
      post_ids: remaining
    },
    store
  );
  return {
    proposal,
    ...summarizeSelectionMembershipChange({
      beforeExclude,
      afterExclude: proposal.exclude_post_ids,
      records: proposal.records
    })
  };
}

export function summarizeSelectionMembershipChange(input: {
  beforeExclude: readonly string[];
  afterExclude: readonly string[];
  records: readonly CommandCompactPostRecord[];
}): { summary: string; op: "exclude" | "restore"; post_ids: string[] } {
  const before = new Set(input.beforeExclude);
  const after = new Set(input.afterExclude);
  const dropped = input.afterExclude.filter((id) => !before.has(id));
  const restored = input.beforeExclude.filter((id) => !after.has(id));
  if (dropped.length > 0 && restored.length === 0) {
    const dests = new Set<string>();
    for (const row of input.records) {
      if (!dropped.includes(row.post_id)) continue;
      for (const key of ["x", "patreon", "deviantart", "bluesky"] as const) {
        if (row.destination_flags[key]) dests.add(key);
      }
    }
    const onlyDest = dests.size === 1 ? [...dests][0] : null;
    const allOnDest =
      onlyDest != null &&
      dropped.every((id) =>
        input.records.find((row) => row.post_id === id)?.destination_flags[onlyDest as CommandDestinationKey]
      );
    const n = dropped.length;
    const summary =
      allOnDest && onlyDest
        ? `Dropped ${n} already on ${destinationLabel(onlyDest)}.`
        : `Dropped ${n} ${n === 1 ? "piece" : "pieces"}.`;
    return { summary, op: "exclude", post_ids: dropped };
  }
  if (restored.length > 0 && dropped.length === 0) {
    const n = restored.length;
    return {
      summary: `Restored ${n} ${n === 1 ? "piece" : "pieces"}.`,
      op: "restore",
      post_ids: restored
    };
  }
  return { summary: "Selection updated.", op: "exclude", post_ids: dropped.length ? dropped : restored };
}

export async function refineSelectionProposal(
  input: RefineSelectionProposalInput
): Promise<RefineSelectionProposalResult> {
  const creatorId = input.creatorId.trim();
  const proposalId = input.proposalId.trim();
  const instruction = input.instruction.trim();
  if (!instruction) {
    throw new CommandContractError("COMMAND_VALIDATION", "Type a refinement first.", [
      { field: "instruction", issue: "empty" }
    ]);
  }
  const existing = getSelectionProposal(proposalId, creatorId, input.store);
  const postedDest = parsePostedCleanupInstruction(instruction);
  if (postedDest) {
    return applyPostedCleanup(existing, postedDest, input.store);
  }
  const plannerOn =
    typeof input.plannerEnabled === "boolean"
      ? input.plannerEnabled
      : getRelayCommandFeatureFlags().planner_enabled;
  if (!plannerOn && !input.generate) {
    throw new CommandContractError("COMMAND_VALIDATION", SELECTION_REFINE_PLANNER_UNAVAILABLE, [
      { field: "planner", issue: "off" }
    ]);
  }

  const plan = await planCommandSelection({
    instruction,
    creatorId,
    items: input.items,
    generate: input.generate,
    activeProposal: existing,
    collections: input.collections
  });
  if (!plan.ok) {
    if (plan.skipped) {
      throw new CommandContractError("COMMAND_VALIDATION", SELECTION_REFINE_PLANNER_UNAVAILABLE, [
        { field: "planner", issue: "skipped" }
      ]);
    }
    const code = (COMMAND_ERROR_CODES as readonly string[]).includes(plan.code)
      ? (plan.code as CommandErrorCode)
      : "COMMAND_VALIDATION";
    throw new CommandContractError(code, plan.message, [{ field: "instruction", issue: plan.code }]);
  }
  if (plan.output.kind === "clarification") {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Say which pieces to drop or restore in this selection.",
      [{ field: "kind", issue: "clarification" }]
    );
  }
  if (plan.output.kind !== "proposal_patch") {
    throw new CommandContractError("COMMAND_VALIDATION", SELECTION_REFINE_NEW_SELECTION_MESSAGE, [
      { field: "kind", issue: plan.output.kind }
    ]);
  }

  const beforeExclude = [...existing.exclude_post_ids];
  const proposal = applyPlannerSelectionPatch(
    {
      creator_id: creatorId,
      proposal_id: proposalId,
      op: plan.output.op,
      post_ids: plan.output.post_ids,
      already_posted: plan.output.already_posted
    },
    input.store
  );
  return {
    proposal,
    ...summarizeSelectionMembershipChange({
      beforeExclude,
      afterExclude: proposal.exclude_post_ids,
      records: proposal.records
    })
  };
}
