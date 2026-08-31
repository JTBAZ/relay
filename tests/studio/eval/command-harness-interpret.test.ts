import { describe, expect, it } from "vitest";
import { interpretLab2HarnessInstruction } from "../../../src/studio/eval/command-harness-interpret.js";

describe("Lab 2 harness interpret (RC-P3-T06)", () => {
  it("clarifies Academy without picking a series", () => {
    const result = interpretLab2HarnessInstruction({
      instruction: "Organize Academy into a collection."
    });
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.candidate_labels.sort()).toEqual(["Academy Studies", "Hero Academy"]);
  });

  it("organizes Hero Academy with gap warnings and a collection ChangeSet", () => {
    const result = interpretLab2HarnessInstruction({
      instruction: "Organize Hero Academy into a collection, cover first, in page order."
    });
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.apply_ready).toBe(true);
    expect(result.lens_hint).toBe("collections");
    expect(result.resolved_post_ids).not.toContain("sl2_ha_p17");
    expect(result.warnings.some((w) => /Missing page 17/.test(w))).toBe(true);
    expect(result.ops[0]?.payload.collection_id).toBe("sl2_col_hero_academy");
  });

  it("continues from Academy clarification to Hero Academy", () => {
    const result = interpretLab2HarnessInstruction({
      instruction: "Organize Academy into a collection.",
      clarification_choice: "Hero Academy"
    });
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.lens_hint).toBe("collections");
    expect(result.ops[0]?.payload.collection_id).toBe("sl2_col_hero_academy");
  });

  it("refuses gated originals and unknown sentences", () => {
    const gated = interpretLab2HarnessInstruction({
      instruction: "Use the gated studio-shot originals as the public X destination media."
    });
    expect(gated.kind).toBe("error");
    if (gated.kind === "error") expect(gated.code).toBe("COMMAND_GATED_MEDIA");

    const unknown = interpretLab2HarnessInstruction({ instruction: "cluster similar works" });
    expect(unknown.kind).toBe("error");
  });

  it("discloses skip list and metric window on weekly X without inventing a minute", () => {
    const result = interpretLab2HarnessInstruction({
      instruction: "Plan a weekly X schedule for Hero Academy, skipping pages already posted on X."
    });
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.apply_ready).toBe(true);
    expect(result.lens_hint).toBe("schedule");
    expect(result.warnings.some((w) => /Skipping 6 posts already posted on X/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /Tuesday-evening timing cluster/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /7:03/.test(w))).toBe(false);
  });
});
