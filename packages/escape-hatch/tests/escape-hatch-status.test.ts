import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_STATUS_SCHEMA_VERSION,
  buildEscapeHatchStatus,
  formatHumanStatus,
  type EscapeHatchStatus
} from "../src/status.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const CLI_PATH = join(PACKAGE_ROOT, "src", "cli.ts");

function runStatus(args: string[] = []): { exitCode: number; stdout: string } {
  const tsxEntry = join(PACKAGE_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(process.execPath, [tsxEntry, CLI_PATH, "status", ...args], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" }
  });
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? "") + (result.stderr ?? "")
  };
}

const EXPECTED_CAPABILITY_IDS = [
  "cli-generator",
  "generated-repository",
  "premium-patron-theme",
  "soft-persona-gate",
  "public-media-copy",
  "client-readable-bundle",
  "duplicate-contracts",
  "fixture-coverage",
  "relay-dump-fixtures",
  "relay-canonical-reuse",
  "simplified-access-semantics",
  "generated-site-identity",
  "entitlement-evaluator",
  "private-media-delivery",
  "account-paywall-ux",
  "billing-adapters",
  "deploy-adapters",
  "native-admin",
  "migration-import",
  "library-truth-parity",
  "backup-restore",
  "provider-readiness",
  "creator-patreon-oauth",
  "relay-managed-patreon-verification"
] as const;

