/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import {
  blurPlugExportBlurPx,
  paintBlurPlugCssBlur
} from "../../web/app/components/previewizer/compositions/blur-plug-export-paint";

describe("blur-plug-export-paint", () => {
  it("keeps export gaussian radius equal to studio (18px) and none at 0", () => {
    expect(blurPlugExportBlurPx("gaussian", true)).toBe(18);
    expect(blurPlugExportBlurPx("gaussian", false)).toBe(18);
    expect(blurPlugExportBlurPx("none", true)).toBe(0);
    expect(blurPlugExportBlurPx("pixelated", true)).toBe(0);
    expect(blurPlugExportBlurPx("zoom", true)).toBe(9);
  });

  it("paintBlurPlugCssBlur rejects undersized frames without throwing", () => {
    const canvas = document.createElement("canvas");
    const img = new Image();
    Object.defineProperty(img, "naturalWidth", { value: 64 });
    Object.defineProperty(img, "naturalHeight", { value: 64 });
    expect(
      paintBlurPlugCssBlur({
        canvas,
        img,
        width: 1,
        height: 1,
        blurPx: 18,
        crop: null,
        focalX: 50,
        focalY: 50
      })
    ).toBe(false);
  });
});
