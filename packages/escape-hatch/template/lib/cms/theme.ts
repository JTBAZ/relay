/**
 * Local kit CMS mutations for appearance/theme (EH-062).
 * Writes site.json + theme artifacts — productionSafe remains false.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSiteBundle,
  type EscapeHatchTheme,
  type SiteBundle
} from "../contracts";
import { renderThemeCssVars } from "../theme";
import { loadSiteBundleFromKit, saveSiteBundle } from "./posts";

export type PublishThemeInput = Omit<
  Partial<EscapeHatchTheme>,
  "hero" | "community_cta"
> & {
  hero?: EscapeHatchTheme["hero"];
  community_cta?: EscapeHatchTheme["community_cta"] | null;
};

export type PublishThemeResult =
  | { ok: true; theme: EscapeHatchTheme }
  | { ok: false; reason: string };

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function mergeTheme(
  current: EscapeHatchTheme,
  patch: PublishThemeInput
): EscapeHatchTheme | { error: string } {
  const next: EscapeHatchTheme = {
    ...current,
    hero: { ...current.hero }
  };

  if (patch.color_scheme !== undefined) {
    if (!["dark", "light", "warm"].includes(patch.color_scheme)) {
      return { error: "invalid_color_scheme" };
    }
    next.color_scheme = patch.color_scheme;
  }
  if (patch.paywall_style !== undefined) {
    if (!["blur", "hard", "teaser"].includes(patch.paywall_style)) {
      return { error: "invalid_paywall_style" };
    }
    next.paywall_style = patch.paywall_style;
  }
  if (patch.accent_color !== undefined) {
    const accent = patch.accent_color.trim();
    if (accent && !HEX_RE.test(accent)) {
      return { error: "invalid_accent_color" };
    }
    if (accent) next.accent_color = accent;
    else delete next.accent_color;
  }
  if (patch.type_pairing !== undefined) {
    if (!["editorial", "studio", "signal"].includes(patch.type_pairing)) {
      return { error: "invalid_type_pairing" };
    }
    next.type_pairing = patch.type_pairing;
  }
  if (patch.gallery_density !== undefined) {
    if (!["comfortable", "compact"].includes(patch.gallery_density)) {
      return { error: "invalid_gallery_density" };
    }
    next.gallery_density = patch.gallery_density;
  }
  if (patch.cover_crop !== undefined) {
    if (!["center", "top", "safe"].includes(patch.cover_crop)) {
      return { error: "invalid_cover_crop" };
    }
    next.cover_crop = patch.cover_crop;
  }
  if (patch.logo_path !== undefined) {
    const logo = patch.logo_path.trim();
    if (logo) next.logo_path = logo.slice(0, 500);
    else delete next.logo_path;
  }
  if (patch.paywall_message !== undefined) {
    const msg = patch.paywall_message.trim();
    if (msg) next.paywall_message = msg.slice(0, 500);
    else delete next.paywall_message;
  }
  if (patch.hero) {
    const title = (patch.hero.title ?? next.hero.title).trim();
    if (!title) return { error: "hero_title_required" };
    next.hero = { title: title.slice(0, 200) };
    if (patch.hero.subtitle?.trim()) {
      next.hero.subtitle = patch.hero.subtitle.trim().slice(0, 400);
    }
    if (patch.hero.bio?.trim()) {
      next.hero.bio = patch.hero.bio.trim().slice(0, 2_000);
    }
  }
  if (patch.community_cta === null) {
    delete next.community_cta;
  } else if (patch.community_cta) {
    const label = patch.community_cta.label?.trim() ?? "";
    const href = patch.community_cta.href?.trim() ?? "";
    if (!label || !href) return { error: "community_cta_incomplete" };
    next.community_cta = {
      label: label.slice(0, 80),
      href: href.slice(0, 500)
    };
  }

  return next;
}

function writeThemeArtifacts(bundle: SiteBundle, kitDir: string): void {
  const themeJson = `${JSON.stringify(bundle.theme, null, 2)}\n`;
  const siteJson = `${JSON.stringify(
    {
      site_id: bundle.site_id,
      creator: bundle.creator,
      theme: bundle.theme,
      base_url: bundle.base_url
    },
    null,
    2
  )}\n`;

  mkdirSync(join(kitDir, "data"), { recursive: true });
  mkdirSync(join(kitDir, "public"), { recursive: true });
  mkdirSync(join(kitDir, "app"), { recursive: true });

  writeFileSync(join(kitDir, "data", "theme.json"), themeJson, "utf8");
  writeFileSync(join(kitDir, "public", "theme.json"), themeJson, "utf8");
  writeFileSync(join(kitDir, "public", "site.json"), siteJson, "utf8");
  writeFileSync(
    join(kitDir, "app", "theme-vars.css"),
    renderThemeCssVars(bundle.theme),
    "utf8"
  );
}

/**
 * Publish approved theme dials into kit data (no raw CSS/scripts).
 */
export function publishTheme(
  patch: PublishThemeInput,
  kitDir = process.cwd()
): PublishThemeResult {
  const bundle = loadSiteBundleFromKit(kitDir);
  const merged = mergeTheme(bundle.theme, patch);
  if ("error" in merged) return { ok: false, reason: merged.error };

  const updated: SiteBundle = parseSiteBundle({
    ...bundle,
    theme: merged,
    generated_at: new Date().toISOString()
  });
  saveSiteBundle(updated, kitDir);
  writeThemeArtifacts(updated, kitDir);
  return { ok: true, theme: updated.theme };
}

export function themeArtifactPaths(kitDir: string): string[] {
  return [
    join(kitDir, "data", "site.json"),
    join(kitDir, "data", "theme.json"),
    join(kitDir, "public", "theme.json"),
    join(kitDir, "public", "site.json"),
    join(kitDir, "app", "theme-vars.css")
  ];
}
