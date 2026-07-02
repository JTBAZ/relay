/**
 * @fileoverview Server-side HTML sanitizer for post descriptions.
 * @description [R-SEC-02 — security-review 2026-06] Strip XSS vectors from Patreon/creator HTML before
 *   persistence and on read merge. See docs/security-review-2026-06.md.
 */

import DOMPurify from "isomorphic-dompurify";
import { POST_HTML_SANITIZE_CONFIG } from "./post-html-sanitize-config.js";

/**
 * @description Sanitize untrusted post description HTML to a safe formatting subset.
 * @param html Raw HTML from Patreon ingest or creator edits.
 * @returns Sanitized HTML safe for `dangerouslySetInnerHTML` after defense-in-depth client pass.
 */
export function sanitizePostDescriptionHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, POST_HTML_SANITIZE_CONFIG).trim();
}

/**
 * @description Sanitize and collapse empty results to `undefined` for optional description fields.
 */
export function sanitizeOptionalPostDescriptionHtml(
  html: string | null | undefined
): string | undefined {
  if (html == null) return undefined;
  const cleaned = sanitizePostDescriptionHtml(String(html));
  return cleaned.length > 0 ? cleaned : undefined;
}
