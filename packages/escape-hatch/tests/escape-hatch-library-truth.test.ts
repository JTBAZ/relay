/**
 * EH-013 Library truth / parity report: accounted-for gate, exclusions, ambiguity.
 */

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ContractValidationError, parseSiteBundle } from "../src/contracts.js";
import {
  embedLibraryTruthModules,
  fillTemplate,
  rewriteKitModuleImports
} from "../src/fill-template.js";
import { importRelayDump } from "../src/import/index.js";
import {
  assertNoSecretsInLibraryTruthJson,
  buildLibraryParityReport,
  evaluateContinueGate,
  evaluateLocalLibraryTruthMutationAccess,
  excludeAnomalyFromBuild,
  LIBRARY_PARITY_REPORT_CONTRACT_VERSION,
  LIBRARY_TRUTH_STATE_CONTRACT_VERSION,
  parseLibraryParityReport,
  parseLibraryTruthState,
  runLibraryTruthForKit,
  serializeLibraryTruthDocument,
  writeLibraryTruthArtifacts
} from "../src/library-truth/index.js";
import {
  MemoryObjectStorage,
  migrateKitMedia
} from "../src/migrate/index.js";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELAY_DUMP = join(PACKAGE_ROOT, "fixtures", "relay-dump");
const FIXED_NOW = () => new Date("2026-07-22T20:00:00.000Z");

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function materializeKit(slug: string): string {
  const imported = importRelayDump({
    dumpRoot: RELAY_DUMP,
    creatorId: "cr_eh_relay"
  });
  const staging = join(PACKAGE_ROOT, ".out", ".media-staging", slug);
  mkdirSync(staging, { recursive: true });
  const result = fillTemplate({
    bundle: imported.bundle,
    mediaSourceDir: join(RELAY_DUMP, "exports", "cr_eh_relay", "blobs"),
    slug,
    clean: true
  });
  const dataDir = join(result.outDir, "data");
  writeFileSync(
    join(dataDir, "provenance.json"),
    JSON.stringify(imported.provenance, null, 2),
    "utf8"
  );
  writeFileSync(
    join(dataDir, "import-state.json"),
    JSON.stringify(imported.localState, null, 2),
    "utf8"
  );
  writeFileSync(
    join(dataDir, "import-report.json"),
    JSON.stringify(imported.report, null, 2),
    "utf8"
  );
  writeFileSync(
    join(dataDir, "site.bundle.json"),
    JSON.stringify(imported.bundle, null, 2),
    "utf8"
  );
  return result.outDir;
}

describe("EH-013 status (preserved under EH-032)", () => {
  it("keeps library-truth preview capability with productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-073");
    expect(status.slice).toBe("EH-073");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-074");
    expect(
      status.blockers.some((b) => /Library truth wizard remains open/i.test(b))
    ).toBe(false);
    const cap = status.capabilities.find((c) => c.id === "library-truth-parity");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/library-parity-report/i);
    expect(cap?.evidence).toMatch(/productionSafe remains false|production_safe/i);
  });
});

describe("EH-013 parity report contracts", () => {
  it("fail-closes on wrong version or production_safe true", () => {
    expect(() =>
      parseLibraryParityReport({
        contract_version: "library-parity-report/0.0.1",
        production_safe: false
      })
    ).toThrow(ContractValidationError);

    const goodShape = buildLibraryParityReport({
      bundle: parseSiteBundle(
        JSON.parse(
          readFileSync(
            join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"),
            "utf8"
          )
        )
      ),
      now: FIXED_NOW
    });
    expect(goodShape.production_safe).toBe(false);
    expect(goodShape.contract_version).toBe(LIBRARY_PARITY_REPORT_CONTRACT_VERSION);

    const tampered = {
      ...goodShape,
      production_safe: true
    };
    expect(() => parseLibraryParityReport(tampered)).toThrow(/production_safe/);
  });

  it("serializes without secrets or patron PII patterns", () => {
    const report = buildLibraryParityReport({
      bundle: parseSiteBundle(
        JSON.parse(
          readFileSync(
            join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"),
            "utf8"
          )
        )
      ),
      now: FIXED_NOW
    });
    const json = serializeLibraryTruthDocument(report);
    expect(() => assertNoSecretsInLibraryTruthJson(json)).not.toThrow();
    expect(json).not.toMatch(/sk_live_|AKIA|BEGIN PRIVATE KEY/);
  });
});

