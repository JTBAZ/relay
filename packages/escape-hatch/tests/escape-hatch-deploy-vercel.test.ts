/**
 * EH-070 — Vercel golden path (fixture preview/promote/rollback + callbacks).
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { buildCallbackChecklist } from "../template/lib/deploy/callbacks.js";
import {
  assessVercelDeployReadiness,
  createMemoryVercelClient,
  createVercelPreview,
  promoteVercelDeployment,
  rollbackVercelDeployment
} from "../template/lib/deploy/vercel-path.js";
import { buildHealthItems } from "../template/lib/admin/connections.js";

describe("EH-070 status", () => {
  it("advances slice to EH-082 with next HUMAN-SIGNOFF and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-082");
    expect(status.slice).toBe("EH-082");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("HUMAN-SIGNOFF");
    expect(status.nextSlice.title).toMatch(/human|sign[- ]?off|release/i);
    const deploy = status.capabilities.find((c) => c.id === "deploy-adapters");
    expect(deploy?.state).toBe("preview_only");
    expect(deploy?.nextSlice).toBe("HUMAN-SIGNOFF");
    expect(deploy?.evidence).toMatch(/EH-070|vercel|fixture|rehearsal/i);
  });
});

describe("EH-070 callback checklist", () => {
  it("fails closed for unset and placeholder origins", () => {
    expect(buildCallbackChecklist(undefined).ok).toBe(false);
    expect(buildCallbackChecklist("http://localhost:3000").ok).toBe(false);
    expect(buildCallbackChecklist("https://example.com").ok).toBe(false);
  });

  it("mints absolute URLs for provider and custom domains", () => {
    const provider = buildCallbackChecklist(
      "https://my-site-abc.vercel.app"
    );
    expect(provider.ok).toBe(true);
    expect(provider.domain_mode).toBe("provider_url");
    expect(
      provider.slots.find((s) => s.id === "patreon_oauth_callback")
        ?.absolute_url
    ).toBe("https://my-site-abc.vercel.app/api/patreon/oauth/callback");

    const custom = buildCallbackChecklist("https://studio.example.art");
    expect(custom.ok).toBe(true);
    expect(custom.domain_mode).toBe("custom");
  });
});

describe("EH-070 Vercel fixture rehearsal", () => {
  it("runs preview → promote → rollback retaining prior stable", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh070-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      const client = createMemoryVercelClient();

      const first = await createVercelPreview({
        siteId: "site_eh_070",
        kitDir,
        client
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const promo1 = promoteVercelDeployment({
        siteId: "site_eh_070",
        deploymentId: first.record.deployment_id,
        kitDir,
        siteUrl: "https://preview-a.vercel.app"
      });
      expect(promo1.ok).toBe(true);
      if (!promo1.ok) return;
      expect(promo1.record.status).toBe("live");

      const second = await createVercelPreview({
        siteId: "site_eh_070",
        kitDir,
        client
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      const promo2 = promoteVercelDeployment({
        siteId: "site_eh_070",
        deploymentId: second.record.deployment_id,
        kitDir,
        siteUrl: "https://preview-b.vercel.app"
      });
      expect(promo2.ok).toBe(true);
      if (!promo2.ok) return;
      expect(promo2.state.previous_stable_deployment_id).toBe(
        first.record.deployment_id
      );

      const rolled = rollbackVercelDeployment({
        siteId: "site_eh_070",
        kitDir
      });
      expect(rolled.ok).toBe(true);
      if (!rolled.ok) return;
      expect(rolled.record.status).toBe("rolled_back");
      expect(rolled.state.active_deployment_id).toBe(
        first.record.deployment_id
      );
      expect(rolled.restored?.status).toBe("live");

      const ready = assessVercelDeployReadiness({
        siteId: "site_eh_070",
        siteUrl: "https://preview-a.vercel.app",
        kitDir
      });
      expect(ready.ok).toBe(true);
      expect(ready.path).toBe("vercel_rehearsal");
      expect(ready.production_safe).toBe(false);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("keeps default readiness fail-closed without rehearsal", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh070-empty-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      const ready = assessVercelDeployReadiness({
        siteId: "site_eh_070",
        siteUrl: "https://example.vercel.app",
        kitDir
      });
      expect(ready.ok).toBe(false);
      expect(ready.path).toBe("manifest");
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("surfaces deploy health items without claiming productionSafe", () => {
    const items = buildHealthItems({
      adapters: [],
      blockers: [],
      manifestSlice: "EH-070",
      publicMediaHonesty: "public/media honesty",
      deployReadiness: assessVercelDeployReadiness({
        siteId: "missing",
        siteUrl: null
      })
    });
    expect(items.some((i) => i.id === "deploy_version")).toBe(true);
    expect(items.some((i) => i.id === "callback_checklist")).toBe(true);
    expect(
      items.every((i) => !/production.?safe:\s*true/i.test(i.detail))
    ).toBe(true);
  });
});
