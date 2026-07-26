import { describe, expect, it, vi } from "vitest";
import {
  applyOwnerPromoPieceMarkers,
  loadPromoPieceMarkersByPostId
} from "../src/creator/promo-piece-markers.js";
import { buildPromoAttributionContextV1 } from "../src/marketing/promo-attribution-context.js";
import type { GalleryItem } from "../src/gallery/types.js";

const BASE_ITEM: GalleryItem = {
  media_id: "m1",
  post_id: "post_a",
  title: "A",
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
  collection_theme_tag_ids: []
};

describe("buildPromoAttributionContextV1", () => {
  it("builds a valid context and rejects incomplete input", () => {
    expect(
      buildPromoAttributionContextV1({
        promo_piece_id: "pp_1",
        creator_id: "cr_1",
        post_id: "post_a",
        slot_rank: 2
      })
    ).toEqual({
      version: 1,
      promo_piece_id: "pp_1",
      creator_id: "cr_1",
      post_id: "post_a",
      slot_rank: 2,
      source: "promo_pool"
    });
    expect(
      buildPromoAttributionContextV1({
        promo_piece_id: "",
        creator_id: "cr_1",
        post_id: "post_a",
        slot_rank: 1
      })
    ).toBeNull();
  });
});

describe("applyOwnerPromoPieceMarkers", () => {
  it("marks every media row for a promoted post with the same identity", () => {
    const markers = new Map([
      ["post_a", { promo_piece_id: "pp_1", promo_slot_rank: 1 as const }]
    ]);
    const items = [
      { ...BASE_ITEM, media_id: "m1" },
      { ...BASE_ITEM, media_id: "m2" },
      { ...BASE_ITEM, media_id: "m3", post_id: "post_b", title: "B" }
    ];
    const out = applyOwnerPromoPieceMarkers(items, markers);
    expect(out[0]).toMatchObject({
      is_promo_piece: true,
      promo_piece_id: "pp_1",
      promo_slot_rank: 1
    });
    expect(out[1]).toMatchObject({
      is_promo_piece: true,
      promo_piece_id: "pp_1",
      promo_slot_rank: 1
    });
    expect(out[2]?.is_promo_piece).toBe(false);
    expect(out[2]?.promo_piece_id).toBeUndefined();
  });
});

describe("loadPromoPieceMarkersByPostId", () => {
  it("resolves post and media targets to post ids", async () => {
    const prisma = {
      creatorPromoSlot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "pp_post",
            slotRank: 1,
            targetKind: "post",
            targetId: "post_a"
          },
          {
            id: "pp_media",
            slotRank: 2,
            targetKind: "media",
            targetId: "media_b"
          }
        ])
      },
      mediaAsset: {
        findMany: vi.fn().mockResolvedValue([
          { id: "media_b", primaryPostId: "post_b" }
        ])
      }
    };
    const map = await loadPromoPieceMarkersByPostId(prisma as never, "cr_1");
    expect(map.get("post_a")).toEqual({
      promo_piece_id: "pp_post",
      promo_slot_rank: 1
    });
    expect(map.get("post_b")).toEqual({
      promo_piece_id: "pp_media",
      promo_slot_rank: 2
    });
  });
});
