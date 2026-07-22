/**
 * Relay-grade relative_blob_path containment for EH-011 import/staging.
 * Rejects absolute paths, drive/UNC roots, `.` / `..` segments, and escapes.
 */

import { isAbsolute, relative, resolve } from "node:path";

/**
 * Split a relative blob path into safe segments (POSIX or Windows separators).
 * @throws Error when the path is absolute, empty, or contains traversal segments.
 */
export function pathSegmentsFromRelativeBlob(relativeBlobPath: string): string[] {
  if (typeof relativeBlobPath !== "string" || relativeBlobPath.length === 0) {
    throw new Error("empty relative_blob_path");
  }
  if (relativeBlobPath.includes("\0")) {
    throw new Error("nul in relative_blob_path");
  }
  // Absolute / rooted forms (POSIX, Windows drive, UNC, leading slash/backslash).
  if (
    isAbsolute(relativeBlobPath) ||
    /^[A-Za-z]:[\\/]/.test(relativeBlobPath) ||
    relativeBlobPath.startsWith("/") ||
    relativeBlobPath.startsWith("\\") ||
    relativeBlobPath.startsWith("//") ||
    relativeBlobPath.startsWith("\\\\")
  ) {
    throw new Error("absolute or rooted relative_blob_path");
  }

  const parts = relativeBlobPath.split(/[/\\]+/).filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error("empty relative_blob_path segments");
  }
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error("unsafe relative_blob_path segment");
  }
  // Block Windows-illegal filename characters in any segment.
  if (parts.some((p) => /[:*?"<>|]/.test(p))) {
    throw new Error("illegal character in relative_blob_path");
  }
  return parts;
}

export function isSafeRelativeBlobPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    pathSegmentsFromRelativeBlob(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve `relativeBlobPath` under `exportCreatorRoot` with containment checks.
 * @throws Error when the resolved path would escape the creator root.
 */
export function resolveBlobPathUnderRoot(
  exportCreatorRoot: string,
  relativeBlobPath: string
): string {
  const parts = pathSegmentsFromRelativeBlob(relativeBlobPath);
  const root = resolve(exportCreatorRoot);
  const abs = resolve(root, ...parts);
  const rel = relative(root, abs);
  if (
    rel.startsWith("..") ||
    rel === "" ||
    isAbsolute(rel) ||
    rel.split(/[/\\]/).includes("..")
  ) {
    throw new Error("Export path escapes creator directory");
  }
  return abs;
}
