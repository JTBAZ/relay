/**
 * Creator-scoped command harness interpreter (RC-P5-T01).
 * Reuses eval fixture *intent* when the sentence matches, then searches the
 * caller's library items. Never resolves Lab 2 `sl2_*` IDs for a non-Lab-2 creator.
 */
import { randomUUID } from "node:crypto";
import { previewChangeSet } from "../command/change-set-types.js";
import { lab2FixtureWeeklyDueDates } from "../command/finite-plan-compiler.js";
import {
  CommandContractError,
  type CommandChangeSetOp,
  type CommandWriteLayer
} from "../command/contracts.js";
import { commandCapabilityFacade } from "../command/capability-facade.js";
import {
  COMMAND_PLANNER_SCENARIO_ID,
  planCommandSelection,
  type CommandPlannerGenerateFn
} from "../command/command-semantic-planner.js";
import { getRelayCommandFeatureFlags } from "../command/flags.js";
import { assertCommandMcpInputSafety } from "../command/mcp/redact.js";
import {
  applyPlannerSelectionPatch,
  pendingProposalPostIds
} from "../command/proposal-types.js";
import type { CommandLibraryItem } from "../command/selection.js";
import {
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
  loadStudioLab2Corpus
} from "../lab2/corpus-spec.js";
import { expandEvalScalar, loadCommandEvalCorpus, lookupEvalScenario } from "./command-eval-corpus.js";
import { uniqueSequencePostIds } from "./command-eval-runner.js";
import type { CommandEvalCorpus, CommandEvalScenario } from "./command-eval-types.js";
import {
  isLab2CorpusPostId,
  type Lab2HarnessInterpretResult,
  type Lab2HarnessLensHint
} from "./command-harness-interpret.js";

function creatorCollectionId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return `col_${slug || "collection"}`;
}

function lensHint(writeLayer: CommandWriteLayer | null, ops: CommandChangeSetOp[]): Lab2HarnessLensHint {
  if (writeLayer === "collection" || ops.some((op) => op.capability === "create_or_update_collection")) {
    return "collections";
  }
  if (
    writeLayer === "schedule_rail" ||
    writeLayer === "distribution_plan" ||
    ops.some(
      (op) =>
        op.capability === "materialize_schedule" ||
        op.capability === "prepare_destination_drafts" ||
        op.capability === "create_release_plan"
    )
  ) {
    return "schedule";
  }
  return null;
}

function applyReady(scenario: CommandEvalScenario, ops: CommandChangeSetOp[], writeLayer: CommandWriteLayer | null) {
  if (ops.length === 0) return false;
  if (scenario.facade_intent.kind === "sequence_report") return false;
  if (scenario.facade_intent.kind === "analytics_fallback") return false;
  if (scenario.facade_intent.kind === "gated_refuse") return false;
  if (scenario.facade_intent.kind === "undo_collection") return false;
  return Boolean(writeLayer);
}

function summaryFor(
  scenario: CommandEvalScenario,
  postCount: number,
  writeLayer: CommandWriteLayer | null
): string {
  if (writeLayer === "collection") {
    return `Collection “${scenario.facade_intent.collection_title ?? "Collection"}” — ${postCount} posts.`;
  }
  if (writeLayer === "schedule_rail") {
    return `Weekly X plan for ${postCount} posts (already-posted skipped).`;
  }
  if (writeLayer === "distribution_plan" && scenario.facade_intent.kind === "destination_drafts") {
    return `Unpublished X drafts for ${postCount} posts.`;
  }
  if (writeLayer === "presentation") {
    return `Imported title revise on presentation layer (${postCount} post).`;
  }
  if (writeLayer === "native_version") {
    return `Native title revise appends PostVersion (${postCount} post).`;
  }
  if (scenario.facade_intent.kind === "analytics_fallback") {
    return "Weak analytics disclosed. Fallback window — no invented precision.";
  }
  if (scenario.facade_intent.kind === "sequence_report") {
    return "Sequence report. No pages invented.";
  }
  return `${postCount} posts resolved.`;
}

