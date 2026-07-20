import { describe, expect, it } from "vitest";
import {
  FIXTURE_HIDDEN_REVIEW_ROWS,
  FIXTURE_LEGACY_MEDIA_SLOT,
  FIXTURE_LEGACY_MEDIA_UNRESOLVED,
  FIXTURE_LINKED_SET_MEMBERS,
  FIXTURE_MULTI_ASSET_ROWS,
  FIXTURE_NORMAL_POST,
  FIXTURE_SHADOW_COVER,
  EXPECTED_PUT_THREE_POSTS
} from "../../web/app/studio/promos/promo-pieces-fixtures";
import {
  MAX_PROMO_SLOTS,
  compactSelection,
  galleryItemsToPostOptions,
  isActivePromoPickerItem,
  nextAvailableRank,
  rankForPostId,
  selectionFromSlots,
  selectionToPutRows,
  togglePostSelection,
  type PromoPostOption,
  type SelectedPromoPost
} from "../../web/app/studio/promos/promo-post-picker-model";

describe("isActivePromoPickerItem", () => {
  it("includes visible posts and excludes hidden, review, and shadow covers", () => {
    expect(isActivePromoPickerItem(FIXTURE_NORMAL_POST)).toBe(true);
    expect(isActivePromoPickerItem(FIXTURE_HIDDEN_REVIEW_ROWS[0]!)).toBe(false);
    expect(isActivePromoPickerItem(FIXTURE_HIDDEN_REVIEW_ROWS[1]!)).toBe(false);
    expect(isActivePromoPickerItem(FIXTURE_SHADOW_COVER)).toBe(false);
  });
});

describe("galleryItemsToPostOptions", () => {
  it("collapses multi-asset rows to one post option", () => {
    const options = galleryItemsToPostOptions(FIXTURE_MULTI_ASSET_ROWS);
    expect(options).toHaveLength(1);
    expect(options[0]!.post_id).toBe("post_carousel");
  });

  it("keeps Linked Set member posts as separate options", () => {
    const options = galleryItemsToPostOptions(FIXTURE_LINKED_SET_MEMBERS);
    expect(options.map((o) => o.post_id)).toEqual(["post_ls_1", "post_ls_2"]);
    expect(options.every((o) => o.linked_set_member)).toBe(true);
    expect(options[0]!.member_label).toBe("Teaser");
    expect(options[1]!.member_label).toBe("Full");
  });

  it("filters inactive rows from a mixed list", () => {
    const options = galleryItemsToPostOptions([
      FIXTURE_NORMAL_POST,
      ...FIXTURE_HIDDEN_REVIEW_ROWS,
      FIXTURE_SHADOW_COVER,
      ...FIXTURE_LINKED_SET_MEMBERS
    ]);
    expect(options.map((o) => o.post_id)).toEqual([
      "post_normal",
      "post_ls_1",
      "post_ls_2"
    ]);
  });
});

describe("togglePostSelection / max five", () => {
  function option(postId: string): PromoPostOption {
    return {
      post_id: postId,
      title: postId,
      linked_set_member: false
    };
  }

  it("assigns compact ranks and rejects a sixth selection", () => {
    let selected = new Map<number, SelectedPromoPost>();
    for (let i = 1; i <= 5; i += 1) {
      selected = togglePostSelection(selected, option(`post_${i}`));
    }
    expect(selected.size).toBe(MAX_PROMO_SLOTS);
    expect(nextAvailableRank(selected)).toBeNull();

    const before = new Map(selected);
    selected = togglePostSelection(selected, option("post_6"));
    expect(selected).toEqual(before);
    expect(rankForPostId(selected, "post_1")).toBe(1);
  });

  it("removes on second toggle", () => {
    let selected = togglePostSelection(new Map(), option("post_a"));
    expect(rankForPostId(selected, "post_a")).toBe(1);
    selected = togglePostSelection(selected, option("post_a"));
    expect(selected.size).toBe(0);
  });
});

describe("selectionFromSlots / selectionToPutRows", () => {
  it("prefills from post slots and emits post-target PUT rows", () => {
    const selected = selectionFromSlots([
      {
        slot_rank: 1,
        target_kind: "post",
        target_id: "post_normal",
        post_id: "post_normal",
        title: "Normal Post"
      },
      {
        slot_rank: 2,
        target_kind: "post",
        target_id: "post_carousel",
        post_id: "post_carousel",
        title: "Carousel Post"
      },
      {
        slot_rank: 3,
        target_kind: "post",
        target_id: "post_ls_1",
        post_id: "post_ls_1",
        title: "Linked Member A"
      }
    ]);
    expect(selectionToPutRows(selected)).toEqual(EXPECTED_PUT_THREE_POSTS);
  });

  it("maps resolved legacy media slots to post selection", () => {
    const selected = selectionFromSlots([FIXTURE_LEGACY_MEDIA_SLOT]);
    expect(rankForPostId(selected, "post_legacy")).toBe(1);
    expect(selectionToPutRows(selected)).toEqual([
      { slot_rank: 1, target_kind: "post", target_id: "post_legacy" }
    ]);
  });

  it("keeps unresolved legacy visible but drops it from PUT rows", () => {
    const selected = selectionFromSlots([FIXTURE_LEGACY_MEDIA_UNRESOLVED]);
    expect(selected.size).toBe(1);
    const row = selected.get(1)!;
    expect(row.unresolved_legacy).toBe(true);
    expect(selectionToPutRows(selected)).toEqual([]);
  });

  it("compacts ranks after removal", () => {
    let selected = selectionFromSlots([
      {
        slot_rank: 1,
        target_kind: "post",
        target_id: "post_normal",
        title: "A"
      },
      {
        slot_rank: 2,
        target_kind: "post",
        target_id: "post_carousel",
        title: "B"
      },
      {
        slot_rank: 3,
        target_kind: "post",
        target_id: "post_ls_1",
        title: "C"
      }
    ]);
    selected.delete(2);
    selected = compactSelection(selected);
    expect(Array.from(selected.keys())).toEqual([1, 2]);
    expect(selected.get(2)!.post_id).toBe("post_ls_1");
  });
});
