#!/usr/bin/env node
/**
 * Escape Hatch CLI: fixture | wizard | build | from-relay | from-clone | zip | status
 */

import {
  cpSync,
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
import { runWizard } from "./wizard.js";
import { buildEscapeHatchStatus, formatHumanStatus } from "./status.js";
import { zipExportKit } from "./zip-kit.js";
import type { CloneSiteModelInput, EscapeHatchTheme, SiteBundle } from "./types.js";

function usage(): never {
  console.log(`Escape Hatch CLI

Usage:
  npx tsx src/cli.ts fixture [slug]
  npx tsx src/cli.ts wizard [bundle.json] [slug]
  npx tsx src/cli.ts build <bundle.json> [theme.json] [slug]
  npx tsx src/cli.ts from-relay <creator_id> [slug]
  npx tsx src/cli.ts from-clone <clone.json> [slug]
  npx tsx src/cli.ts zip <slug>
  npx tsx src/cli.ts status [--json]
  npx tsx src/cli.ts status json

Flags (also supported): --bundle --theme --slug --clone --creator --media --json
Note: on Windows, prefer positional args — npm may strip --flags (e.g. status json).
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
  mkdirSync(stagingDir, { recursive: true });
  const indexPath = join(exportCreatorRoot, "export_index.json");
  if (!existsSync(indexPath)) return;
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    media: Record<string, { relative_blob_path: string; mime_type?: string }>;
  };
  for (const post of bundle.posts) {
    for (const m of post.media) {
      const rec = index.media[m.media_id];
      if (!rec) continue;
      const src = join(exportCreatorRoot, rec.relative_blob_path);
      if (!existsSync(src) || !statSync(src).isFile()) continue;
      const destName = m.content_path.replace(/^\/media\//, "");
      cpSync(src, join(stagingDir, destName));
    }
  }
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
    const clone = JSON.parse(
      readFileSync(resolvePath(clonePath), "utf8")
    ) as CloneSiteModelInput;
    const bundle = fromClone({
      clone,
      creator: {
        display_name: argValue(args, "--display-name") ?? clone.creator_id,
        handle:
          argValue(args, "--handle") ??
          clone.creator_id.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
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