describe("EH-013 accounted-for and premium gate", () => {
  it("marks fixture bundle media not fully migration-verified as blocking premium", () => {
    const bundle = parseSiteBundle(
      JSON.parse(
        readFileSync(join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"), "utf8")
      )
    );
    const report = buildLibraryParityReport({ bundle, now: FIXED_NOW });
    expect(report.production_safe).toBe(false);
    expect(report.artifacts.media_migration_ledger).toBe(false);
    expect(
      report.anomalies.some((a) => a.id === "missing_migration_artifacts")
    ).toBe(true);
    const premiumBlocks = report.anomalies.filter(
      (a) => a.kind === "premium_media_unverified" && a.blocking
    );
    expect(premiumBlocks.length).toBeGreaterThan(0);
    const gate = evaluateContinueGate(report, null);
    expect(gate.can_continue).toBe(false);
    expect(gate.production_safe).toBe(false);
  });

  it("exclude clears a blocker so continue gate passes when otherwise accounted", async () => {
    const kitDir = materializeKit("eh-013-exclude");
    // Without migrate-media, premium gold media blocks.
    let result = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
    expect(
      result.report.anomalies.some(
        (a) => a.kind === "premium_media_unverified" && a.blocking
      )
    ).toBe(true);
    expect(result.gate.can_continue).toBe(false);

    // Migrate first so premium verified media is not blocking.
    await migrateKitMedia({
      kitDir,
      storage: new MemoryObjectStorage(),
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "eh013_mig",
      now: FIXED_NOW
    });
    result = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });

    let blocking = result.report.anomalies.filter((a) => a.blocking);
    if (blocking.length === 0) {
      // Force degraded premium blockers by removing migration artifacts.
      const dataDir = join(kitDir, "data");
      rmSync(join(dataDir, "media-migration-ledger.json"), { force: true });
      rmSync(join(dataDir, "media-migration-report.json"), { force: true });
      result = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
      blocking = result.report.anomalies.filter((a) => a.blocking);
    }
    expect(blocking.length).toBeGreaterThan(0);

    const nowIso = "2026-07-22T20:05:00.000Z";
    let currentState = result.state;
    for (const b of result.report.anomalies.filter((a) => a.blocking)) {
      currentState = excludeAnomalyFromBuild(
        result.report,
        currentState,
        b.id,
        "Creator excluded from this build.",
        nowIso
      );
    }
    writeLibraryTruthArtifacts(join(kitDir, "data"), result.report, currentState);
    const gate = evaluateContinueGate(result.report, currentState);
    expect(gate.unresolved_blocking_ids).toEqual([]);
    expect(gate.can_continue).toBe(true);
    expect(gate.production_safe).toBe(false);
  });

  it("surfaces access ambiguity instead of auto-picking paid tier by array order", () => {
    const bundle = parseSiteBundle(
      JSON.parse(
        readFileSync(join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"), "utf8")
      )
    );
    // Inject ambiguous tier_gated post: multiple source tiers in provenance, single kept id.
    const ambiguous = {
      ...bundle,
      posts: [
        ...bundle.posts,
        {
          post_id: "p_ambig",
          slug: "ambiguous-access",
          title: "Ambiguous Access Post",
          published_at: "2026-07-01T12:00:00.000Z",
          tag_ids: [],
          access: {
            level: "tier_gated" as const,
            tier_ids: ["t_gold"],
            match_mode: "tier_or_higher" as const
          },
          media: []
        }
      ]
    };
    const provenance = {
      contract_version: "import-provenance/1.0.0" as const,
      site_id: bundle.site_id,
      creator_id: bundle.creator_id,
      provider: "relay_canonical" as const,
      batch_id: "batch_ambig",
      source_revision: "rev_ambig",
      imported_at: "2026-07-22T20:00:00.000Z",
      posts: {
        p_ambig: {
          provider: "relay_canonical" as const,
          provider_object_id: "p_ambig",
          published_at: "2026-07-01T12:00:00.000Z",
          upstream_revision: "r_ambig",
          source_tier_ids: ["t_silver", "t_gold"],
          access_snapshot: {
            level: "tier_gated" as const,
            tier_ids: ["t_gold"]
            // no match_mode — ambiguous
          },
          media: [],
          upstream_status: "active" as const
        }
      },
      tiers: {},
      media: {}
    };
    const report = buildLibraryParityReport({
      bundle: ambiguous,
      provenance,
      now: FIXED_NOW
    });
    const amb = report.anomalies.filter((a) => a.kind === "access_ambiguity");
    expect(amb.length).toBeGreaterThan(0);
    expect(amb.some((a) => a.blocking)).toBe(true);
    expect(amb.some((a) => /t_silver|t_gold|array order|multiple source/i.test(a.what_was_seen))).toBe(
      true
    );
  });

  it("degrades honestly when migration artifacts are missing", () => {
    const kitDir = materializeKit("eh-013-degrade");
    const result = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
    expect(result.report.artifacts.import_report).toBe(true);
    expect(result.report.artifacts.media_migration_ledger).toBe(false);
    expect(result.report.notes.some((n) => /Degraded: migration/i.test(n))).toBe(
      true
    );
    expect(result.report.production_safe).toBe(false);
    expect(result.gate.can_continue).toBe(false);
    expect(existsSync(result.reportPath)).toBe(true);
    expect(existsSync(result.statePath)).toBe(true);
    const roundTrip = parseLibraryParityReport(
      JSON.parse(readFileSync(result.reportPath, "utf8"))
    );
    expect(roundTrip.contract_version).toBe(LIBRARY_PARITY_REPORT_CONTRACT_VERSION);
    const state = parseLibraryTruthState(
      JSON.parse(readFileSync(result.statePath, "utf8"))
    );
    expect(state.contract_version).toBe(LIBRARY_TRUTH_STATE_CONTRACT_VERSION);
    expect(state.production_safe).toBe(false);
  });

  it("after import+migrate, posts and media are fully accounted and premium verified", async () => {
    const kitDir = materializeKit("eh-013-accounted");
    await migrateKitMedia({
      kitDir,
      storage: new MemoryObjectStorage(),
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "eh013_accounted",
      now: FIXED_NOW
    });
    const result = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
    expect(result.report.posts.fully_accounted).toBe(true);
    expect(result.report.media.fully_accounted).toBe(true);
    expect(result.report.production_safe).toBe(false);
    // Premium gold should be migration-verified — not a premium_media_unverified blocker
    expect(
      result.report.anomalies.some(
        (a) =>
          a.kind === "premium_media_unverified" &&
          a.subject.media_ids?.includes("m_relay_gold")
      )
    ).toBe(false);
  });
});

