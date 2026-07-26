/**
 * Load and runtime-validate site.json (generated-app data boundary).
 * Fail-closed: malformed or unsupported contracts throw actionable field-path errors.
 * Soft-gate prototype — not production authorization.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ContractValidationError,
  parseSiteBundle,
  type SiteBundle
} from "./contracts";

export class SiteLoadError extends Error {
  readonly fieldPath: string;
  readonly code: string;

  constructor(fieldPath: string, message: string, code = "invalid") {
    super(`site contract: ${fieldPath}: ${message}`);
    this.name = "SiteLoadError";
    this.fieldPath = fieldPath;
    this.code = code;
  }
}

/**
 * Validate `data/site.json` against the embedded SiteBundle contract.
 * Does not trust JSON via type assertion.
 */
export function loadSite(): SiteBundle {
  const path = join(process.cwd(), "data", "site.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  } catch {
    throw new SiteLoadError(
      "data/site.json",
      "file missing or unreadable",
      "io"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new SiteLoadError("(root)", "invalid JSON", "parse");
  }

  try {
    return parseSiteBundle(parsed);
  } catch (err) {
    if (err instanceof ContractValidationError) {
      throw new SiteLoadError(err.fieldPath, err.message.replace(/^[^:]+:\s*/, ""), err.code);
    }
    throw err;
  }
}
