/**
 * @fileoverview Relay Coach attack-formula catalog (product IP).
 *
 * The LLM fills slots on these formulae — it must not invent new formula ids.
 * Keep `web/lib/coach-attack-formulae.ts` in sync (same ids / labels / slots).
 */

/** Mirrors web `CoachPathId` — path picker batches 1–2 synergistic goals. */
export type CoachPathId = "engage" | "reach" | "localize" | "trend";

export type AttackFormulaId =
  | "hook_proof_cta"
  | "format_first_line"
  | "question_hook"
  | "cold_scroll_explain"
  | "craft_lead"
  | "locale_bridge"
  | "locale_casual"
  | "moment_frame"
  | "moment_soft_nod";

export type AttackFormula = {
  id: AttackFormulaId;
  label: string;
  /** One-line card subtitle for creators. */
  description: string;
  /** Paths this formula may be proposed for. */
  pathAffinity: readonly CoachPathId[];
  /** Ordered structure steps (shown in Review + injected into the propose prompt). */
  structureSlots: readonly string[];
  /** Slot-fill guidance for the LLM (not shown verbatim to creators). */
  copyHint: string;
  /**
   * Higher = likelier Recommended default for an eligible path.
   * Used only when ranking candidates; UI still honors server `recommended` flag.
   */
  recommendWeight: number;
};

/**
 * Product-owned formulae. Propose must return `formula_id` values from this set only.
 */
export const ATTACK_FORMULAE: readonly AttackFormula[] = [
  {
    id: "hook_proof_cta",
    label: "Hook → proof → CTA",
    description: "Sharp opener, one concrete detail, soft invite.",
    pathAffinity: ["engage", "reach"],
    structureSlots: ["Hook line", "One concrete detail", "Soft CTA"],
    copyHint:
      "Open with a platform-native hook, add one specific detail from the piece, end with a light CTA (no hard sell).",
    recommendWeight: 10
  },
  {
    id: "format_first_line",
    label: "Format-first line",
    description: "Lead with the line that works in-feed, then a trimmed body.",
    pathAffinity: ["engage"],
    structureSlots: ["In-feed first line", "Trimmed body", "Optional tag/close"],
    copyHint:
      "Optimize the first line for the destination format (character limit / feed skim). Keep the body shorter than the source when needed.",
    recommendWeight: 8
  },
  {
    id: "question_hook",
    label: "Question hook",
    description: "Open with a question that invites a reply or save.",
    pathAffinity: ["engage", "reach"],
    structureSlots: ["Question opener", "Answer beat from the piece", "Invite to engage"],
    copyHint:
      "Start with a genuine question tied to the artwork, answer it briefly with a detail from the piece, invite a reply or follow.",
    recommendWeight: 6
  },
  {
    id: "cold_scroll_explain",
    label: "Cold-scroll explain",
    description: "What it is → why it matters → where to see more.",
    pathAffinity: ["reach"],
    structureSlots: ["What it is", "Why it matters", "Where to see more"],
    copyHint:
      "Assume a cold viewer. Name the piece plainly, give one reason to care, point to the fuller post or profile without jargon.",
    recommendWeight: 10
  },
  {
    id: "craft_lead",
    label: "Craft lead",
    description: "Lead with process or craft, then the piece.",
    pathAffinity: ["reach", "engage"],
    structureSlots: ["Craft or process beat", "The piece", "Soft invite"],
    copyHint:
      "Lead with a craft/process detail that rewards artists and curious fans, then name the piece, then a soft invite.",
    recommendWeight: 5
  },
  {
    id: "locale_bridge",
    label: "Locale bridge",
    description: "Localized hook with proper nouns preserved.",
    pathAffinity: ["localize"],
    structureSlots: ["Localized hook", "Preserved names/terms", "Localized close"],
    copyHint:
      "Write in the target locale. Preserve proper nouns, series titles, and creator handle spelling. Keep tone neutral-clear.",
    recommendWeight: 10
  },
  {
    id: "locale_casual",
    label: "Locale casual",
    description: "Same bridge, warmer / more conversational tone.",
    pathAffinity: ["localize"],
    structureSlots: ["Casual localized opener", "Preserved names/terms", "Friendly close"],
    copyHint:
      "Same localization rules as locale_bridge, but warmer and more conversational — still preserve proper nouns exactly.",
    recommendWeight: 7
  },
  {
    id: "moment_frame",
    label: "Moment frame",
    description: "Explicit nod to the moment, then the piece, then invite.",
    pathAffinity: ["trend"],
    structureSlots: ["Moment nod", "The piece", "Invite"],
    copyHint:
      "Frame around the creator-named moment only (do not invent trends). Tie the piece to that moment, then invite engagement.",
    recommendWeight: 10
  },
  {
    id: "moment_soft_nod",
    label: "Soft moment nod",
    description: "Light topical framing without forcing the trend.",
    pathAffinity: ["trend"],
    structureSlots: ["Soft topical cue", "The piece", "Soft CTA"],
    copyHint:
      "Use a light cue from the creator-named moment; keep the piece primary. Do not invent hashtags or trend stats.",
    recommendWeight: 7
  }
] as const;

