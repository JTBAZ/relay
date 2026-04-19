#!/usr/bin/env node
/**
 * EXT-2B / 2V: dev build must allow local Relay + Next for consent testing.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, "..", "dist", "chrome-dev", "manifest.json");

const raw = await readFile(manifestPath, "utf8").catch((e) => {
  console.error("Run npm run build:chrome:dev first.", e.message);
  process.exit(1);
});

const m = JSON.parse(raw);
const hosts = m.host_permissions ?? [];
const external = m.externally_connectable?.matches ?? [];
const needle = "localhost";

const inHosts = hosts.some((h) => typeof h === "string" && h.includes(needle));
const inExternal = external.some((h) => typeof h === "string" && h.includes(needle));

if (!inHosts || !inExternal) {
  console.error(
    "Expected http://localhost:*/* in both host_permissions and externally_connectable.matches.",
    { host_permissions: hosts, externally_connectable: m.externally_connectable }
  );
  process.exit(1);
}

console.log("OK: chrome-dev manifest includes localhost allowances.");
