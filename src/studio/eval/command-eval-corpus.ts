/**
 * Load and validate the Relay Command eval corpus (RC-P3-T04).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StudioLab2Corpus } from "../lab2/corpus-spec.js";
import {
  COMMAND_EVAL_INTENT_KINDS,
  COMMAND_EVAL_ORDER_KINDS,
  RELAY_COMMAND_EVAL_CORPUS_VERSION,
  type CommandEvalCorpus,
  type CommandEvalIntentKind,
  type CommandEvalOrderKind,
  type CommandEvalScenario
} from "./command-eval-types.js";

export const REQUIRED_RC_DF_03_13 = [
  "RC-DF-03",
  "RC-DF-04",
  "RC-DF-05",
  "RC-DF-06",
  "RC-DF-07",
  "RC-DF-08",
  "RC-DF-09",
  "RC-DF-10",
  "RC-DF-11",
  "RC-DF-12",
  "RC-DF-13"
] as const;

export function defaultRelayCommandEvalCorpusPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../../tests/fixtures/relay-command-eval/corpus.json"),
    join(here, "../../../../tests/fixtures/relay-command-eval/corpus.json")
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0]!;
}

function isIntentKind(value: unknown): value is CommandEvalIntentKind {
  return typeof value === "string" && (COMMAND_EVAL_INTENT_KINDS as readonly string[]).includes(value);
}

function isOrderKind(value: unknown): value is CommandEvalOrderKind {
  return typeof value === "string" && (COMMAND_EVAL_ORDER_KINDS as readonly string[]).includes(value);
}

export function validateCommandEvalCorpus(spec: unknown): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") return ["eval corpus must be an object"];
  const s = spec as CommandEvalCorpus;
  if (s.version !== RELAY_COMMAND_EVAL_CORPUS_VERSION) {
    errors.push(`version must be ${RELAY_COMMAND_EVAL_CORPUS_VERSION}`);
  }
  if (s.label !== "relay-command-eval-v1") errors.push("label must be relay-command-eval-v1");
  if (s.lab2_corpus_label !== "studio-lab2-corpus-v1") {
    errors.push("lab2_corpus_label must be studio-lab2-corpus-v1");
  }
  if (!Array.isArray(s.scenarios) || s.scenarios.length < 1) {
    errors.push("scenarios[] required");
    return errors;
  }

  const covered = new Set<string>();
  const texts = new Map<string, string>();
  const ids = new Set<string>();
  for (const scenario of s.scenarios) {
    if (!scenario?.id || ids.has(scenario.id)) errors.push(`duplicate or empty scenario id ${scenario?.id}`);
    ids.add(scenario.id);
    if (!Array.isArray(scenario.rc_df) || scenario.rc_df.length < 1) {
      errors.push(`${scenario.id}: rc_df required`);
    }
    for (const df of scenario.rc_df ?? []) covered.add(df);
    if (!scenario.instruction?.trim()) errors.push(`${scenario.id}: instruction required`);
    if (!Array.isArray(scenario.paraphrases) || scenario.paraphrases.length < 3) {
      errors.push(`${scenario.id}: paraphrases must have ≥3 entries`);
    }
    const allTexts = [scenario.instruction, ...(scenario.paraphrases ?? [])];
    for (const text of allTexts) {
      const key = text.trim();
      if (!key) {
        errors.push(`${scenario.id}: empty instruction/paraphrase`);
        continue;
      }
      const owner = texts.get(key);
      if (owner && owner !== scenario.id) {
        errors.push(`instruction collision ${JSON.stringify(key)} (${owner} vs ${scenario.id})`);
      }
      texts.set(key, scenario.id);
    }
    if (!isIntentKind(scenario.facade_intent?.kind)) {
      errors.push(`${scenario.id}: facade_intent.kind invalid`);
    }
    if (!isOrderKind(scenario.expected_order)) {
      errors.push(`${scenario.id}: expected_order invalid`);
    }
    if (typeof scenario.expected_clarification?.required !== "boolean") {
      errors.push(`${scenario.id}: expected_clarification.required required`);
    }
    if (!Array.isArray(scenario.forbidden_ops)) errors.push(`${scenario.id}: forbidden_ops required`);
    if (!Array.isArray(scenario.expected_post_ids)) errors.push(`${scenario.id}: expected_post_ids required`);
    if (!Array.isArray(scenario.expected_db_assertions)) {
      errors.push(`${scenario.id}: expected_db_assertions required`);
    }
  }

  for (const df of REQUIRED_RC_DF_03_13) {
    if (!covered.has(df)) errors.push(`eval corpus missing ${df}`);
  }
  return errors;
}

export function loadCommandEvalCorpus(fixturePath?: string): CommandEvalCorpus {
  const path = fixturePath?.trim() || defaultRelayCommandEvalCorpusPath();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CommandEvalCorpus;
  const errors = validateCommandEvalCorpus(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid Relay Command eval corpus (${path}):\n${errors.join("\n")}`);
  }
  return parsed;
}

export function lookupEvalScenario(
  corpus: CommandEvalCorpus,
  instructionOrId: string
): CommandEvalScenario | null {
  const needle = instructionOrId.trim();
  if (!needle) return null;
  for (const scenario of corpus.scenarios) {
    if (scenario.id === needle) return scenario;
    if (scenario.instruction === needle) return scenario;
    if (scenario.paraphrases.includes(needle)) return scenario;
  }
  return null;
}

export function heroAcademyXPlanIds(lab2: StudioLab2Corpus): string[] {
  const skip = new Set(lab2.eval.already_on_x_post_ids);
  return lab2.eval.hero_academy_ordered_ids.filter((id) => id !== "sl2_ha_cover" && !skip.has(id));
}

export function weakPromoPostIds(lab2: StudioLab2Corpus): string[] {
  return lab2.metrics.filter((m) => m.pattern === "weak_promo").map((m) => m.post_id);
}

export function expandEvalPostIds(refs: readonly string[], lab2: StudioLab2Corpus): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    switch (ref) {
      case "$eval.watercolor_post_ids":
        out.push(...lab2.eval.watercolor_post_ids);
        break;
      case "$eval.hero_academy_ordered_ids":
        out.push(...lab2.eval.hero_academy_ordered_ids);
        break;
      case "$eval.already_on_x_post_ids":
        out.push(...lab2.eval.already_on_x_post_ids);
        break;
      case "$eval.hero_academy_x_plan_ids":
        out.push(...heroAcademyXPlanIds(lab2));
        break;
      case "$eval.weak_promo_post_ids":
        out.push(...weakPromoPostIds(lab2));
        break;
      case "$eval.gated_original_post_ids":
        out.push(...lab2.eval.gated_original_post_ids);
        break;
      case "$eval.imported_revise_post_id":
        out.push(lab2.eval.imported_revise_post_id);
        break;
      case "$eval.native_revise_post_id":
        out.push(lab2.eval.native_revise_post_id);
        break;
      default:
        if (ref.startsWith("$eval.")) {
          throw new Error(`Unknown eval post id ref ${ref}`);
        }
        out.push(ref);
    }
  }
  return out;
}

export function expandEvalScalar(ref: string | undefined, lab2: StudioLab2Corpus): string | undefined {
  if (!ref) return undefined;
  if (!ref.startsWith("$eval.")) return ref;
  const expanded = expandEvalPostIds([ref], lab2);
  return expanded[0];
}
