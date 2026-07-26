import { describe, expect, it } from "vitest";
import {
  collapsePostGroupsToGridCards,
  unionMemberPresence,
} from "./active-post-linked-sets";
import type { GalleryItem } from "./relay-api";
import type { PostGalleryGroup } from "./gallery-group";

function item(partial: Partial<GalleryItem> & Pick<GalleryItem, "post_id" | "media_id" | "title">): GalleryItem {
  return {
    description: "",
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/c",
    preview_url_path: "/p",
    thumb_url_path: "/t",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...partial,
  };
}

describe("active-post-linked-sets", () => {
  it("unions present destinations across members", () => {
    const { present, missing } = unionMemberPresence([
      {
        present: [{ destination: "patreon", external_url: "https://patreon.com/1" }],
        missing: ["x", "deviantart", "bluesky"],
      },
      {
        present: [{ destination: "x", external_url: null }],
        missing: ["patreon", "deviantart", "bluesky"],
      },
    ]);
    expect(present.map((p) => p.destination)).toEqual(["patreon", "x"]);
    expect(missing).toEqual(["deviantart", "bluesky"]);
  });

  it("collapses non-default multi-member works into linked_set cards", () => {
    const groups: PostGalleryGroup[] = [
      {
        post_id: "post_a",
        items: [
          item({
            post_id: "post_a",
            media_id: "m1",
            title: "Page 1",
            creative_work_id: "cw_set",
            is_default_bundle: false,
            creative_work_member_count: 2,
            creative_work_sort_order: 0,
            variant_role: "full",
          }),
        ],
      },
      {
        post_id: "post_b",
        items: [
          item({
            post_id: "post_b",
            media_id: "m2",
            title: "Page 2",
            creative_work_id: "cw_set",
            is_default_bundle: false,
            creative_work_member_count: 2,
            creative_work_sort_order: 1,
            variant_role: "teaser",
            member_label: "Page 2",
          }),
        ],
      },
      {
        post_id: "post_c",
        items: [
          item({
            post_id: "post_c",
            media_id: "m3",
            title: "Solo",
            creative_work_id: "cw_default_post_c",
            is_default_bundle: true,
            creative_work_member_count: 1,
          }),
        ],
      },
    ];

    const cards = collapsePostGroupsToGridCards(groups);
    expect(cards).toHaveLength(2);
    expect(cards[0]?.kind).toBe("linked_set");
    if (cards[0]?.kind === "linked_set") {
      expect(cards[0].member_count).toBe(2);
      expect(cards[0].cover_post_id).toBe("post_a");
    }
    expect(cards[1]).toMatchObject({ kind: "post", group: { post_id: "post_c" } });
  });

  it("keeps multi-asset carousel as a post card", () => {
    const groups: PostGalleryGroup[] = [
      {
        post_id: "post_multi",
        items: [
          item({
            post_id: "post_multi",
            media_id: "m1",
            title: "Carousel",
            is_default_bundle: true,
            creative_work_member_count: 1,
          }),
          item({
            post_id: "post_multi",
            media_id: "m2",
            title: "Carousel",
            is_default_bundle: true,
            creative_work_member_count: 1,
          }),
        ],
      },
    ];
    const cards = collapsePostGroupsToGridCards(groups);
    expect(cards).toEqual([{ kind: "post", group: groups[0] }]);
  });
});
