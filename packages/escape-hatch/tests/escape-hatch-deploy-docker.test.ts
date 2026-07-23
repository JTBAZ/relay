/**
 * EH-071 — Portable Docker Path B (fixture + recipe inventory).
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { assessPathBRecipe } from "../template/lib/deploy/path-b-recipe.js";
import {
  createDockerPreview,
  createMemoryDockerClient,
  promoteDockerDeployment,
  rollbackDockerDeployment
} from "../template/lib/deploy/docker-path.js";
import { assessVercelDeployReadiness } from "../template/lib/deploy/vercel-path.js";
import { buildHealthItems } from "../template/lib/admin/connections.js";

const TEMPLATE = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../template"
);

describe("EH-071 status", () => {
  it("advances slice to EH-071 with next EH-072 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-071");
    expect(status.slice).toBe("EH-071");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-072");
    expect(status.nextSlice.title).toMatch(/email|transactional/i);
    const deploy = status.capabilities.find((c) => c.id === "deploy-adapters");
    expect(deploy?.state).toBe("preview_only");
    expect(deploy?.nextSlice).toBe("EH-072");
    expect(deploy?.evidence).toMatch(/EH-071|docker|Path B|fixture/i);
  });
});

describe("EH-071 Path B recipe", () => {
  it("reports recipe files present on the template chassis", () => {
    const report = assessPathBRecipe(TEMPLATE);
    expect(report.ok).toBe(true);
    expect(report.production_safe).toBe(false);
    expect(report.host_candidate.id).toBe("mojohost");
    expect(report.host_candidate.wizard_supported).toBe(false);
    expect(
      report.items.every((i) => (i.required ? i.present : true))
    ).toBe(true);
  });
});

describe("EH-071 Docker fixture rehearsal", () => {
  it("runs build/up → promote → rollback retaining prior stable", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh071-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      const client = createMemoryDockerClient();

      const first = await createDockerPreview({
        siteId: "site_eh_071",
        kitDir,
        client
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.record.provider).toBe("docker");

      const promo1 = promoteDockerDeployment({
        siteId: "site_eh_071",
        deploymentId: first.record.deployment_id,
        kitDir,
        siteUrl: "https://path-b.example.art"
      });
      expect(promo1.ok).toBe(true);
      if (!promo1.ok) return;

      const second = await createDockerPreview({
        siteId: "site_eh_071",
        kitDir,
        client
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      const promo2 = promoteDockerDeployment({
        siteId: "site_eh_071",
        deploymentId: second.record.deployment_id,
        kitDir,
        siteUrl: "https://path-b.example.art"
      });
      expect(promo2.ok).toBe(true);
      if (!promo2.ok) return;
      expect(promo2.state.previous_stable_deployment_id).toBe(
        first.record.deployment_id
      );

      const rolled = rollbackDockerDeployment({
        siteId: "site_eh_071",
        kitDir
      });
      expect(rolled.ok).toBe(true);
      if (!rolled.ok) return;
      expect(rolled.state.active_deployment_id).toBe(first.record.deployment_id);

      const ready = assessVercelDeployReadiness({
        siteId: "site_eh_071",
        siteUrl: "https://path-b.example.art",
        kitDir
      });
      expect(ready.ok).toBe(true);
      expect(ready.path).toBe("docker_rehearsal");
      expect(ready.production_safe).toBe(false);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("surfaces Path B health without claiming productionSafe", () => {
    const items = buildHealthItems({
      adapters: [],
      blockers: [],
      manifestSlice: "EH-071",
      publicMediaHonesty: "public/media honesty",
      deployReadiness: assessVercelDeployReadiness({
        siteId: "missing",
        siteUrl: null
      }),
      pathBRecipe: assessPathBRecipe(TEMPLATE)
    });
    expect(items.some((i) => i.id === "path_b_recipe" && i.ok)).toBe(true);
    expect(
      items.every((i) => !/production.?safe:\s*true/i.test(i.detail))
    ).toBe(true);
  });
});
