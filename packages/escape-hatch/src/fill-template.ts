/**
 * Fill a Next.js template directory with SiteBundle data + media.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EscapeHatchTheme, SiteBundle } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(__dirname, "..");
export const TEMPLATE_DIR = join(PACKAGE_ROOT, "template");
export const OUT_ROOT = join(PACKAGE_ROOT, ".out");

const SKIP_COPY_NAMES = new Set(["node_modules", ".next", ".git"]);

function copyTemplate(dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(TEMPLATE_DIR)) {
    if (SKIP_COPY_NAMES.has(name)) continue;
    const src = join(TEMPLATE_DIR, name);
    const target = join(dest, name);
    cpSync(src, target, { recursive: true });
  }
}

function themeCssVars(theme: EscapeHatchTheme): string {
  const schemes: Record<
    string,
    { bg: string; fg: string; muted: string; card: string; deep: string; hover: string; border: string }
  > = {
    dark: {
      bg: "#313338",
      fg: "#f2f3f5",
      muted: "#b5bac1",
      card: "#2b2d31",
      deep: "#1e1f22",
      hover: "#35373c",
      border: "#3f4147"
    },
    light: {
      bg: "#ffffff",
      fg: "#060607",
      muted: "#4e5058",
      card: "#f2f3f5",
      deep: "#e3e5e8",
      hover: "#ebebeb",
      border: "#d1d3d7"
    },
    warm: {
      bg: "#2b2d31",
      fg: "#f2f3f5",
      muted: "#b5bac1",
      card: "#1e1f22",
      deep: "#111214",
      hover: "#35373c",
      border: "#3f4147"
    }
  };
  const s = schemes[theme.color_scheme] ?? schemes.dark;
  const accent = theme.accent_color ?? "#5865f2";
  return `:root {
  --eh-bg: ${s.bg};
  --eh-fg: ${s.fg};
  --eh-muted: ${s.muted};
  --eh-card: ${s.card};
  --eh-accent: ${accent};
  --eh-bg-deep: ${s.deep};
  --eh-hover: ${s.hover};
  --eh-border: ${s.border};
}
`;
}

export type FillOptions = {
  bundle: SiteBundle;
  /** Absolute or package-relative path to a media source directory (files named by media_id + ext). */
  mediaSourceDir?: string;
  /** Optional theme override (wizard). */
  themeOverride?: Partial<EscapeHatchTheme>;
  /** Output slug; defaults to creator handle. */
  slug?: string;
  /** Wipe existing out dir for slug. */
  clean?: boolean;
};

export type FillResult = {
  outDir: string;
  slug: string;
  siteJsonPath: string;
  themeJsonPath: string;
};

export function fillTemplate(opts: FillOptions): FillResult {
  const theme: EscapeHatchTheme = {
    ...opts.bundle.theme,
    ...opts.themeOverride,
    hero: {
      ...opts.bundle.theme.hero,
      ...(opts.themeOverride?.hero ?? {})
    }
  };
  const bundle: SiteBundle = { ...opts.bundle, theme };
  const slug = opts.slug ?? bundle.creator.handle ?? bundle.creator_id;
  const outDir = join(OUT_ROOT, slug);

  if (opts.clean !== false && existsSync(outDir)) {
    // Preserve installed Next deps so refill doesn't force reinstall every time
    for (const name of readdirSync(outDir)) {
      if (name === "node_modules" || name === ".next") continue;
      rmSync(join(outDir, name), { recursive: true, force: true });
    }
  } else {
    mkdirSync(outDir, { recursive: true });
  }

  copyTemplate(outDir);

  const dataDir = join(outDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const siteJsonPath = join(dataDir, "site.json");
  const themeJsonPath = join(dataDir, "theme.json");
  writeFileSync(siteJsonPath, JSON.stringify(bundle, null, 2), "utf8");
  writeFileSync(themeJsonPath, JSON.stringify(theme, null, 2), "utf8");

  const cssPath = join(outDir, "app", "theme-vars.css");
  writeFileSync(cssPath, themeCssVars(theme), "utf8");

  // Client-readable copies
  const publicDir = join(outDir, "public");
  mkdirSync(join(publicDir, "media"), { recursive: true });
  writeFileSync(join(publicDir, "site.json"), JSON.stringify(bundle, null, 2), "utf8");
  writeFileSync(join(publicDir, "theme.json"), JSON.stringify(theme, null, 2), "utf8");

  const mediaSource = opts.mediaSourceDir
    ? resolve(opts.mediaSourceDir)
    : join(PACKAGE_ROOT, "fixtures", "media");

  if (existsSync(mediaSource)) {
    copyMediaIntoPublic(bundle, mediaSource, join(publicDir, "media"));
  }

  writeFileSync(
    join(outDir, "ESCAPE_HATCH.md"),
    [
      "# Escape Hatch site kit",
      "",
      "**Soft gate only** — persona switching is for demo. This is not production security.",
      "Locked media is still present in `/public/media`; do not deploy this kit as a real paywall.",
      "",
      "## Hatch Console (open these in order)",
      "",
      "1. `/structure` — tiers & posts detected (accuracy)",
      "2. `/style` — few aesthetic dials (session peek)",
      "3. `/preview` — visitor walkthrough (soft gate)",
      "",
      "`/` redirects to Structure. See `IA.md` in the escape-hatch package.",
      "",
      "## Run",
      "",
      "```bash",
      "npm install",
      "npm run dev",
      "```",
      "",
      `Creator: ${bundle.creator.display_name} (@${bundle.creator.handle})`,
      `Generated: ${bundle.generated_at}`,
      ""
    ].join("\n"),
    "utf8"
  );

  return { outDir, slug, siteJsonPath, themeJsonPath };
}

function copyMediaIntoPublic(
  bundle: SiteBundle,
  mediaSource: string,
  mediaDest: string
): void {
  mkdirSync(mediaDest, { recursive: true });
  const seen = new Set<string>();
  for (const post of bundle.posts) {
    for (const m of post.media) {
      if (seen.has(m.media_id)) continue;
      seen.add(m.media_id);
      const fileName = m.content_path.replace(/^\/media\//, "");
      const destFile = join(mediaDest, fileName);
      const candidates = [
        join(mediaSource, fileName),
        join(mediaSource, m.media_id),
        join(mediaSource, `${m.media_id}.svg`),
        join(mediaSource, `${m.media_id}.png`),
        join(mediaSource, `${m.media_id}.jpg`)
      ];
      const src = candidates.find((c) => existsSync(c) && statSync(c).isFile());
      if (src) {
        mkdirSync(dirname(destFile), { recursive: true });
        cpSync(src, destFile);
      }
    }
  }
}

export function loadThemeFile(themePath: string): EscapeHatchTheme {
  const raw = readFileSync(themePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as EscapeHatchTheme;
}

export function loadBundleFile(bundlePath: string): SiteBundle {
  const raw = readFileSync(bundlePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as SiteBundle;
}