function followupAfterClarification(corpus: CommandEvalCorpus, choice: string): CommandEvalScenario {
  const trimmed = choice.trim();
  if (trimmed === "Hero Academy") {
    const hero = corpus.scenarios.find((s) => s.id === "rc-df-03-exact-hero-academy");
    if (hero) {
      return {
        ...hero,
        facade_intent: {
          ...hero.facade_intent,
          collection_id: creatorCollectionId(hero.facade_intent.collection_title ?? "Hero Academy")
        }
      };
    }
  }
  return {
    id: `rc-df-03-choice-${trimmed.toLowerCase().replace(/\s+/g, "-")}`,
    rc_df: ["RC-DF-03", "RC-DF-04"],
    instruction: `Organize ${trimmed} into a collection.`,
    paraphrases: ["n/a", "n/a", "n/a"],
    expected_post_ids: [],
    expected_order: "n/a",
    expected_clarification: { required: false, candidate_labels: [] },
    forbidden_ops: ["publish_external", "unsolicited_curation", "silent_series_pick"],
    expected_write_layer: "collection",
    expected_db_assertions: [],
    facade_intent: {
      kind: "search_collect",
      query: { title_contains: trimmed },
      collection_id: creatorCollectionId(trimmed),
      collection_title: trimmed
    }
  };
}

function noMatchError(): Lab2HarnessInterpretResult {
  return {
    kind: "error",
    code: "COMMAND_VALIDATION",
    message:
      "No matching posts in this library for that command (creator data plane). Lab 2 fixture IDs were not applied."
  };
}

function foreignIdError(): Lab2HarnessInterpretResult {
  return {
    kind: "error",
    code: "COMMAND_VALIDATION",
    message: "Lab 3 interpret cannot resolve Lab 2 fixture post IDs for this creator."
  };
}

function assertCreatorIds(creatorId: string, ids: readonly string[]): Lab2HarnessInterpretResult | null {
  if (creatorId === STUDIO_LAB2_CREATOR_ID) return null;
  if (ids.some((id) => isLab2CorpusPostId(id))) return foreignIdError();
  return null;
}

function searchRecords(
  items: readonly CommandLibraryItem[],
  query: CommandEvalScenario["facade_intent"]["query"],
  creatorId?: string
) {
  return commandCapabilityFacade.search_library(items, query ?? {}, {
    creator_id: creatorId
  });
}

type SequencedSearch =
  | {
      searched: ReturnType<typeof searchRecords>;
      resolved: ReturnType<typeof commandCapabilityFacade.resolve_numbered_sequence>;
      ambiguous: null;
    }
  | {
      searched: ReturnType<typeof searchRecords>;
      resolved: null;
      ambiguous: CommandContractError;
    };

function sequenceFromSearch(
  items: readonly CommandLibraryItem[],
  query: CommandEvalScenario["facade_intent"]["query"],
  creatorId?: string
): SequencedSearch {
  const searched = searchRecords(items, query, creatorId);
  const uniqueItems = new Map<string, CommandLibraryItem>();
  for (const item of items) {
    if (searched.records.some((r) => r.post_id === item.post_id) && !uniqueItems.has(item.post_id)) {
      uniqueItems.set(item.post_id, item);
    }
  }
  try {
    const resolved = commandCapabilityFacade.resolve_numbered_sequence(
      [...uniqueItems.values()].map((it) => ({ post_id: it.post_id, title: it.title }))
    );
    return { searched, resolved, ambiguous: null };
  } catch (err) {
    if (err instanceof CommandContractError && err.code === "COMMAND_AMBIGUOUS") {
      return { searched, resolved: null, ambiguous: err };
    }
    throw err;
  }
}

