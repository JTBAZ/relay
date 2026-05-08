/**
 * Relay dependency, island, asset, and ghost-dependency audit.
 * Run: node scripts/relay-dependency-audit.mjs
 * Writes: audit/dependency_report.md, relay_audit.json (repo root)
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, normalize, extname, sep } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const AUDIT_DIR = join(REPO, "audit");
const OUT_JSON = join(REPO, "relay_audit.json");
const OUT_MD = join(AUDIT_DIR, "dependency_report.md");

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  "Automation"
]);

const ENTRY_EXCLUDE_ISLAND = [
  /^vitest\.config\.(ts|mts)$/,
  /^prisma\.config\.(ts|mts|js)$/,
  /(^|[\\/])next\.config\.(mjs|js|ts)$/,
  /(^|[\\/])postcss\.config\.(mjs|js|ts|cts)$/,
  /(^|[\\/])tailwind\.config\.(mjs|js|ts)$/,
  /(^|[\\/])middleware\.(ts|js)$/,
  /(^|[\\/])instrumentation\.(ts|js)$/,
  /\.config\.(ts|js|mjs|cjs)$/,
  /(^|[\\/])eslint\.config\.(mjs|js|cjs)$/,
  /\.d\.ts$/,
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /(^|[\\/])tests?[\\/]/,
  /(^|[\\/])__tests__[\\/]/
];

/** Next app router segment files — not imported by graph; loaded by framework. */
function isNextRouteEntry(relPosix) {
  return /(^|\/)app\/.*\/(page|layout|route|loading|error|not-found|template|default|opengraph-image|icon|apple-icon|robots|sitemap)(\.(tsx|ts|jsx|js))?$/i.test(
    relPosix
  );
}

function isNextSpecialRoot(relPosix) {
  return /(^|\/)app\/(layout|page|route|global-error)\.(tsx|ts|jsx|js)$/i.test(relPosix);
}

function walkDir(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walkDir(p, acc);
    } else acc.push(p);
  }
  return acc;
}

function toPosix(p) {
  return p.split(sep).join("/");
}

function normalizeRel(fullPath) {
  return toPosix(relative(REPO, fullPath));
}

/**
 * `web/onboarding_enhancement/...` and `web/b_i0ofEW9bMcy/...` use `@/*` relative to that subfolder.
 */
function resolveWebAliasRoot(fromFileAbs) {
  const rel = normalizeRel(fromFileAbs).replace(/\\/g, "/");
  const parts = rel.split("/");
  if (parts[0] !== "web" || parts.length < 2) return join(REPO, "web");
  const seg = parts[1];
  if (["app", "components", "lib", "public", "node_modules", ".next"].includes(seg)) {
    return join(REPO, "web");
  }
  const candidate = join(REPO, "web", seg);
  if (
    existsSync(join(candidate, "tsconfig.json")) ||
    existsSync(join(candidate, "next.config.mjs")) ||
    existsSync(join(candidate, "next.config.js")) ||
    existsSync(join(candidate, "next.config.ts"))
  ) {
    return candidate;
  }
  return join(REPO, "web");
}

/** @param {string} fileAbs */
function resolveImport(fromFileAbs, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const baseDir = dirname(fromFileAbs);
  let target;
  if (specifier.startsWith("@/")) {
    if (!fromFileAbs.replace(/\\/g, "/").includes("/web/")) return null;
    const webAliasRoot = resolveWebAliasRoot(fromFileAbs);
    target = resolve(webAliasRoot, specifier.slice(2));
  } else {
    target = resolve(baseDir, specifier);
  }
  const candidates = [
    target,
    target + ".ts",
    target + ".tsx",
    target + ".js",
    target + ".jsx",
    target + ".mjs",
    join(target, "index.ts"),
    join(target, "index.tsx"),
    join(target, "index.js")
  ];
  if (target.endsWith(".js")) {
    const asTs = target.slice(0, -3) + ".ts";
    const asTsx = target.slice(0, -3) + ".tsx";
    candidates.unshift(asTs, asTsx);
  }
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return target;
}

/**
 * Strip line comments, block comments, and mask template literal / string bodies so
 * import-like text inside error messages does not register as static imports (P0-base-003).
 */
