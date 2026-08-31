import { describe, expect, it } from "vitest";
import { commandLibraryItemsFromEffectivePosts } from "../../../src/studio/command/library-items-from-db.js";
import { searchLibrary } from "../../../src/studio/command/selection.js";
import type { Collection, GalleryOverridesRoot } from "../../../src/gallery/types.js";

const CREATOR = "cr_dev_ava";

function emptySummaries() {
  return new Map();
}

describe("command library items Gallery parity (RC-P5-T02)", () => {
  it("matches command search on presentation title and override tags, not canonical-only fields", () => {
    const overrides: GalleryOverridesRoot = {
      creators: {
        [CREATOR]: {
          posts: {
            post_overlay: {
              add_tag_ids: ["tag_watercolor"],
              remove_tag_ids: [],
              visibility: "hidden"
            }
          }
        }
      }
    };
    const collections: Collection[] = [
      {
        collection_id: "col_theme",
        creator_id: CREATOR,
        title: "Theme stack",
        theme_tag_ids: ["theme_academy"],
        post_ids: ["post_overlay"],
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ];

    const items = commandLibraryItemsFromEffectivePosts({
      creatorId: CREATOR,
      posts: [
        {
          id: "post_overlay",
          source: "PATREON",
          isPublic: true,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          version: {
            title: "Canonical dump title",
            description: "Canonical body",
            publishedAt: new Date("2026-04-01T00:00:00.000Z"),
            tagIds: [],
            tierIds: ["tier_public"],
            mediaIds: ["media_1"]
          },
          publishState: "published",
          creativeWorkId: "cw_overlay",
          mediaAssets: [
            {
              id: "media_1",
              currentMimeType: "image/png",
              currentRole: "attachment",
              currentStorageKey: "key/media_1"
            }
          ]
        }
      ],
      overlays: {
        post_overlay: {
          relay_title: "Hero Academy Page 1",
          relay_description: "Relay overlay description"
        }
      },
      overrides,
      collections,
      summaries: emptySummaries()
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Hero Academy Page 1");
    expect(items[0]?.description).toBe("Relay overlay description");
    expect(items[0]?.tag_ids).toContain("tag_watercolor");
    expect(items[0]?.visibility).toBe("hidden");
    expect(items[0]?.collection_ids).toEqual(["col_theme"]);
    expect(items[0]?.collection_theme_tag_ids).toEqual(["theme_academy"]);
    expect(items[0]?.source).toBe("PATREON");
    expect(items[0]?.content_url_path).toBe("");
    expect(items[0]?.preview_url_path).toBe("");
    expect(items[0]?.thumb_url_path).toBe("");
    expect(items[0]?.publish_state).toBe("published");
    expect(items[0]?.creative_work_id).toBe("cw_overlay");

    const byOverlayTitle = searchLibrary(items, { title_contains: "Hero Academy" });
    expect(byOverlayTitle.selection.post_ids).toEqual(["post_overlay"]);

    const byCanonicalTitle = searchLibrary(items, { title_contains: "Canonical dump" });
    expect(byCanonicalTitle.selection.post_ids).toEqual([]);

    const byOverrideTag = searchLibrary(items, { tag_ids: ["tag_watercolor"] });
    expect(byOverrideTag.selection.post_ids).toEqual(["post_overlay"]);

    const byThemeQ = searchLibrary(items, { q: "theme_academy" });
    expect(byThemeQ.selection.post_ids).toEqual(["post_overlay"]);

    const byWork = searchLibrary(items, { creative_work_id: "cw_overlay" });
    expect(byWork.selection.post_ids).toEqual(["post_overlay"]);
  });

  it("keeps destination flags from distribution summaries", () => {
    const items = commandLibraryItemsFromEffectivePosts({
      creatorId: CREATOR,
      posts: [
        {
          id: "post_x",
          source: "RELAY",
          isPublic: true,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          version: {
            title: "Native sketch",
            description: null,
            publishedAt: new Date("2026-05-01T00:00:00.000Z"),
            tagIds: ["tag_sketch"],
            tierIds: [],
            mediaIds: []
          },
          mediaAssets: []
        }
      ],
      overlays: {},
      overrides: { creators: {} },
      collections: [],
      summaries: new Map([
        [
          "post_x",
          {
            post_id: "post_x",
            destinations: [
              {
                destination: "x",
                variant_status: "ready",
                attempt_status: "posted",
                attempt_id: "att_1",
                external_url: "https://x.com/s/1",
                external_id: "x1"
              }
            ]
          }
        ]
      ])
    });

    expect(items[0]?.media_id).toBe("post_only_post_x");
    const posted = searchLibrary(items, { destination_present: ["x"] });
    expect(posted.selection.post_ids).toEqual(["post_x"]);
    const absent = searchLibrary(items, { destination_absent: ["x"] });
    expect(absent.selection.post_ids).toEqual([]);
  });
});
