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
  "soft-persona-gate",
  "public-media-copy",
  "client-readable-bundle",
  "duplicate-contracts",
  "fixture-coverage",
  "relay-dump-fixtures",
  "relay-canonical-reuse",
  "simplified-access-semantics",
  "generated-site-identity",
  "private-media-delivery",
  "billing-adapters",
  "deploy-adapters",
  "native-admin",
  "migration-import",
  "backup-restore",
  "provider-readiness"
] as const;

describe("buildEscapeHatchStatus", () => {
  it("returns a versioned schema with productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(status.schemaVersion).toBe(ESCAPE_HATCH_STATUS_SCHEMA_VERSION);
    expect(status.slice).toBe("EH-000");
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

  it("documents premium public bytes and non-authoritative persona state", () => {
    const status = buildEscapeHatchStatus();
    const joined = status.prototypeWarnings.join(" ");
    expect(joined).toMatch(/public/i);
    expect(joined).toMatch(/persona/i);
    expect(joined).toMatch(/non-authoritative|not authoritative/i);
    const media = status.capabilities.find((c) => c.id === "public-media-copy");
    expect(media?.evidence).toMatch(/200/);
    expect(media?.evidence).toMatch(/public bytes/i);
  });

  it("lists blockers and next slice EH-001", () => {
    const status = buildEscapeHatchStatus();
    expect(status.blockers.length).toBeGreaterThan(0);
    expect(status.blockers.some((b) => b.includes("EH-001"))).toBe(true);
    expect(status.nextSlice.id).toBe("EH-001");
    expect(status.nextSlice.focus.length).toBeGreaterThan(0);
  });

  it("states billing/deploy stubs are not production proof", () => {
    const status = buildEscapeHatchStatus();
    expect(
      status.prototypeWarnings.some((w) => /billing|deploy|stub/i.test(w))
    ).toBe(true);
    expect(status.capabilities.find((c) => c.id === "billing-adapters")?.state).toBe(
      "stub_only"
    );
    expect(status.capabilities.find((c) => c.id === "deploy-adapters")?.state).toBe(
      "stub_only"
    );
  });

  it("routes capability ownership to the corrected batting-order slices", () => {
    const capabilities = new Map(
      buildEscapeHatchStatus().capabilities.map((cap) => [cap.id, cap])
    );
    expect(capabilities.get("private-media-delivery")?.nextSlice).toBe("EH-033");
    expect(capabilities.get("billing-adapters")?.nextSlice).toBe("EH-050");
    expect(capabilities.get("deploy-adapters")?.nextSlice).toBe("EH-070");
    expect(capabilities.get("backup-restore")?.nextSlice).toBe("EH-073");
    expect(capabilities.get("provider-readiness")?.nextSlice).toBeUndefined();
    expect(capabilities.get("provider-readiness")?.evidence).toMatch(
      /EH-030.*EH-051.*EH-052.*EH-070.*EH-072/
    );
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

  it("cites real-shape Patreon fixture paths exactly", () => {
    const capability = buildEscapeHatchStatus().capabilities.find(
      (cap) => cap.id === "fixture-coverage"
    );
    expect(capability?.sourcePaths).toEqual(
      expect.arrayContaining([
        "tests/fixtures/patreon/oauth-list-post-text-only.json",
        "tests/fixtures/patreon/cookie-list-with-media.json"
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
