import { describe, expect, it } from "vitest";
import {
  loadCommandEvalCorpus,
  lookupEvalScenario,
  REQUIRED_RC_DF_03_13,
  validateCommandEvalCorpus
} from "../../../src/studio/eval/command-eval-corpus.js";
import { runCommandEvalFacade } from "../../../src/studio/eval/command-eval-runner.js";
import { loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";
import { factPackFromLab2Posts } from "../../../src/studio/eval/fact-pack-from-lab2.js";
import { commandLibraryItemsFromLab2Corpus } from "../../../src/studio/eval/library-items-from-corpus.js";
import { commandCapabilityFacade } from "../../../src/studio/command/capability-facade.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

describe("Relay Command eval corpus (RC-P3-T04)", () => {
  const corpus = loadCommandEvalCorpus();

  it("covers RC-DF-03–13 with ≥3 paraphrases each", () => {
    const errors = validateCommandEvalCorpus(corpus);
    expect(errors, errors.join("\n")).toEqual([]);
    const covered = new Set(corpus.scenarios.flatMap((s) => s.rc_df));
    for (const df of REQUIRED_RC_DF_03_13) {
      expect(covered.has(df), `missing ${df}`).toBe(true);
    }
    for (const scenario of corpus.scenarios) {
      expect(scenario.paraphrases.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("maps each instruction and paraphrase to the same scenario id", () => {
    for (const scenario of corpus.scenarios) {
      expect(lookupEvalScenario(corpus, scenario.id)?.id).toBe(scenario.id);
      expect(lookupEvalScenario(corpus, scenario.instruction)?.id).toBe(scenario.id);
      for (const phrase of scenario.paraphrases) {
        expect(lookupEvalScenario(corpus, phrase)?.id).toBe(scenario.id);
      }
    }
    expect(lookupEvalScenario(corpus, "Organize something I just made up")).toBeNull();
  });

  it("does not silently map Academy paraphrases onto Hero Academy", () => {
    const academy = lookupEvalScenario(corpus, "Organize Academy into a collection.");
    const hero = lookupEvalScenario(
      corpus,
      "Organize Hero Academy into a collection, cover first, in page order."
    );
    expect(academy?.id).toBe("rc-df-03-ambiguous-academy");
    expect(hero?.id).toBe("rc-df-03-exact-hero-academy");
    expect(academy?.id).not.toBe(hero?.id);
  });
});

describe("Relay Command facade-only runner", () => {
  it("passes --facade-only against the Lab 2 JSON corpus without an LLM", async () => {
    const report = await runCommandEvalFacade({ facadeOnly: true, requireDb: false });
    const failed = report.scenarios.filter((s) => !s.ok);
    expect(failed, failed.map((s) => `${s.id}: ${s.errors.join("; ")}`).join("\n")).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.live_model).toBe("skipped");
    expect(report.db.status).toBe("skipped");
    expect(report.scenario_count).toBeGreaterThanOrEqual(13);
    expect(report.lab2_fixture_hash).toBe(loadStudioLab2Corpus().fixture_hash);
  });

  it("clarifies Academy and organizes watercolor without a question", async () => {
    const report = await runCommandEvalFacade({ facadeOnly: true, requireDb: false });
    const academy = report.scenarios.find((s) => s.id === "rc-df-03-ambiguous-academy");
    const watercolor = report.scenarios.find((s) => s.id === "rc-df-04-watercolor-organize");
    expect(academy?.clarification).toBe(true);
    expect(academy?.post_ids).toEqual([]);
    expect(watercolor?.clarification).toBe(false);
    expect(watercolor?.write_layer).toBe("collection");
    expect(watercolor?.post_ids).toHaveLength(18);
  });

  it("reports Hero Academy gap 17 and duplicate 8 without inventing a page", async () => {
    const report = await runCommandEvalFacade({ facadeOnly: true, requireDb: false });
    const seq = report.scenarios.find((s) => s.id === "rc-df-06-missing-duplicate-pages");
    expect(seq?.ok).toBe(true);
    expect(seq?.post_ids).not.toContain("sl2_ha_p17");
    expect(seq?.post_ids.filter((id) => id.includes("p08")).length).toBe(1);
  });

  it("skips already-on-X pages and refuses gated originals", async () => {
    const report = await runCommandEvalFacade({ facadeOnly: true, requireDb: false });
    const skip = report.scenarios.find((s) => s.id === "rc-df-07-skip-posted-on-x");
    const gated = report.scenarios.find((s) => s.id === "rc-df-11-gated-originals");
    const lab2 = loadStudioLab2Corpus();
    expect(skip?.ok).toBe(true);
    for (const id of lab2.eval.already_on_x_post_ids) {
      expect(skip?.post_ids).not.toContain(id);
    }
    expect(gated?.ok).toBe(true);
    expect(gated?.write_layer).toBeNull();
  });

  it("routes imported vs native revises and discloses weak analytics", async () => {
    const report = await runCommandEvalFacade({ facadeOnly: true, requireDb: false });
    expect(report.scenarios.find((s) => s.id === "rc-df-10-imported-rename")?.write_layer).toBe(
      "presentation"
    );
    expect(report.scenarios.find((s) => s.id === "rc-df-10-native-rename")?.write_layer).toBe(
      "native_version"
    );
    const weak = report.scenarios.find((s) => s.id === "rc-df-08-weak-analytics-fallback");
    expect(weak?.ok).toBe(true);
    const lab2 = loadStudioLab2Corpus();
    const pack = factPackFromLab2Posts(
      lab2,
      lab2.metrics.filter((m) => m.pattern === "weak_promo").map((m) => m.post_id),
      "pack_eval_weak_promo"
    );
    expect(pack.coverage).toBe("weak");
    expect(pack.window_suggestion.fallback).toBe(true);
    expect(pack.window_suggestion.weekday).toBeNull();
  });

  it("JSON library items match watercolor search used by P2 seed-eval", () => {
    const lab2 = loadStudioLab2Corpus();
    const items = commandLibraryItemsFromLab2Corpus(lab2);
    const watercolor = commandCapabilityFacade.search_library(items, {
      tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"]
    });
    expect(watercolor.records.map((r) => r.post_id).sort()).toEqual(
      [...lab2.eval.watercolor_post_ids].sort()
    );
  });
});

describe.skipIf(!hasDatabaseUrl)("Relay Command facade-only runner (seeded DB)", () => {
  it("passes --facade-only against the seeded Lab 2 creator", async () => {
    const report = await runCommandEvalFacade({ facadeOnly: true, requireDb: true });
    const failed = report.scenarios.filter((s) => !s.ok);
    expect(failed, failed.map((s) => `${s.id}: ${s.errors.join("; ")}`).join("\n")).toEqual([]);
    expect(report.db.status, report.db.errors.join("\n")).toBe("ok");
    expect(report.ok).toBe(true);
  });
});
