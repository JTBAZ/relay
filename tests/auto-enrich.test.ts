import { describe, expect, it } from "vitest";
import { enrichBatch } from "../src/ingest/auto-enrich.js";
import type { IngestTier, SyncBatchInput } from "../src/ingest/types.js";
import { RELAY_TIER_ALL_PATRONS } from "../src/patreon/relay-access-tiers.js";

function makeBatch(overrides: Partial<SyncBatchInput> = {}): SyncBatchInput {
  return {
    creator_id: "cr_test",
    ...overrides
  };
}

const tier = (id: string, amount_cents?: number): IngestTier => ({
  tier_id: id,
  title: id,
  upstream_updated_at: "2026-01-01T00:00:00Z",
  ...(amount_cents !== undefined ? { amount_cents } : {})
});

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

    const { batch: result } = enrichBatch(batch);
    expect(result.posts![0].tag_ids).toEqual(["art"]);
    expect(result.posts![0].tag_ids).not.toContain("cover");
  });

  it("leaves batches without posts unchanged", () => {
    const batch = makeBatch({ posts: undefined });
    const { batch: result, notes } = enrichBatch(batch);
    expect(result).toEqual(batch);
    expect(notes).toEqual([]);
  });

  it("expands relay_tier_all_patrons using batch tiers and appends revision suffix", () => {
    const batch = makeBatch({
      tiers: [tier("patreon_tier_5", 500), tier("relay_tier_all_patrons")],
      posts: [
        {
          post_id: "patreon_post_1",
          title: "Paid",
          published_at: "2026-03-30T12:00:00Z",
          tag_ids: [],
          tier_ids: [RELAY_TIER_ALL_PATRONS],
          upstream_revision: "rev1",
          media: []
        }
      ]
    });
    const { batch: out, notes } = enrichBatch(batch);
    expect(out.posts![0].tier_ids).toEqual(["patreon_tier_5"]);
    expect(out.posts![0].upstream_revision).toContain(":tier_expand");
    expect(notes.some((n) => n.includes("Tier normalize: expanded"))).toBe(true);
    expect(notes.some((n) => n.includes("paid Patreon tier"))).toBe(true);
  });

  it("does not expand all_patrons when only free ($0) patreon tiers exist in catalog", () => {
    const batch = makeBatch({
      tiers: [tier("patreon_tier_free", 0), tier("relay_tier_all_patrons")],
      posts: [
        {
          post_id: "patreon_post_1",
          title: "Paid",
          published_at: "2026-03-30T12:00:00Z",
          tag_ids: [],
          tier_ids: [RELAY_TIER_ALL_PATRONS],
          upstream_revision: "rev1",
          media: []
        }
      ]
    });
    const { batch: out, notes } = enrichBatch(batch);
    expect(out.posts![0].tier_ids).toEqual([RELAY_TIER_ALL_PATRONS]);
    expect(out.posts![0].upstream_revision).not.toContain(":tier_expand");
    expect(notes.some((n) => n.includes("no paid tiers with amount_cents>0"))).toBe(true);
  });
});
