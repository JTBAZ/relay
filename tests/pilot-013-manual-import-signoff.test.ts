/**
 * PILOT-013 — manual import sign-off: UI surfaces, upload gate copy, route wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

describe("PILOT-013 — manual import optional sign-off", () => {
  it("manual import page and client exist with upload gate copy", () => {
    const page = readFileSync(join(ROOT, "web/app/manual-import/page.tsx"), "utf8");
    const client = readFileSync(
      join(ROOT, "web/app/manual-import/manual-import-page-client.tsx"),
      "utf8"
    );
    expect(page).toContain("ManualImportPageClient");
    expect(page).toContain("StudioRouteGuard");
    expect(client).toContain("upload_enabled");
    expect(client).toContain("Link this bin to a real Patreon or SubscribeStar tier row");
    expect(client).toContain("Relay needs R2 configured");
  });

  it("server exposes manual-import setup, staging, and commit routes", () => {
    const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    expect(server).toMatch(/app\.get\("\/api\/v1\/relay\/manual-import\/setup"/);
    expect(server).toMatch(/app\.post\("\/api\/v1\/relay\/manual-import\/setup"/);
    expect(server).toMatch(/app\.get\("\/api\/v1\/relay\/manual-import\/staging"/);
    expect(server).toMatch(/app\.post\("\/api\/v1\/relay\/manual-import\/commit-to-library"/);
    expect(server).toContain("getManualImportSetup");
    expect(server).toContain("upsertManualTierBins");
  });

  it("catalog uses Tier table rows and upload_enabled gate semantics", () => {
    const catalog = readFileSync(join(ROOT, "src/relay/manual-import-catalog.ts"), "utf8");
    expect(catalog).toContain("upload_enabled");
    expect(catalog).toContain("manualUploadAccessRelayTierId");
    expect(catalog).toContain("synced_tiers");
    expect(catalog).toContain("manual_bins");
  });

  it("onboarding import modal links to manual-import", () => {
    const steps = readFileSync(join(ROOT, "web/app/components/onboarding/step-panels.tsx"), "utf8");
    expect(steps).toContain('href="/manual-import"');
  });
});