describe("EH-013 security-review corrections", () => {
  it("inflated bundle vs deflated import report fails posts fully_accounted", () => {
    const bundle = parseSiteBundle(
      JSON.parse(
        readFileSync(join(PACKAGE_ROOT, "fixtures", "sample.bundle.json"), "utf8")
      )
    );
    expect(bundle.posts.length).toBeGreaterThan(1);
    const importReport = {
      contract_version: "import-report/1.0.0" as const,
      batch_id: "batch_deflated",
      creator_id: bundle.creator_id,
      site_id: bundle.site_id,
      generated_at: "2026-07-22T20:00:00.000Z",
      source_revision: "rev_deflated",
      posts: {
        expected: 1,
        imported: 1,
        excluded: 0,
        failed: 0,
        conflicts: 0
      },
      media: {
        expected: 0,
        imported: 0,
        excluded: 0,
        failed: 0,
        missing_export: 0
      },
      tiers: { expected: bundle.tiers.length, mapped: bundle.tiers.length, unmapped: 0 },
      exclusions: [],
      failures: [],
      conflicts: [],
      notes: []
    };
    const report = buildLibraryParityReport({
      bundle,
      importReport,
      now: FIXED_NOW
    });
    expect(report.posts.fully_accounted).toBe(false);
    expect(
      report.anomalies.some((a) => a.id === "posts_not_fully_accounted")
    ).toBe(true);
    expect(report.posts.expected).toBeGreaterThanOrEqual(bundle.posts.length);
    expect(report.posts.imported).toBe(1);
  });

  it("tampered fully_accounted / empty anomalies cannot complete until rebuild proves truth", () => {
    const kitDir = materializeKit("eh-013-tamper");
    const honest = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
    expect(honest.gate.can_continue).toBe(false);
    expect(honest.report.anomalies.some((a) => a.blocking)).toBe(true);

    const reportPath = join(kitDir, "data", "library-parity-report.json");
    const statePath = join(kitDir, "data", "library-truth-state.json");
    const tamperedReport = {
      ...honest.report,
      posts: { ...honest.report.posts, fully_accounted: true },
      media: { ...honest.report.media, fully_accounted: true },
      anomalies: [],
      gate: {
        fully_accounted: true,
        blocking_anomaly_ids: [],
        unresolved_blocking_count: 0,
        can_continue_without_exclusions: true
      }
    };
    writeFileSync(reportPath, `${JSON.stringify(tamperedReport, null, 2)}\n`, "utf8");
    writeFileSync(
      statePath,
      `${JSON.stringify(
        {
          ...honest.state,
          library_truth_complete: true,
          completed_at: "2026-07-22T20:00:00.000Z"
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const rebuilt = runLibraryTruthForKit({
      kitDir,
      now: FIXED_NOW,
      markComplete: true
    });
    expect(rebuilt.report.anomalies.length).toBeGreaterThan(0);
    expect(rebuilt.report.anomalies.some((a) => a.blocking)).toBe(true);
    expect(rebuilt.gate.can_continue).toBe(false);
    expect(rebuilt.state.library_truth_complete).toBe(false);
    expect(rebuilt.gate.library_truth_complete).toBe(false);
    // Disk tamper must not stick after rebuild.
    const diskReport = parseLibraryParityReport(
      JSON.parse(readFileSync(reportPath, "utf8"))
    );
    expect(diskReport.anomalies.length).toBeGreaterThan(0);
    const diskState = parseLibraryTruthState(
      JSON.parse(readFileSync(statePath, "utf8"))
    );
    expect(diskState.library_truth_complete).toBe(false);
  });

  it("rewriteKitModuleImports strips relative .js but leaves packages and node:", () => {
    const input = [
      `import { x } from "../contracts.js";`,
      `import { y } from './build-report.js';`,
      `export { z } from "../import/index.js";`,
      `const m = await import("./validate.js");`,
      `import { join } from "node:path";`,
      `import archiver from "archiver";`,
      `import type { SiteBundle } from "../contracts.js";`
    ].join("\n");
    const out = rewriteKitModuleImports(input);
    expect(out).toContain(`from "../contracts"`);
    expect(out).toContain(`from './build-report'`);
    expect(out).toContain(`from "../import/index"`);
    expect(out).toContain(`import("./validate")`);
    expect(out).toContain(`from "node:path"`);
    expect(out).toContain(`from "archiver"`);
    expect(out).not.toMatch(/\bfrom\s+["']\.\.?\/[^"']+\.js["']/);
  });

  it("embedded kit modules use extensionless relative imports", () => {
    const kitDir = tempDir("eh-013-embed-imports-");
    embedLibraryTruthModules(kitDir);
    const relativeJsFrom = /\bfrom\s+["']\.\.?\/[^"']+\.js["']/;
    const dirs = [
      join(kitDir, "lib", "library-truth"),
      join(kitDir, "lib", "import"),
      join(kitDir, "lib", "migrate")
    ];
    const sources: string[] = [];
    for (const dir of dirs) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".ts")) continue;
        const path = join(dir, name);
        if (!statSync(path).isFile()) continue;
        const source = readFileSync(path, "utf8");
        sources.push(path);
        expect(source, path).not.toMatch(relativeJsFrom);
      }
    }
    expect(sources.length).toBeGreaterThan(0);
    expect(readFileSync(join(kitDir, "lib", "import", "index.ts"), "utf8")).toContain(
      `from "./validate"`
    );
    expect(readFileSync(join(kitDir, "lib", "import", "index.ts"), "utf8")).toContain(
      `from "./types"`
    );
  });

  it("fillTemplate embedded modules also have no relative .js imports", () => {
    const kitDir = materializeKit("eh-013-fill-imports");
    const relativeJsFrom = /\bfrom\s+["']\.\.?\/[^"']+\.js["']/;
    for (const sub of ["library-truth", "import", "migrate"] as const) {
      const dir = join(kitDir, "lib", sub);
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".ts")) continue;
        const path = join(dir, name);
        expect(readFileSync(path, "utf8"), path).not.toMatch(relativeJsFrom);
      }
    }
  });

  it("kit lib path rebuild matches CLI runLibraryTruthForKit and rejects tamper", async () => {
    const kitDir = materializeKit("eh-013-kit-lib");
    expect(
      existsSync(join(kitDir, "lib", "library-truth", "kit-io.ts"))
    ).toBe(true);
    expect(existsSync(join(kitDir, "lib", "library-truth", "build-report.ts"))).toBe(
      true
    );
    expect(existsSync(join(kitDir, "lib", "import", "validate.ts"))).toBe(true);
    expect(existsSync(join(kitDir, "lib", "migrate", "validate.ts"))).toBe(true);

    const kitSource = readFileSync(
      join(kitDir, "lib", "library-truth", "kit-io.ts"),
      "utf8"
    );
    const pkgSource = readFileSync(
      join(PACKAGE_ROOT, "src", "library-truth", "kit-io.ts"),
      "utf8"
    );
    expect(kitSource).toBe(rewriteKitModuleImports(pkgSource));
    expect(kitSource).not.toMatch(/\bfrom\s+["']\.\.?\/[^"']+\.js["']/);

    const honest = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
    const reportPath = join(kitDir, "data", "library-parity-report.json");
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          ...honest.report,
          posts: { ...honest.report.posts, fully_accounted: true },
          media: { ...honest.report.media, fully_accounted: true },
          anomalies: []
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const { pathToFileURL } = await import("node:url");
    const kitIo = await import(
      pathToFileURL(join(kitDir, "lib", "library-truth", "kit-io.ts")).href
    );
    const fromKitLib = kitIo.runLibraryTruthForKit({
      kitDir,
      now: FIXED_NOW,
      markComplete: true
    });
    expect(fromKitLib.gate.can_continue).toBe(false);
    expect(fromKitLib.state.library_truth_complete).toBe(false);
    expect(fromKitLib.report.anomalies.length).toBeGreaterThan(0);
  });

  it("local operator guard rejects missing header and remote hosts", () => {
    const missingHeader = evaluateLocalLibraryTruthMutationAccess({
      headerValue: null,
      hostHeader: "localhost:3000",
      requestUrl: "http://localhost:3000/api/library-truth"
    });
    expect(missingHeader.allowed).toBe(false);
    if (!missingHeader.allowed) {
      expect(missingHeader.status).toBe(403);
      expect(missingHeader.error).toMatch(/x-escape-hatch-local/i);
      expect(missingHeader.error).toMatch(/not authentication/i);
    }

    const remote = evaluateLocalLibraryTruthMutationAccess({
      headerValue: "1",
      hostHeader: "preview.example.com",
      requestUrl: "https://preview.example.com/api/library-truth"
    });
    expect(remote.allowed).toBe(false);
    if (!remote.allowed) {
      expect(remote.status).toBe(403);
      expect(remote.error).toMatch(/local-prototype|localhost/i);
      expect(remote.error).toMatch(/not authentication/i);
    }

    const local = evaluateLocalLibraryTruthMutationAccess({
      headerValue: "1",
      hostHeader: "localhost:3000",
      requestUrl: "http://localhost:3000/api/library-truth"
    });
    expect(local.allowed).toBe(true);
    if (local.allowed) {
      expect(local.reason).toBe("localhost");
    }

    const loopbackIpv4 = evaluateLocalLibraryTruthMutationAccess({
      headerValue: "1",
      hostHeader: "127.0.0.1:3001",
      requestUrl: "http://127.0.0.1:3001/api/library-truth"
    });
    expect(loopbackIpv4.allowed).toBe(true);

    // Env override must not enable remote mutations (ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW removed).
    const priorAllow = process.env.ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW;
    process.env.ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW = "1";
    try {
      const remoteWithEnv = evaluateLocalLibraryTruthMutationAccess({
        headerValue: "1",
        hostHeader: "preview.example.com",
        requestUrl: "https://preview.example.com/api/library-truth"
      });
      expect(remoteWithEnv.allowed).toBe(false);
      if (!remoteWithEnv.allowed) {
        expect(remoteWithEnv.error).toMatch(/not authentication/i);
      }
    } finally {
      if (priorAllow === undefined) {
        delete process.env.ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW;
      } else {
        process.env.ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW = priorAllow;
      }
    }
  });

  it("status documents rebuild + local-operator honesty", () => {
    const status = buildEscapeHatchStatus();
    expect(status.productionSafe).toBe(false);
    expect(
      status.prototypeWarnings.some((w) =>
        /x-escape-hatch-local|local-prototype operator/i.test(w)
      )
    ).toBe(true);
    expect(
      status.prototypeWarnings.some((w) =>
        /rebuilds parity|tampered library-parity-report/i.test(w)
      )
    ).toBe(true);
    const cap = status.capabilities.find((c) => c.id === "library-truth-parity");
    expect(cap?.evidence).toMatch(/rebuild|byte-copied|x-escape-hatch-local/i);
  });
});

/**
 * Presentation contract for inventory tiles (mirrors LibraryTruthView.tsx).
 * Expected is live inventory; exclusions are detail-only and must not inflate the ratio.
 */
function formatLiveInventoryDisplay(counts: {
  expected: number;
  imported: number;
  excluded: number;
  failed: number;
  fully_accounted: boolean;
}): { primary: string; detail: string; tone: "ok" | "bad" } {
  const live = counts.imported + counts.failed;
  const detail = `${counts.imported} imported · ${counts.excluded} excluded · ${counts.failed} failed`;

  if (counts.fully_accounted) {
    return {
      primary: `${counts.expected}/${counts.expected}`,
      detail,
      tone: "ok"
    };
  }

  if (live > counts.expected) {
    return {
      primary: "Needs review",
      detail: `${live} live dispositions vs ${counts.expected} expected · ${detail}`,
      tone: "bad"
    };
  }

  return {
    primary: `${live}/${counts.expected}`,
    detail,
    tone: "bad"
  };
}

describe("EH-013 presentation — inventory readout + mobile nav", () => {
  const viewPath = join(
    PACKAGE_ROOT,
    "template",
    "components",
    "LibraryTruthView.tsx"
  );
  const cssPath = join(PACKAGE_ROOT, "template", "app", "globals.css");

  it("accepted fixture never derives impossible posts ratio like 4/3", async () => {
    const kitDir = materializeKit("eh-013-posts-display");
    await migrateKitMedia({
      kitDir,
      storage: new MemoryObjectStorage(),
      exportCreatorRoot: join(RELAY_DUMP, "exports", "cr_eh_relay"),
      batchId: "eh013_posts_display",
      now: FIXED_NOW
    });
    const result = runLibraryTruthForKit({ kitDir, now: FIXED_NOW });
    const posts = result.report.posts;

    // Fixture shape that previously rendered 4/3: live inventory closed with a
    // separate tombstone exclusion.
    expect(posts.fully_accounted).toBe(true);
    expect(posts.imported + posts.excluded + posts.failed).toBeGreaterThan(
      posts.expected
    );
    expect(posts.imported + posts.excluded + posts.failed).toBe(4);
    expect(posts.expected).toBe(3);

    const display = formatLiveInventoryDisplay(posts);
    expect(display.primary).toBe("3/3");
    expect(display.primary).not.toBe("4/3");
    expect(display.tone).toBe("ok");
    expect(display.detail).toMatch(/3 imported/);
    expect(display.detail).toMatch(/1 excluded/);

    // Naive sum must never be what we show.
    const naive = `${posts.imported + posts.excluded + posts.failed}/${posts.expected}`;
    expect(naive).toBe("4/3");
    expect(display.primary).not.toBe(naive);
  });

  it("under-accounted posts still read incomplete/bad", () => {
    const under = formatLiveInventoryDisplay({
      expected: 3,
      imported: 1,
      excluded: 0,
      failed: 0,
      fully_accounted: false
    });
    expect(under.primary).toBe("1/3");
    expect(under.tone).toBe("bad");
    expect(under.primary).not.toMatch(/Complete|3\/3/);

    const overLive = formatLiveInventoryDisplay({
      expected: 3,
      imported: 4,
      excluded: 0,
      failed: 0,
      fully_accounted: false
    });
    expect(overLive.primary).toBe("Needs review");
    expect(overLive.tone).toBe("bad");
    expect(overLive.primary).not.toBe("4/3");
  });

  it("LibraryTruthView uses live-inventory display, not naive imported+excluded+failed/expected", () => {
    const source = readFileSync(viewPath, "utf8");
    expect(source).toContain("formatLiveInventoryDisplay");
    expect(source).toContain("postsDisplay.primary");
    expect(source).toContain("postsDisplay.detail");
    // Old impossible-ratio formula must be gone.
    expect(source).not.toMatch(
      /report\.posts\.imported\s*\+\s*report\.posts\.excluded\s*\+\s*report\.posts\.failed/
    );
    expect(source).not.toMatch(
      /report\.media\.imported\s*\+\s*report\.media\.excluded\s*\+\s*report\.media\.failed/
    );
    // Presentation contract branches present in source.
    expect(source).toContain("Needs review");
    expect(source).toMatch(/imported \+ counts\.failed|counts\.imported \+ counts\.failed/);
    expect(source).toMatch(/\$\{counts\.expected\}\/\$\{counts\.expected\}/);
  });

  it("mobile console nav is a single scrollable rail with 44px targets and hidden hints", () => {
    const css = readFileSync(cssPath, "utf8");
    // Mobile block markers for the compact tab rail (not the old 2×2 card stack).
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tabs\s*\{[\s\S]*?flex-wrap:\s*nowrap/
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tabs\s*\{[\s\S]*?overflow-x:\s*auto/
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tab\s*\{[\s\S]*?min-height:\s*44px/
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tab\s*\{[\s\S]*?min-width:\s*44px/
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tab-hint\s*\{[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\)/
    );
    // Old 2×2 card flex-basis must not return.
    expect(css).not.toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*flex:\s*1\s+1\s+calc\(50%/
    );

    // Filled kits receive the same mobile rail CSS.
    const kitDir = materializeKit("eh-013-mobile-nav-css");
    const generated = readFileSync(join(kitDir, "app", "globals.css"), "utf8");
    expect(generated).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tabs\s*\{[\s\S]*?flex-wrap:\s*nowrap/
    );
    expect(generated).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tabs\s*\{[\s\S]*?overflow-x:\s*auto/
    );
    expect(generated).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.console-tab-hint\s*\{[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\)/
    );
  });
});
