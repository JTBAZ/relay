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
import {
  ContractValidationError,
  isSafeRouteSegment,
  parseSiteBundle,
  serializeSiteBundle,
  type EscapeHatchTheme,
  type SiteBundle
} from "./contracts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(__dirname, "..");
export const TEMPLATE_DIR = join(PACKAGE_ROOT, "template");
export const OUT_ROOT = join(PACKAGE_ROOT, ".out");

/** Canonical contracts module path (copied into generated apps). */
export const CONTRACTS_SOURCE_PATH = join(PACKAGE_ROOT, "src", "contracts.ts");

/** Stable generated-app path for the self-contained contract module. */
export const GENERATED_CONTRACTS_RELATIVE_PATH = join("lib", "contracts.ts");

/**
 * Canonical library-truth rebuild modules (copied into generated kits with
 * NodeNext `.js` relative import suffixes stripped for bundler resolution).
 * Paths are relative to PACKAGE_ROOT / outDir respectively.
 */
export const LIBRARY_TRUTH_EMBED_SOURCES: ReadonlyArray<{
  from: string;
  to: string;
}> = [
  { from: join("src", "library-truth", "build-report.ts"), to: join("lib", "library-truth", "build-report.ts") },
  { from: join("src", "library-truth", "gate.ts"), to: join("lib", "library-truth", "gate.ts") },
  { from: join("src", "library-truth", "kit-io.ts"), to: join("lib", "library-truth", "kit-io.ts") },
  { from: join("src", "library-truth", "types.ts"), to: join("lib", "library-truth", "types.ts") },
  { from: join("src", "library-truth", "validate.ts"), to: join("lib", "library-truth", "validate.ts") },
  { from: join("src", "library-truth", "local-operator.ts"), to: join("lib", "library-truth", "local-operator.ts") },
  { from: join("src", "import", "types.ts"), to: join("lib", "import", "types.ts") },
  { from: join("src", "import", "validate.ts"), to: join("lib", "import", "validate.ts") },
  { from: join("src", "import", "path-safety.ts"), to: join("lib", "import", "path-safety.ts") },
  { from: join("src", "migrate", "types.ts"), to: join("lib", "migrate", "types.ts") },
  { from: join("src", "migrate", "validate.ts"), to: join("lib", "migrate", "validate.ts") }
];

/**
 * Strip `.js` from relative import/export module specifiers so embedded sources
 * resolve under the generated kit's `moduleResolution: "bundler"`.
 * Leaves bare package imports and `node:` builtins unchanged.
 */
