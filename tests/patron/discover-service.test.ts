import { describe, expect, it } from "vitest";
import {
  buildDiscoverPage,
  DEFAULT_CREATOR_CAP,
  DEFAULT_LIMIT,
  MAX_LIMIT
} from "../../src/patron/discover-service.js";
import type { CanonicalSnapshot, PostRow } from "../../src/ingest/canonical-store.js";
import type { GalleryOverridesRoot } from "../../src/gallery/types.js";

function postRow(args: {
  postId: string;
  creatorId: string;
  publishedAt: string;
  tierIds?: string[];
  title?: string;
  description?: string;
  tagIds?: string[];
  mediaIds?: string[];
  status?: "active" | "deleted";
}): PostRow {
  return {
    post_id: args.postId,
    creator_id: args.creatorId,
    upstream_status: args.status ?? "active",
    current: {
      version_seq: 1,
      upstream_revision: "rev1",
      title: args.title ?? args.postId,
      description: args.description,
      published_at: args.publishedAt,
      tag_ids: args.tagIds ?? [],
      tier_ids: args.tierIds ?? [],
      media_ids: args.mediaIds ?? [],
      ingested_at: args.publishedAt
    },
    versions: []
  };
}

function snapshot(rows: PostRow[]): CanonicalSnapshot {
  const s: CanonicalSnapshot = {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {}
  };
  for (const r of rows) {
    if (!s.posts[r.creator_id]) s.posts[r.creator_id] = {};
    s.posts[r.creator_id][r.post_id] = r;
  }
  return s;
}

function overrides(eligible: { creatorId: string; postId: string }[]): GalleryOverridesRoot {
  const root: GalleryOverridesRoot = { creators: {} };
  for (const e of eligible) {
    if (!root.creators[e.creatorId]) {
      root.creators[e.creatorId] = { posts: {} };
    }
    root.creators[e.creatorId].posts[e.postId] = {
      add_tag_ids: [],
      remove_tag_ids: [],
      discovery_eligible: true
    };
  }
  return root;
}

