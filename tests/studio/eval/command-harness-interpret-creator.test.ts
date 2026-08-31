import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../../../src/gallery/types.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";
import { interpretCreatorHarnessInstruction } from "../../../src/studio/eval/command-harness-interpret-creator.js";
import {
  interpretLab2HarnessInstruction,
  shouldUseLab2FixtureInterpret
} from "../../../src/studio/eval/command-harness-interpret.js";

function item(overrides: Partial<CommandLibraryItem> = {}): CommandLibraryItem {
  const base: GalleryItem = {
    media_id: overrides.media_id ?? "media_1",
    post_id: overrides.post_id ?? "post_1",
    title: overrides.title ?? "Standalone study",
    published_at: overrides.published_at ?? "2026-03-01T00:00:00.000Z",
    tag_ids: overrides.tag_ids ?? [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "",
    preview_url_path: "",
    thumb_url_path: "",
    visibility: overrides.visibility ?? "visible",
    collection_ids: overrides.collection_ids ?? [],
    collection_theme_tag_ids: [],
    distribution_summary: overrides.distribution_summary
  };
  return { ...base, source: "PATREON", ...overrides };
}

const avaHero = [
  item({
    post_id: "ava_ha_cover",
    media_id: "ava_ha_cover_m",
    title: "Hero Academy Cover",
    published_at: "2026-01-01T00:00:00.000Z"
  }),
  item({
    post_id: "ava_ha_p01",
    media_id: "ava_ha_p01_m",
    title: "Hero Academy Page 1",
    published_at: "2026-01-02T00:00:00.000Z"
  }),
  item({
    post_id: "ava_ha_p02",
    media_id: "ava_ha_p02_m",
    title: "Hero Academy Page 2",
    published_at: "2026-01-03T00:00:00.000Z"
  })
];

describe("Lab 3 creator harness interpret (RC-P5-T01)", () => {
  it("uses creator post IDs and never returns sl2_* for Dev Ava", async () => {
    const result = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Organize Hero Academy into a collection, cover first, in page order.",
      items: avaHero
    });
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.resolved_post_ids).toEqual(["ava_ha_cover", "ava_ha_p01", "ava_ha_p02"]);
    expect(result.resolved_post_ids.every((id) => !id.startsWith("sl2_"))).toBe(true);
    expect(result.ops[0]?.payload.collection_id).toBe("col_hero_academy");
    expect(String(result.ops[0]?.payload.collection_id)).not.toMatch(/^sl2_col_eval_/);
  });

  it("does not invent Lab 2 watercolor IDs when the creator library has no matching tags", async () => {
    const result = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Organize the watercolor landscapes newest first into a collection.",
      items: avaHero
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.code).toBe("COMMAND_VALIDATION");
    expect(result.message).toMatch(/creator data plane/);
  });

  it("refuses Lab 2 fixture IDs when they appear in a non-Lab-2 creator search", async () => {
    const result = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Organize Hero Academy into a collection, cover first, in page order.",
      items: [
        item({
          post_id: "sl2_ha_cover",
          title: "Hero Academy Cover",
          published_at: "2026-01-01T00:00:00.000Z"
        })
      ]
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toMatch(/Lab 2 fixture post IDs/);
  });

  it("clarifies Academy then searches the creator library", async () => {
    const clarify = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Organize Academy into a collection.",
      items: avaHero
    });
    expect(clarify.kind).toBe("clarification");

    const chosen = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Organize Academy into a collection.",
      clarification_choice: "Hero Academy",
      items: avaHero
    });
    expect(chosen.kind).toBe("preview");
    if (chosen.kind !== "preview") return;
    expect(chosen.resolved_post_ids).toEqual(["ava_ha_cover", "ava_ha_p01", "ava_ha_p02"]);
  });

  it("keeps Lab 2 fixture interpret on the lab2 surface", () => {
    expect(shouldUseLab2FixtureInterpret("lab2", "cr_dev_ava")).toBe(true);
    expect(shouldUseLab2FixtureInterpret("lab3", "cr_dev_ava")).toBe(false);
    expect(shouldUseLab2FixtureInterpret("lab3", "rcx_studio_lab2")).toBe(false);
    expect(shouldUseLab2FixtureInterpret("studio", "rcx_studio_lab2")).toBe(true);
    expect(shouldUseLab2FixtureInterpret("studio", "cr_dev_ava")).toBe(false);

    const lab2 = interpretLab2HarnessInstruction({
      instruction: "Organize Hero Academy into a collection, cover first, in page order."
    });
    expect(lab2.kind).toBe("preview");
    if (lab2.kind !== "preview") return;
    expect(lab2.resolved_post_ids.some((id) => id.startsWith("sl2_"))).toBe(true);
    expect(lab2.ops[0]?.payload.collection_id).toBe("sl2_col_hero_academy");
  });
});
