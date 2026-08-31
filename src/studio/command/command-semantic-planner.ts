/**
 * Untrusted semantic planner for Lab 3 selection (RC-P7-T02).
 * Maps a sentence to a validated CommandSelectionQuery, one clarification, or a
 * bounded proposal patch. TypeScript remains authority. No writes. No Prisma.
 */
import { createHash } from "node:crypto";
import {
  generateStructured,
  type AiGenerateStructuredInput,
  type AiGenerateStructuredResult
} from "../../ai/ai-service.js";
import {
  CommandContractError,
  COMMAND_SELECTION_LEAF_KEYS,
  type CommandSelectionQuery,
  validateCommandSelectionQuery
} from "./contracts.js";
import {
  commandCapabilityFacade,
  type CommandSearchLibraryResult
} from "./capability-facade.js";
import {
  buildCommandPlannerContext,
  COMMAND_PLANNER_CONTEXT_SCHEMA_VERSION,
  type CommandPlannerContext
} from "./command-planner-context.js";
import { redactCommandMcpValue } from "./mcp/redact.js";
import { findActiveSelectionProposal, type CommandSelectionProposal } from "./proposal-types.js";
import type { CommandLibraryItem } from "./selection.js";

export const COMMAND_PLANNER_FEATURE = "command_planner";
export const COMMAND_PLANNER_SCHEMA_NAME = "command_planner_result";
export const COMMAND_PLANNER_SCENARIO_ID = "rc-p7-planner";
export const COMMAND_PLANNER_SCHEMA_VERSION = COMMAND_PLANNER_CONTEXT_SCHEMA_VERSION;

export const COMMAND_PLANNER_KINDS = [
  "clarification",
  "selection_intent",
  "proposal_patch",
  "plan_patch",
  "refuse"
] as const;
export type CommandPlannerKind = (typeof COMMAND_PLANNER_KINDS)[number];

export const COMMAND_PLANNER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: { type: "string", enum: [...COMMAND_PLANNER_KINDS] },
    prompt: { type: "string" },
    candidate_labels: { type: "array", items: { type: "string" } },
    query: { type: "object" },
    collection_title: { type: "string" },
    op: { type: "string", enum: ["exclude", "restore", "set_weekday", "set_interval_days", "set_start"] },
    post_ids: { type: "array", items: { type: "string" } },
    already_posted: { type: "boolean" },
    weekday: { type: ["string", "number"] },
    interval_days: { type: "number" },
    start_local: { type: "string" },
    code: { type: "string" },
    message: { type: "string" }
  }
};

export const COMMAND_PLANNER_SYSTEM = [
  "You are Relay's untrusted selection planner. TypeScript services resolve IDs.",
  "Return only the command_planner_result tool payload.",
  "Map artist meaning to library mechanics: tags, title/description terms, source, dates, visibility, destinations, numbered sequences.",
  "Do not invent ontology, missing pages, similarity clusters, or other creators' posts.",
  "Do not publish, apply ChangeSets, emit SQL, Prisma, HTTP, media URLs, or gated originals.",
  "If two series could match (for example Academy), return clarification with candidate labels. Never pick a series silently.",
  "selection_intent.query must be a CommandSelectionQuery with at least one constraint and no unknown keys.",
  "proposal_patch may exclude or restore post IDs already in the active proposal. After freeze, do not add library hits that were not frozen.",
  "When the active proposal is selection_approved or plan_shaping, plan_patch may set_weekday, set_interval_days, or set_start. Do not emit plan_patch during selection_review. Do not publish or write rail rows.",
  "One clarification max per instruction."
].join(" ");

const FORBIDDEN_OUTPUT_RE =
  /publish_external|apply_change_set|expose_gated|gated_original|\bprisma\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i;

export type CommandPlannerOutput =
  | {
      kind: "clarification";
      prompt: string;
      candidate_labels: string[];
    }
  | {
      kind: "selection_intent";
      query: CommandSelectionQuery;
      collection_title: string;
    }
  | {
      kind: "proposal_patch";
      op: "exclude" | "restore";
      post_ids: string[];
      already_posted: boolean;
    }
  | {
      kind: "plan_patch";
      op: "set_weekday" | "set_interval_days" | "set_start";
      weekday?: number | string;
      interval_days?: number;
      start_local?: string;
    }
  | {
      kind: "refuse";
      code: string;
      message: string;
    };

export type CommandPlannerGenerateFn = (
  input: AiGenerateStructuredInput
) => Promise<AiGenerateStructuredResult>;

