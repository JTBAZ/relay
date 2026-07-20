import { describe, expect, it } from "vitest";
import {
  galleryViewModeNeedsRewrite,
  readGalleryViewMode
} from "../web/lib/gallery-view-mode";

describe("gallery-view-mode", () => {
  it("maps legacy list to normal", () => {
    expect(readGalleryViewMode("list")).toBe("normal");
    expect(galleryViewModeNeedsRewrite("list")).toBe(true);
  });

  it("keeps dense and normal", () => {
    expect(readGalleryViewMode("dense")).toBe("dense");
    expect(readGalleryViewMode("normal")).toBe("normal");
    expect(readGalleryViewMode(null)).toBe("dense");
    expect(galleryViewModeNeedsRewrite("dense")).toBe(false);
  });
});