describe("buildEscapeHatchStatus", () => {
  it("returns a versioned schema with productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(status.schemaVersion).toBe(ESCAPE_HATCH_STATUS_SCHEMA_VERSION);
    expect(status.slice).toBe("EH-041");
    expect(status.deliverable).toBe("prototype_preview_only");
    expect(status.productionSafe).toBe(false);
  });

  it("exposes stable capability IDs and closed union states", () => {
    const status = buildEscapeHatchStatus();
    const ids = status.capabilities.map((c) => c.id);
    expect(ids).toEqual([...EXPECTED_CAPABILITY_IDS]);
    for (const cap of status.capabilities) {
      expect([
        "production_safe",
        "preview_only",
        "stub_only",
        "not_implemented",
        "reusable_relay_source"
      ]).toContain(cap.state);
    }
    expect(status.capabilities.some((c) => c.state === "production_safe")).toBe(
      false
    );
  });

  it("documents private media layout and non-authoritative persona state", () => {
    const status = buildEscapeHatchStatus();
    const joined = status.prototypeWarnings.join(" ");
    expect(joined).toMatch(/public_legacy|private-media|private media/i);
    expect(joined).toMatch(/persona/i);
    expect(joined).toMatch(/non-authoritative|not authoritative|persona id only/i);
    const media = status.capabilities.find((c) => c.id === "public-media-copy");
    expect(media?.evidence).toMatch(/private-media|public\/media/i);
    expect(media?.evidence).toMatch(/evaluateAccess|api\/media/i);
    expect(media?.nextSlice).toBe("EH-042");
  });

  it("records EH-041 complete and routes next work to EH-042", () => {
    const status = buildEscapeHatchStatus();
    expect(status.blockers.length).toBeGreaterThan(0);
    expect(status.blockers.some((b) => /OAuth\/cookie.*not yet wired/i.test(b))).toBe(
      false
    );
    expect(status.blockers.some((b) => /Library truth wizard remains open/i.test(b))).toBe(
      false
    );
    expect(status.blockers.some((b) => /Native admin shell.*remains open/i.test(b))).toBe(
      false
    );
    expect(status.blockers.some((b) => /No hard patron identity/i.test(b))).toBe(false);
    expect(status.blockers.some((b) => /Entitlement service freshness/i.test(b))).toBe(
      false
    );
    expect(status.blockers.some((b) => /Account\/paywall UX.*EH-034/i.test(b))).toBe(
      false
    );
    expect(status.nextSlice.id).toBe("EH-042");
    expect(status.nextSlice.title).toMatch(/billing|connector/i);
    expect(status.nextSlice.focus.length).toBeGreaterThan(0);
  });

  it("reports shared contracts and aligned preview access honestly", () => {
    const capabilities = new Map(
      buildEscapeHatchStatus().capabilities.map((cap) => [cap.id, cap])
    );
    const contracts = capabilities.get("duplicate-contracts");
    expect(contracts?.evidence).toMatch(/versioned/i);
    expect(contracts?.evidence).toMatch(/runtime-validated/i);
    expect(contracts?.evidence).toMatch(/generated apps/i);
    expect(contracts?.nextSlice).toBeUndefined();

    const access = capabilities.get("simplified-access-semantics");
    expect(access?.evidence).toMatch(/paid\/free/i);
    expect(access?.evidence).toMatch(/tier-or-higher/i);
    expect(access?.evidence).toMatch(/client-only|fail-closed|EH-032/i);
    expect(access?.nextSlice).toBe("EH-042");
  });

  it("states billing stubs are not production proof and deploy manifests are preview-only", () => {
    const status = buildEscapeHatchStatus();
    expect(
      status.prototypeWarnings.some((w) => /billing|deploy|stub|manifest/i.test(w))
    ).toBe(true);
    expect(status.capabilities.find((c) => c.id === "billing-adapters")?.state).toBe(
      "stub_only"
    );
    expect(status.capabilities.find((c) => c.id === "deploy-adapters")?.state).toBe(
      "preview_only"
    );
  });

  it("routes capability ownership to the corrected batting-order slices", () => {
    const capabilities = new Map(
      buildEscapeHatchStatus().capabilities.map((cap) => [cap.id, cap])
    );
    expect(capabilities.get("private-media-delivery")?.nextSlice).toBe("EH-042");
    expect(capabilities.get("account-paywall-ux")?.nextSlice).toBe("EH-042");
    expect(capabilities.get("billing-adapters")?.nextSlice).toBe("EH-050");
    expect(capabilities.get("deploy-adapters")?.nextSlice).toBe("EH-070");
    expect(capabilities.get("backup-restore")?.nextSlice).toBe("EH-073");
    expect(capabilities.get("provider-readiness")?.nextSlice).toBe("EH-042");
    expect(capabilities.get("provider-readiness")?.evidence).toMatch(
      /EH-030|EH-031|Auth\/DB|EH-051|EH-070|EH-072/
    );
    expect(capabilities.get("generated-site-identity")?.state).toBe("preview_only");
    expect(capabilities.get("generated-site-identity")?.nextSlice).toBe("EH-042");
    expect(capabilities.get("entitlement-evaluator")?.state).toBe("preview_only");
    expect(capabilities.get("entitlement-evaluator")?.nextSlice).toBe("EH-042");
  });

  it("uses exact repository-relative source paths that exist", () => {
    const sourcePaths = buildEscapeHatchStatus().capabilities.flatMap(
      (cap) => cap.sourcePaths
    );
    expect(sourcePaths.length).toBeGreaterThan(0);
    for (const sourcePath of sourcePaths) {
      expect(sourcePath).toMatch(/^(packages\/escape-hatch\/|src\/|tests\/)/);
      expect(sourcePath).not.toMatch(/^[A-Za-z]:[\\/]|^[/\\]/);
      expect(existsSync(join(REPO_ROOT, ...sourcePath.split("/")))).toBe(true);
    }
  });

  it("identifies public JSON copies and their supporting source", () => {
    const capability = buildEscapeHatchStatus().capabilities.find(
      (cap) => cap.id === "client-readable-bundle"
    );
    expect(capability?.evidence).toMatch(/public\/site\.json/);
    expect(capability?.evidence).toMatch(/public\/theme\.json/);
    expect(capability?.sourcePaths).toContain(
      "packages/escape-hatch/src/fill-template.ts"
    );
  });

  it("cites wired matrix, scan, and real-shape Patreon fixture paths", () => {
    const capability = buildEscapeHatchStatus().capabilities.find(
      (cap) => cap.id === "fixture-coverage"
    );
    expect(capability?.evidence).toMatch(/MATRIX\.json/i);
    expect(capability?.evidence).toMatch(/secret\/PII scan/i);
    expect(capability?.evidence).not.toMatch(/not wired/i);
    expect(capability?.nextSlice).toBe("EH-042");
    expect(capability?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/fixtures/MATRIX.json",
        "packages/escape-hatch/fixtures/PROVENANCE.md",
        "packages/escape-hatch/src/fixture-scan.ts",
        "packages/escape-hatch/tests/escape-hatch-fixtures.test.ts",
        "packages/escape-hatch/tests/escape-hatch-generated-repo.test.ts",
        "packages/escape-hatch/tests/escape-hatch-identity.test.ts",
        "packages/escape-hatch/tests/escape-hatch-portable-identity.test.ts",
        "tests/fixtures/patreon/oauth-list-post-text-only.json",
        "tests/fixtures/patreon/cookie-list-with-media.json"
      ])
    );
  });

  it("marks migration-import and relay-dump as implemented preview capabilities", () => {
    const capabilities = new Map(
      buildEscapeHatchStatus().capabilities.map((cap) => [cap.id, cap])
    );
    const migration = capabilities.get("migration-import");
    expect(migration?.state).toBe("preview_only");
    expect(migration?.evidence).toMatch(/idempotent|provenance|conflict|ledger|private-read/i);
    expect(migration?.evidence).not.toMatch(/no idempotent/i);
    expect(migration?.nextSlice).toBe("EH-042");
    expect(migration?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/src/import/importer.ts",
        "packages/escape-hatch/src/migrate/engine.ts",
        "packages/escape-hatch/tests/escape-hatch-import.test.ts",
        "packages/escape-hatch/tests/escape-hatch-migrate.test.ts"
      ])
    );

    const dump = capabilities.get("relay-dump-fixtures");
    expect(dump?.state).toBe("preview_only");
    expect(dump?.evidence).toMatch(/import-relay-dump|migrate-media|checksum|private-read/i);
    expect(dump?.evidence).not.toMatch(/no automated importer/i);
    expect(dump?.nextSlice).toBe("EH-042");
  });

  it("marks library-truth-parity as implemented preview capability", () => {
    const cap = buildEscapeHatchStatus().capabilities.find(
      (c) => c.id === "library-truth-parity"
    );
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/100% accounted-for|accounted-for/i);
    expect(cap?.evidence).toMatch(/productionSafe remains false|production_safe/i);
    expect(cap?.nextSlice).toBe("EH-042");
    expect(cap?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/src/library-truth/build-report.ts",
        "packages/escape-hatch/template/components/LibraryTruthView.tsx",
        "packages/escape-hatch/tests/escape-hatch-library-truth.test.ts"
      ])
    );
  });

  it("marks generated-repository as preview chassis capability", () => {
    const cap = buildEscapeHatchStatus().capabilities.find(
      (c) => c.id === "generated-repository"
    );
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/typed env|Dockerfile|clean directory/i);
    expect(cap?.nextSlice).toBe("EH-042");
    expect(cap?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/lib/env.ts",
        "packages/escape-hatch/template/Dockerfile",
        "packages/escape-hatch/tests/escape-hatch-generated-repo.test.ts"
      ])
    );
  });

  it("is deterministic across calls", () => {
    const a = buildEscapeHatchStatus();
    const b = buildEscapeHatchStatus();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("formatHumanStatus", () => {
  it("includes unmistakable not-production-safe warnings", () => {
    const text = formatHumanStatus(buildEscapeHatchStatus());
    expect(text).toMatch(/NOT PRODUCTION SAFE/i);
    expect(text).toMatch(/productionSafe:\s*false/i);
    expect(text).toMatch(/fixture tests passing does not authorize deployment/i);
    expect(text).not.toMatch(/production-safe capability/i);
  });
});

describe("status CLI", () => {
  it("exits 0 for human output", () => {
    const { exitCode, stdout } = runStatus();
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/NOT PRODUCTION SAFE/i);
  });

  it("exits 0 for --json with parseable output", () => {
    const { exitCode, stdout } = runStatus(["--json"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as EscapeHatchStatus;
    expect(parsed.schemaVersion).toBe(ESCAPE_HATCH_STATUS_SCHEMA_VERSION);
    expect(parsed.productionSafe).toBe(false);
    expect(parsed.capabilities).toHaveLength(EXPECTED_CAPABILITY_IDS.length);
    expect(JSON.stringify(parsed)).not.toMatch(/[A-Za-z]:\\|\/Users\//);
  });
});
