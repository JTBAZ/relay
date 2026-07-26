/**
 * PILOT-012 — permission override guardrails: UI copy, docs, and patron exclusion wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PILOT_ADR004_DOC_PATH,
  PILOT_PERMISSION_HEADLINE,
  PILOT_PERMISSION_SIDEBAR_FILTER_HINT
} from "../web/lib/pilot-permission-copy.js";

const ROOT = join(__dirname, "..");

/** Surfaces that still render the shared permission headline (explanatory copy). */
const HEADLINE_SURFACES: Array<{ path: string; label: string }> = [
  { path: "web/app/components/LibraryPowerPanel.tsx", label: "LibraryPowerPanel" },
  { path: "web/app/components/studio/AudiencePromotionPanel.tsx", label: "Audience & Promotion" },
  { path: "web/app/components/GallerySidebar.tsx", label: "GallerySidebar filters" }
];

describe("PILOT-012 — permission override guardrails", () => {
  it("UX acceptance guardrails doc covers override rules and Gate F", () => {
    const guardrails = readFileSync(join(ROOT, "docs/qa/UX_ACCEPTANCE_GUARDRAILS.md"), "utf8");
    expect(guardrails).toContain("PILOT-012");
    expect(guardrails).toContain("Hidden excludes patrons");
    expect(guardrails).toContain("Hidden excludes upsell");
    expect(guardrails).toContain("PUX-006");
    expect(guardrails).toContain(PILOT_PERMISSION_HEADLINE);
  });

  it("creator Library surfaces render shared permission headline", () => {
    for (const { path, label } of HEADLINE_SURFACES) {
      const src = readFileSync(join(ROOT, path), "utf8");
      expect(src, `${label} should import shared copy`).toMatch(/pilot-permission-copy/);
      expect(src, `${label} should render headline`).toMatch(/\{PILOT_PERMISSION_HEADLINE\}/);
    }
  });

  it("BulkActionBar keeps Hidden / Adult separate from tier access reference", () => {
    const bar = readFileSync(join(ROOT, "web/app/components/BulkActionBar.tsx"), "utf8");
    expect(bar).toMatch(/data-visibility-switchboard/);
    expect(bar).toMatch(/label="Hidden"/);
    expect(bar).toMatch(/Tier access/);
    expect(bar).not.toContain("PILOT_PERMISSION_HEADLINE");
  });

  it("GallerySidebar distinguishes library filters from patron hide actions", () => {
    const sidebar = readFileSync(join(ROOT, "web/app/components/GallerySidebar.tsx"), "utf8");
    expect(sidebar).toContain("PILOT_PERMISSION_SIDEBAR_FILTER_HINT");
    expect(sidebar).toMatch(/\{PILOT_PERMISSION_SIDEBAR_FILTER_HINT\}/);
    expect(sidebar).toContain("Library filters");
    expect(PILOT_PERMISSION_SIDEBAR_FILTER_HINT).toMatch(/Relay visibility/);
  });

  it("ADR 004 unlocks PILOT-012 and documents hidden-before-tier order", () => {
    const adr = readFileSync(join(ROOT, PILOT_ADR004_DOC_PATH), "utf8");
    expect(adr).toContain("PILOT-012");
    expect(adr).toMatch(/hidden-post-ids\.ts/);
    expect(adr).toMatch(/assemblePatronFeed/);
  });

  it("visibility API route does not accept tier mutation fields", () => {
    const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    const routeStart = server.indexOf('app.post("/api/v1/gallery/visibility"');
    expect(routeStart).toBeGreaterThan(-1);
    const routeEnd = server.indexOf("});", routeStart + 4000);
    const routeBlock = server.slice(routeStart, routeEnd > routeStart ? routeEnd : routeStart + 6000);
    expect(routeBlock).toMatch(/galleryOverridesStore\.setVisibility/);
    expect(routeBlock).not.toMatch(/tier_ids|tierIds|audience-access/);
  });
});
