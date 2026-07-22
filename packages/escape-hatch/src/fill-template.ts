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
    {
      bg: string;
      fg: string;
      muted: string;
      card: string;
      deep: string;
      hover: string;
      border: string;
      atmosphere: string;
      colorScheme: string;
    }
  > = {
    dark: {
      bg: "#141210",
      fg: "#f4efe6",
      muted: "#a89f93",
      card: "#1c1a17",
      deep: "#0c0b09",
      hover: "#26221c",
      border: "#2e2a24",
      atmosphere:
        "radial-gradient(ellipse 90% 55% at 50% -10%, color-mix(in srgb, var(--eh-accent) 22%, transparent), transparent 70%), linear-gradient(180deg, #1a1714 0%, #141210 42%, #0c0b09 100%)",
      colorScheme: "dark"
    },
    light: {
      bg: "#f0ebe3",
      fg: "#1a1814",
      muted: "#5c564c",
      card: "#faf7f2",
      deep: "#e4ddd2",
      hover: "#ebe4d8",
      border: "#d4cdc0",
      atmosphere:
        "radial-gradient(ellipse 90% 50% at 50% -8%, color-mix(in srgb, var(--eh-accent) 16%, transparent), transparent 68%), linear-gradient(180deg, #f7f3ec 0%, #f0ebe3 50%, #e8e1d6 100%)",
      colorScheme: "light"
    },
    warm: {
      bg: "#10141a",
      fg: "#eef2f6",
      muted: "#9aa6b2",
      card: "#161b22",
      deep: "#0a0d11",
      hover: "#1e2530",
      border: "#2a3340",
      atmosphere:
        "radial-gradient(ellipse 85% 50% at 50% -12%, color-mix(in srgb, var(--eh-accent) 20%, transparent), transparent 72%), linear-gradient(180deg, #141a22 0%, #10141a 45%, #0a0d11 100%)",
      colorScheme: "dark"
    }
  };
  const pairings: Record<string, { display: string; body: string }> = {
    editorial: {
      display:
        'var(--font-fraunces), "Iowan Old Style", "Palatino Linotype", Palatino, serif',
      body: 'var(--font-source-sans), "Segoe UI", system-ui, sans-serif'
    },
    studio: {
      display: 'var(--font-instrument-serif), "Iowan Old Style", Georgia, serif',
      body: 'var(--font-dm-sans), "Segoe UI", system-ui, sans-serif'
    },
    signal: {
      display:
        'var(--font-space-grotesk), "Avenir Next", "Segoe UI", system-ui, sans-serif',
      body: 'var(--font-newsreader), "Iowan Old Style", Georgia, serif'
    }
  };
  const crops: Record<string, string> = {
    center: "center",
    top: "center top",
    safe: "center 30%"
  };
  const densities: Record<string, string> = {
    comfortable: "280px",
    compact: "180px"
  };
  const s = schemes[theme.color_scheme] ?? schemes.dark;
  const pairing = pairings[theme.type_pairing ?? "editorial"] ?? pairings.editorial;
  const accent = theme.accent_color ?? "#c4784a";
  const cover = crops[theme.cover_crop ?? "center"] ?? crops.center;
  const gridMin = densities[theme.gallery_density ?? "comfortable"] ?? densities.comfortable;
  return `:root {
  color-scheme: ${s.colorScheme};
  --eh-bg: ${s.bg};
  --eh-fg: ${s.fg};
  --eh-muted: ${s.muted};
  --eh-card: ${s.card};
  --eh-accent: ${accent};
  --eh-bg-deep: ${s.deep};
  --eh-hover: ${s.hover};
  --eh-border: ${s.border};
  --eh-atmosphere: ${s.atmosphere};
  --eh-font-display: ${pairing.display};
  --eh-font-body: ${pairing.body};
  --eh-cover-position: ${cover};
  --eh-grid-min: ${gridMin};
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

/** Chassis files that must be present in every generated kit (EH-020 / EH-031). */
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
  "lib/identity/types.ts",
  "lib/identity/entitlements.ts",
  "lib/identity/session.ts",
  "lib/identity/admin-access.ts",
  "lib/entitlements/types.ts",
  "lib/entitlements/freshness.ts",
  "lib/entitlements/merge.ts",
  "lib/entitlements/gate.ts",
  "lib/entitlements/evaluate.ts",
  "lib/entitlements/server.ts",
  "lib/entitlements/index.ts",
  "lib/supabase/client.ts",
  "lib/supabase/server.ts",
  "lib/portable-auth/index.ts",
  "lib/portable-auth/crypto.ts",
  "lib/portable-auth/db.ts",
  "lib/portable-auth/session.ts",
  "db/schema/0001_preview_chassis.sql",
  "db/schema/0002_identity_rls.sql",
  "db/schema/0003_portable_identity.sql",
  "db/schema/0004_entitlement_evaluator_supabase.sql",
  "db/schema/0004_entitlement_evaluator_portable.sql",
  "db/migrations/0001_preview_chassis.sql",
  "db/migrations/0002_identity_rls.sql",
  "db/migrations/0003_portable_identity.sql",
  "db/migrations/0004_entitlement_evaluator_supabase.sql",
  "db/migrations/0004_entitlement_evaluator_portable.sql",
  "db/docker-init/01_preview_chassis.sql",
  "db/docker-init/02_portable_identity.sql",
  "db/docker-init/03_entitlement_evaluator.sql",
  "db/README.md",
  "scripts/bootstrap-identity.md",
  "deploy/README.md",
  "app/login/page.tsx",
  "app/auth/callback/route.ts",
  "app/auth/logout/route.ts",
  "app/auth/portable/login/route.ts",
  "components/PortableLoginForm.tsx"
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
  parsed.slice = "EH-032";
  parsed.productionSafe = false;
  parsed.schema_version = "eh-db/0004_entitlement_evaluator";
  parsed.feature_flags = {
    ...parsed.feature_flags,
    soft_persona_gate: true,
    hard_paywall: false,
    signed_media_delivery: false,
    supabase_identity: true,
    portable_identity: true,
    entitlement_evaluator: true,
    stripe_billing: false,
    native_admin: true
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
      "**Soft gate remains for local preview** — persona switching is demo UI only, not production security.",
      "Identity: Path A Supabase (`ESCAPE_HATCH_IDENTITY_PROVIDER=supabase` or unset + Supabase env) or Path B portable (`=portable` + DATABASE_URL).",
      "Locked media is still present in `/public/media`; do not deploy this kit as a real paywall.",
      "`productionSafe: false` — EH-031 identity paths available; not EH-033 signed private media delivery.",
      "",
      `Contract: ${bundle.contract_version}`,
      "",
      "## Hatch Console (open these in order)",
      "",
      "1. `/library` — Library truth audit (parity, anomalies, exclude)",
      "2. `/structure` — tiers & posts detected (accuracy)",
      "3. `/style` — few aesthetic dials (session peek)",
      "4. `/admin` — operator shell (health, posts, media, tiers)",
      "5. `/login` — Supabase magic-link or portable password (when provider configured)",
      "6. `/preview` — visitor walkthrough (soft gate)",
      "",
      "`/` redirects to Library. Library truth rebuilds parity from data/ artifacts on every load (never trusts a tampered report alone).",
      "Admin mutations: local-operator when identity unset; staff session when Path A/B configured. Soft personas never authorize admin.",
      "",
      "## Chassis (EH-020) + theme (EH-021) + admin (EH-022) + identity (EH-030/031)",
      "",
      "- Typed env: `lib/env.ts` + `.env.example` (names only — never commit secrets)",
      "- SQL migrations: Path A `0001`+`0002`; Path B `0001`+`0003` (see `db/README.md`)",
      "- Bootstrap: `scripts/bootstrap-identity.md`",
      "- Adapters: `lib/adapters/` — Auth/DB ready when env is real; still preview until EH-033",
      "- Admin: `/admin` routes — distinct from visitor gallery",
      "- Deploy: `vercel.json`, `Dockerfile`, optional `docker-compose.yml` (Path B profile `db`)",
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
