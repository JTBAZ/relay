import { describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import {
  buildBlueskyProfileUrl,
  buildPatreonDisplayText,
  buildPatreonHomepageUrl,
  normalizeExternalHttpsUrl,
  previewizerDestinationQrPngDataUrl
} from "./previewizer-destination-qr";
import {
  assemblePreviewizerLinkDestinations,
  compositionSupportsDestinationQr,
  defaultPreviewizerDestinationId,
  destinationDisplayPatch
} from "./previewizer-link-destinations";

describe("normalizeExternalHttpsUrl", () => {
  it("adds https and normalizes host paths", () => {
    expect(normalizeExternalHttpsUrl("patreon.com/devava")).toBe("https://patreon.com/devava");
    expect(normalizeExternalHttpsUrl("https://www.patreon.com/devava/")).toBe(
      "https://www.patreon.com/devava"
    );
  });

  it("rejects empty or invalid values", () => {
    expect(normalizeExternalHttpsUrl("")).toBeNull();
    expect(normalizeExternalHttpsUrl("not a url")).toBeNull();
  });
});

describe("Patreon / Bluesky builders", () => {
  it("matches Library homepage construction", () => {
    expect(buildPatreonHomepageUrl("DevAva")).toBe("https://www.patreon.com/DevAva");
    expect(buildPatreonDisplayText("devava")).toBe("patreon.com/devava");
    expect(buildBlueskyProfileUrl("@alice.bsky.social")).toBe(
      "https://bsky.app/profile/alice.bsky.social"
    );
  });
});

describe("previewizerDestinationQrPngDataUrl", () => {
  it("encodes an HTTPS destination as PNG", async () => {
    const href = "https://www.patreon.com/devava";
    const spy = vi.spyOn(QRCode, "toDataURL");
    const png = await previewizerDestinationQrPngDataUrl(href);
    expect(png.startsWith("data:image/png")).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      href,
      expect.objectContaining({ type: "image/png" })
    );
    spy.mockRestore();
  });
});

describe("assemblePreviewizerLinkDestinations", () => {
  it("marks Patreon available when vanity is present and stubs others", () => {
    const rows = assemblePreviewizerLinkDestinations({
      patreonName: "devava",
      blueskyHandle: null
    });
    expect(defaultPreviewizerDestinationId(rows)).toBe("patreon");
    const patreon = rows.find((r) => r.id === "patreon");
    expect(patreon?.available).toBe(true);
    expect(patreon?.href).toBe("https://www.patreon.com/devava");
    expect(rows.find((r) => r.id === "x")?.available).toBe(false);
    expect(rows.find((r) => r.id === "custom")?.available).toBe(true);
  });

  it("includes Bluesky when credential handle exists", () => {
    const rows = assemblePreviewizerLinkDestinations({
      blueskyHandle: "artist.bsky.social"
    });
    const bluesky = rows.find((r) => r.id === "bluesky");
    expect(bluesky?.available).toBe(true);
    expect(bluesky?.href).toContain("bsky.app/profile/artist.bsky.social");
  });
});

describe("destinationDisplayPatch", () => {
  it("maps blur_plug to handle and URL comps to platformUrl", () => {
    expect(destinationDisplayPatch("blur_plug", "patreon.com/x")).toEqual({
      handle: "patreon.com/x"
    });
    expect(destinationDisplayPatch("mystery_crop", "patreon.com/x")).toEqual({
      platformUrl: "patreon.com/x"
    });
    expect(destinationDisplayPatch("frosted_glass_card", "patreon.com/x")).toBeNull();
  });

  it("supports destination QR on URL compositions only", () => {
    expect(compositionSupportsDestinationQr("collage_windows")).toBe(true);
    expect(compositionSupportsDestinationQr("bottom_blur_paywall")).toBe(false);
  });
});
