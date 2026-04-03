import { describe, expect, it } from "vitest";
import { effectiveTags } from "../src/gallery/query.js";
import type { GalleryOverridesRoot } from "../src/gallery/types.js";

describe("effectiveTags (Relay overrides survive canonical base changes)", () => {
  const emptyOv: GalleryOverridesRoot = { creators: {} };

  it("returns canonical base when no override", () => {
    expect(effectiveTags(["patreon-a", "patreon-b"], "c1", "p1", emptyOv)).toEqual([
      "patreon-a",
      "patreon-b"
    ]);
  });

  it("layers add_tag_ids on top of base (Relay-only tags)", () => {
    const ov: GalleryOverridesRoot = {
      creators: {
        c1: {
          posts: {
            p1: { add_tag_ids: ["relay-child", "sketch"], remove_tag_ids: [] }
          }
        }
      }
    };
    const out = effectiveTags(["patreon-a"], "c1", "p1", ov);
    expect(out.sort()).toEqual(["patreon-a", "relay-child", "sketch"].sort());
  });

  it("remove_tag_ids hides a tag Patreon may re-send on next ingest", () => {
    const ov: GalleryOverridesRoot = {
      creators: {
        c1: {
          posts: {
            p1: { add_tag_ids: [], remove_tag_ids: ["spoilers"] }
          }
        }
      }
    };
    expect(effectiveTags(["a", "spoilers", "b"], "c1", "p1", ov)).toEqual(["a", "b"]);
  });

  it("simulates fresh Patreon scrape replacing base while Relay adds remain", () => {
    const ov: GalleryOverridesRoot = {
      creators: {
        c1: {
          posts: {
            p1: { add_tag_ids: ["curated", "wip"], remove_tag_ids: [] }
          }
        }
      }
    };
    const afterOldIngest = effectiveTags(["old-patreon-tag"], "c1", "p1", ov);
    expect(afterOldIngest).toContain("curated");
    const afterNewIngest = effectiveTags(["new-patreon-tag-only"], "c1", "p1", ov);
    expect(afterNewIngest).toContain("curated");
    expect(afterNewIngest).toContain("wip");
    expect(afterNewIngest).toContain("new-patreon-tag-only");
    expect(afterNewIngest).not.toContain("old-patreon-tag");
  });
});
