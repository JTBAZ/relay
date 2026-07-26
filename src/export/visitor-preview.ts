/**
 * @fileoverview Blurred visitor teaser images (JPEG or animated WebP) from export bytes.
 * Downscale + blur export bytes for public visitor teaser tiles (`/preview` route).
 * Uses `sharp` when available; returns null if processing fails or mime is unsupported.
 *
 * Still images: **JPEG** (blurred). **GIF**: Sharp animated pipeline → **animated WebP** (blurred)
 * so visitor tiles stay in motion instead of JPEG’s first frame only.
 */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

const PREVIEW_MAX_EDGE = 520;
const PREVIEW_BLUR_SIGMA = 6;
const SHARP_SAFE_INPUT_PIXELS = 268_402_689;

/** @description Output envelope for blurred visitor preview responses. */
export type VisitorPreviewResult = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/webp";
};

/**
 * @description Produces blurred still JPEG or animated WebP depending on GIF detection.
 * @param input Raw image bytes.
 * @param mimeType Declared MIME for pipeline selection.
 * @returns Bytes + content-type or `null`.
 * @async
 */
export async function buildVisitorPreviewImage(
  input: Buffer,
  mimeType: string
): Promise<VisitorPreviewResult | null> {
  const mt = (mimeType ?? "").toLowerCase();
  if (!mt.startsWith("image/")) {
    return null;
  }
  if (input.length > MAX_INPUT_BYTES) {
    return null;
  }
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const animatedPreviewWebp = { quality: 68, animated: true, loop: 0, effort: 4 };

    if (mt === "image/gif") {
      try {
        const buffer = await sharp(input, {
          animated: true,
          limitInputPixels: SHARP_SAFE_INPUT_PIXELS
        })
          .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
          .blur(PREVIEW_BLUR_SIGMA)
          .webp(animatedPreviewWebp as import("sharp").WebpOptions)
          .toBuffer();
        return { buffer, contentType: "image/webp" };
      } catch {
        const buffer = await sharp(input)
          .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
          .blur(PREVIEW_BLUR_SIGMA)
          .jpeg({ quality: 68, mozjpeg: true })
          .toBuffer();
        return { buffer, contentType: "image/jpeg" };
      }
    }

    const buffer = await sharp(input)
      .resize(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .blur(PREVIEW_BLUR_SIGMA)
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer();
    return { buffer, contentType: "image/jpeg" };
  } catch {
    return null;
  }
}
