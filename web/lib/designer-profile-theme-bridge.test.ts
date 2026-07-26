import { describe, expect, it } from "vitest";
import { buildPageLayoutFromDesignerState, type DesignerProfileThemeInput } from "@/lib/designer-profile-theme-bridge";
import type { PageLayout } from "@/lib/relay-api";

const baseTheme = (): DesignerProfileThemeInput => ({
  heroStyle: "full",
  showBio: true,
  showSocials: true,
  showTierBadges: true,
  accentColor: "emerald",
  customAccent: "#00c781",
  defaultLayout: "grid",
  featured: { type: "latest" },
  sections: []
});

const mediaCatalog: Record<string, { postId: string }> = {
  m1: { postId: "p1" },
  m2: { postId: "p2" }
};

const emptyCollections: Array<{ collection_id: string; post_ids: string[] }> = [];

describe("buildPageLayoutFromDesignerState — legacy section ids", () => {
  it("binds bare featured/gallery to filter rows when a collection is first in the saved layout (regression)", () => {
    const previousLayout: PageLayout = {
      creator_id: "cr1",
      theme: { color_scheme: "dark" },
      sections: [
        {
          section_id: "sec_collection_first",
          title: "Highlights",
          source: { type: "collection", collection_id: "col_a" },
          layout: "grid",
          sort_order: 0
        },
        {
          section_id: "sec_featured_filter",
          title: "Featured",
          source: { type: "filter", query: {} },
          layout: "grid",
          sort_order: 1
        },
        {
          section_id: "sec_gallery_filter",
          title: "All Works",
          source: { type: "filter", query: {} },
          layout: "grid",
          sort_order: 2
        }
      ],
      updated_at: "2026-05-07T00:00:00.000Z"
    };

    const theme = baseTheme();
    theme.sections = [
      {
        id: "featured",
        title: "Featured",
        layout: "showcase",
        visible: true,
        order: 0,
        itemIds: ["m1"]
      },
      {
        id: "gallery",
        title: "All Works",
        layout: "masonry",
        visible: true,
        order: 1,
        itemIds: ["m1", "m2"]
      }
    ];

    const out = buildPageLayoutFromDesignerState({
      creatorId: "cr1",
      theme,
      hero: {},
      mediaCatalog,
      collections: emptyCollections,
      previousLayout
    });

    const featured = out.sections.find((s) => s.section_id === "sec_featured_filter");
    const gallery = out.sections.find((s) => s.section_id === "sec_gallery_filter");

    expect(featured?.layout).toBe("featured");
    expect(featured?.source).toEqual({ type: "filter", query: {} });
    expect(gallery?.layout).toBe("masonry");
    expect(gallery?.source).toEqual({ type: "filter", query: {} });
  });

  it("spotlight + latest converts a legacy manual featured row to an open filter", () => {
    const previousLayout: PageLayout = {
      creator_id: "cr1",
      theme: { color_scheme: "dark" },
      sections: [
        {
          section_id: "sec_coll",
          title: "C",
          source: { type: "collection", collection_id: "col_a" },
          layout: "grid",
          sort_order: 0
        },
        {
          section_id: "sec_manual_feat",
          title: "Featured",
          source: { type: "manual", post_ids: ["p1"] },
          layout: "grid",
          sort_order: 1
        }
      ],
      updated_at: "2026-05-07T00:00:00.000Z"
    };

    const theme = baseTheme();
    theme.sections = [
      {
        id: "featured",
        title: "Featured",
        layout: "showcase",
        visible: true,
        order: 0,
        itemIds: ["m1"]
      }
    ];

    const out = buildPageLayoutFromDesignerState({
      creatorId: "cr1",
      theme,
      hero: {},
      mediaCatalog,
      collections: emptyCollections,
      previousLayout
    });

    const row = out.sections.find((s) => s.section_id === "sec_manual_feat");
    expect(row?.layout).toBe("featured");
    expect(row?.source).toEqual({ type: "filter", query: {} });
  });

  it("persists spotlight Featured chooser post selection as manual post_ids", () => {
    const previousLayout: PageLayout = {
      creator_id: "cr1",
      theme: { color_scheme: "dark" },
      sections: [
        {
          section_id: "sec_featured_filter",
          title: "Featured",
          source: { type: "filter", query: {} },
          layout: "featured",
          sort_order: 0
        }
      ],
      updated_at: "2026-05-07T00:00:00.000Z"
    };

    const theme = baseTheme();
    theme.featured = { type: "post", postId: "p2" };
    theme.sections = [
      {
        id: "filter-sec_featured_filter",
        title: "Featured",
        layout: "showcase",
        visible: true,
        order: 0,
        itemIds: []
      }
    ];

    const out = buildPageLayoutFromDesignerState({
      creatorId: "cr1",
      theme,
      hero: {},
      mediaCatalog,
      collections: emptyCollections,
      previousLayout
    });

    expect(out.sections[0]?.section_id).toBe("sec_featured_filter");
    expect(out.sections[0]?.source).toEqual({ type: "manual", post_ids: ["p2"] });
  });
});
