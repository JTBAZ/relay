/**
 * EH-021 Premium patron theme: branding dial validation (preserved under EH-030),
 * fillTemplate theme CSS tokens, productionSafe false.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  COVER_CROPS,
  GALLERY_DENSITIES,
  TYPE_PAIRINGS,
  parseSiteBundle,
  serializeSiteBundle
} from "../src/contracts.js";
import { fillTemplate } from "../src/fill-template.js";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_BUNDLE = join(PACKAGE_ROOT, "fixtures", "sample.bundle.json");
const MEDIA_DIR = join(PACKAGE_ROOT, "fixtures", "media");

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function loadSample(): unknown {
  return JSON.parse(readFileSync(SAMPLE_BUNDLE, "utf8"));
}

describe("EH-021 theme capability (preserved under EH-032)", () => {
  it("keeps premium-patron-theme preview_only with productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-072");
    expect(status.slice).toBe("EH-072");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-073");
    const theme = status.capabilities.find((c) => c.id === "premium-patron-theme");
    expect(theme?.state).toBe("preview_only");
    expect(theme?.evidence).toMatch(/soft-gate|preview-only/i);
    expect(theme?.evidence).toMatch(/productionSafe remains false/i);
    expect(theme?.evidence).not.toMatch(/EH-033 private media delivery claimed/i);
    expect(theme?.nextSlice).toBe("EH-073");
  });
});

describe("EH-021 theme branding fields", () => {
  it("parses sample bundle branding dials", () => {
    const bundle = parseSiteBundle(loadSample());
    expect(bundle.theme.color_scheme).toBe("dark");
    expect(bundle.theme.accent_color).toBe("#4a7fc4");
    expect(bundle.theme.type_pairing).toBe("editorial");
    expect(bundle.theme.gallery_density).toBe("comfortable");
    expect(bundle.theme.cover_crop).toBe("center");
    expect(bundle.theme.logo_path).toBe("/media/m_public.svg");
    expect(bundle.theme.paywall_message).toMatch(/Members only/i);
    expect(bundle.theme.community_cta?.label).toMatch(/community/i);
    expect(bundle.theme.community_cta?.href).toMatch(/^https?:\/\//);
  });

  it("accepts legacy themes without optional branding dials", () => {
    const legacy = parseSiteBundle({
      site_id: "site_legacy_theme",
      creator_id: "cr_legacy",
      generated_at: "2026-07-01T00:00:00.000Z",
      base_url: "http://localhost:3001",
      creator: { display_name: "Legacy", handle: "legacy" },
      theme: {
        color_scheme: "light",
        paywall_style: "hard",
        hero: { title: "Legacy Gallery" }
      },
      demo_personas: [{ id: "public", label: "Public", tier_ids: [] }],
      tiers: [],
      posts: [],
      total_media: 0
    });
    expect(legacy.theme.type_pairing).toBeUndefined();
    expect(legacy.theme.gallery_density).toBeUndefined();
    expect(legacy.theme.cover_crop).toBeUndefined();
    expect(legacy.theme.logo_path).toBeUndefined();
    expect(legacy.theme.community_cta).toBeUndefined();
  });

  it("rejects invalid type pairing, density, and cover crop enums", () => {
    const base = parseSiteBundle(loadSample());
    const raw = JSON.parse(serializeSiteBundle(base)) as Record<string, unknown>;
    const theme = { ...(raw.theme as Record<string, unknown>) };

    expect(() =>
      parseSiteBundle({ ...raw, theme: { ...theme, type_pairing: "comic-sans" } })
    ).toThrow(/type_pairing/);

    expect(() =>
      parseSiteBundle({ ...raw, theme: { ...theme, gallery_density: "dense" } })
    ).toThrow(/gallery_density/);

    expect(() =>
      parseSiteBundle({ ...raw, theme: { ...theme, cover_crop: "left" } })
    ).toThrow(/cover_crop/);
  });

  it("rejects incomplete community_cta objects", () => {
    const base = parseSiteBundle(loadSample());
    const raw = JSON.parse(serializeSiteBundle(base)) as Record<string, unknown>;
    const theme = { ...(raw.theme as Record<string, unknown>) };
    expect(() =>
      parseSiteBundle({
        ...raw,
        theme: { ...theme, community_cta: { label: "Join" } }
      })
    ).toThrow(/community_cta/);
  });

  it("exposes approved pairing and density catalogs", () => {
    expect([...TYPE_PAIRINGS]).toEqual(["editorial", "studio", "signal"]);
    expect([...GALLERY_DENSITIES]).toEqual(["comfortable", "compact"]);
    expect([...COVER_CROPS]).toEqual(["center", "top", "safe"]);
  });
});

describe("EH-021 fillTemplate theme tokens", () => {
  it("writes theme CSS vars for branding dials and manifest EH-032", () => {
    const slug = `eh021-theme-${Date.now()}`;
    const result = fillTemplate({
      bundle: loadSample(),
      mediaSourceDir: MEDIA_DIR,
      slug,
      clean: true
    });
    tempDirs.push(result.outDir);

    const css = readFileSync(join(result.outDir, "app", "theme-vars.css"), "utf8");
    expect(css).toMatch(/--eh-accent:\s*#4a7fc4/);
    expect(css).toMatch(/--eh-font-display:/);
    expect(css).toMatch(/--font-outfit/);
    expect(css).toMatch(/--eh-font-body:/);
    expect(css).toMatch(/--eh-grid-min:\s*280px/);
    expect(css).toMatch(/--eh-cover-position:\s*center/);
    expect(css).toMatch(/color-scheme:\s*dark/);

    const themeJson = JSON.parse(
      readFileSync(join(result.outDir, "data", "theme.json"), "utf8")
    ) as {
      type_pairing?: string;
      paywall_message?: string;
      community_cta?: { label: string };
    };
    expect(themeJson.type_pairing).toBe("editorial");
    expect(themeJson.paywall_message).toMatch(/Members only/i);
    expect(themeJson.community_cta?.label).toMatch(/community/i);

    const manifest = JSON.parse(
      readFileSync(join(result.outDir, "escape-hatch.manifest.json"), "utf8")
    ) as { slice: string; productionSafe: boolean };
    expect(manifest.slice).toBe("EH-072");
    expect(manifest.productionSafe).toBe(false);

    expect(existsSync(join(result.outDir, "components", "PatronChrome.tsx"))).toBe(
      true
    );
    expect(existsSync(join(result.outDir, "lib", "theme.ts"))).toBe(true);
  });

  it("applies compact density and safe cover crop overrides", () => {
    const slug = `eh021-dials-${Date.now()}`;
    const result = fillTemplate({
      bundle: loadSample(),
      mediaSourceDir: MEDIA_DIR,
      slug,
      clean: true,
      themeOverride: {
        gallery_density: "compact",
        cover_crop: "safe",
        type_pairing: "signal",
        color_scheme: "light",
        accent_color: "#2a9d8f"
      }
    });
    tempDirs.push(result.outDir);

    const css = readFileSync(join(result.outDir, "app", "theme-vars.css"), "utf8");
    expect(css).toMatch(/--eh-grid-min:\s*180px/);
    expect(css).toMatch(/--eh-cover-position:\s*center 30%/);
    expect(css).toMatch(/--eh-accent:\s*#2a9d8f/);
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).toMatch(/--font-space-grotesk|--font-newsreader/);
  });
});
