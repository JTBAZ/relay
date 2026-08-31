/**
 * Relay Command eval corpus wire types (RC-P3-T04).
 * @see docs/studio/relay-command-mcp-build-plans/03-PHASE-3-MCP-MODEL-EVALUATION.md
 */
import type { CommandSelectionQuery, CommandWriteLayer } from "../command/contracts.js";

export const RELAY_COMMAND_EVAL_CORPUS_VERSION = 1 as const;

export const COMMAND_EVAL_INTENT_KINDS = [
  "search_collect",
  "clarify_series",
  "sequence_report",
  "skip_posted_destination",
  "destination_drafts",
  "revise_write_layer",
  "analytics_fallback",
  "gated_refuse",
  "idempotent_retry",
  "undo_collection"
] as const;
export type CommandEvalIntentKind = (typeof COMMAND_EVAL_INTENT_KINDS)[number];

export const COMMAND_EVAL_ORDER_KINDS = [
  "newest_first",
  "sequence_numeric",
  "as_resolved",
  "n/a"
] as const;
export type CommandEvalOrderKind = (typeof COMMAND_EVAL_ORDER_KINDS)[number];

export type CommandEvalClarification = {
  required: boolean;
  candidate_labels: string[];
};

export type CommandEvalFacadeIntent = {
  kind: CommandEvalIntentKind;
  query?: CommandSelectionQuery;
  collection_id?: string;
  collection_title?: string;
  destination?: "x";
  revise_title?: string;
  post_id?: string;
  gated_args?: Record<string, unknown>;
  idempotency_key?: string;
};

export type CommandEvalScenario = {
  id: string;
  rc_df: string[];
  instruction: string;
  paraphrases: string[];
  expected_post_ids: string[];
  expected_order: CommandEvalOrderKind;
  expected_clarification: CommandEvalClarification;
  forbidden_ops: string[];
  expected_write_layer: CommandWriteLayer | null;
  expected_db_assertions: string[];
  facade_intent: CommandEvalFacadeIntent;
};

export type CommandEvalCorpus = {
  version: typeof RELAY_COMMAND_EVAL_CORPUS_VERSION;
  label: "relay-command-eval-v1";
  lab2_corpus_label: "studio-lab2-corpus-v1";
  scenarios: CommandEvalScenario[];
};
