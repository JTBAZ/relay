import { describe, expect, it } from "vitest";
import { enrichBatch } from "../src/ingest/auto-enrich.js";
import type { SyncBatchInput } from "../src/ingest/types.js";

function makeBatch(overrides: Partial<SyncBatchInput> = {}): SyncBatchInput {
  return {
    creator_id: "cr_test",
    ...overrides
  };
}

describe("enrichBatch", () => {
  it("does not add post-level 'cover' tag (gallery derives cover chip per media row)", () => {
    const batch = makeBatch({
      posts: [
        {
          post_id: "p1",
          title: "Art post",
          published_at: "2026-03-30T12:00:00Z",
          tag_ids: ["art"],
          tier_ids: [],
          upstream_revision: "rev1",
          media: [
            { media_id: "m1", upstream_revision: "mr1", role: "cover" },
            { media_id: "m2", upstream_revision: "mr2" }
          ]
        }
      ]
    });

    const result = enrichBatch(batch);
    expect(result.posts![0].tag_ids).toEqual(["art"]);
    expect(result.posts![0].tag_ids).not.toContain("cover");
  });

  it("leaves batches without posts unchanged", () => {
    const batch = makeBatch({ posts: undefined });
    const result = enrichBatch(batch);
    expect(result).toEqual(batch);
  });
});
