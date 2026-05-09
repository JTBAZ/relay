/**
 * @fileoverview Grid/library WebP thumbnail generation with animated GIF detection via Sharp.
 * Downscale export image bytes for library/grid tiles (`/thumb` route).
 * No blur — distinct from visitor teaser `buildVisitorPreviewImage`.
 *
 * Still images emit **static WebP**. **Multi-frame** inputs (GIF magic bytes, `image/gif`,
 * or Sharp `pages` > 1 for gif/webp) use the animated pipeline → **animated WebP** so tiles keep
 * motion even when Patreon or clients mis-label MIME types.
 */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

/** Cap total decoded pixels Sharp will accept before resize (helps bound memory on odd GIFs). */
const SHARP_SAFE_INPUT_PIXELS = 268_402_689;

/**
 * @description Max edge length (px) for `fit: inside` grid thumbnails.
 */
export const GRID_THUMB_MAX_EDGE = 320;

/**
 * Stable fragment for ETag / cache busting when thumb parameters change.
 * Bumped when thumb logic changes (GIF / multi-frame MIME sniff).
 */
export const GRID_THUMB_ETAG_TOKEN = "thumb320w-animdetect";

/** GIF89a / GIF87a */
function bufferLooksGif(input: Buffer): boolean {
  return (
    input.length >= 6 && input[0] === 0x47 && input[1] === 0x49 && input[2] === 0x46 && input[3] === 0x38
  );
}

/**
 * @description Builds downscaled WebP (animated when input is multi-frame) suitable for grid tiles.
 * @param input Raw image bytes.
 * @param mimeType Declared MIME type for gating.
 * @returns WebP buffer or `null` when unsupported/fails.
 * @async
 */
export async function buildGridThumbnailImage(
  input: Buffer,
  mimeType: string
): Promise<Buffer | null> {
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
    /** Sharp supports `animated` / `loop` at runtime; bundled `.d.ts` can lag. */
    const animatedWebpOut = { quality: 78, effort: 4, animated: true, loop: 0 };
    const resizeStatic = sharp(input).resize(GRID_THUMB_MAX_EDGE, GRID_THUMB_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true
    });

    let metaPages = 1;
    let metaFormat = "";
    try {
      const meta = await sharp(input, {
        animated: true,
        limitInputPixels: SHARP_SAFE_INPUT_PIXELS
      }).metadata();
      metaPages = meta.pages ?? 1;
      metaFormat = (meta.format ?? "").toLowerCase();
    } catch {
      /* fall through — treat as single-frame */
    }

    /** Patreon / uploads often mis-label GIFs (`image/jpeg`, etc.). Also catch animated WebP. */
    const useAnimatedThumbPipeline =
      mt === "image/gif" ||
      bufferLooksGif(input) ||
      (metaPages > 1 && (metaFormat === "gif" || metaFormat === "webp"));

    if (useAnimatedThumbPipeline) {
      try {
        return await sharp(input, {
          animated: true,
          limitInputPixels: SHARP_SAFE_INPUT_PIXELS
        })
          .resize(GRID_THUMB_MAX_EDGE, GRID_THUMB_MAX_EDGE, {
            fit: "inside",
            withoutEnlargement: true
          })
          .webp(animatedWebpOut as import("sharp").WebpOptions)
          .toBuffer();
      } catch {
        /** Corrupt / odd multi-frame inputs → single-frame WebP. */
        return await resizeStatic.webp({ quality: 82, effort: 4 }).toBuffer();
      }
    }

    return await resizeStatic.webp({ quality: 82, effort: 4 }).toBuffer();
  } catch {
    return null;
  }
}
