import { describe, expect, it } from "vitest";
import { isPostMatureFromPatronSurfaces } from "../../src/gallery/mature-post-ids.js";
import type { GalleryOverridesRoot } from "../../src/gallery/types.js";

const creatorId = "cr_mature";
const postId = "post_intro";

describe("isPostMatureFromPatronSurfaces", () => {
  it("true when post-level override is review", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            [postId]: { add_tag_ids: [], remove_tag_ids: [], visibility: "review" }
          }
        }
      }
    };
    expect(
      isPostMatureFromPatronSurfaces({
        overrides,
        creatorId,
        postId,
        activeMediaIds: ["media_1"]
      })
    ).toBe(true);
  });

  it("true when any active media row is review via asset override", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            [postId]: {
              add_tag_ids: [],
              remove_tag_ids: [],
              media: {
                media_1: { visibility: "review" }
              }
            }
          }
        }
      }
    };
    expect(
      isPostMatureFromPatronSurfaces({
        overrides,
        creatorId,
        postId,
        activeMediaIds: ["media_1", "media_2"]
      })
    ).toBe(true);
  });

  it("false when only some media rows are review and others are visible", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            [postId]: {
              add_tag_ids: [],
              remove_tag_ids: [],
              media: {
                media_1: { visibility: "visible" },
                media_2: { visibility: "visible" }
              }
            }
          }
        }
      }
    };
    expect(
      isPostMatureFromPatronSurfaces({
        overrides,
        creatorId,
        postId,
        activeMediaIds: ["media_1", "media_2"]
      })
    ).toBe(false);
  });
});