function collectionOps(args: {
  opId: string;
  collectionId: string;
  title: string;
  postIds: string[];
}): CommandChangeSetOp[] {
  return [
    {
      op_id: args.opId,
      capability: "create_or_update_collection",
      risk_class: "execute_undo",
      target_ids: [args.collectionId],
      payload: {
        collection_id: args.collectionId,
        title: args.title,
        post_ids: args.postIds,
        ordered_post_ids: args.postIds
      }
    }
  ];
}

function sequenceWarnings(resolved: ReturnType<typeof commandCapabilityFacade.resolve_numbered_sequence>): string[] {
  const warnings: string[] = [];
  if (resolved.gaps.length > 0) {
    warnings.push(`Missing page ${resolved.gaps.join(", ")} — not invented.`);
  }
  if (resolved.duplicates.length > 0) {
    warnings.push(
      `Duplicate page ${resolved.duplicates.join(", ")} — both copies kept until you choose.`
    );
  }
  return warnings;
}

function resolveCreatorPostId(
  creatorId: string,
  items: readonly CommandLibraryItem[],
  rawPostId: string | undefined
): string | null {
  const raw = rawPostId?.trim() ?? "";
  if (!raw) return null;
  const lab2 = loadStudioLab2Corpus();
  const candidate = raw.startsWith("$eval.") ? expandEvalScalar(raw, lab2) ?? "" : raw;
  if (!candidate) return null;
  if (isLab2CorpusPostId(candidate) && creatorId !== STUDIO_LAB2_CREATOR_ID) return null;
  return items.some((it) => it.post_id === candidate) ? candidate : null;
}

function previewResult(args: {
  scenario: CommandEvalScenario;
  instruction: string;
  postIds: string[];
  ops: CommandChangeSetOp[];
  writeLayer: CommandWriteLayer | null;
  warnings: string[];
}): Lab2HarnessInterpretResult {
  const changeSetId = `cs_harness_${randomUUID()}`;
  if (args.ops.length > 0) {
    previewChangeSet({
      change_set_id: changeSetId,
      idempotency_key: `harness:${changeSetId}`,
      instruction: args.instruction,
      resolved_post_ids: args.postIds,
      ops: args.ops
    });
  }
  return {
    kind: "preview",
    scenario_id: args.scenario.id,
    change_set_id: changeSetId,
    instruction: args.instruction,
    resolved_post_ids: args.postIds,
    ops: args.ops,
    write_layer: args.writeLayer,
    warnings: args.warnings,
    summary: summaryFor(args.scenario, args.postIds.length, args.writeLayer),
    lens_hint: lensHint(args.writeLayer, args.ops),
    apply_ready: applyReady(args.scenario, args.ops, args.writeLayer)
  };
}

const FIXTURE_MISS_MESSAGE =
  "That sentence is not in the Lab 2 eval fixture yet. Use a known paraphrase (Hero Academy, watercolor, Academy, skip X, undo via the Undo button).";

function plannerPreviewResult(args: {
  instruction: string;
  postIds: string[];
  ops: CommandChangeSetOp[];
  writeLayer: CommandWriteLayer | null;
  warnings: string[];
  summary: string;
}): Lab2HarnessInterpretResult {
  const changeSetId = `cs_harness_${randomUUID()}`;
  if (args.ops.length > 0) {
    previewChangeSet({
      change_set_id: changeSetId,
      idempotency_key: `harness:${changeSetId}`,
      instruction: args.instruction,
      resolved_post_ids: args.postIds,
      ops: args.ops
    });
  }
  return {
    kind: "preview",
    scenario_id: COMMAND_PLANNER_SCENARIO_ID,
    change_set_id: changeSetId,
    instruction: args.instruction,
    resolved_post_ids: args.postIds,
    ops: args.ops,
    write_layer: args.writeLayer,
    warnings: args.warnings,
    summary: args.summary,
    lens_hint: lensHint(args.writeLayer, args.ops),
    apply_ready: args.ops.length > 0 && Boolean(args.writeLayer)
  };
}

