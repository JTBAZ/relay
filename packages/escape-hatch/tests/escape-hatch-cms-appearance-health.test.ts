/**
 * EH-062 — Appearance / connections / health CMS.
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
import { writeSiteBundleForKit } from "../template/lib/cms/posts.js";
import {
  publishTheme,
  themeArtifactPaths
} from "../template/lib/cms/theme.js";
import {
  buildConnectionCards,
  buildHealthItems
} from "../template/lib/admin/connections.js";

function minimalBundle(over?: Partial<SiteBundle>): SiteBundle {
  return parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: "site_eh_062",
    creator_id: "creator_eh_062",
    generated_at: "2026-07-23T16:00:00.000Z",
    base_url: "/",
    creator: { display_name: "Test", handle: "test" },
    theme: {
      color_scheme: "light",
      paywall_style: "blur",
      hero: { title: "Before" }
    },
    demo_personas: [{ id: "public", label: "Public", tier_ids: [] }],
    tiers: [],
    posts: [],
    total_media: 0,
    ...over
  });
}

describe("EH-062 status", () => {
  it("advances slice to EH-064 with next EH-070 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-064");
    expect(status.slice).toBe("EH-064");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-070");
    expect(status.nextSlice.title).toMatch(/vercel|deploy/i);
  });
});

describe("EH-062 appearance + health", () => {
  it("publishes theme dials into site.json and theme-vars.css", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh062-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      const bad = publishTheme({ color_scheme: "neon" as never }, kitDir);
      expect(bad.ok).toBe(false);

      const published = publishTheme(
        {
          color_scheme: "warm",
          accent_color: "#2a9d8f",
          type_pairing: "studio",
          gallery_density: "compact",
          cover_crop: "safe",
          paywall_style: "teaser",
          paywall_message: "Join to unlock",
          hero: { title: "After", subtitle: "Sub", bio: "Bio" },
          community_cta: { label: "Discord", href: "https://example.com" }
        },
        kitDir
      );
      expect(published.ok).toBe(true);
      if (!published.ok) return;
      expect(published.theme.color_scheme).toBe("warm");
      expect(published.theme.hero.title).toBe("After");
      expect(published.theme.community_cta?.label).toBe("Discord");

      for (const path of themeArtifactPaths(kitDir)) {
        expect(existsSync(path)).toBe(true);
      }
      const css = readFileSync(join(kitDir, "app", "theme-vars.css"), "utf8");
      expect(css).toMatch(/--eh-accent:\s*#2a9d8f/);
      expect(css).toMatch(/color-scheme:\s*dark/);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("builds connection cards and health items with next actions", () => {
    const cards = buildConnectionCards([
      {
        id: "billing",
        implementation: "stub",
        ok: false,
        detail: "Billing stub"
      },
      {
        id: "auth",
        implementation: "supabase",
        ok: true,
        detail: "Configured preview"
      }
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0]?.next_action).toMatch(/STRIPE|billing|Patreon/i);
    expect(cards[0]?.what_breaks.length).toBeGreaterThan(0);
    expect(cards[1]?.next_action).toMatch(/preview|productionSafe/i);

    const items = buildHealthItems({
      adapters: cards.map((c) => ({
        id: c.id,
        implementation: c.implementation,
        ok: c.ok,
        detail: c.detail
      })),
      blockers: ["Example blocker"],
      manifestSlice: "EH-062",
      publicMediaHonesty: "public/media is never private-verified"
    });
    expect(items.some((i) => i.id === "kit_version" && i.ok)).toBe(true);
    expect(items.every((i) => i.next_action.length > 0)).toBe(true);
    expect(items.some((i) => /blocker/i.test(i.id))).toBe(true);
  });
});