const FORMULA_BY_ID: ReadonlyMap<AttackFormulaId, AttackFormula> = new Map(
  ATTACK_FORMULAE.map((f) => [f.id, f])
);

const FORMULA_ID_SET = new Set<string>(ATTACK_FORMULAE.map((f) => f.id));

/** Max copy variants proposed per destination (UI + prompt clamp). */
export const COACH_VARIANTS_PER_DESTINATION_MAX = 4;

/** Min variants when deterministic fallback fills samples. */
export const COACH_VARIANTS_PER_DESTINATION_MIN = 2;

export function isAttackFormulaId(value: string): value is AttackFormulaId {
  return FORMULA_ID_SET.has(value);
}

export function getAttackFormula(id: AttackFormulaId): AttackFormula {
  const formula = FORMULA_BY_ID.get(id);
  if (!formula) {
    throw new Error(`Unknown attack formula: ${id}`);
  }
  return formula;
}

export function tryGetAttackFormula(id: string): AttackFormula | null {
  if (!isAttackFormulaId(id)) return null;
  return FORMULA_BY_ID.get(id) ?? null;
}

/** Formulae eligible for a Coach path, highest recommendWeight first. */
export function formulaeForPath(pathId: CoachPathId): AttackFormula[] {
  return ATTACK_FORMULAE.filter((f) => f.pathAffinity.includes(pathId)).sort(
    (a, b) => b.recommendWeight - a.recommendWeight || a.id.localeCompare(b.id)
  );
}

/**
 * Candidate formulae for propose (2–4). Prefer higher recommendWeight;
 * always includes the path's top-weighted formula when any exist.
 */
export function pickFormulaCandidates(
  pathId: CoachPathId,
  max = COACH_VARIANTS_PER_DESTINATION_MAX
): AttackFormula[] {
  const eligible = formulaeForPath(pathId);
  const limit = Math.max(
    COACH_VARIANTS_PER_DESTINATION_MIN,
    Math.min(max, COACH_VARIANTS_PER_DESTINATION_MAX)
  );
  return eligible.slice(0, Math.min(limit, eligible.length));
}

/** Default Recommended formula id for a path (highest weight), or null if none. */
export function defaultRecommendedFormulaId(pathId: CoachPathId): AttackFormulaId | null {
  return formulaeForPath(pathId)[0]?.id ?? null;
}

/** Prompt block: list candidate formulae with slots + copy hints. */
export function formatFormulaeForPrompt(pathId: CoachPathId): string {
  const candidates = pickFormulaCandidates(pathId);
  if (candidates.length === 0) return "No formulae available for this path.";
  return candidates
    .map((f, i) => {
      const slots = f.structureSlots.join(" → ");
      return `${i + 1}. id=${f.id} | ${f.label}\n   structure: ${slots}\n   fill: ${f.copyHint}`;
    })
    .join("\n");
}

export function isCoachPathId(value: string): value is CoachPathId {
  return value === "engage" || value === "reach" || value === "localize" || value === "trend";
}
