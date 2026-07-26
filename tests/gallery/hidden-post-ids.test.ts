import { describe, expect, it } from "vitest";
import { isPostHiddenFromPatronSurfaces } from "../../src/gallery/hidden-post-ids.js";
import type { GalleryOverridesRoot } from "../../src/gallery/types.js";

const creatorId = "cr_hide";
const postId = "post_intro";

describe("isPostHiddenFromPatronSurfaces", () => {
  it("true when post-level override is hidden", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            [postId]: { add_tag_ids: [], remove_tag_ids: [], visibility: "hidden" }
          }
        }
      }
    };
    expect(
      isPostHiddenFromPatronSurfaces({
        overrides,
        creatorId,
        postId,
        activeMediaIds: ["media_1"]
      })
    ).toBe(true);
  });

  it("true when every active media row is hidden via asset override", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            [postId]: {
              add_tag_ids: [],
              remove_tag_ids: [],
              media: {
                media_1: { visibility: "hidden" }
              }
            }
          }
        }
      }
    };
    expect(
      isPostHiddenFromPatronSurfaces({
        overrides,
        creatorId,
        postId,
        activeMediaIds: ["media_1"]
      })
    ).toBe(true);
  });

  it("false when only some media rows are hidden", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            [postId]: {
              add_tag_ids: [],
              remove_tag_ids: [],
              media: {
                media_1: { visibility: "hidden" },
                media_2: { visibility: "visible" }
              }
            }
          }
        }
      }
    };
    expect(
      isPostHiddenFromPatronSurfaces({
        overrides,
        creatorId,
        postId,
        activeMediaIds: ["media_1", "media_2"]
      })
    ).toBe(false);
  });
});
