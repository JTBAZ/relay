import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildGridThumbnailImage } from "../src/export/grid-thumbnail.js";
import { buildVisitorPreviewImage } from "../src/export/visitor-preview.js";

/** Minimal 1×1 transparent GIF (single frame). */
const TINY_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=",
  "base64"
);

describe("export GIF → animated WebP pipeline", () => {
  it("buildGridThumbnailImage treats GIF bytes as animated even when MIME is wrong", async () => {
    const out = await buildGridThumbnailImage(TINY_GIF, "image/jpeg");
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("webp");
  });
  it("buildVisitorPreviewImage returns image/webp for gif", async () => {
    const result = await buildVisitorPreviewImage(TINY_GIF, "image/gif");
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/webp");
    const meta = await sharp(result!.buffer).metadata();
    expect(meta.format).toBe("webp");
  });
});
