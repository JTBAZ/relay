/**
 * EH-060 — Posts/media CMS (local kit mutations).
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  SITE_BUNDLE_CONTRACT_VERSION,
  parseSiteBundle,
  type SiteBundle
} from "../src/contracts.js";
import {
  attachLocalMediaFile,
  isPublishedForGallery,
  sanitizeBodyPlain,
  sortPostsForGallery,
  upsertPost,
  writeSiteBundleForKit
} from "../template/lib/cms/posts.js";

function minimalBundle(over?: Partial<SiteBundle>): SiteBundle {
  return parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: "site_eh_060",
    creator_id: "creator_eh_060",
    generated_at: "2026-07-23T12:00:00.000Z",
    base_url: "/",
    creator: { display_name: "Test", handle: "test" },
    theme: {
      color_scheme: "light",
      paywall_style: "blur",
      hero: { title: "Test" }
    },
    demo_personas: [{ id: "public", label: "Public", tier_ids: [] }],
    tiers: [
      {
        tier_id: "tier_basic",
        title: "Basic",
        access_level: "tier_gated",
        amount_cents: 500
      }
    ],
    posts: [],
    total_media: 0,
    ...over
  });
}

describe("EH-060 status", () => {
  it("advances slice to EH-071 with next EH-072 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-071");
    expect(status.slice).toBe("EH-071");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-072");
  });
});

describe("EH-060 CMS posts", () => {
  it("sanitizes body_plain by stripping tags", () => {
    expect(sanitizeBodyPlain("<b>Hi</b> &amp; there")).toBe("Hi & there");
  });

  it("creates, drafts, and publishes posts in site.json", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh060-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      const created = upsertPost(
        {
          title: "Hello World",
          access_level: "public",
          status: "draft",
          body_plain: "<script>x</script>Plain body",
          feature_order: 1
        },
        kitDir
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.created).toBe(true);
      expect(created.post.status).toBe("draft");
      expect(created.post.body_plain).toBe("Plain body");
      expect(isPublishedForGallery(created.post)).toBe(false);

      const published = upsertPost(
        {
          post_id: created.post.post_id,
          title: "Hello World",
          access_level: "public",
          status: "published",
          feature_order: 1
        },
        kitDir
      );
      expect(published.ok).toBe(true);
      if (!published.ok) return;
      expect(isPublishedForGallery(published.post)).toBe(true);

      const second = upsertPost(
        {
          title: "Later",
          access_level: "member_only",
          status: "published",
          feature_order: 5
        },
        kitDir
      );
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      const ordered = sortPostsForGallery([published.post, second.post]);
      expect(ordered[0]?.post_id).toBe(published.post.post_id);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("attaches local media bytes under data/private-media", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh060m-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);
      const created = upsertPost(
        { title: "With media", access_level: "public", status: "published" },
        kitDir
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const src = join(kitDir, "sample.svg");
      writeFileSync(
        src,
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        "utf8"
      );
      const attached = attachLocalMediaFile(
        {
          postId: created.post.post_id,
          sourceFilePath: src,
          mimeType: "image/svg+xml",
          publicCopy: true
        },
        kitDir
      );
      expect(attached.ok).toBe(true);
      if (!attached.ok) return;
      expect(attached.media.content_path).toMatch(/^\/media\//);
      expect(attached.post.media.length).toBe(1);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
