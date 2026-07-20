import { describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { offerTrackedLinkQrDataUrl } from "./offer-tracked-link-qr";

describe("offerTrackedLinkQrDataUrl", () => {
  it("passes the Relay tracked URL into the QR encoder (never Patreon)", async () => {
    const tracked = "http://127.0.0.1:8787/go/abcTEST";
    const toStringSpy = vi.spyOn(QRCode, "toString");
    const toDataUrlSpy = vi.spyOn(QRCode, "toDataURL");

    const png = await offerTrackedLinkQrDataUrl(tracked, "png");
    expect(png.startsWith("data:image/png")).toBe(true);
    expect(toDataUrlSpy).toHaveBeenCalledWith(
      tracked,
      expect.objectContaining({ type: "image/png" })
    );

    const svg = await offerTrackedLinkQrDataUrl(tracked, "svg");
    expect(svg.startsWith("data:image/svg+xml")).toBe(true);
    expect(toStringSpy).toHaveBeenCalledWith(
      tracked,
      expect.objectContaining({ type: "svg" })
    );
    expect(tracked).toContain("/go/");
    expect(tracked).not.toContain("patreon.com");

    toStringSpy.mockRestore();
    toDataUrlSpy.mockRestore();
  });
});
