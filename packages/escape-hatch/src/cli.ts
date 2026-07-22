#!/usr/bin/env node
/**
 * Escape Hatch CLI: fixture | wizard | build | from-relay | from-clone |
 * import-relay-dump | zip | status
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { fromClone } from "./from-clone.js";
import { fromRelay } from "./from-relay.js";
import {
  fillTemplate,
  loadBundleFile,
  loadThemeFile,
  OUT_ROOT,
  PACKAGE_ROOT
} from "./fill-template.js";
import {
  DEFAULT_RELAY_DUMP_CREATOR_ID,
  DEFAULT_RELAY_DUMP_ROOT,
  importRelayDump,
  loadExistingImportArtifacts,
  serializeImportDocument,
  stageExportMediaSafe
} from "./import/index.js";
import { runWizard } from "./wizard.js";
import { buildEscapeHatchStatus, formatHumanStatus } from "./status.js";
import { zipExportKit } from "./zip-kit.js";
import type { EscapeHatchTheme, SiteBundle } from "./types.js";

function usage(): never {
  console.log(`Escape Hatch CLI

Usage:
  npx tsx src/cli.ts fixture [slug]
  npx tsx src/cli.ts wizard [bundle.json] [slug]
  npx tsx src/cli.ts build <bundle.json> [theme.json] [slug]
  npx tsx src/cli.ts from-relay <creator_id> [slug]
  npx tsx src/cli.ts from-clone <clone.json> [slug]
  npx tsx src/cli.ts import-relay-dump [slug]
  npx tsx src/cli.ts import-relay-dump <dumpRoot> [creator_id] [slug]
  npx tsx src/cli.ts import-relay-dump [slug] fresh
  npx tsx src/cli.ts zip <slug>
  npx tsx src/cli.ts status [--json]
  npx tsx src/cli.ts status json

Flags (also supported): --bundle --theme --slug --clone --creator --media --json --dump-root --fresh
Note: on Windows, prefer positional args — npm may strip --flags (e.g. status json).
Re-import loads data/provenance.json + import-state.json + site.bundle.json when present unless --fresh / fresh.
`);
  process.exit(1);
}

function argValue(args: string[], name: string): string | undefined {
  const long = name.startsWith("--") ? name : `--${name}`;
  const i = args.indexOf(long);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("-")) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${long}=`));
  if (eq) return eq.slice(long.length + 1);
  // short -b= / -b value
  if (long === "--bundle") {
    const j = args.indexOf("-b");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  if (long === "--theme") {
    const j = args.indexOf("-t");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  if (long === "--slug") {
    const j = args.indexOf("-s");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  if (long === "--clone") {
    const j = args.indexOf("-c");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  if (long === "--creator") {
    const j = args.indexOf("-C");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  if (long === "--media") {
    const j = args.indexOf("-m");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  if (long === "--dump-root") {
    const j = args.indexOf("-d");
    if (j >= 0 && args[j + 1]) return args[j + 1];
  }
  return undefined;
}

/** Collect positional args after the command (npm on Windows often strips --flags). */
function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      // skip flag and its value when separate
      if (!a.includes("=") && args[i + 1] && !args[i + 1].startsWith("-")) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function resolvePath(p: string): string {
  return p.startsWith("/") || /^[A-Za-z]:/.test(p)
    ? p
    : join(process.cwd(), p);
}

function printPreviewHint(outDir: string, slug: string): void {
  console.log(`
✓ Site kit written to:
  ${outDir}

Preview (soft gate — not production security):
  cd packages/escape-hatch/.out/${slug}
  npm install
  npm run dev

Then open the URL Next prints (usually http://localhost:3001).
`);
}