async function interpretViaPlanner(input: {
  creatorId: string;
  instruction: string;
  items: readonly CommandLibraryItem[];
  clarification_choice?: string | null;
  generate?: CommandPlannerGenerateFn;
}): Promise<Lab2HarnessInterpretResult> {
  const plan = await planCommandSelection({
    instruction: input.instruction,
    creatorId: input.creatorId,
    items: input.items,
    generate: input.generate,
    clarification_choice: input.clarification_choice,
    collections:
      input.creatorId === STUDIO_LAB2_CREATOR_ID
        ? [
            {
              collection_id: STUDIO_LAB2_DEFAULT_COLLECTION_ID,
              title: STUDIO_LAB2_DEFAULT_COLLECTION_TITLE
            }
          ]
        : undefined
  });
  if (!plan.ok) {
    if (plan.skipped) {
      return {
        kind: "error",
        code: "COMMAND_VALIDATION",
        message: `${FIXTURE_MISS_MESSAGE} Planner unavailable.`
      };
    }
    return { kind: "error", code: plan.code, message: plan.message };
  }

  if (plan.output.kind === "clarification") {
    return {
      kind: "clarification",
      scenario_id: COMMAND_PLANNER_SCENARIO_ID,
      prompt: plan.output.prompt,
      candidate_labels: plan.output.candidate_labels
    };
  }

  if (plan.output.kind === "proposal_patch") {
    try {
      const updated = applyPlannerSelectionPatch({
        creator_id: input.creatorId,
        op: plan.output.op,
        post_ids: plan.output.post_ids,
        already_posted: plan.output.already_posted
      });
      const postIds =
        updated.stage === "selection_approved"
          ? updated.frozen_post_ids
          : pendingProposalPostIds(updated);
      return plannerPreviewResult({
        instruction: input.instruction,
        postIds,
        ops: [],
        writeLayer: null,
        warnings: [],
        summary: `Selection updated — ${postIds.length} posts.`
      });
    } catch (err) {
      if (err instanceof CommandContractError) {
        return { kind: "error", code: err.code, message: err.message };
      }
      throw err;
    }
  }

  if (plan.output.kind !== "selection_intent") {
    return { kind: "error", code: "COMMAND_VALIDATION", message: FIXTURE_MISS_MESSAGE };
  }

  const query = plan.output.query;
  const sequenced = sequenceFromSearch(input.items, query, input.creatorId);
  if (sequenced.ambiguous) {
    return {
      kind: "clarification",
      scenario_id: COMMAND_PLANNER_SCENARIO_ID,
      prompt: "Which series?",
      candidate_labels: sequenced.ambiguous.details.map((d) => d.issue)
    };
  }
  const { searched, resolved } = sequenced;
  const byTag = Boolean(query.tag_ids?.length);
  let postIds = byTag ? searched.records.map((r) => r.post_id) : uniqueSequencePostIds(resolved);
  if (!byTag && postIds.length === 0) postIds = searched.records.map((r) => r.post_id);
  const leaked = assertCreatorIds(input.creatorId, postIds);
  if (leaked) return leaked;
  if (postIds.length === 0) return noMatchError();
  const title = plan.output.collection_title;
  const collectionId = creatorCollectionId(title);
  commandCapabilityFacade.route_collection_write({
    collection_id: collectionId,
    title,
    post_ids: postIds,
    ordered_post_ids: postIds
  });
  return plannerPreviewResult({
    instruction: input.instruction,
    postIds,
    ops: collectionOps({
      opId: `op_${COMMAND_PLANNER_SCENARIO_ID}`,
      collectionId,
      title,
      postIds
    }),
    writeLayer: "collection",
    warnings: byTag ? [] : sequenceWarnings(resolved),
    summary: `Collection “${title}” — ${postIds.length} posts.`
  });
}

