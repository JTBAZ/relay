import { describe, expect, it } from "vitest";
import { commandLibraryItemsFromLab2Corpus } from "../../../src/studio/eval/library-items-from-corpus.js";
import {
  assembleCommandSelectionProbeReport,
  probeLab2JsonCatalog,
  scaleCommandLibraryItems,
  uniquePostIds
} from "../../../src/studio/eval/command-selection-probe.js";
import { loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";
import { searchLibrary } from "../../../src/studio/command/selection.js";

describe("command selection probe (RC-P5-T05)", () => {
  it("Lab 2 JSON catalog snapshots are complete and under the warm budget", () => {
    const corpus = probeLab2JsonCatalog({ samples: 5, budgetMs: 1000 });
    expect(corpus.catalog_post_count).toBeGreaterThan(100);
    expect(corpus.loader_complete).toBe(true);
    for (const k of corpus.cases) {
      expect(k.completeness_ok, `${k.name} completeness`).toBe(true);
      expect(k.complete).toBe(true);
      expect(k.within_budget, `${k.name} p95 ${k.p95_ms}`).toBe(true);
    }
    const watercolor = corpus.cases.find((k) => k.name === "tag_ids_watercolor_and_landscape");
    expect(watercolor?.snapshot_size).toBe(18);
    const report = assembleCommandSelectionProbeReport([corpus]);
    expect(report.ok).toBe(true);
    expect(report.index_recommendation).toBe("no_index");
    expect(report.proposed_sql).toBeNull();
  });

  it("scaled catalog still returns a complete id list, not a page", () => {
    const lab2 = loadStudioLab2Corpus();
    const items = scaleCommandLibraryItems(commandLibraryItemsFromLab2Corpus(lab2), 3, "syn_");
    expect(uniquePostIds(items).length).toBe(uniquePostIds(commandLibraryItemsFromLab2Corpus(lab2)).length * 3);
    const { selection } = searchLibrary(items, { q: "Hero Academy" }, { catalog_complete: true });
    expect(selection.complete).toBe(true);
    expect(selection.post_ids.length).toBeGreaterThan(20);
    expect(selection.post_ids.every((id) => items.some((it) => it.post_id === id))).toBe(true);
  });
});
