/**
 * Downscale + blur export bytes for public visitor teaser tiles (`/preview` route).
 * Uses `sharp` when available; returns null if processing fails or mime is unsupported.
 */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export async function buildVisitorPreviewImage(
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
    return await sharp(input)
      .resize(520, 520, { fit: "inside", withoutEnlargement: true })
      .blur(6)
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}
