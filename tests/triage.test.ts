import { describe, expect, it } from "vitest";
import { buildDuplicateGroupsByTitleAndSha } from "../src/gallery/triage-service.js";

describe("triage duplicate grouping (title + shared sha)", () => {
  it("clusters split posts that share an export hash under the same title", () => {
    const posts = {
      p_cover: {
        upstream_status: undefined as string | undefined,
        current: { title: "Hello", published_at: "2026-01-02T00:00:00Z", media_ids: ["m1"] }
      },
      p_main: {
        upstream_status: undefined,
        current: { title: "Hello", published_at: "2026-01-01T00:00:00Z", media_ids: ["m2"] }
      }
    };
    const mediaMap = {
      m1: { upstream_status: undefined, current: { role: "cover" } },
      m2: { upstream_status: undefined, current: {} }
    };
    const index = {
      media: {
        m1: { sha256: "deadbeef" },
        m2: { sha256: "deadbeef" }
      }
    };

    const groups = buildDuplicateGroupsByTitleAndSha(posts, mediaMap, index);
    expect(groups).toEqual([
      {
        canonical_post_id: "p_main",
        duplicate_post_ids: ["p_cover"]
      }
    ]);
  });

  it("returns no groups when titles match but hashes do not", () => {
    const posts = {
      a: {
        upstream_status: undefined,
        current: { title: "X", published_at: "2026-01-01T00:00:00Z", media_ids: ["m1"] }
      },
      b: {
        upstream_status: undefined,
        current: { title: "X", published_at: "2026-01-02T00:00:00Z", media_ids: ["m2"] }
      }
    };
    const mediaMap = {
      m1: { upstream_status: undefined, current: {} },
      m2: { upstream_status: undefined, current: {} }
    };
    const index = {
      media: {
        m1: { sha256: "aaa" },
        m2: { sha256: "bbb" }
      }
    };

    expect(buildDuplicateGroupsByTitleAndSha(posts, mediaMap, index)).toEqual([]);
  });
});
