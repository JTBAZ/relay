/**
 * Characterization fixtures for VS1 Promo Pieces UX.
 * Pure data only — no production behavior.
 */

import type { CreatorPromoSlotRow, GalleryItem, PutCreatorPromoSlotRow } from "@/lib/relay-api";

const BASE_ITEM = {
  published_at: "2026-01-01T00:00:00.000Z",
  tag_ids: [] as string[],
  tier_ids: [] as string[],
  has_export: true,
  processing_status: "READY" as const,
  export_status: "ready" as const,
  content_url_path: "/content/x",
  preview_url_path: "/preview/x",
  thumb_url_path: "/thumb/x",
  visibility: "visible" as const,
  collection_ids: [] as string[],
  collection_theme_tag_ids: [] as string[],
  mime_type: "image/png"
};

/** One normal active post (single media). */
export const FIXTURE_NORMAL_POST: GalleryItem = {
  ...BASE_ITEM,
  media_id: "media_normal",
  post_id: "post_normal",
  title: "Normal Post",
  content_url_path: "/content/media_normal",
  preview_url_path: "/preview/media_normal",
  thumb_url_path: "/thumb/media_normal"
};

/** Multi-asset post — two gallery rows, same post_id (carousel). */
export const FIXTURE_MULTI_ASSET_ROWS: GalleryItem[] = [
  {
    ...BASE_ITEM,
    media_id: "media_carousel_a",
    post_id: "post_carousel",
    title: "Carousel Post",
    content_url_path: "/content/media_carousel_a",
    preview_url_path: "/preview/media_carousel_a",
    thumb_url_path: "/thumb/media_carousel_a"
  },
  {
    ...BASE_ITEM,
    media_id: "media_carousel_b",
    post_id: "post_carousel",
    title: "Carousel Post",
    content_url_path: "/content/media_carousel_b",
    preview_url_path: "/preview/media_carousel_b",
    thumb_url_path: "/thumb/media_carousel_b"
  }
];

/** Two posts in the same Linked Set (non-default CreativeWork). */
export const FIXTURE_LINKED_SET_MEMBERS: GalleryItem[] = [
  {
    ...BASE_ITEM,
    media_id: "media_ls_1",
    post_id: "post_ls_1",
    title: "Linked Member A",
    content_url_path: "/content/media_ls_1",
    preview_url_path: "/preview/media_ls_1",
    thumb_url_path: "/thumb/media_ls_1",
    creative_work_id: "cw_linked_1",
    is_default_bundle: false,
    creative_work_member_count: 2,
    member_label: "Teaser",
    variant_role: "teaser",
    creative_work_sort_order: 0
  },
  {
    ...BASE_ITEM,
    media_id: "media_ls_2",
    post_id: "post_ls_2",
    title: "Linked Member B",
    content_url_path: "/content/media_ls_2",
    preview_url_path: "/preview/media_ls_2",
    thumb_url_path: "/thumb/media_ls_2",
    creative_work_id: "cw_linked_1",
    is_default_bundle: false,
    creative_work_member_count: 2,
    member_label: "Full",
    variant_role: "full",
    creative_work_sort_order: 1
  }
];

/** Hidden / review rows — excluded from active promo picker eligibility. */
export const FIXTURE_HIDDEN_REVIEW_ROWS: GalleryItem[] = [
  {
    ...BASE_ITEM,
    media_id: "media_hidden",
    post_id: "post_hidden",
    title: "Hidden Post",
    visibility: "hidden",
    content_url_path: "/content/media_hidden",
    preview_url_path: "/preview/media_hidden",
    thumb_url_path: "/thumb/media_hidden"
  },
  {
    ...BASE_ITEM,
    media_id: "media_review",
    post_id: "post_review",
    title: "Review Post",
    visibility: "review",
    content_url_path: "/content/media_review",
    preview_url_path: "/preview/media_review",
    thumb_url_path: "/thumb/media_review"
  }
];

/** Shadow-cover duplicate — excluded from Active Posts eligibility by default. */
export const FIXTURE_SHADOW_COVER: GalleryItem = {
  ...BASE_ITEM,
  media_id: "media_shadow",
  post_id: "post_shadow",
  title: "Shadow Cover",
  shadow_cover: true,
  content_url_path: "/content/media_shadow",
  preview_url_path: "/preview/media_shadow",
  thumb_url_path: "/thumb/media_shadow"
};

/** Page 1 + page 2 stubs for pagination characterization. */
export const FIXTURE_PAGE_1_ITEMS: GalleryItem[] = [
  FIXTURE_NORMAL_POST,
  ...FIXTURE_MULTI_ASSET_ROWS.slice(0, 1)
];

export const FIXTURE_PAGE_2_ITEMS: GalleryItem[] = [
  FIXTURE_LINKED_SET_MEMBERS[0]!,
  FIXTURE_LINKED_SET_MEMBERS[1]!
];

export const FIXTURE_PAGE_1_CURSOR = "cursor_page_2";

/** Legacy media-target slot (onboarding Step 5) with resolved post_id. */
export const FIXTURE_LEGACY_MEDIA_SLOT: CreatorPromoSlotRow = {
  promo_piece_id: "pp_legacy",
  slot_rank: 1,
  target_kind: "media",
  target_id: "media_legacy",
  post_id: "post_legacy",
  title: "Legacy Media Piece",
  thumb_url_path: "/thumb/media_legacy",
  label: null
};

/** Unresolved legacy media slot (no post_id enrichment). */
export const FIXTURE_LEGACY_MEDIA_UNRESOLVED: CreatorPromoSlotRow = {
  promo_piece_id: "pp_orphan",
  slot_rank: 2,
  target_kind: "media",
  target_id: "media_orphan",
  title: undefined,
  thumb_url_path: undefined,
  label: null
};

/**
 * Expected full-set PUT payload for selecting three posts in order:
 * normal → carousel → linked member A. Compact ranks 1…N, post targets only.
 */
export const EXPECTED_PUT_THREE_POSTS: PutCreatorPromoSlotRow[] = [
  { slot_rank: 1, target_kind: "post", target_id: "post_normal" },
  { slot_rank: 2, target_kind: "post", target_id: "post_carousel" },
  { slot_rank: 3, target_kind: "post", target_id: "post_ls_1" }
];

/** Compact ranks after removing middle of a 1–3 set. */
export const EXPECTED_PUT_AFTER_REMOVE_MIDDLE: PutCreatorPromoSlotRow[] = [
  { slot_rank: 1, target_kind: "post", target_id: "post_normal" },
  { slot_rank: 2, target_kind: "post", target_id: "post_ls_1" }
];
