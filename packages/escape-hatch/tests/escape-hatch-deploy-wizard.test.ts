/**
 * EH-074 — Deployment launch wizard (Path A/B + backup-before-complete).
 */

import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { buildHealthItems } from "../template/lib/admin/connections.js";
import {
  runIsolatedRestoreRehearsal,
  runScheduledBackup
} from "../template/lib/backup/index.js";
import {
  assessLaunchReadiness,
  completeLaunchWizard,
  markLaunchStep,
  selectLaunchPath
} from "../template/lib/deploy/launch-wizard.js";
import {
  createVercelPreview,
  promoteVercelDeployment
} from "../template/lib/deploy/vercel-path.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_MANIFEST = join(
  HERE,
  "..",
  "template",
  "escape-hatch.manifest.json"
);

function seedKitDir(): string {
  const kitDir = mkdtempSync(join(tmpdir(), "eh074-"));
  mkdirSync(join(kitDir, "data"), { recursive: true });
  copyFileSync(TEMPLATE_MANIFEST, join(kitDir, "escape-hatch.manifest.json"));
  return kitDir;
}

const SITE_URL = "https://fixture-eh074.vercel.app";

describe("EH-074 status", () => {
  it("advances slice to EH-074 with next EH-080 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-074");
    expect(status.slice).toBe("EH-074");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-080");
    expect(status.nextSlice.title).toMatch(/ownership/i);
  });
});

describe("EH-074 launch wizard", () => {
  it("blocks complete without backup/restore and smoke approval", async () => {
    const kitDir = seedKitDir();
    try {
      selectLaunchPath("site_eh_074", "vercel", kitDir);
      const preview = await createVercelPreview({
        siteId: "site_eh_074",
        kitDir,
        domain: "fixture.example.art"
      });
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      promoteVercelDeployment({
        siteId: "site_eh_074",
        deploymentId: preview.record.deployment_id,
        siteUrl: SITE_URL,
        kitDir
      });

      const blocked = assessLaunchReadiness({
        siteId: "site_eh_074",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL }
      });
      expect(blocked.can_complete).toBe(false);
      expect(blocked.blockers.some((b) => /backup|restore|smoke/i.test(b))).toBe(
        true
      );

      const fail = completeLaunchWizard({
        siteId: "site_eh_074",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL }
      });
      expect(fail.ok).toBe(false);
      expect(fail.error).toBe("launch_blockers_present");
      expect(fail.production_safe).toBe(false);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("completes Path A when backup gate + smoke pass", async () => {
    const kitDir = seedKitDir();
    try {
      const now = new Date("2026-07-23T19:00:00.000Z");
      selectLaunchPath("site_eh_074", "vercel", kitDir);

      const preview = await createVercelPreview({
        siteId: "site_eh_074",
        kitDir,
        domain: "fixture.example.art"
      });
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;

      promoteVercelDeployment({
        siteId: "site_eh_074",
        deploymentId: preview.record.deployment_id,
        siteUrl: SITE_URL,
        kitDir
      });

      runScheduledBackup({ siteId: "site_eh_074", kitDir, now });
      runIsolatedRestoreRehearsal({
        siteId: "site_eh_074",
        kitDir,
        now: new Date("2026-07-23T19:05:00.000Z")
      });
      markLaunchStep("site_eh_074", "smoke_approve", "verified", kitDir);

      const ready = assessLaunchReadiness({
        siteId: "site_eh_074",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL },
        now: new Date("2026-07-23T19:06:00.000Z")
      });
      expect(ready.path).toBe("vercel");
      expect(ready.can_complete).toBe(true);
      expect(ready.production_safe).toBe(false);

      const done = completeLaunchWizard({
        siteId: "site_eh_074",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL },
        now: new Date("2026-07-23T19:07:00.000Z")
      });
      expect(done.ok).toBe(true);
      expect(done.readiness.wizard.launch_completed_at).toBeTruthy();

      const again = completeLaunchWizard({
        siteId: "site_eh_074",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL }
      });
      expect(again.ok).toBe(false);
      expect(again.error).toBe("already_completed");
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("supports Path B selection with recipe gate", () => {
    const kitDir = seedKitDir();
    try {
      // Minimal Path B recipe files for fixture.
      writeFileSync(join(kitDir, "Dockerfile"), "# fixture\n", "utf8");
      writeFileSync(join(kitDir, "docker-compose.yml"), "services: {}\n", "utf8");
      mkdirSync(join(kitDir, "deploy", "docker"), { recursive: true });
      writeFileSync(
        join(kitDir, "deploy", "docker", "compose.path-b.yml"),
        "services: {}\n",
        "utf8"
      );
      writeFileSync(
        join(kitDir, "deploy", "docker", "Caddyfile.sample"),
        "# caddy\n",
        "utf8"
      );
      writeFileSync(
        join(kitDir, "deploy", "docker", "README.md"),
        "# path b\n",
        "utf8"
      );

      selectLaunchPath("site_eh_074b", "docker", kitDir);
      const r = assessLaunchReadiness({
        siteId: "site_eh_074b",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL }
      });
      expect(r.path).toBe("docker");
      expect(r.path_b?.ok).toBe(true);
      expect(r.path_b?.host_candidate.wizard_supported).toBe(false);
      expect(r.can_complete).toBe(false);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("wires Health launch wizard item", async () => {
    const kitDir = seedKitDir();
    try {
      selectLaunchPath("site_eh_074", "vercel", kitDir);
      const launch = assessLaunchReadiness({
        siteId: "site_eh_074",
        siteUrl: SITE_URL,
        kitDir,
        env: { NEXT_PUBLIC_SITE_URL: SITE_URL }
      });
      const items = buildHealthItems({
        adapters: [],
        blockers: [],
        manifestSlice: "EH-074",
        publicMediaHonesty: "test",
        launchReadiness: launch
      });
      expect(items.some((i) => i.id === "launch_wizard")).toBe(true);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
