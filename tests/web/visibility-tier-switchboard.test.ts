import { describe, expect, it } from "vitest";
import type { GalleryItem, TierFacet } from "../../web/lib/relay-api";
import { buildVisibilityTierSwitchboard } from "../../web/lib/visibility-tier-switchboard";

const catalog: TierFacet[] = [
  { tier_id: "t_free", title: "Free", amount_cents: 0 },
  { tier_id: "t_studio", title: "Studio", amount_cents: 1000 },
  { tier_id: "t_vip", title: "VIP", amount_cents: 2500 }
];

function item(partial: Partial<GalleryItem> & Pick<GalleryItem, "post_id" | "tier_ids">): GalleryItem {
  return {
    media_id: `m_${partial.post_id}`,
    title: "Post",
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "",
    preview_url_path: "",
    thumb_url_path: "",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...partial
  };
}

describe("buildVisibilityTierSwitchboard", () => {
  it("marks all tiers as access when the post is public", () => {
    const board = buildVisibilityTierSwitchboard(
      [item({ post_id: "p1", tier_ids: [] })],
      catalog
    );
    expect(board.publicAccess).toBe("access");
    expect(board.tiers.every((t) => t.bucket === "access")).toBe(true);
  });

  it("splits can-access vs no-access by minimum tier ladder", () => {
    const board = buildVisibilityTierSwitchboard(
      [item({ post_id: "p1", tier_ids: ["t_studio"] })],
      catalog
    );
    expect(board.publicAccess).toBe("locked");
    expect(board.tiers.find((t) => t.tier_id === "t_free")?.bucket).toBe("locked");
    expect(board.tiers.find((t) => t.tier_id === "t_studio")?.bucket).toBe("access");
    expect(board.tiers.find((t) => t.tier_id === "t_vip")?.bucket).toBe("access");
  });

  it("marks mixed when selection posts disagree", () => {
    const board = buildVisibilityTierSwitchboard(
      [
        item({ post_id: "p1", tier_ids: [] }),
        item({ post_id: "p2", tier_ids: ["t_vip"] })
      ],
      catalog
    );
    expect(board.publicAccess).toBe("mixed");
    expect(board.tiers.find((t) => t.tier_id === "t_free")?.bucket).toBe("mixed");
    expect(board.tiers.find((t) => t.tier_id === "t_vip")?.bucket).toBe("access");
  });
});
