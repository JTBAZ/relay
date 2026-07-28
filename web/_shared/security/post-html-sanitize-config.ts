/**
 * @fileoverview Shared DOMPurify allowlist for post description HTML.
 * @description [R-SEC-02 — security-review 2026-06] Patreon/creator descriptions may contain HTML for
 *   formatting. Keep this list tight: formatting + links + images only. No scripts, events, or iframes.
 *   Keep in sync with `web/lib/sanitize-post-html.ts`.
 * @see docs/security-review-2026-06.md
 */

/** @description Subset of DOMPurify config used by Relay post-description sanitizers. */
export type PostHtmlSanitizeConfig = {
  ALLOWED_TAGS: string[];
  ALLOWED_ATTR: string[];
  ALLOW_DATA_ATTR: boolean;
  ALLOW_UNKNOWN_PROTOCOLS: boolean;
};

export const POST_HTML_SANITIZE_CONFIG: PostHtmlSanitizeConfig = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "ins",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "pre",
    "code",
    "a",
    "span",
    "div",
    "hr",
    "img"
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "src", "alt", "title", "width", "height"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false
};
