#!/usr/bin/env node
/**
 * CLI entry for Escape Hatch fixture secret/PII scan (EH-010).
 * Exit 1 on any finding; exit 2 if the fixture tree cannot be scanned.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatFixtureScanFindings,
  scanFixtureTree
} from "../src/fixture-scan.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(PACKAGE_ROOT, "fixtures");

try {
  const result = scanFixtureTree(FIXTURE_ROOT);
  const text = formatFixtureScanFindings(result);
  if (result.findings.length > 0) {
    console.error(text);
    process.exit(1);
  }
  console.log(text);
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}
