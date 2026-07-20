/**
 * PILOT-004 — permission model sign-off: UI copy + doc cross-links + server modules cited in ADR 004.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PILOT_ADR004_DOC_PATH,
  PILOT_PERMISSION_BULK_VISIBILITY_HINT,
  PILOT_PERMISSION_HEADLINE
} from "../web/lib/pilot-permission-copy.js";

const ROOT = join(__dirname, "..");

/** Post-G9 surfaces: legacy Inspect/PostBatch shells deleted; A&P + Power + sidebar remain. */
const UI_SURFACES: Array<{ path: string; label: string }> = [
  { path: "web/app/components/BulkActionBar.tsx", label: "bulk visibility panel" },
  { path: "web/app/components/LibraryPowerPanel.tsx", label: "LibraryPowerPanel placement" },
  { path: "web/app/components/studio/AudiencePromotionPanel.tsx", label: "Audience & Promotion" },
  { path: "web/app/components/GallerySidebar.tsx", label: "GallerySidebar filters" }
];

describe("PILOT-004 — permission model sign-off", () => {
  it("exports canonical headline and links ADR 004 in sign-off doc", () => {
    expect(PILOT_PERMISSION_HEADLINE).toBe("Relay visibility ≠ Patreon access");
    const signoff = readFileSync(join(ROOT, "docs/pilot-permission-signoff.md"), "utf8");
    expect(signoff).toContain("PILOT-004");
    expect(signoff).toContain("004-pilot-three-layer-permissions");
    expect(signoff).toContain(PILOT_PERMISSION_HEADLINE);

    const adr = readFileSync(join(ROOT, PILOT_ADR004_DOC_PATH), "utf8");
    expect(adr).toContain("PILOT-004");
    expect(adr).toMatch(/evaluatePostPermission/);
    expect(adr).toMatch(/assemblePatronFeed/);
  });

  it("creator Library surfaces import pilot-permission-copy and render headline constant", () => {
    for (const { path, label } of UI_SURFACES) {
      const src = readFileSync(join(ROOT, path), "utf8");
      expect(src, `${label} should import shared copy`).toMatch(/pilot-permission-copy/);
      expect(src, `${label} should render headline`).toMatch(/\{PILOT_PERMISSION_HEADLINE\}/);
    }
  });

  it("BulkActionBar visibility panel uses bulk hint from shared copy", () => {
    const bar = readFileSync(join(ROOT, "web/app/components/BulkActionBar.tsx"), "utf8");
    expect(bar).toContain("PILOT_PERMISSION_BULK_VISIBILITY_HINT");
    expect(bar).toMatch(/\{PILOT_PERMISSION_BULK_VISIBILITY_HINT\}/);
  });

  it("server gating modules documented in ADR remain wired", () => {
    const postPerm = readFileSync(join(ROOT, "src/gallery/post-permission.ts"), "utf8");
    expect(postPerm).toMatch(/004-pilot-three-layer-permissions/);
    expect(postPerm).toMatch(/relayPostVisibility === "hidden"/);

    const feed = readFileSync(join(ROOT, "src/patron/assemble-patron-feed.ts"), "utf8");
    expect(feed).toMatch(/loadHiddenPostIdsByCreator/);

    const hidden = readFileSync(join(ROOT, "src/gallery/hidden-post-ids.ts"), "utf8");
    expect(hidden).toMatch(/loadHiddenPostIdsByCreator/);
    expect(hidden).toMatch(/isPostHiddenFromPatronSurfaces/);
  });
});
