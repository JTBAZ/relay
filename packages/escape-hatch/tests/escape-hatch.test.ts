import { describe, expect, it } from "vitest";
import {
  canAccessPost,
  canViewPost,
  rewriteExportApiPath,
  rewriteMediaContentPath
} from "../src/access.js";
import { fromClone } from "../src/from-clone.js";
import type { CloneSiteModelInput, DemoPersona } from "../src/types.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fillTemplate, PACKAGE_ROOT } from "../src/fill-template.js";

describe("access matrix", () => {
  const publicPersona: DemoPersona = {
    id: "public",
    label: "Public",
    tier_ids: []
  };
  const patron: DemoPersona = {
    id: "patron",
    label: "Patron",
    tier_ids: ["t_gold"]
  };
  const silver: DemoPersona = {
    id: "silver",
    label: "Silver",
    tier_ids: ["t_silver"]
  };

  it("allows public posts for everyone", () => {
    const access = { level: "public" as const, tier_ids: [] };
    expect(canAccessPost(access, [])).toBe(true);
    expect(canAccessPost(access, ["t_gold"])).toBe(true);
  });

  it("requires any paid tier for member_only", () => {
    const access = { level: "member_only" as const, tier_ids: [] };
    expect(canAccessPost(access, [])).toBe(false);
    expect(canAccessPost(access, ["t_gold"])).toBe(true);
  });

  it("requires matching tier for tier_gated", () => {
    const access = { level: "tier_gated" as const, tier_ids: ["t_gold"] };
    expect(canAccessPost(access, [])).toBe(false);
    expect(canAccessPost(access, ["t_silver"])).toBe(false);
    expect(canAccessPost(access, ["t_gold"])).toBe(true);
  });

  it("canViewPost uses persona tiers", () => {
    const post = {
      post_id: "p",
      slug: "s",
      title: "t",
      published_at: "2026-01-01T00:00:00Z",
      tag_ids: [],
      access: { level: "tier_gated" as const, tier_ids: ["t_gold"] },
      media: []
    };
    expect(canViewPost(post, publicPersona)).toBe(false);
    expect(canViewPost(post, silver)).toBe(false);
    expect(canViewPost(post, patron)).toBe(true);
  });
});

describe("path rewrite", () => {
  it("rewrites export API paths to /media/{id}{ext}", () => {
    expect(
      rewriteExportApiPath(
        "/api/v1/export/media/cr1/m_api/content",
        "m_api",
        "image/png"
      )
    ).toBe("/media/m_api.png");
  });

  it("leaves local /media paths alone", () => {
    expect(rewriteExportApiPath("/media/m1.svg", "m1", "image/svg+xml")).toBe(
      "/media/m1.svg"
    );
  });

  it("rewriteMediaContentPath picks mime extension", () => {
    expect(rewriteMediaContentPath("m1", "image/jpeg")).toBe("/media/m1.jpg");
  });
});

describe("fromClone adapter", () => {
  it("rewrites clone API media paths and builds personas", () => {
    const clone = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "fixtures", "clone-site.json"), "utf8")
    ) as CloneSiteModelInput;
    const bundle = fromClone({
      clone,
      creator: { display_name: "Demo", handle: "demo" }
    });
    expect(bundle.posts[0].media[0].content_path).toBe("/media/m_api.png");
    expect(bundle.posts[1].media[0].content_path).toBe("/media/m_gold2.jpg");
    expect(bundle.demo_personas.some((p) => p.id === "public")).toBe(true);
    expect(bundle.demo_personas.some((p) => p.id === "tier:t_gold")).toBe(true);
  });
});

describe("fill-template integration", () => {
  it("writes site.json, theme, and media into .out", () => {
    const bundle = JSON.parse(
      readFileSync(
        join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"),
        "utf8"
      )
    );
    const result = fillTemplate({
      bundle,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug: "test-fill-integration",
      clean: true
    });
    expect(existsSync(result.siteJsonPath)).toBe(true);
    expect(existsSync(result.themeJsonPath)).toBe(true);
    expect(existsSync(join(result.outDir, "app", "page.tsx"))).toBe(true);
    expect(
      existsSync(join(result.outDir, "public", "media", "m_public.svg"))
    ).toBe(true);
    expect(
      existsSync(join(result.outDir, "public", "media", "m_gold.svg"))
    ).toBe(true);
    const site = JSON.parse(readFileSync(result.siteJsonPath, "utf8"));
    expect(site.creator.handle).toBe("elena-adler");
    expect(site.posts).toHaveLength(3);
  });
});

describe("from-clone fill integration", () => {
  it("adapts clone JSON then fills a site tree", () => {
    const clone = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "fixtures", "clone-site.json"), "utf8")
    ) as CloneSiteModelInput;
    const bundle = fromClone({
      clone,
      creator: { display_name: "Clone Demo", handle: "clone-fill" }
    });
    const result = fillTemplate({
      bundle,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug: "test-clone-fill",
      clean: true
    });
    expect(existsSync(result.siteJsonPath)).toBe(true);
    const site = JSON.parse(readFileSync(result.siteJsonPath, "utf8"));
    expect(site.posts[0].media[0].content_path).toBe("/media/m_api.png");
  });
});
