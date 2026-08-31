import { describe, expect, it } from "vitest";
import { CommandContractError } from "../../../src/studio/command/contracts.js";
import { searchLibrary, type CommandLibraryItem } from "../../../src/studio/command/selection.js";
import {
  assertSelectionRevision,
  selectionChecksum
} from "../../../src/studio/command/selection-snapshot.js";
import type { GalleryItem } from "../../../src/gallery/types.js";

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
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/t",
    visibility: overrides.visibility ?? "visible",
    collection_ids: overrides.collection_ids ?? [],
    collection_theme_tag_ids: [],
    distribution_summary: overrides.distribution_summary,
    member_label: overrides.member_label
  };
  return { ...base, ...overrides };
}

const watercolor = item({
  post_id: "post_watercolor",
  media_id: "media_watercolor",
  title: "River watercolor",
  tag_ids: ["tag_watercolor"],
  published_at: "2026-04-01T00:00:00.000Z"
});

const heroPage1 = item({
  post_id: "post_ha_1",
  media_id: "media_ha_1",
  title: "Hero Academy Page 1",
  published_at: "2026-01-01T00:00:00.000Z",
  distribution_summary: {
    post_id: "post_ha_1",
    destinations: [
      {
        destination: "x",
        variant_status: "ready",
        attempt_status: "posted",
        attempt_id: "att_x_1",
        external_url: "https://x.com/s/1",
        external_id: "x1"
      }
    ]
  }
});

const heroPage7 = item({
  post_id: "post_ha_7",
  media_id: "media_ha_7",
  title: "Hero Academy Page 7",
  published_at: "2026-02-01T00:00:00.000Z"
});

describe("search_library complete snapshot (RC-P5-T04)", () => {
  it("returns complete=true with checksum, evidence, and creator_id", () => {
    const { selection } = searchLibrary([watercolor, heroPage1], { tag_ids: ["tag_watercolor"] }, {
      creator_id: "cr_dev_ava",
      created_at: "2026-08-30T19:00:00.000Z"
    });
    expect(selection.complete).toBe(true);
    expect(selection.creator_id).toBe("cr_dev_ava");
    expect(selection.created_at).toBe("2026-08-30T19:00:00.000Z");
    expect(selection.revision).toBe(selectionChecksum(["post_watercolor"]));
    expect(selection.match_evidence).toEqual([{ post_id: "post_watercolor", fields: ["tag"] }]);
    expect(selection.explanation).toContain("tag_ids=tag_watercolor");
  });

  it("changes checksum when one id is dropped", () => {
    const full = searchLibrary([watercolor, heroPage1, heroPage7], {
      title_contains: "Hero Academy"
    });
    expect(full.selection.post_ids).toEqual(["post_ha_7", "post_ha_1"]);
    const dropped = searchLibrary([watercolor, heroPage7], { title_contains: "Hero Academy" });
    expect(dropped.selection.post_ids).toEqual(["post_ha_7"]);
    expect(dropped.selection.revision).not.toBe(full.selection.revision);
  });

  it("refuses a truncated catalog instead of paging the id list", () => {
    try {
      searchLibrary([watercolor], { tag_ids: ["tag_watercolor"] }, { catalog_complete: false });
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).code).toBe("COMMAND_VALIDATION");
      expect((err as CommandContractError).details).toEqual([{ field: "complete", issue: "false" }]);
    }
  });

  it("assertSelectionRevision throws COMMAND_STALE_SELECTION on mismatch", () => {
    const { selection } = searchLibrary([watercolor, heroPage1], { tag_ids: ["tag_watercolor"] });
    expect(() => assertSelectionRevision(selection.revision, selection.post_ids)).not.toThrow();
    expect(() => assertSelectionRevision(selection.revision, ["post_watercolor", "post_ha_1"])).toThrow(
      expect.objectContaining({ code: "COMMAND_STALE_SELECTION" })
    );
  });

  it("warns on destination filters and numbered-sequence gaps without inventing pages", () => {
    const posted = searchLibrary([heroPage1, heroPage7], { destination_present: ["x"] });
    expect(posted.selection.warnings.some((w) => /destination_present/.test(w))).toBe(true);
    const absent = searchLibrary([heroPage1, heroPage7], { destination_absent: ["x"] });
    expect(absent.selection.warnings.some((w) => /destination_absent/.test(w))).toBe(true);

    const sequenced = searchLibrary([heroPage1, heroPage7], {
      title_contains: "Hero Academy",
      numbered_sequence: true
    });
    expect(sequenced.selection.post_ids).toEqual(["post_ha_7", "post_ha_1"]);
    expect(sequenced.selection.warnings.some((w) => /Missing page 2, 3, 4, 5, 6/.test(w))).toBe(true);
  });

  it("warns instead of inventing a series pick when numbered_sequence is ambiguous", () => {
    const other = item({
      post_id: "post_other_1",
      media_id: "media_other_1",
      title: "Side Quest Page 1",
      published_at: "2026-01-02T00:00:00.000Z"
    });
    const { selection } = searchLibrary([heroPage1, other], { numbered_sequence: true });
    expect(selection.post_ids.sort()).toEqual(["post_ha_1", "post_other_1"].sort());
    expect(selection.warnings).toContain("Multiple series labels matched; ask which series to use.");
  });
});
