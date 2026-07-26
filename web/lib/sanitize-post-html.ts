/**
 * @fileoverview Client-side HTML sanitizer for post descriptions (defense in depth).
 * @description [R-SEC-02 — security-review 2026-06] Re-sanitize before `dangerouslySetInnerHTML` even when
 *   the API already sanitizes on write/read. Keep config in sync with `src/security/post-html-sanitize-config.ts`.
 */

import DOMPurify from "dompurify";
import { POST_HTML_SANITIZE_CONFIG } from "../../src/security/post-html-sanitize-config";

/**
 * @description Sanitize post description HTML in the browser before rendering.
 */
export function sanitizePostDescriptionHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, POST_HTML_SANITIZE_CONFIG).trim();
}