export type CommandSemanticPlan =
  | {
      ok: true;
      output: CommandPlannerOutput;
      instruction_hash: string;
      search: CommandSearchLibraryResult | null;
    }
  | { ok: false; skipped: true; reason: string; instruction_hash: string }
  | {
      ok: false;
      skipped: false;
      code: string;
      message: string;
      instruction_hash: string;
    };

export type PlanCommandSelectionInput = {
  instruction: string;
  creatorId: string;
  items: readonly CommandLibraryItem[];
  generate?: CommandPlannerGenerateFn;
  context?: Record<string, unknown>;
  collections?: Array<{ collection_id: string; title: string }>;
  clarification_choice?: string | null;
  activeProposal?: CommandSelectionProposal | null;
};

function instructionHash(instruction: string): string {
  return createHash("sha256").update(instruction).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function selectionHasConstraint(query: CommandSelectionQuery): boolean {
  for (const key of COMMAND_SELECTION_LEAF_KEYS) {
    if (query[key] !== undefined) return true;
  }
  return Boolean(query.all?.length || query.any?.length || query.not?.length);
}

function uniqueLabels(values: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (!Array.isArray(values)) return out;
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function parseCommandPlannerOutput(raw: unknown): CommandPlannerOutput {
  const serialized = JSON.stringify(raw ?? null);
  if (FORBIDDEN_OUTPUT_RE.test(serialized)) {
    throw new CommandContractError(
      "COMMAND_VALIDATION",
      "Planner output requested a forbidden operation.",
      [{ field: "kind", issue: "forbidden" }]
    );
  }
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new CommandContractError("COMMAND_VALIDATION", "Planner output is not a valid object.", [
      { field: "kind", issue: "required" }
    ]);
  }
  const kind = raw.kind.trim();
  if (kind === "clarification") {
    const labels = uniqueLabels(raw.candidate_labels);
    if (labels.length < 2) {
      throw new CommandContractError(
        "COMMAND_AMBIGUOUS",
        "Clarification must list at least two candidate labels.",
        [{ field: "candidate_labels", issue: "min_2" }]
      );
    }
    const prompt =
      typeof raw.prompt === "string" && raw.prompt.trim()
        ? raw.prompt.trim()
        : "Which series did you mean?";
    return { kind: "clarification", prompt, candidate_labels: labels.slice(0, 8) };
  }
  if (kind === "selection_intent") {
    const query = validateCommandSelectionQuery(raw.query ?? {});
    if (!selectionHasConstraint(query)) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Selection query must include a constraint.",
        [{ field: "query", issue: "empty" }]
      );
    }
    const collectionTitle =
      typeof raw.collection_title === "string" && raw.collection_title.trim()
        ? raw.collection_title.trim()
        : query.title_contains?.trim() || "Collection";
    return { kind: "selection_intent", query, collection_title: collectionTitle };
  }
  if (kind === "proposal_patch") {
    const op = raw.op === "restore" ? "restore" : raw.op === "exclude" ? "exclude" : null;
    if (!op) {
      throw new CommandContractError("COMMAND_VALIDATION", "proposal_patch requires exclude or restore.", [
        { field: "op", issue: "exclude_or_restore" }
      ]);
    }
    const postIds = Array.isArray(raw.post_ids)
      ? raw.post_ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    return {
      kind: "proposal_patch",
      op,
      post_ids: idsTrim(postIds),
      already_posted: raw.already_posted === true
    };
  }
  if (kind === "plan_patch") {
    const opRaw = typeof raw.op === "string" ? raw.op.trim() : "";
    if (opRaw !== "set_weekday" && opRaw !== "set_interval_days" && opRaw !== "set_start") {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "plan_patch requires set_weekday, set_interval_days, or set_start.",
        [{ field: "op", issue: opRaw || "empty" }]
      );
    }
    const weekday =
      typeof raw.weekday === "string" || typeof raw.weekday === "number" ? raw.weekday : undefined;
    const interval_days = typeof raw.interval_days === "number" ? raw.interval_days : undefined;
    const start_local = typeof raw.start_local === "string" ? raw.start_local.trim() : undefined;
    return {
      kind: "plan_patch",
      op: opRaw,
      weekday,
      interval_days,
      start_local
    };
  }
  if (kind === "refuse") {
    const message =
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message.trim()
        : "That command is not available.";
    const code =
      typeof raw.code === "string" && raw.code.trim() ? raw.code.trim() : "COMMAND_VALIDATION";
    return { kind: "refuse", code, message };
  }
  throw new CommandContractError("COMMAND_VALIDATION", "Planner output kind is not allowed.", [
    { field: "kind", issue: kind }
  ]);
}

