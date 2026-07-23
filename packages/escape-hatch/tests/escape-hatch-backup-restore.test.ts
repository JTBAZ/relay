/**
 * EH-073 — Backup / restore / update manifest (kit-local fixture).
 */

import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { buildHealthItems } from "../template/lib/admin/connections.js";
import {
  assessBackupReadiness,
  assessCompatibility,
  buildDiagnosticBundle,
  diagnosticContainsSecrets,
  isBackupFresh,
  runIsolatedRestoreRehearsal,
  runScheduledBackup
} from "../template/lib/backup/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_MANIFEST = join(
  HERE,
  "..",
  "template",
  "escape-hatch.manifest.json"
);

function seedKitDir(): string {
  const kitDir = mkdtempSync(join(tmpdir(), "eh073-"));
  mkdirSync(join(kitDir, "data"), { recursive: true });
  copyFileSync(TEMPLATE_MANIFEST, join(kitDir, "escape-hatch.manifest.json"));
  writeFileSync(
    join(kitDir, "data", "site-config.json"),
    `${JSON.stringify({ site_name: "Fixture", api_key: "sk_live_should_redact_this_value_xx" }, null, 2)}\n`,
    "utf8"
  );
  return kitDir;
}

describe("EH-073 status", () => {
  it("advances slice to EH-074 with next EH-080 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-074");
    expect(status.slice).toBe("EH-074");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-080");
    expect(status.nextSlice.title).toMatch(/ownership/i);
    const backup = status.capabilities.find((c) => c.id === "backup-restore");
    expect(backup?.state).toBe("preview_only");
    expect(backup?.nextSlice).toBe("EH-080");
    expect(backup?.sourcePaths.length).toBeGreaterThan(0);
  });
});

describe("EH-073 backup / restore / diagnostics", () => {
  it("runs scheduled backup with freshness within RPO", () => {
    const kitDir = seedKitDir();
    try {
      const now = new Date("2026-07-23T18:00:00.000Z");
      const result = runScheduledBackup({
        siteId: "site_eh_073",
        kitDir,
        now
      });
      expect(result.ok).toBe(true);
      expect(result.artifact?.status).toBe("ok");
      expect(result.production_safe).toBe(false);
      expect(isBackupFresh(result.state, now)).toBe(true);

      const snapshot = JSON.parse(
        readFileSync(join(kitDir, result.artifact!.artifact_path), "utf8")
      ) as { data_file_hashes: Array<{ name: string }>; redaction_note: string };
      expect(snapshot.redaction_note).toMatch(/not a live/i);
      expect(
        snapshot.data_file_hashes.some((h) => h.name === "site-config.json")
      ).toBe(true);

      const rawSnap = readFileSync(
        join(kitDir, result.artifact!.artifact_path),
        "utf8"
      );
      expect(rawSnap).not.toMatch(/sk_live_should_redact/);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("isolated restore rehearsal passes and fails closed", () => {
    const kitDir = seedKitDir();
    try {
      const now = new Date("2026-07-23T18:00:00.000Z");
      const bak = runScheduledBackup({
        siteId: "site_eh_073",
        kitDir,
        now
      });
      expect(bak.ok).toBe(true);

      const pass = runIsolatedRestoreRehearsal({
        siteId: "site_eh_073",
        kitDir,
        now: new Date("2026-07-23T18:05:00.000Z")
      });
      expect(pass.ok).toBe(true);
      expect(pass.rehearsal?.status).toBe("passed");
      expect(pass.rehearsal?.target_path).toMatch(/restore-rehearsal/);

      const fail = runIsolatedRestoreRehearsal({
        siteId: "site_eh_073",
        kitDir,
        forceFail: true,
        now: new Date("2026-07-23T18:10:00.000Z")
      });
      expect(fail.ok).toBe(false);
      expect(fail.error).toBe("forced_rehearsal_failure");
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("diagnostics exclude secrets and include versions/statuses", () => {
    const kitDir = seedKitDir();
    try {
      runScheduledBackup({
        siteId: "site_eh_073",
        kitDir,
        now: new Date("2026-07-23T18:00:00.000Z")
      });
      const bundle = buildDiagnosticBundle({
        siteId: "site_eh_073",
        kitDir,
        healthStatuses: [
          { id: "backup_freshness", ok: true, detail: "ok" },
          {
            id: "leak",
            ok: false,
            detail: "token=supersecret_token_value_should_not_matter"
          }
        ]
      });
      expect(bundle).not.toBeNull();
      expect(bundle!.versions.slice).toBeTruthy();
      expect(bundle!.production_safe).toBe(false);
      expect(diagnosticContainsSecrets(bundle!)).toBe(false);
      const json = JSON.stringify(bundle);
      expect(json).not.toMatch(/sk_live_/);
      expect(json).toMatch(/escape-hatch-diagnostic-bundle/);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("compatibility reports honestly with previous_stable", () => {
    const report = assessCompatibility({
      current: {
        chassis_version: "0.8.0",
        schema_version: "eh-db/0005_patreon_oauth",
        slice: "EH-073",
        recorded_at: "2026-07-23T18:00:00.000Z"
      },
      previous_stable: {
        chassis_version: "0.8.0",
        schema_version: "eh-db/0005_patreon_oauth",
        slice: "EH-072",
        recorded_at: "2026-07-22T18:00:00.000Z"
      }
    });
    expect(report.verdict).toBe("compatible_with_notes");
    expect(report.production_safe).toBe(false);
    expect(report.detail).toMatch(/slice/);
  });

  it("wires Health backup items", () => {
    const kitDir = seedKitDir();
    try {
      runScheduledBackup({
        siteId: "site_eh_073",
        kitDir,
        now: new Date("2026-07-23T18:00:00.000Z")
      });
      runIsolatedRestoreRehearsal({
        siteId: "site_eh_073",
        kitDir,
        now: new Date("2026-07-23T18:05:00.000Z")
      });
      const readiness = assessBackupReadiness({
        siteId: "site_eh_073",
        kitDir,
        now: new Date("2026-07-23T18:06:00.000Z")
      });
      expect(readiness.schedule_ok).toBe(true);
      expect(readiness.restore_ok).toBe(true);
      expect(readiness.production_safe).toBe(false);

      const items = buildHealthItems({
        adapters: [],
        blockers: [],
        manifestSlice: "EH-073",
        publicMediaHonesty: "test",
        backupReadiness: readiness
      });
      const ids = items.map((i) => i.id);
      expect(ids).toContain("backup_freshness");
      expect(ids).toContain("restore_rehearsal");
      expect(ids).toContain("update_compatibility");
      expect(ids).toContain("diagnostic_bundle");
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
