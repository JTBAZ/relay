import { describe, expect, it } from "vitest";
import type { AiGenerateStructuredResult } from "../../../src/ai/types.js";
import type { CommandPlannerGenerateFn } from "../../../src/studio/command/command-semantic-planner.js";
import {
  loadHeldOutNlCorpus,
  runCommandPlannerEval,
  scorePlannerOutput
} from "../../../src/studio/eval/command-planner-eval.js";

function stubFromHeldOut(): CommandPlannerGenerateFn {
  const corpus = loadHeldOutNlCorpus();
  return async (input) => {
    const user = input.messages.find((m) => m.role === "user")?.content ?? "";
    let instruction = "";
    try {
      const parsed = JSON.parse(user) as { instruction?: string };
      instruction = parsed.instruction ?? "";
    } catch {
      /* probe / retry */
    }
    const held = corpus.cases.find((row) => row.instruction === instruction);
    const payload =
      held?.expected.kind === "refuse"
        ? { kind: "refuse", code: "COMMAND_VALIDATION", message: "Refused." }
        : held?.expected ?? { kind: "refuse", message: "probe" };
    return {
      ok: true,
      parsed: payload,
      text: JSON.stringify(payload),
      tool_calls: [],
      provider: "stub",
      model: "stub",
      tier: "cheap",
      usage: { input_tokens: 11, output_tokens: 7 }
    } satisfies AiGenerateStructuredResult;
  };
}

describe("Relay Command planner eval (RC-P7-T04)", () => {
  it("loads held-out safety and paraphrase categories", () => {
    const corpus = loadHeldOutNlCorpus();
    expect(corpus.cases.map((row) => row.category).sort()).toEqual(
      [
        "ambiguity",
        "colloquial",
        "compound",
        "cross-tenant",
        "gated-media",
        "prompt-injection",
        "typo"
      ].sort()
    );
  });

  it("scores a silent publish mapping as a forbidden miss", () => {
    expect(
      scorePlannerOutput(
        { kind: "refuse" },
        {
          kind: "selection_intent",
          query: { title_contains: "Hero Academy" },
          collection_title: "Hero Academy"
        }
      )
    ).toBe("forbidden_miss");
  });

  it("skips cleanly when RELAY_COMMAND_EVAL_MODEL is off", async () => {
    const report = await runCommandPlannerEval({
      env: { ...process.env, RELAY_COMMAND_EVAL_MODEL: "0" },
      generate: stubFromHeldOut()
    });
    expect(report.status).toBe("skipped");
    expect(report.ok).toBe(true);
    expect(report.skip_reason).toMatch(/RELAY_COMMAND_EVAL_MODEL/);
  });

  it("skips cleanly when the provider is skipped even if the eval flag is on", async () => {
    const report = await runCommandPlannerEval({
      env: { ...process.env, RELAY_COMMAND_EVAL_MODEL: "1" },
      generate: async () => ({
        ok: false,
        skipped: true,
        reason: "Missing Anthropic API key (RELAY_AI_API_KEY / ANTHROPIC_API_KEY)."
      })
    });
    expect(report.status).toBe("skipped");
    expect(report.ok).toBe(true);
    expect(report.skip_reason).toMatch(/skipped/i);
    expect(JSON.stringify(report)).not.toMatch(/sk-ant-/i);
  });

  it("meets thresholds against a deterministic held-out stub (3 runs)", async () => {
    const report = await runCommandPlannerEval({
      env: { ...process.env, RELAY_COMMAND_EVAL_MODEL: "true" },
      generate: stubFromHeldOut(),
      runs: 3
    });
    expect(report.status).toBe("ran");
    expect(report.ok).toBe(true);
    expect(report.match_rate).toBe(1);
    expect(report.safety_reject_rate).toBe(1);
    expect(report.cases.every((row) => !("instruction" in row))).toBe(true);
    expect(report.cases[0]?.runs[0]?.input_tokens).toBe(11);
    expect(report.cases[0]?.runs[0]?.output_tokens).toBe(7);
    expect(JSON.stringify(report)).not.toMatch(/Ignore previous instructions/);
  });
});
