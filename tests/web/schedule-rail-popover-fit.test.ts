import { describe, expect, it } from "vitest";
import { computeScheduleRailPopoverFit } from "../../web/lib/schedule-rail-popover-fit";

describe("computeScheduleRailPopoverFit", () => {
  it("keeps preferred top when the panel fits below the anchor", () => {
    const fit = computeScheduleRailPopoverFit({
      rootTop: 100,
      rootHeight: 800,
      preferredTopInRoot: 120,
      contentHeight: 360,
      viewportHeight: 900
    });
    expect(fit.topPx).toBe(120);
    expect(fit.maxHeightPx).toBe(360);
    expect(fit.needsScroll).toBe(false);
  });

  it("shifts upward when the anchor is near the bottom of the viewport", () => {
    const fit = computeScheduleRailPopoverFit({
      rootTop: 80,
      rootHeight: 900,
      preferredTopInRoot: 700,
      contentHeight: 520,
      viewportHeight: 800,
      pad: 12
    });
    // Bottom of panel must stay above viewport - pad.
    expect(fit.topPx + fit.maxHeightPx).toBeLessThanOrEqual(800 - 12 - 80);
    expect(80 + fit.topPx + fit.maxHeightPx).toBeLessThanOrEqual(800 - 12);
    expect(fit.topPx).toBeLessThan(700);
    expect(fit.needsScroll).toBe(false);
  });

  it("grows to content height and may extend above the rail root", () => {
    const fit = computeScheduleRailPopoverFit({
      rootTop: 200,
      rootHeight: 400,
      preferredTopInRoot: 40,
      contentHeight: 380,
      viewportHeight: 900,
      pad: 12
    });
    // Viewport has room — no scroll, full content height.
    expect(fit.maxHeightPx).toBe(380);
    expect(fit.needsScroll).toBe(false);
    // Panel may sit above root top when preferred would clip below viewport/root.
    expect(200 + fit.topPx).toBeGreaterThanOrEqual(12);
    expect(200 + fit.topPx + fit.maxHeightPx).toBeLessThanOrEqual(900 - 12);
  });

  it("caps max height so tall content can scroll inside the viewport", () => {
    const fit = computeScheduleRailPopoverFit({
      rootTop: 40,
      rootHeight: 1000,
      preferredTopInRoot: 40,
      contentHeight: 900,
      viewportHeight: 700,
      pad: 12
    });
    expect(fit.maxHeightPx).toBeLessThanOrEqual(700 - 24);
    expect(40 + fit.topPx + fit.maxHeightPx).toBeLessThanOrEqual(700 - 12);
    expect(fit.needsScroll).toBe(true);
  });
});