function prepareSourceForImportScan(source) {
  let out = "";
  let i = 0;
  const len = source.length;
  while (i < len) {
    const c = source[i];
    const c1 = source[i + 1];

    if (c === "/" && c1 === "/") {
      out += " ";
      i += 2;
      while (i < len && source[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }

    if (c === "/" && c1 === "*") {
      out += "  ";
      i += 2;
      while (i < len - 1 && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < len - 1) {
        out += "  ";
        i += 2;
      }
      continue;
    }

    if (c === "`") {
      out += "`";
      i++;
      while (i < len) {
        if (source[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          out += "${";
          i += 2;
          let depth = 1;
          while (i < len && depth > 0) {
            const ch = source[i];
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            out += ch;
            i++;
          }
          continue;
        }
        if (source[i] === "`") {
          out += "`";
          i++;
          break;
        }
        out += " ";
        i++;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      const q = c;
      out += q;
      i++;
      while (i < len) {
        if (source[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (source[i] === q) {
          out += q;
          i++;
          break;
        }
        out += " ";
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

const IMPORT_RE =
  /(?:import\s+[^'"]*from\s+|import\s*\(\s*|require\s*\(\s*|export\s+[^'"]*from\s*)['"]([^'"]+)['"]/g;

function extractImports(source) {
  const out = [];
  let m;
  const re = new RegExp(IMPORT_RE.source, "g");
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

function isPackageSpecifier(s) {
  if (s.startsWith(".") || s.startsWith("@/")) return false;
  if (s.startsWith("@")) {
    const parts = s.split("/");
    return parts.length >= 2;
  }
  return true;
}

function packageRootName(s) {
  if (s.startsWith("@")) {
    const p = s.split("/");
    return `${p[0]}/${p[1]}`;
  }
  return s.split("/")[0];
}

function shouldExcludeIsland(relPosix) {
  for (const re of ENTRY_EXCLUDE_ISLAND) {
    if (re.test(relPosix.replace(/\\/g, "/"))) return true;
  }
  if (relPosix.replace(/\\/g, "/") === "src/main.ts") return true;
  if (relPosix.replace(/\\/g, "/") === "src/server.ts") return true;
  if (relPosix.replace(/\\/g, "/") === "src/autosync-once.ts") return true;
  if (relPosix.replace(/\\/g, "/") === "src/backfill-part2-from-files.ts") return true;
  if (isNextRouteEntry(relPosix) || isNextSpecialRoot(relPosix)) return true;
  if (relPosix.startsWith("scripts/")) return true;
  if (/^discord-bot\/src\/index\.(ts|js)$/.test(relPosix.replace(/\\/g, "/"))) return true;
  return false;
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function collectCodeFiles() {
  const roots = [
    join(REPO, "src"),
    join(REPO, "tests"),
    join(REPO, "web"),
    join(REPO, "scripts"),
    join(REPO, "discord-bot")
  ];
  const files = [];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    walkDir(r, files);
  }
  return files.filter((f) => CODE_EXT.has(extname(f)));
}

function buildGraph() {
  const codeFiles = collectCodeFiles();
  const relSet = new Set(codeFiles.map((f) => normalizeRel(f)));
  /** @type {Map<string, Set<string>>} */
  const importers = new Map();
  /** @type {Map<string, string[]>} */
  const edges = new Map();
  /** @type {{from:string, to:string, spec:string, issue:string}[]} */
  const brokenImports = [];
  /** @type {Map<string, Set<string>>} */
  const packageUses = new Map();

  const addEdge = (fromRel, toRel) => {
    if (!importers.has(toRel)) importers.set(toRel, new Set());
    importers.get(toRel).add(fromRel);
  };

  for (const abs of codeFiles) {
    const fromRel = normalizeRel(abs);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const imports = extractImports(prepareSourceForImportScan(src));
    const localTargets = [];
    for (const spec of imports) {
      if (isPackageSpecifier(spec)) {
        const root = packageRootName(spec);
        if (!packageUses.has(root)) packageUses.set(root, new Set());
        packageUses.get(root).add(fromRel);
        continue;
      }
      const resolved = resolveImport(abs, spec);
      if (!resolved) continue;
      const toRel = normalizeRel(resolved);
      if (relSet.has(toRel)) {
        localTargets.push(toRel);
        addEdge(fromRel, toRel);
      } else {
        const existsFile = existsSync(resolved) && statSync(resolved).isFile();
        if (!existsFile) {
          brokenImports.push({
            from: fromRel,
            spec,
            resolved: toPosix(relative(REPO, resolved)),
            issue: "resolve_target_missing"
          });
        }
      }
    }
    edges.set(fromRel, localTargets);
  }

  return {
    codeFiles: codeFiles.map(normalizeRel),
    importers,
    edges,
    brokenImports,
    packageUses
  };
}

function bfsFrom(startRels, edges) {
  const seen = new Set();
  const q = [...startRels];
  while (q.length) {
    const u = q.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const outs = edges.get(u) || [];
    for (const v of outs) {
      if (!seen.has(v)) q.push(v);
    }
  }
  return [...seen].sort();
}

function scanDynamicAssetPatterns(textFilesContent) {
  /** @type {Set<string>} */
  const patterns = new Set();
  const re =
    /[`'"]([^`'"]*\$\{[^}]+\}[^`'"]*)[`'"]|template\s*\(\s*[`'"]([^`'"]*\$\{[^}]+\}[^`'"]*)/g;
  for (const { rel, body } of textFilesContent) {
    if (!/\.(tsx?|jsx?|mjs|cjs|html|css)$/i.test(rel)) continue;
    let m;
    const s = body;
    const r = /\$\{[^}]+\}/g;
    if (!r.test(s)) continue;
    r.lastIndex = 0;
    while ((m = r.exec(s)) !== null) {
      const start = Math.max(0, m.index - 80);
      const slice = s.slice(start, Math.min(s.length, m.index + 80));
      if (
        /\/(public|assets)\/|@\/public\/|`\/|'\//i.test(slice) ||
        /encodeURIComponent|artistId|creatorId|mediaId|slug/i.test(slice)
      ) {
        patterns.add(rel);
      }
    }
  }
  return [...patterns];
}

function main() {
  mkdirSync(AUDIT_DIR, { recursive: true });
  const { codeFiles, importers, edges, brokenImports, packageUses } = buildGraph();

  const mainEntry = "src/main.ts";
  const coreTree = bfsFrom([mainEntry], edges);

  /** Islands: zero incoming importers */
  const islands = codeFiles.filter((rel) => {
    const set = importers.get(rel);
    const hasImporters = set && set.size > 0;
    if (hasImporters) return false;
    if (shouldExcludeIsland(rel)) return false;
    return true;
  });

  /** Asset dirs */
  const publicRoots = [
    join(REPO, "web", "public"),
    join(REPO, "design-archive", "preflight", "public"),
    join(REPO, "ui-control-room-prototype", "public")
  ].filter((p) => existsSync(p));

  const assetFiles = [];
  for (const root of publicRoots) {
    walkDir(root, assetFiles);
  }
  const assetRels = assetFiles.map((f) => normalizeRel(f));

  /** Scan source for string refs */
  const scanRoots = [join(REPO, "src"), join(REPO, "web"), join(REPO, "tests"), join(REPO, "scripts")];
  const textFilesContent = [];
  for (const root of scanRoots) {
    if (!existsSync(root)) continue;
    const all = [];
    walkDir(root, all);
    for (const f of all) {
      const ext = extname(f);
      if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".html", ".json", ".md"].includes(ext))
        continue;
      try {
        const body = readFileSync(f, "utf8");
        textFilesContent.push({ rel: normalizeRel(f), body });
      } catch {
        /* skip */
      }
    }
  }

  const dynamicFiles = scanDynamicAssetPatterns(textFilesContent);

  /** @type {Record<string, {status:string, referencedBy?:string[], note?:string}>} */
  const assetReport = {};

  for (const arel of assetRels) {
    const basename = arel.split("/").pop();
    const urlPath = arel.replace(/^.*?\/public\//, "/");
    const variants = new Set(
      [
        basename,
        urlPath,
        `public/${basename}`,
        `web/public/${basename}`,
        arel
      ].filter(Boolean)
    );
    /** @type {string[]} */
    const refs = [];
    for (const { rel, body } of textFilesContent) {
      if (rel === arel || rel.replace(/\\/g, "/") === arel.replace(/\\/g, "/")) continue;
      if (rel.includes("/public/") && arel.includes(basename) && rel.endsWith(basename)) continue;
      for (const v of variants) {
        if (v && body.includes(v)) refs.push(rel);
      }
    }
    let uniqueRefs = [...new Set(refs)];
    let status = "ghost_asset";
    let note;
    if (uniqueRefs.length > 0) status = "referenced";

    const tail = basename;
    let dynamicHit = false;
    if (tail && tail.length > 2) {
      for (const { rel, body } of textFilesContent) {
        if (!/\.(tsx?|jsx?)$/.test(rel)) continue;
        if (!body.includes("${")) continue;
        const idx = body.indexOf(tail);
        if (idx === -1) continue;
        const window = body.slice(Math.max(0, idx - 120), idx + tail.length + 40);
        if (/\$\{[^}]+\}/.test(window) && /[`'"](\/|\.|\w)/.test(window)) {
          dynamicHit = true;
          note = `Template literal near '${tail}' in ${rel} — verify dynamic URL; Do not treat folder as unused.`;
          if (!uniqueRefs.includes(rel)) uniqueRefs.push(`${rel} (dynamic context)`);
          break;
        }
      }
    }
    if (dynamicHit) {
      status = "dynamically_referenced";
    }

    assetReport[arel] = {
      status,
      referencedBy: uniqueRefs.slice(0, 40),
      ...(note ? { note } : {})
    };
  }

  /** Ghost deps — root package.json */
  const rootPkgPath = join(REPO, "package.json");
  const webPkgPath = join(REPO, "web", "package.json");
  const rootPkg = readJson(rootPkgPath);
  const webPkg = existsSync(webPkgPath) ? readJson(webPkgPath) : { dependencies: {}, devDependencies: {} };

  const toolingBins = new Set([
    "typescript",
    "prisma",
    "eslint",
    "tailwindcss",
    "postcss",
    "vitest",
    "prettier",
    "concurrently",
    "ts-node"
  ]);

  function auditDeps(pkg, pathPrefixFilter) {
    const all = {
      ...pkg.dependencies,
      ...pkg.devDependencies
    };
    /** @type {{name:string, kind:string, reason?:string}[]} */
    const ghost = [];
    /** @type {{name:string, kind:string}[]} */
    const toolingOnly = [];
    /** @type {{name:string, importers:string[]}[]} */
    const used = [];
    for (const name of Object.keys(all)) {
      if (name.startsWith("@types/")) {
        toolingOnly.push({ name, kind: "typescriptAmbientTypes" });
        continue;
      }
      const rootName = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
      if (toolingBins.has(rootName) || toolingBins.has(name)) {
        const ver = all[name];
        toolingOnly.push({
          name,
          kind: typeof ver === "string" && ver.startsWith("^") ? "range" : "pinned"
        });
        continue;
      }
      const uses = packageUses.get(name) || packageUses.get(rootName);
      const hits = uses
        ? [...uses].filter((r) => {
            const posix = r.replace(/\\/g, "/");
            return pathPrefixFilter(posix);
          })
        : [];
      if (hits.length === 0) {
        ghost.push({
          name,
          kind: pkg.dependencies?.[name] ? "dependency" : "devDependency",
          reason: "No matching import in scanned files for this workspace (after path filter)"
        });
      } else {
        used.push({ name, importers: hits.slice(0, 20) });
      }
    }
    return { ghost, toolingOnly, used };
  }

  const rootAudit = auditDeps(
    rootPkg,
    () => true
  );
  const webAudit = auditDeps(webPkg, (posix) => posix.startsWith("web/"));

  /** Full directed edge list for tooling */
  const edgeObjects = [];
  for (const [from, tos] of edges.entries()) {
    for (const to of tos) {
      edgeObjects.push({ from, to });
    }
  }
  edgeObjects.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));

  /** @type {Record<string, string[]>} */
  const importersOf = {};
  for (const { from, to } of edgeObjects) {
    if (!importersOf[to]) importersOf[to] = [];
    importersOf[to].push(from);
  }
  for (const k of Object.keys(importersOf)) {
    importersOf[k].sort();
  }

  const auditJson = {
    generatedAt: new Date().toISOString(),
    entryPoints: {
      primary_runtime: mainEntry,
      server_companion: "src/server.ts",
      scripts_not_traced: [
        "src/autosync-once.ts",
        "src/backfill-part2-from-files.ts",
        "(many package.json script entrypoints under scripts/*.mjs)"
      ],
      web_framework: "Next.js app router — segment files under web/app are not central-imported"
    },
    coreTreeFromMain: {
      fileCount: coreTree.length,
      files: coreTree
    },
    graph: {
      nodeCount: codeFiles.length,
      edgeCount: edgeObjects.length,
      edges: edgeObjects,
      importersByModule: importersOf
    },
    islandFiles: islands.sort(),
    islandCount: islands.length,
    brokenImports: brokenImports.sort((a, b) => a.from.localeCompare(b.from)),
    assets: assetReport,
    dynamicTemplateLiteralHints: dynamicFiles.sort(),
    ghostDependencies: {
      root: rootAudit.ghost,
      web: webAudit.ghost
    },
    toolingOnlyDependencies: {
      root: rootAudit.toolingOnly,
      web: webAudit.toolingOnly
    },
    packageUseSummary: {
      root_used_sample: rootAudit.used.slice(0, 50),
      web_used_sample: webAudit.used.slice(0, 80)
    },
    notes: [
      "Island = no incoming relative/@ alias imports in scanned code; Next route files excluded.",
      "Broken imports = relative/@ specifier that did not resolve to an existing file on disk.",
      "Assets only scanned under web/public and a few prototype public folders.",
      "Ghost dependency = package not seen in any import/require in scanned files; tooling packages listed separately."
    ]
  };

  writeFileSync(OUT_JSON, JSON.stringify(auditJson, null, 2), "utf8");

  const md = [];
  md.push("# Relay dependency & ghost asset audit\n\n");
  md.push("## Methodology\n\n");
  md.push(
    "- **Active modules**: BFS from `src/main.ts` following only **static** relative/`@/` imports (`.js` specifiers mapped to `.ts`). npm package imports are not expanded.\n"
  );
  md.push(
    "- **Dead code (islands)**: source files with **no incoming** local/`@/` edges, excluding tests, configs, Next segment files, and declared entry scripts.\n"
  );
  md.push(
    "- **Ghost assets**: files under selected `public/` trees; string matches in `src/`, `web/`, `tests/`, `scripts/`. **Dynamically referenced** when a template literal appears near the basename in TS/TSX (see JSON `assets` and `dynamicTemplateLiteralHints`).\n"
  );
  md.push(
    "- **Broken links**: static import specifiers that do not resolve to an existing file (after `.js`→`.ts` and `@/` subapp root heuristics).\n"
  );
  md.push(
    "- **Ghost dependencies**: root `package.json` — unused in **any** scanned file; `web/package.json` — unused in `web/**` only. `@types/*` listed under tooling (types-only).\n"
  );
  md.push(
    "- **Full graph**: `relay_audit.json` → `graph.edges` (all directed import edges) and `graph.importersByModule` (reverse map).\n\n"
  );
  md.push(`Generated: ${auditJson.generatedAt} (repo root).\n`);
  md.push("## Active modules (core tree from `src/main.ts`)\n");
  md.push(`Reachable files: **${coreTree.length}** (static relative/\`@/\` graph only).\n`);
  md.push("<details><summary>Expand file list</summary>\n\n```text\n");
  md.push(coreTree.join("\n"));
  md.push("\n```\n</details>\n");

  md.push("\n## Dead code (island files)\n");
  md.push(
    "Files with **zero incoming** local/\`@/\` imports, excluding tests, configs, `src/main.ts`, Next segment entries, etc.\n"
  );
  md.push(`Count: **${islands.length}**\n`);
  md.push("<details><summary>Expand</summary>\n\n```text\n");
  md.push(islands.join("\n") || "(none)");
  md.push("\n```\n</details>\n");

  md.push("\n## Ghost assets\n");
  const ghosts = Object.entries(assetReport).filter(([, v]) => v.status === "ghost_asset");
  const dyn = Object.entries(assetReport).filter(([, v]) => v.status === "dynamically_referenced");
  md.push(`**Likely unreferenced:** ${ghosts.length} · **Possibly dynamic:** ${dyn.length}\n`);
  md.push("<details><summary>Ghost asset paths</summary>\n\n```text\n");
  md.push(ghosts.map(([k]) => k).join("\n") || "(none flagged)");
  md.push("\n```\n</details>\n");
  md.push("<details><summary>Dynamic / template hints (files containing `${...}` near paths)</summary>\n\n```text\n");
  md.push(dyn.map(([k, v]) => `${k} — ${v.note || ""}`).join("\n") || auditJson.dynamicTemplateLiteralHints.join("\n"));
  md.push("\n```\n</details>\n");

  md.push("\n## Broken links (missing resolve targets)\n");
  md.push(`Count: **${brokenImports.length}**\n`);
  md.push("```json\n");
  md.push(JSON.stringify(brokenImports, null, 2));
  md.push("\n```\n");

  md.push("\n## Ghost dependencies\n");
  md.push("### Root `package.json`\n");
  md.push("```json\n");
  md.push(JSON.stringify(rootAudit.ghost, null, 2));
  md.push("\n```\n");
  md.push("### `web/package.json`\n");
  md.push("```json\n");
  md.push(JSON.stringify(webAudit.ghost, null, 2));
  md.push("\n```\n");
  md.push("\n### Tooling-only (not expected to appear as imports)\n");
  md.push("- Root: " + rootAudit.toolingOnly.map((x) => x.name).join(", ") + "\n");
  md.push("- Web: " + webAudit.toolingOnly.map((x) => x.name).join(", ") + "\n");

  md.push("\n## Machine-readable graph\n");
  md.push(`See \`relay_audit.json\` at repo root.\n`);

  writeFileSync(OUT_MD, md.join(""), "utf8");
  console.log("Wrote", OUT_JSON, OUT_MD);
}

main();