function stageExportMedia(
  exportCreatorRoot: string,
  stagingDir: string,
  bundle: SiteBundle
): void {
  stageExportMediaSafe(exportCreatorRoot, stagingDir, bundle);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || hasFlag(args, "--help") || hasFlag(args, "-h")) usage();

  if (cmd === "fixture") {
    const pos = positionals(args);
    const bundlePath = join(PACKAGE_ROOT, "fixtures", "sample.bundle.json");
    const bundle = loadBundleFile(bundlePath);
    const slug = argValue(args, "--slug") ?? pos[0] ?? bundle.creator.handle;
    const result = fillTemplate({
      bundle,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug,
      clean: true
    });
    printPreviewHint(result.outDir, result.slug);
    return;
  }

  if (cmd === "wizard") {
    const pos = positionals(args);
    const maybeBundle = argValue(args, "--bundle") ?? pos[0];
    const bundleFile =
      maybeBundle &&
      (maybeBundle.endsWith(".json") || existsSync(resolvePath(maybeBundle)))
        ? resolvePath(maybeBundle)
        : join(PACKAGE_ROOT, "fixtures", "sample.bundle.json");
    const loaded = loadBundleFile(bundleFile);
    const theme = await runWizard(loaded.theme);
    const slug =
      argValue(args, "--slug") ??
      (maybeBundle && !maybeBundle.endsWith(".json") ? maybeBundle : pos[1]) ??
      loaded.creator.handle;
    const themesDir = join(OUT_ROOT, ".themes");
    mkdirSync(themesDir, { recursive: true });
    const themePath = join(themesDir, `${slug}.json`);
    writeFileSync(themePath, JSON.stringify(theme, null, 2), "utf8");
    const result = fillTemplate({
      bundle: loaded,
      themeOverride: theme,
      mediaSourceDir: join(PACKAGE_ROOT, "fixtures", "media"),
      slug,
      clean: true
    });
    writeFileSync(
      join(result.outDir, "data", "theme.wizard.json"),
      JSON.stringify(theme, null, 2),
      "utf8"
    );
    console.log(`Theme saved for rebuild: ${themePath}`);
    printPreviewHint(result.outDir, result.slug);
    return;
  }

  if (cmd === "build") {
    const pos = positionals(args);
    const bundlePath = argValue(args, "--bundle") ?? pos[0];
    if (!bundlePath) {
      console.error("--bundle is required (or: build <bundle.json> [theme.json] [slug])");
      usage();
    }
    const bundle = loadBundleFile(resolvePath(bundlePath));
    const slug = argValue(args, "--slug") ?? pos[2] ?? bundle.creator.handle;
    const themePath = argValue(args, "--theme") ?? pos[1];
    let themeOverride: Partial<EscapeHatchTheme> | undefined;
    if (themePath) {
      themeOverride = loadThemeFile(resolvePath(themePath));
    } else {
      const saved = join(OUT_ROOT, ".themes", `${slug}.json`);
      if (existsSync(saved)) {
        themeOverride = loadThemeFile(saved);
        console.log(`Using saved theme: ${saved}`);
      }
    }
    const media = argValue(args, "--media");
    const result = fillTemplate({
      bundle,
      themeOverride,
      mediaSourceDir: media
        ? resolvePath(media)
        : join(PACKAGE_ROOT, "fixtures", "media"),
      slug,
      clean: true
    });
    printPreviewHint(result.outDir, result.slug);
    return;
  }

  if (cmd === "from-relay") {
    const pos = positionals(args);
    const creatorId = argValue(args, "--creator") ?? pos[0];
    if (!creatorId) {
      console.error("--creator is required (or: from-relay <creator_id>)");
      usage();
    }
    const { bundle, exportCreatorRoot } = fromRelay({
      creatorId,
      displayName: argValue(args, "--display-name"),
      handle: argValue(args, "--handle"),
      canonicalPath: argValue(args, "--canonical"),
      exportRoot: argValue(args, "--export-root"),
      repoRoot: argValue(args, "--repo-root")
    });
    const slug =
      argValue(args, "--slug") ?? pos[1] ?? bundle.creator.handle ?? creatorId;
    const staging = join(OUT_ROOT, ".media-staging", slug);
    if (exportCreatorRoot) {
      stageExportMedia(exportCreatorRoot, staging, bundle);
    }
    mkdirSync(join(OUT_ROOT, slug), { recursive: true });
    const bundleOut = join(OUT_ROOT, slug, "site.bundle.json");
    // fillTemplate cleans outDir — write bundle after fill into data/
    const mediaSource =
      exportCreatorRoot &&
      existsSync(staging) &&
      readdirSync(staging).length > 0
        ? staging
        : join(PACKAGE_ROOT, "fixtures", "media");

    const result = fillTemplate({
      bundle,
      mediaSourceDir: mediaSource,
      slug,
      clean: true
    });
    writeFileSync(bundleOut, JSON.stringify(bundle, null, 2), "utf8");
    writeFileSync(
      join(result.outDir, "data", "site.bundle.json"),
      JSON.stringify(bundle, null, 2),
      "utf8"
    );
    console.log(`Bundle dump: ${join(result.outDir, "data", "site.bundle.json")}`);
    printPreviewHint(result.outDir, result.slug);
    return;
  }

  if (cmd === "from-clone") {
    const pos = positionals(args);
    const clonePath = argValue(args, "--clone") ?? pos[0];
    if (!clonePath) {
      console.error("--clone is required (or: from-clone <clone.json>)");
      usage();
    }
    const clone: unknown = JSON.parse(
      readFileSync(resolvePath(clonePath), "utf8")
    );
    const bundle = fromClone({
      clone,
      creator: {
        display_name: argValue(args, "--display-name"),
        handle: argValue(args, "--handle")
      }
    });
    const slug = argValue(args, "--slug") ?? bundle.creator.handle;
    const result = fillTemplate({
      bundle,
      mediaSourceDir:
        argValue(args, "--media") != null
          ? resolvePath(argValue(args, "--media")!)
          : join(PACKAGE_ROOT, "fixtures", "media"),
      slug,
      clean: true
    });
    printPreviewHint(result.outDir, result.slug);
    return;
  }

  if (cmd === "import-relay-dump") {
    const pos = positionals(args);
    const fresh =
      hasFlag(args, "--fresh") || pos.some((p) => p.toLowerCase() === "fresh");
    const posNoFresh = pos.filter((p) => p.toLowerCase() !== "fresh");

    let dumpRoot = argValue(args, "--dump-root") ?? DEFAULT_RELAY_DUMP_ROOT;
    let creatorId =
      argValue(args, "--creator") ?? DEFAULT_RELAY_DUMP_CREATOR_ID;
    let slug = argValue(args, "--slug");

    const p0 = posNoFresh[0];
    if (p0) {
      const asPath = resolvePath(p0);
      if (existsSync(asPath) && statSync(asPath).isDirectory()) {
        dumpRoot = asPath;
        if (posNoFresh[1] && /^cr_[A-Za-z0-9_.:-]+$/.test(posNoFresh[1])) {
          creatorId = argValue(args, "--creator") ?? posNoFresh[1];
          slug = slug ?? posNoFresh[2];
        } else {
          slug = slug ?? posNoFresh[1];
        }
      } else {
        slug = slug ?? p0;
      }
    }

    // Resolve slug before import so persisted kit state can be merged.
    slug = slug ?? argValue(args, "--handle") ?? "eh-relay";

    let existing:
      | {
          provenance?: unknown;
          localState?: unknown;
          bundle?: unknown;
        }
      | undefined;
    if (!fresh) {
      const dataDir = join(OUT_ROOT, slug, "data");
      const loaded = loadExistingImportArtifacts(dataDir, creatorId);
      if (loaded) {
        existing = {
          provenance: loaded.provenance,
          localState: loaded.localState,
          bundle: loaded.bundle
        };
        console.log(`Re-import merging existing state from: ${dataDir}`);
      }
    }

    const resolvedDump = resolvePath(dumpRoot);
    const imported = importRelayDump({
      dumpRoot: resolvedDump,
      creatorId,
      displayName: argValue(args, "--display-name"),
      handle: argValue(args, "--handle"),
      existing
    });

    const exportCreatorRoot = join(resolvedDump, "exports", creatorId);
    const staging = join(OUT_ROOT, ".media-staging", slug);
    if (existsSync(exportCreatorRoot)) {
      stageExportMedia(exportCreatorRoot, staging, imported.bundle);
    }
    const mediaSource =
      existsSync(staging) && readdirSync(staging).length > 0
        ? staging
        : join(PACKAGE_ROOT, "fixtures", "media");

    const result = fillTemplate({
      bundle: imported.bundle,
      mediaSourceDir: mediaSource,
      slug,
      clean: true
    });

    const dataDir = join(result.outDir, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "provenance.json"),
      serializeImportDocument(imported.provenance),
      "utf8"
    );
    writeFileSync(
      join(dataDir, "import-state.json"),
      serializeImportDocument(imported.localState),
      "utf8"
    );
    writeFileSync(
      join(dataDir, "import-report.json"),
      serializeImportDocument(imported.report),
      "utf8"
    );
    writeFileSync(
      join(dataDir, "site.bundle.json"),
      JSON.stringify(imported.bundle, null, 2),
      "utf8"
    );

    console.log(`Import report: ${join(dataDir, "import-report.json")}`);
    console.log(
      `Posts imported=${imported.report.posts.imported} excluded=${imported.report.posts.excluded} conflicts=${imported.report.conflicts.length}`
    );
    console.log(
      "Note: public/media copy remains prototype-only; private R2 delivery is EH-012."
    );
    printPreviewHint(result.outDir, result.slug);
    return;
  }

  if (cmd === "zip") {
    const slug = argValue(args, "--slug") ?? args[1];
    if (!slug || slug.startsWith("-")) {
      console.error("--slug is required (or pass slug as the second argument)");
      usage();
    }
    const zipPath = await zipExportKit(slug, argValue(args, "--out"));
    console.log(`Export Kit zip: ${zipPath}`);
    return;
  }

  if (cmd === "status") {
    const pos = positionals(args);
    const asJson = hasFlag(args, "--json") || pos[0] === "json";
    const status = buildEscapeHatchStatus();
    if (asJson) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(formatHumanStatus(status));
    }
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
