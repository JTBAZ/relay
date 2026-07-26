/**
 * @fileoverview URL slug helper for clone post paths combining title fragments and post ids.
 */

/**
 * @description Produces a stable, filesystem-friendly slug; falls back to `postId` when title sanitizes empty.
 * @param title Raw post title.
 * @param postId Stable upstream post identifier suffix.
 * @returns Slug string safe for URLs.
 */
export function slugify(title: string, postId: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base ? `${base}-${postId}` : postId;
}