export async function interpretCreatorHarnessInstruction(input: {
  creatorId: string;
  instruction: string;
  items: readonly CommandLibraryItem[];
  clarification_choice?: string | null;
  planner?: {
    enabled?: boolean;
    generate?: CommandPlannerGenerateFn;
  };
}): Promise<Lab2HarnessInterpretResult> {
  const instruction = input.instruction.trim();
  const creatorId = input.creatorId.trim();
  if (!instruction) {
    return { kind: "error", code: "COMMAND_VALIDATION", message: "Type a command first." };
  }

  const corpus = loadCommandEvalCorpus();
  let scenario = lookupEvalScenario(corpus, instruction);
  if (!scenario) {
    const plannerOn =
      typeof input.planner?.enabled === "boolean"
        ? input.planner.enabled
        : getRelayCommandFeatureFlags().planner_enabled;
    if (!plannerOn) {
      return {
        kind: "error",
        code: "COMMAND_VALIDATION",
        message: FIXTURE_MISS_MESSAGE
      };
    }
    return interpretViaPlanner({
      creatorId,
      instruction,
      items: input.items,
      clarification_choice: input.clarification_choice,
      generate: input.planner?.generate
    });
  }

  if (scenario.facade_intent.kind === "undo_collection") {
    return {
      kind: "error",
      code: "COMMAND_VALIDATION",
      message: "Use the Undo button after a command applies. Undo does not delete corpus posts."
    };
  }

  if (scenario.facade_intent.kind === "clarify_series") {
    const choice = input.clarification_choice?.trim() ?? "";
    if (!choice) {
      return {
        kind: "clarification",
        scenario_id: scenario.id,
        prompt: "Which Academy series?",
        candidate_labels: [...scenario.expected_clarification.candidate_labels]
      };
    }
    const allowed = scenario.expected_clarification.candidate_labels;
    if (!allowed.includes(choice)) {
      return {
        kind: "error",
        code: "COMMAND_VALIDATION",
        message: `Choose one of: ${allowed.join(", ")}.`
      };
    }
    scenario = followupAfterClarification(corpus, choice);
  }

  if (scenario.facade_intent.kind === "gated_refuse") {
    try {
      assertCommandMcpInputSafety("revise_post", {
        post_id: "gated_refuse",
        use_public_cover: false,
        is_public: false,
        expose_gated_originals: true
      });
    } catch (err) {
      if (err instanceof CommandContractError && err.code === "COMMAND_GATED_MEDIA") {
        return { kind: "error", code: err.code, message: err.message };
      }
      throw err;
    }
    return {
      kind: "error",
      code: "COMMAND_GATED_MEDIA",
      message: "Gated originals cannot be used as destination or public media."
    };
  }

  const intent = scenario.facade_intent;
  const items = input.items;

  if (intent.kind === "analytics_fallback") {
    return previewResult({
      scenario,
      instruction,
      postIds: [],
      ops: [],
      writeLayer: null,
      warnings: ["Weak analytics disclosed. Fallback window — no invented precision."]
    });
  }

  if (intent.kind === "revise_write_layer") {
    const postId = resolveCreatorPostId(creatorId, items, intent.post_id);
    if (!postId) return noMatchError();
    const leaked = assertCreatorIds(creatorId, [postId]);
    if (leaked) return leaked;
    const item = items.find((it) => it.post_id === postId);
    if (!item?.source) return noMatchError();
    const routed = commandCapabilityFacade.revise_post({
      post_id: postId,
      source: item.source,
      fields: { title: intent.revise_title ?? "creator revise" }
    });
    const writeLayer = routed.layer === "presentation" || routed.layer === "native_version" ? routed.layer : null;
    return previewResult({
      scenario,
      instruction,
      postIds: [postId],
      ops: [
        {
          op_id: `op_${scenario.id}`,
          capability: "revise_post",
          risk_class: "execute_undo",
          target_ids: [postId],
          payload: { post_id: postId, source: item.source, title: intent.revise_title }
        }
      ],
      writeLayer,
      warnings: []
    });
  }

  if (intent.kind === "skip_posted_destination" || intent.kind === "destination_drafts") {
    const query = intent.query ?? { title_contains: "Hero Academy", destination_absent: ["x"] as const };
    const planned = searchRecords(items, query, creatorId).records.map((r) => r.post_id);
    const leaked = assertCreatorIds(creatorId, planned);
    if (leaked) return leaked;
    if (planned.length === 0) return noMatchError();
    const titleNeedle = query.title_contains ?? "Hero Academy";
    const allSeries = searchRecords(items, { title_contains: titleNeedle }, creatorId).records.map(
      (r) => r.post_id
    );
    const skipped = allSeries.filter((id) => !planned.includes(id));
    const capability =
      intent.kind === "destination_drafts" ? "prepare_destination_drafts" : "materialize_schedule";
    const writeLayer = intent.kind === "destination_drafts" ? "distribution_plan" : "schedule_rail";
    return previewResult({
      scenario,
      instruction,
      postIds: planned,
      ops: [
        {
          op_id: `op_${scenario.id}`,
          capability,
          risk_class: "execute_undo",
          target_ids: planned,
          payload: {
            post_ids: planned,
            destination: intent.destination ?? "x",
            skipped_post_ids: skipped,
            due_ats: lab2FixtureWeeklyDueDates(planned.length).map((d) => d.toISOString())
          }
        }
      ],
      writeLayer,
      warnings: [`Skipping ${skipped.length} posts already posted on X.`]
    });
  }

  if (intent.kind === "sequence_report") {
    const sequenced = sequenceFromSearch(items, intent.query, creatorId);
    if (sequenced.ambiguous) {
      return {
        kind: "clarification",
        scenario_id: scenario.id,
        prompt: "Which series?",
        candidate_labels: sequenced.ambiguous.details.map((d) => d.issue)
      };
    }
    let postIds = uniqueSequencePostIds(sequenced.resolved);
    if (postIds.length === 0) postIds = sequenced.searched.records.map((r) => r.post_id);
    const leaked = assertCreatorIds(creatorId, postIds);
    if (leaked) return leaked;
    return previewResult({
      scenario,
      instruction,
      postIds,
      ops: [],
      writeLayer: null,
      warnings: sequenceWarnings(sequenced.resolved)
    });
  }

  if (intent.kind === "search_collect" || intent.kind === "idempotent_retry") {
    const sequenced = sequenceFromSearch(items, intent.query, creatorId);
    if (sequenced.ambiguous) {
      return {
        kind: "clarification",
        scenario_id: scenario.id,
        prompt: "Which series?",
        candidate_labels: sequenced.ambiguous.details.map((d) => d.issue)
      };
    }
    const { searched, resolved } = sequenced;
    const byTag = Boolean(intent.query?.tag_ids?.length);
    let postIds = byTag ? searched.records.map((r) => r.post_id) : uniqueSequencePostIds(resolved);
    if (!byTag && postIds.length === 0) postIds = searched.records.map((r) => r.post_id);
    const leaked = assertCreatorIds(creatorId, postIds);
    if (leaked) return leaked;
    if (postIds.length === 0) return noMatchError();
    const title = intent.collection_title ?? "Collection";
    const collectionId =
      intent.collection_id && !intent.collection_id.startsWith("sl2_col_eval_")
        ? intent.collection_id
        : creatorCollectionId(title);
    commandCapabilityFacade.route_collection_write({
      collection_id: collectionId,
      title,
      post_ids: postIds,
      ordered_post_ids: postIds
    });
    return previewResult({
      scenario,
      instruction,
      postIds,
      ops: collectionOps({
        opId: `op_${scenario.id}`,
        collectionId,
        title,
        postIds
      }),
      writeLayer: "collection",
      warnings: byTag ? [] : sequenceWarnings(resolved)
    });
  }

  return {
    kind: "error",
    code: "COMMAND_VALIDATION",
    message:
      "That sentence is not in the Lab 2 eval fixture yet. Use a known paraphrase (Hero Academy, watercolor, Academy, skip X, undo via the Undo button)."
  };
}
