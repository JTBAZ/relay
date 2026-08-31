import { describe, expect, it } from "vitest";
import { projectStudioContent, paginateProjectionPosts } from "../../../src/studio/projection/studio-content-projection.js";

describe("StudioContentProjection (RC-P2-T06)", () => {
  it("keeps the same post_ids across lenses and stacks collections with ≥2 members", () => {
    const posts = [
      { post_id: "a", title: "A", published_at: "2025-04-02T00:00:00.000Z", collection_ids: ["c1"] },
      { post_id: "b", title: "B", published_at: "2025-04-03T00:00:00.000Z", collection_ids: ["c1"] },
      { post_id: "c", title: "C", published_at: "2025-04-01T00:00:00.000Z", collection_ids: [] }
    ];
    const projected = projectStudioContent({
      lens: "collections",
      posts,
      collections: [{ collection_id: "c1", title: "Watercolor", post_ids: ["b", "a"] }],
      schedule: [{ event_id: "e1", post_id: "a", title: "A", due_at: "2026-08-27T19:00:00.000Z", destination: "x" }]
    });
    expect(projected.post_ids.sort()).toEqual(["a", "b", "c"]);
    expect(projected.stacks).toHaveLength(1);
    expect(projected.stacks[0]?.member_titles).toEqual(["B", "A"]);
    expect(projected.chronological[0]?.post_id).toBe("b");
    expect(projected.schedule[0]?.event_id).toBe("e1");
  });

  it("pages at gallery max 100 without dropping remainder", () => {
    const items = Array.from({ length: 112 }, (_, i) => i);
    const first = paginateProjectionPosts(items, 100, 0);
    const second = paginateProjectionPosts(items, 100, 1);
    expect(first.page).toHaveLength(100);
    expect(first.has_more).toBe(true);
    expect(second.page).toHaveLength(12);
    expect(second.has_more).toBe(false);
  });
});
