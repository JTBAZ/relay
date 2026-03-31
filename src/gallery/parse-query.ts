import type { Request } from "express";

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

export function parseGalleryLimit(req: Request): number {
  const raw = req.query.limit;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) {
    return 50;
  }
  return Math.min(100, n);
}
