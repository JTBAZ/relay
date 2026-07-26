import { describe, expect, it } from "vitest";
import {
  ATTACK_FORMULAE,
  COACH_VARIANTS_PER_DESTINATION_MAX,
  COACH_VARIANTS_PER_DESTINATION_MIN,
  defaultRecommendedFormulaId,
  formulaeForPath,
  formatFormulaeForPrompt,
  isAttackFormulaId,
  pickFormulaCandidates,
  tryGetAttackFormula,
  type CoachPathId
} from "../src/distribution/coach-attack-formulae.js";

const PATHS: CoachPathId[] = ["engage", "reach", "localize", "trend"];

describe("coach-attack-formulae", () => {
  it("has unique formula ids", () => {
    const ids = ATTACK_FORMULAE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every formula has non-empty structure slots and path affinity", () => {
    for (const f of ATTACK_FORMULAE) {
      expect(f.structureSlots.length).toBeGreaterThan(0);
      expect(f.pathAffinity.length).toBeGreaterThan(0);
      expect(f.label.trim()).not.toBe("");
      expect(f.copyHint.trim()).not.toBe("");
    }
  });

  it("each Coach path has at least two candidate formulae", () => {
    for (const path of PATHS) {
      const candidates = pickFormulaCandidates(path);
      expect(candidates.length).toBeGreaterThanOrEqual(COACH_VARIANTS_PER_DESTINATION_MIN);
      expect(candidates.length).toBeLessThanOrEqual(COACH_VARIANTS_PER_DESTINATION_MAX);
      expect(defaultRecommendedFormulaId(path)).toBe(candidates[0]?.id ?? null);
    }
  });

  it("formulaeForPath only returns affinity matches, weight-desc", () => {
    const engage = formulaeForPath("engage");
    expect(engage.every((f) => f.pathAffinity.includes("engage"))).toBe(true);
    for (let i = 1; i < engage.length; i++) {
      expect(engage[i - 1]!.recommendWeight).toBeGreaterThanOrEqual(engage[i]!.recommendWeight);
    }
  });

  it("isAttackFormulaId / tryGetAttackFormula gate unknown ids", () => {
    expect(isAttackFormulaId("hook_proof_cta")).toBe(true);
    expect(isAttackFormulaId("not_a_formula")).toBe(false);
    expect(tryGetAttackFormula("moment_frame")?.label).toBe("Moment frame");
    expect(tryGetAttackFormula("nope")).toBeNull();
  });

  it("formatFormulaeForPrompt lists candidate ids for the path", () => {
    const block = formatFormulaeForPrompt("trend");
    expect(block).toContain("id=moment_frame");
    expect(block).toContain("structure:");
  });
});