describe("buildDiscoverPage", () => {
  it("returns only posts that are explicitly discoveryEligible AND have no tier requirements", () => {
    const snap = snapshot([
      postRow({ postId: "p_eligible_free", creatorId: "c1", publishedAt: "2026-04-22T00:00:00Z" }),
      postRow({ postId: "p_eligible_tiered", creatorId: "c1", publishedAt: "2026-04-22T00:00:00Z", tierIds: ["t1"] }),
      postRow({ postId: "p_not_optedin", creatorId: "c1", publishedAt: "2026-04-22T00:00:00Z" })
    ]);
    const ov = overrides([
      { creatorId: "c1", postId: "p_eligible_free" },
      { creatorId: "c1", postId: "p_eligible_tiered" }
      // p_not_optedin: no override, no opt-in
    ]);
    const result = buildDiscoverPage(snap, ov, {});
    expect(result.items.map((i) => i.post_id)).toEqual(["p_eligible_free"]);
  });

  it("excludes deleted posts even when opted in", () => {
    const snap = snapshot([
      postRow({
        postId: "p_dead",
        creatorId: "c1",
        publishedAt: "2026-04-22T00:00:00Z",
        status: "deleted"
      })
    ]);
    const ov = overrides([{ creatorId: "c1", postId: "p_dead" }]);
    expect(buildDiscoverPage(snap, ov, {}).items).toEqual([]);
  });

  it("sorts by published_at DESC with deterministic creator/post tiebreak", () => {
    const snap = snapshot([
      postRow({ postId: "old", creatorId: "z", publishedAt: "2026-04-20T00:00:00Z" }),
      postRow({ postId: "newest", creatorId: "a", publishedAt: "2026-04-22T00:00:00Z" }),
      postRow({ postId: "tied_b", creatorId: "b", publishedAt: "2026-04-21T00:00:00Z" }),
      postRow({ postId: "tied_a", creatorId: "a", publishedAt: "2026-04-21T00:00:00Z" })
    ]);
    const ov = overrides([
      { creatorId: "z", postId: "old" },
      { creatorId: "a", postId: "newest" },
      { creatorId: "b", postId: "tied_b" },
      { creatorId: "a", postId: "tied_a" }
    ]);
    const result = buildDiscoverPage(snap, ov, {});
    expect(result.items.map((i) => i.post_id)).toEqual(["newest", "tied_a", "tied_b", "old"]);
  });

  it("applies the creator_cap fairness limit", () => {
    const snap = snapshot([
      postRow({ postId: "p1", creatorId: "spam", publishedAt: "2026-04-22T05:00:00Z" }),
      postRow({ postId: "p2", creatorId: "spam", publishedAt: "2026-04-22T04:00:00Z" }),
      postRow({ postId: "p3", creatorId: "spam", publishedAt: "2026-04-22T03:00:00Z" }),
      postRow({ postId: "p4", creatorId: "spam", publishedAt: "2026-04-22T02:00:00Z" }),
      postRow({ postId: "q1", creatorId: "other", publishedAt: "2026-04-22T01:00:00Z" })
    ]);
    const ov = overrides([
      { creatorId: "spam", postId: "p1" },
      { creatorId: "spam", postId: "p2" },
      { creatorId: "spam", postId: "p3" },
      { creatorId: "spam", postId: "p4" },
      { creatorId: "other", postId: "q1" }
    ]);
    const result = buildDiscoverPage(snap, ov, { creator_cap: 2 });
    // Only the 2 most-recent 'spam' posts survive the cap, then 'other'.
    expect(result.items.map((i) => i.post_id)).toEqual(["p1", "p2", "q1"]);
  });

  it("uses DEFAULT_CREATOR_CAP when not specified", () => {
    const rows: PostRow[] = [];
    const elig = [];
    for (let i = 0; i < 5; i += 1) {
      rows.push(
        postRow({
          postId: `p${i}`,
          creatorId: "c1",
          publishedAt: `2026-04-22T0${i}:00:00Z`
        })
      );
      elig.push({ creatorId: "c1", postId: `p${i}` });
    }
    const result = buildDiscoverPage(snapshot(rows), overrides(elig), {});
    expect(result.items).toHaveLength(DEFAULT_CREATOR_CAP);
  });

  it("excludes the viewer's own creator scope", () => {
    const snap = snapshot([
      postRow({ postId: "mine", creatorId: "viewer-creator", publishedAt: "2026-04-22T00:00:00Z" }),
      postRow({ postId: "theirs", creatorId: "other", publishedAt: "2026-04-22T00:00:00Z" })
    ]);
    const ov = overrides([
      { creatorId: "viewer-creator", postId: "mine" },
      { creatorId: "other", postId: "theirs" }
    ]);
    const result = buildDiscoverPage(snap, ov, {
      viewer_relay_creator_id: "viewer-creator"
    });
    expect(result.items.map((i) => i.post_id)).toEqual(["theirs"]);
  });

  it("filters by free-text q against title / description / tag_ids", () => {
    const snap = snapshot([
      postRow({
        postId: "p1",
        creatorId: "c1",
        publishedAt: "2026-04-22T00:00:00Z",
        title: "Sunset at the dunes",
        tagIds: ["landscape", "warm"]
      }),
      postRow({
        postId: "p2",
        creatorId: "c1",
        publishedAt: "2026-04-22T00:00:00Z",
        title: "Studio still life",
        tagIds: ["table", "fruit"]
      })
    ]);
    const ov = overrides([
      { creatorId: "c1", postId: "p1" },
      { creatorId: "c1", postId: "p2" }
    ]);
    const result = buildDiscoverPage(snap, ov, { q: "sunset", creator_cap: 5 });
    expect(result.items.map((i) => i.post_id)).toEqual(["p1"]);
  });

  it("emits a stable next_cursor that resumes pagination cleanly", () => {
    const snap = snapshot([
      postRow({ postId: "p1", creatorId: "a", publishedAt: "2026-04-22T05:00:00Z" }),
      postRow({ postId: "p2", creatorId: "b", publishedAt: "2026-04-22T04:00:00Z" }),
      postRow({ postId: "p3", creatorId: "c", publishedAt: "2026-04-22T03:00:00Z" }),
      postRow({ postId: "p4", creatorId: "d", publishedAt: "2026-04-22T02:00:00Z" })
    ]);
    const ov = overrides([
      { creatorId: "a", postId: "p1" },
      { creatorId: "b", postId: "p2" },
      { creatorId: "c", postId: "p3" },
      { creatorId: "d", postId: "p4" }
    ]);
    const page1 = buildDiscoverPage(snap, ov, { limit: 2, creator_cap: 5 });
    expect(page1.items.map((i) => i.post_id)).toEqual(["p1", "p2"]);
    expect(page1.next_cursor).toBeTypeOf("string");
    const page2 = buildDiscoverPage(snap, ov, {
      limit: 2,
      creator_cap: 5,
      cursor: page1.next_cursor!
    });
    expect(page2.items.map((i) => i.post_id)).toEqual(["p3", "p4"]);
    expect(page2.next_cursor).toBeNull();
  });

  it("clamps a too-large limit down to MAX_LIMIT", () => {
    const rows: PostRow[] = [];
    const elig = [];
    for (let i = 0; i < MAX_LIMIT + 10; i += 1) {
      // Use distinct creators so the per-creator cap doesn't drop them.
      rows.push(
        postRow({
          postId: `p${i}`,
          creatorId: `c${i}`,
          publishedAt: `2026-04-22T${String(i).padStart(2, "0")}:00:00Z`
        })
      );
      elig.push({ creatorId: `c${i}`, postId: `p${i}` });
    }
    const result = buildDiscoverPage(snapshot(rows), overrides(elig), {
      limit: 1000,
      creator_cap: 5
    });
    expect(result.items).toHaveLength(MAX_LIMIT);
  });

  it("falls back to DEFAULT_LIMIT when limit is non-positive or non-finite", () => {
    const rows: PostRow[] = [];
    const elig = [];
    for (let i = 0; i < DEFAULT_LIMIT + 5; i += 1) {
      rows.push(
        postRow({
          postId: `p${i}`,
          creatorId: `c${i}`,
          publishedAt: `2026-04-22T${String(i).padStart(2, "0")}:00:00Z`
        })
      );
      elig.push({ creatorId: `c${i}`, postId: `p${i}` });
    }
    const r1 = buildDiscoverPage(snapshot(rows), overrides(elig), { limit: -5 });
    expect(r1.items).toHaveLength(DEFAULT_LIMIT);
    const r2 = buildDiscoverPage(snapshot(rows), overrides(elig), { limit: NaN });
    expect(r2.items).toHaveLength(DEFAULT_LIMIT);
  });

  it("returns empty items when no eligible posts exist", () => {
    expect(buildDiscoverPage(snapshot([]), { creators: {} }, {}).items).toEqual([]);
  });

  it("invalid cursor is ignored gracefully (returns from start)", () => {
    const snap = snapshot([
      postRow({ postId: "p1", creatorId: "c1", publishedAt: "2026-04-22T00:00:00Z" })
    ]);
    const ov = overrides([{ creatorId: "c1", postId: "p1" }]);
    const result = buildDiscoverPage(snap, ov, { cursor: "not-a-real-cursor" });
    expect(result.items.map((i) => i.post_id)).toEqual(["p1"]);
  });
});