export function rewriteKitModuleImports(source: string): string {
  return source.replace(
    /(\bfrom\s+|import\s*\(\s*|import\s+)(["'])(\.\.?\/[^"']+)\.js\2/g,
    "$1$2$3$2"
  );
}

/** Minimal import surface for kit library-truth rebuild (parsers only). */
export const GENERATED_IMPORT_INDEX_SOURCE = `/**
 * Generated-kit import parsers for library-truth rebuild (EH-013).
 * Extensionless relative imports for kit bundler resolution.
 */

export {
  parseImportLocalState,
  parseImportProvenance,
  parseImportReport,
  serializeImportDocument
} from "./validate";
export {
  CONFLICT_KINDS,
  EXCLUSION_KINDS,
  IMPORT_LOCAL_STATE_CONTRACT_VERSION,
  IMPORT_ORIGINS,
  IMPORT_PROVENANCE_CONTRACT_VERSION,
  IMPORT_REPORT_CONTRACT_VERSION,
  type AccountedItem,
  type ConflictItem,
  type ConflictKind,
  type ExclusionKind,
  type ImportLocalState,
  type ImportOrigin,
  type ImportProvenance,
  type ImportReport,
  type LocalPostState,
  type ProvenanceMediaEntry,
  type ProvenancePostEntry
} from "./types";
`;

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

/**
 * Embed the canonical contracts module into a generated (or template) site tree.
 * Generated apps must not import Relay-local paths; this file is self-contained.
 */
export function embedContractsModule(outDir: string): string {
  const dest = join(outDir, GENERATED_CONTRACTS_RELATIVE_PATH);
  mkdirSync(dirname(dest), { recursive: true });
  const source = readFileSync(CONTRACTS_SOURCE_PATH, "utf8");
  writeFileSync(dest, source, "utf8");
  return dest;
}

/**
 * Embed library-truth rebuild modules (and fail-closed import/migrate parsers)
 * so kit load/exclude/complete never trust a tampered on-disk parity report alone.
 * Relative `*.js` import suffixes are rewritten for the kit's bundler resolution.
 */
export function embedLibraryTruthModules(outDir: string): string[] {
  const written: string[] = [];
  for (const entry of LIBRARY_TRUTH_EMBED_SOURCES) {
    const dest = join(outDir, entry.to);
    mkdirSync(dirname(dest), { recursive: true });
    const source = readFileSync(join(PACKAGE_ROOT, entry.from), "utf8");
    writeFileSync(dest, rewriteKitModuleImports(source), "utf8");
    written.push(dest);
  }
  const importIndexPath = join(outDir, "lib", "import", "index.ts");
  mkdirSync(dirname(importIndexPath), { recursive: true });
  writeFileSync(
    importIndexPath,
    rewriteKitModuleImports(GENERATED_IMPORT_INDEX_SOURCE),
    "utf8"
  );
  written.push(importIndexPath);
  return written;
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
  /** Raw or versioned SiteBundle (validated/normalized before write). */
  bundle: unknown;
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
  contractsPath: string;
  libraryTruthModulePaths: string[];
  manifestPath: string;
  bundle: SiteBundle;
};

/** Chassis files that must be present in every generated kit (EH-020). */
export const GENERATED_CHASSIS_RELATIVE_PATHS = [
  "package.json",
  "tsconfig.json",
  "next.config.mjs",
  ".env.example",
  "vercel.json",
  "Dockerfile",
  ".dockerignore",
  "docker-compose.yml",
  "escape-hatch.manifest.json",
  "OWNERSHIP.md",
  "OPERATIONS.md",
  "lib/env.ts",
  "lib/adapters/index.ts",
  "lib/adapters/types.ts",
  "db/schema/0001_preview_chassis.sql",
  "db/migrations/0001_preview_chassis.sql",
  "db/README.md",
  "deploy/README.md"
] as const;

type EscapeHatchManifest = {
  contract_version: string;
  chassis_version: string;
  schema_version: string;
  slice: string;
  productionSafe: false;
  generated_at: string | null;
  creator_id: string | null;
  site_id: string | null;
  feature_flags: Record<string, boolean>;
  adapters: Record<string, unknown>;
  deploy_targets: unknown[];
  required_env_names: string[];
  optional_env_names: string[];
  applied_migrations: string[];
  known_exclusions: string[];
  source_export_manifest_hash: string | null;
  relay_optional_services: unknown[];
  warranty: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Stamp generation metadata into escape-hatch.manifest.json without
 * embedding secrets or patron PII.
 */
export function stampEscapeHatchManifest(
  outDir: string,
  bundle: SiteBundle
): string {
  const manifestPath = join(outDir, "escape-hatch.manifest.json");
  const raw = readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as EscapeHatchManifest;
  parsed.generated_at = bundle.generated_at;
  parsed.creator_id = bundle.creator_id;
  parsed.site_id = bundle.site_id ?? bundle.creator_id;
  parsed.slice = "EH-020";
  parsed.productionSafe = false;
  parsed.feature_flags = {
    ...parsed.feature_flags,
    soft_persona_gate: true,
    hard_paywall: false,
    signed_media_delivery: false,
    supabase_identity: false,
    stripe_billing: false
  };
  writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return manifestPath;
}

export function fillTemplate(opts: FillOptions): FillResult {
  const baseBundle = parseSiteBundle(opts.bundle);
  const theme: EscapeHatchTheme = {
    ...baseBundle.theme,
    ...opts.themeOverride,
    hero: {
      ...baseBundle.theme.hero,
      ...(opts.themeOverride?.hero ?? {})
    }
  };
  // Re-normalize after theme merge so output is always current contract.
  const bundle = parseSiteBundle({ ...baseBundle, theme });
  const slug = opts.slug ?? bundle.creator.handle ?? bundle.creator_id;
  if (!isSafeRouteSegment(slug)) {
    throw new ContractValidationError(
      "slug",
      "expected safe output directory segment",
      "path"
    );
  }
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
  const contractsPath = embedContractsModule(outDir);
  const libraryTruthModulePaths = embedLibraryTruthModules(outDir);
  const manifestPath = stampEscapeHatchManifest(outDir, bundle);

  const dataDir = join(outDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const siteJsonPath = join(dataDir, "site.json");
  const themeJsonPath = join(dataDir, "theme.json");
  const siteJson = serializeSiteBundle(bundle).replace(/\n$/, "");
  writeFileSync(siteJsonPath, siteJson, "utf8");
  writeFileSync(themeJsonPath, JSON.stringify(theme, null, 2), "utf8");

  const cssPath = join(outDir, "app", "theme-vars.css");
  writeFileSync(cssPath, themeCssVars(theme), "utf8");

  // Client-readable copies
  const publicDir = join(outDir, "public");
  mkdirSync(join(publicDir, "media"), { recursive: true });
  writeFileSync(join(publicDir, "site.json"), siteJson, "utf8");
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
      "`productionSafe: false` — Milestone 2 chassis (EH-020), not EH-033 signed delivery.",
      "",
      `Contract: ${bundle.contract_version}`,
      "",
      "## Hatch Console (open these in order)",
      "",
      "1. `/library` — Library truth audit (parity, anomalies, exclude)",
      "2. `/structure` — tiers & posts detected (accuracy)",
      "3. `/style` — few aesthetic dials (session peek)",
      "4. `/preview` — visitor walkthrough (soft gate)",
      "",
      "`/` redirects to Library. Library truth rebuilds parity from data/ artifacts on every load (never trusts a tampered report alone).",
      "",
      "## Standalone chassis (EH-020)",
      "",
      "- Typed env: `lib/env.ts` + `.env.example` (names only)",
      "- SQL migrations: `db/schema/`, `db/migrations/` (not required for `npm run build`)",
      "- Adapters: `lib/adapters/` + `escape-hatch.manifest.json`",
      "- Deploy: `vercel.json`, `Dockerfile`, optional `docker-compose.yml`",
      "- See `OPERATIONS.md` and `OWNERSHIP.md`",
      "",
      "## Run (clean directory — no Relay root env)",
      "",
      "```bash",
      "npm install",
      "npm run build",
      "npm run dev",
      "```",
      "",
      `Creator: ${bundle.creator.display_name} (@${bundle.creator.handle})`,
      `Generated: ${bundle.generated_at}`,
      ""
    ].join("\n"),
    "utf8"
  );

  return {
    outDir,
    slug,
    siteJsonPath,
    themeJsonPath,
    contractsPath,
    libraryTruthModulePaths,
    manifestPath,
    bundle
  };
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
  const parsed = JSON.parse(raw) as unknown;
  // Theme is validated as part of a bundle; accept partial wizard themes as plain objects.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("theme file: expected object");
  }
  return parsed as EscapeHatchTheme;
}

/** Load and validate/normalize a SiteBundle JSON file (legacy or current). */
export function loadBundleFile(bundlePath: string): SiteBundle {
  const raw = readFileSync(bundlePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw) as unknown;
  return parseSiteBundle(parsed);
}
