/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MysteryCropOverlay from "../../web/app/components/previewizer/compositions/mystery-crop-overlay";
import BlurPlugOverlay from "../../web/app/components/previewizer/compositions/blur-plug-overlay";
import {
  paintQrStampOnCanvas,
  resolveQrStampPixelSize
} from "../../web/app/components/previewizer/compositions/previewizer-qr-badge";
import { DEFAULT_BLUR_PLUG_QR_STAMP } from "../../web/app/components/previewizer/previewizer-template-compositions";

afterEach(() => {
  cleanup();
});

describe("MysteryCropOverlay QR", () => {
  it("renders destination QR img when qrSrc is set", () => {
    render(
      <MysteryCropOverlay
        platformUrl="patreon.com/devava"
        qrSrc="data:image/png;base64,aaa"
      />
    );
    const badge = screen.getByTestId("previewizer-qr-badge");
    const img = badge.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,aaa");
  });

  it("omits QR badge when qrSrc is missing", () => {
    render(<MysteryCropOverlay platformUrl="patreon.com/devava" />);
    expect(screen.queryByTestId("previewizer-qr-badge")).toBeNull();
  });
});

describe("BlurPlugOverlay QR stamp", () => {
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("renders a free-placed QR stamp when enabled", () => {
    render(
      <BlurPlugOverlay
        imageSrc={tinyPng}
        qrSrc="data:image/png;base64,aaa"
        qrStamp={{ ...DEFAULT_BLUR_PLUG_QR_STAMP, x: 20, y: 30, size: "large" }}
      />
    );
    const stamp = screen.getByTestId("previewizer-qr-stamp");
    expect(stamp.style.left).toBe("20%");
    expect(stamp.style.top).toBe("30%");
    expect(screen.getByTestId("previewizer-qr-badge").querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,aaa"
    );
  });

  it("hides QR stamp when disabled", () => {
    render(
      <BlurPlugOverlay
        imageSrc={tinyPng}
        qrSrc="data:image/png;base64,aaa"
        qrStamp={{ ...DEFAULT_BLUR_PLUG_QR_STAMP, enabled: false }}
      />
    );
    expect(screen.queryByTestId("previewizer-qr-stamp")).toBeNull();
  });

  it("omits DOM QR stamp in exportMode (canvas-baked instead)", () => {
    render(
      <BlurPlugOverlay
        imageSrc={tinyPng}
        exportMode
        qrSrc="data:image/png;base64,aaa"
        qrStamp={{ ...DEFAULT_BLUR_PLUG_QR_STAMP }}
      />
    );
    expect(screen.queryByTestId("previewizer-qr-stamp")).toBeNull();
  });
});

describe("QR stamp export bake helpers", () => {
  it("resolveQrStampPixelSize clamps cqh against frame height", () => {
    expect(resolveQrStampPixelSize("medium", 1350)).toBe(220); // 25% of 1350 = 337.5 → max 220
    expect(resolveQrStampPixelSize("small", 200)).toBe(70); // 16.25% of 200 = 32.5 → min 70
  });

  it("paintQrStampOnCanvas draws into the frame when canvas 2d is available", async () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // happy-dom without canvas native bindings — skip pixel assert
      expect(typeof paintQrStampOnCanvas).toBe("function");
      return;
    }
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 200, 200);
    await paintQrStampOnCanvas(ctx, {
      qrSrc: tinyPng,
      xPct: 50,
      yPct: 50,
      size: "small",
      frameWidth: 200,
      frameHeight: 200
    });
    const pixel = ctx.getImageData(100, 100, 1, 1).data;
    expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(0);
  });
});