function idsTrim(ids: string[]): string[] {
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

function structuredUnknown(result: AiGenerateStructuredResult): unknown {
  if (!result.ok) return null;
  if (result.parsed !== undefined) return result.parsed;
  try {
    return JSON.parse(result.text) as unknown;
  } catch {
    return null;
  }
}

async function callPlannerGenerate(
  generate: CommandPlannerGenerateFn,
  input: Omit<AiGenerateStructuredInput, "schema_name" | "json_schema">,
  retryHint?: string
): Promise<AiGenerateStructuredResult> {
  const messages = retryHint
    ? [...input.messages, { role: "user" as const, content: retryHint }]
    : input.messages;
  return generate({
    ...input,
    messages,
    schema_name: COMMAND_PLANNER_SCHEMA_NAME,
    json_schema: COMMAND_PLANNER_JSON_SCHEMA
  });
}

export async function planCommandSelection(
  input: PlanCommandSelectionInput
): Promise<CommandSemanticPlan> {
  const instruction = input.instruction.trim();
  const hash = instructionHash(instruction);
  if (!instruction) {
    return {
      ok: false,
      skipped: false,
      code: "COMMAND_VALIDATION",
      message: "Type a command first.",
      instruction_hash: hash
    };
  }

  const proposal =
    input.activeProposal === undefined
      ? findActiveSelectionProposal(input.creatorId)
      : input.activeProposal;
  const compactContext = redactCommandMcpValue({
    ...buildCommandPlannerContext({
      items: input.items,
      proposal,
      collections: input.collections,
      clarification_choice: input.clarification_choice
    }),
    ...(input.context ?? {})
  }) as CommandPlannerContext;

  const generate: CommandPlannerGenerateFn =
    input.generate ??
    ((payload) =>
      generateStructured(payload, undefined));

  const structuredInput: Omit<AiGenerateStructuredInput, "schema_name" | "json_schema"> = {
    system: COMMAND_PLANNER_SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ instruction, context: compactContext })
      }
    ],
    tier: "cheap",
    temperature: 0,
    maxOutputTokens: 2048,
    metadata: {
      feature: COMMAND_PLANNER_FEATURE,
      creatorId: input.creatorId
    }
  };

  const first = await callPlannerGenerate(generate, structuredInput);
  if (!first.ok) {
    if (first.skipped) {
      return { ok: false, skipped: true, reason: first.reason, instruction_hash: hash };
    }
    return {
      ok: false,
      skipped: false,
      code: "COMMAND_VALIDATION",
      message: "The planner could not map that sentence. Try a known paraphrase or a title or tag.",
      instruction_hash: hash
    };
  }

  let parsedRaw = structuredUnknown(first);
  let output: CommandPlannerOutput | null = null;
  try {
    output = parseCommandPlannerOutput(parsedRaw);
  } catch {
    const retried = await callPlannerGenerate(
      generate,
      structuredInput,
      "Your previous output was invalid. Return only the command_planner_result tool payload."
    );
    if (!retried.ok) {
      if (retried.skipped) {
        return { ok: false, skipped: true, reason: retried.reason, instruction_hash: hash };
      }
      return {
        ok: false,
        skipped: false,
        code: "COMMAND_VALIDATION",
        message: "The planner could not map that sentence. Try a known paraphrase or a title or tag.",
        instruction_hash: hash
      };
    }
    try {
      output = parseCommandPlannerOutput(structuredUnknown(retried));
    } catch (err) {
      const message =
        err instanceof CommandContractError
          ? err.message
          : "The planner returned invalid JSON after one retry.";
      const code = err instanceof CommandContractError ? err.code : "COMMAND_VALIDATION";
      return { ok: false, skipped: false, code, message, instruction_hash: hash };
    }
  }

  if (output.kind === "refuse") {
    return {
      ok: false,
      skipped: false,
      code: output.code,
      message: output.message,
      instruction_hash: hash
    };
  }

  if (output.kind === "selection_intent") {
    try {
      const search = commandCapabilityFacade.search_library(input.items, output.query, {
        creator_id: input.creatorId
      });
      return { ok: true, output, instruction_hash: hash, search };
    } catch (err) {
      const message =
        err instanceof CommandContractError ? err.message : "Selection query failed.";
      const code = err instanceof CommandContractError ? err.code : "COMMAND_VALIDATION";
      return { ok: false, skipped: false, code, message, instruction_hash: hash };
    }
  }

  if (output.kind === "proposal_patch") {
    return { ok: true, output, instruction_hash: hash, search: null };
  }

  return { ok: true, output, instruction_hash: hash, search: null };
}
