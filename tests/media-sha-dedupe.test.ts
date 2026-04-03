import { describe, expect, it } from "vitest";
import { collapseDuplicateMediaIdsBySha } from "../src/gallery/media-sha-dedupe.js";
import type { CreatorExportIndex } from "../src/export/types.js";

describe("collapseDuplicateMediaIdsBySha", () => {
  it("removes duplicate SHA, preferring non-cover over cover", () => {
    const index: CreatorExportIndex = {
      creator_id: "c1",
      media: {
        patreon_1_cover: {
          media_id: "patreon_1_cover",
          creator_id: "c1",
          sha256: "aaa",
          byte_length: 100,
          relative_blob_path: "x",
          upstream_revision: "r",
          exported_at: "2024-01-01T00:00:00.000Z"
        },
        patreon_media_9: {
          media_id: "patreon_media_9",
          creator_id: "c1",
          sha256: "aaa",
          byte_length: 100,
          relative_blob_path: "y",
          upstream_revision: "r",
          exported_at: "2024-01-01T00:00:00.000Z"
        }
      }
    };
    const roles = (id: string) => (id.endsWith("_cover") ? "cover" : undefined);
    const out = collapseDuplicateMediaIdsBySha(
      ["patreon_1_cover", "patreon_media_9"],
      index,
      roles
    );
    expect(out).toEqual(["patreon_media_9"]);
  });

  it("keeps all when SHA missing from index", () => {
    const index: CreatorExportIndex = { creator_id: "c1", media: {} };
    const ids = ["a", "b"];
    expect(collapseDuplicateMediaIdsBySha(ids, index, () => undefined)).toEqual(ids);
  });
});
