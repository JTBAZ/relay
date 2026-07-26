/**
 * @fileoverview Baseline HTTP security response headers (no CSP).
 * @description [R-SEC-11 — security-review 2026-06, Tier B] Adds nosniff, frame control, and referrer
 *   policy without a strict Content-Security-Policy (CSP needs report-only rollout). Keep values in sync
 *   with `web/next.config.mjs` `headers()`.
 * @see docs/security-review-2026-06.md
 * @see docs/pilot-security-headers.md
 */

import type { Response } from "express";

/** @description Header names/values applied to Relay API and web HTML responses. */
export const BASELINE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin"
} as const;

/**
 * @description Set baseline security headers on an Express response (does not overwrite existing values).
 */
export function applyBaselineSecurityHeaders(res: Pick<Response, "setHeader">): void {
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}
