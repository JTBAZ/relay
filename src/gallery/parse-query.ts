/**
 * @fileoverview Express query helpers for gallery list routes (comma-separated and repeated params).
 * @see {@link ./query.ts} Gallery filtering and pagination
 * @see src/jsdoc-core-entities.ts Artist/Gallery/SyncStatus mapping notes
 */

import type { Request } from "express";

/**
 * @description Parses `req.query[key]` into a deduped string list (supports comma-separated values and repeated keys).
 * @param req Incoming HTTP request.
 * @param key Query parameter name.
 * @returns Trimmed non-empty strings; empty array when absent or invalid.
 */
export function queryStringList(req: Request, key: string): string[] {
  const raw = req.query[key];
  if (raw === undefined) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is string => typeof x === "string")
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * @description Resolves gallery `limit` from query string with bounds (default 50, max 100).
 * @param req Incoming HTTP request.
 * @returns Page size between 1 and 100 inclusive.
 */
export function parseGalleryLimit(req: Request): number {
  const raw = req.query.limit;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return 50;
  }
  return Math.min(100, n);
}
