/**
 * Lab 2 command harness interpreter (RC-P3-T06).
 * Maps typed instructions through the T04 eval fixture — no LLM.
 */
import { randomUUID } from "node:crypto";
import type { CommandChangeSetOp, CommandWriteLayer } from "../command/contracts.js";
import { previewChangeSet } from "../command/change-set-types.js";
import { CommandContractError } from "../command/contracts.js";
import { assertCommandMcpInputSafety } from "../command/mcp/redact.js";
import { loadStudioLab2Corpus } from "../lab2/corpus-spec.js";
import {
  loadCommandEvalCorpus,
  lookupEvalScenario
} from "./command-eval-corpus.js";
import { interpretScenario, type InterpretResult } from "./command-eval-runner.js";
import type { CommandEvalCorpus, CommandEvalScenario } from "./command-eval-types.js";
import { commandLibraryItemsFromLab2Corpus } from "./library-items-from-corpus.js";
import { STUDIO_LAB2_CREATOR_ID } from "../lab2/corpus-spec.js";

export type CommandHarnessSurface = "lab2" | "lab3" | "studio";

export function parseCommandHarnessSurface(raw: unknown): CommandHarnessSurface {
  if (raw === "lab2" || raw === "lab3" || raw === "studio") return raw;
  return "studio";
}

/** Lab 2 harness stays fixture-only. Lab 3 always uses the session creator's DB items. */
export function shouldUseLab2FixtureInterpret(
  surface: CommandHarnessSurface,
  creatorId: string
): boolean {
  if (surface === "lab2") return true;
  if (surface === "lab3") return false;
  return creatorId === STUDIO_LAB2_CREATOR_ID;
}

export function isLab2CorpusPostId(postId: string): boolean {
  return postId.startsWith("sl2_");
}

export type Lab2HarnessLensHint = "collections" | "schedule" | null;

export type Lab2HarnessInterpretResult =
  | {
      kind: "clarification";
      scenario_id: string;
      prompt: string;
      candidate_labels: string[];
    }
  | {
      kind: "preview";
      scenario_id: string;
      change_set_id: string;
      instruction: string;
      resolved_post_ids: string[];
      ops: CommandChangeSetOp[];
      write_layer: CommandWriteLayer | null;
      warnings: string[];
      summary: string;
      lens_hint: Lab2HarnessLensHint;
      apply_ready: boolean;
    }
  | {
      kind: "error";
      code: string;
      message: string;
    };

const PRODUCT_COLLECTION_IDS: Record<string, string> = {
  sl2_col_eval_hero_academy: "sl2_col_hero_academy",
  sl2_col_eval_watercolor: "sl2_col_watercolor",
  sl2_col_eval_t04_undo: "sl2_col_watercolor"
};

function remapOps(ops: CommandChangeSetOp[]): CommandChangeSetOp[] {
  return ops.map((op) => {
    const payload = { ...op.payload };
    const collectionId = typeof payload.collection_id === "string" ? payload.collection_id : "";
    const mapped = PRODUCT_COLLECTION_IDS[collectionId] ?? collectionId;
    if (mapped && mapped !== collectionId) {
      payload.collection_id = mapped;
      return {
        ...op,
        target_ids: op.target_ids.map((id) => (id === collectionId ? mapped : id)),
        payload
      };
    }
    return op;
  });
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

function applyReady(scenario: CommandEvalScenario, result: InterpretResult): boolean {
  if (result.ops.length === 0) return false;
  if (scenario.facade_intent.kind === "sequence_report") return false;
  if (scenario.facade_intent.kind === "analytics_fallback") return false;
  if (scenario.facade_intent.kind === "gated_refuse") return false;
  if (scenario.facade_intent.kind === "undo_collection") return false;
  return Boolean(result.write_layer);
}

function summaryFor(scenario: CommandEvalScenario, result: InterpretResult): string {
  const n = result.post_ids.length;
  if (result.write_layer === "collection") {
    return `Collection “${scenario.facade_intent.collection_title ?? "Collection"}” — ${n} posts.`;
  }
  if (result.write_layer === "schedule_rail") {
    return `Weekly X plan for ${n} posts (already-posted skipped).`;
  }
  if (result.write_layer === "distribution_plan" && scenario.facade_intent.kind === "destination_drafts") {
    return `Unpublished X drafts for ${n} posts.`;
  }
  if (result.write_layer === "presentation") {
    return `Imported title revise on presentation layer (${n} post).`;
  }
  if (result.write_layer === "native_version") {
    return `Native title revise appends PostVersion (${n} post).`;
  }
  if (scenario.facade_intent.kind === "analytics_fallback") {
    return "Weak analytics disclosed. Fallback window — no invented precision.";
  }
  if (scenario.facade_intent.kind === "sequence_report") {
    return "Hero Academy sequence report. No pages invented.";
  }
  return `${n} posts resolved.`;
}

function followupAfterClarification(
  corpus: CommandEvalCorpus,
  choice: string
): CommandEvalScenario {
  const trimmed = choice.trim();
  if (trimmed === "Hero Academy") {
    const hero = corpus.scenarios.find((s) => s.id === "rc-df-03-exact-hero-academy");
    if (hero) return hero;
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
      collection_id: `sl2_col_${trimmed.toLowerCase().replace(/\s+/g, "_")}`,
      collection_title: trimmed
    }
  };
}

export function interpretLab2HarnessInstruction(input: {
  instruction: string;
  clarification_choice?: string | null;
}): Lab2HarnessInterpretResult {
  const instruction = input.instruction.trim();
  if (!instruction) {
    return { kind: "error", code: "COMMAND_VALIDATION", message: "Type a command first." };
  }

  const corpus = loadCommandEvalCorpus();
  const lab2 = loadStudioLab2Corpus();
  const items = commandLibraryItemsFromLab2Corpus(lab2);
  let scenario = lookupEvalScenario(corpus, instruction);
  if (!scenario) {
    return {
      kind: "error",
      code: "COMMAND_VALIDATION",
      message:
        "That sentence is not in the Lab 2 eval fixture yet. Use a known paraphrase (Hero Academy, watercolor, Academy, skip X, undo via the Undo button)."
    };
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
        post_id: lab2.eval.gated_original_post_ids[0],
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

  const interpreted = interpretScenario(scenario, lab2, items);
  if (interpreted.clarification) {
    return {
      kind: "clarification",
      scenario_id: scenario.id,
      prompt: "Which Academy series?",
      candidate_labels: [...scenario.expected_clarification.candidate_labels]
    };
  }

  const ops = remapOps(interpreted.ops);
  const changeSetId = `cs_harness_${randomUUID()}`;
  if (ops.length > 0) {
    previewChangeSet({
      change_set_id: changeSetId,
      idempotency_key: `harness:${changeSetId}`,
      instruction,
      resolved_post_ids: interpreted.post_ids,
      ops
    });
  }

  return {
    kind: "preview",
    scenario_id: scenario.id,
    change_set_id: changeSetId,
    instruction,
    resolved_post_ids: interpreted.post_ids,
    ops,
    write_layer: interpreted.write_layer,
    warnings: interpreted.warnings,
    summary: summaryFor(scenario, interpreted),
    lens_hint: lensHint(interpreted.write_layer, ops),
    apply_ready: applyReady(scenario, { ...interpreted, ops })
  };
}
