import { describe, expect, it } from "vitest";
import {
  buildPublicProfileHeroModel,
  publicProfileHeroCoverExportUrl
} from "@/lib/public-profile-hero";
import type { PageLayout, VisitorHeroData } from "@/lib/relay-api";

const baseLayout = (hero: PageLayout["hero"]): PageLayout => ({
  creator_id: "creator_x",
  theme: {
    color_scheme: "dark",
    accent_color: "#00aa6f",
    show_bio: true,
    show_patreon_link: true,
    patreon_link_position: "below_bio",
    show_tier_badges: true,
    gallery_arrangement: "chronological"
  },
  hero,
  sections: [],
  updated_at: "2026-01-01T00:00:00.000Z"
});

describe("publicProfileHeroCoverExportUrl", () => {
  it("encodes creator and media id in export path", () => {
    const u = publicProfileHeroCoverExportUrl("c/1", "m+2");
    expect(u).toContain("/api/v1/export/media/");
    expect(u).toContain(encodeURIComponent("c/1"));
    expect(u).toContain(encodeURIComponent("m+2"));
  });
});

describe("buildPublicProfileHeroModel", () => {
  it("prefers layout cover export over Patreon banner when both exist", () => {
    const pageLayout = baseLayout({
      title: "Studio",
      show_cover: true,
      cover_media_id: "media_a",
      bio: "Bio line",
      subtitle: "Sub"
    });
    const visitorHero: VisitorHeroData = {
      banner_url: "https://cdn.example/banner.jpg",
      avatar_url: "https://cdn.example/a.png",
      relay_display_name: "Relay Name",
      patreon_name: "PatreonSlug"
    };
    const m = buildPublicProfileHeroModel({
      pageLayout,
      visitorHero,
      creatorId: "creator_1"
    });
    expect(m.coverImageUrl).toBe(publicProfileHeroCoverExportUrl("creator_1", "media_a"));
    expect(m.headline).toBe("Studio");
    expect(m.heroPrimary).toBe("Bio line");
    expect(m.heroSecondary).toBe("Sub");
    expect(m.patreonSlug).toBe("patreonslug");
    expect(m.patreonProfileHref).toBe("https://www.patreon.com/patreonslug");
    expect(m.showCover).toBe(true);
    expect(m.showAvatar).toBe(true);
    expect(m.avatarUrl).toBe("https://cdn.example/a.png");
  });

  it("uses Patreon banner when cover_media_id missing", () => {
    const pageLayout = baseLayout({ title: "T", show_cover: true });
    const m = buildPublicProfileHeroModel({
      pageLayout,
      visitorHero: { banner_url: "https://patreon/camp.png" },
      creatorId: "c"
    });
    expect(m.coverImageUrl).toBe("https://patreon/camp.png");
  });

  it("hides cover when show_cover is false", () => {
    const pageLayout = baseLayout({
      title: "T",
      show_cover: false,
      cover_media_id: "m1"
    });
    const m = buildPublicProfileHeroModel({
      pageLayout,
      visitorHero: { banner_url: "https://patreon/camp.png" },
      creatorId: "c"
    });
    expect(m.showCover).toBe(false);
    expect(m.coverImageUrl).toBe(null);
  });

  it("stacks subtitle as primary when show_bio is false", () => {
    const pageLayout: PageLayout = {
      ...baseLayout({
        title: "T",
        subtitle: "Only sub",
        bio: "Hidden bio",
        show_cover: false
      }),
      theme: {
        ...baseLayout({ title: "x" }).theme,
        show_bio: false
      }
    };
    const m = buildPublicProfileHeroModel({
      pageLayout,
      visitorHero: {},
      creatorId: "c"
    });
    expect(m.heroPrimary).toBe("Only sub");
    expect(m.heroSecondary).toBe(null);
  });

  it("applies fallbacks for banner, avatar, display name, and tagline", () => {
    const pageLayout = baseLayout({ title: "", show_cover: true });
    const m = buildPublicProfileHeroModel({
      pageLayout,
      visitorHero: {},
      creatorId: "c",
      patreonBannerFallback: "https://env/banner",
      avatarUrlFallback: "https://env/av.png",
      displayNameFallback: "Env Creator",
      taglineWhenHeroTextEmpty: "Env tagline"
    });
    expect(m.coverImageUrl).toBe("https://env/banner");
    expect(m.avatarUrl).toBe("https://env/av.png");
    expect(m.headline).toBe("Env Creator");
    expect(m.fallbackTagline).toBe("Env tagline");
    expect(m.heroPrimary).toBe(null);
  });

  it("uses patreonVanitySlug when visitor hero omits patreon_name", () => {
    const pageLayout = baseLayout({ title: "T", show_cover: false });
    const m = buildPublicProfileHeroModel({
      pageLayout,
      visitorHero: { relay_display_name: "X" },
      creatorId: "c",
      patreonVanitySlug: "MyCampaign"
    });
    expect(m.patreonSlug).toBe("mycampaign");
    expect(m.patreonProfileHref).toBe("https://www.patreon.com/mycampaign");
  });
});
