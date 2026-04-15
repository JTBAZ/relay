/**
 * MIG-30 — Verify Cloudflare R2 credentials: PUT then DELETE under relay-smoke/.
 *
 * Requires: npm run build; repo root `.env` with R2_* vars (see `.env.example`).
 *
 * Usage: npm run r2:smoke
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { r2UploadSmokeTest } = await import("../dist/src/storage/r2-smoke-upload.js");

const result = await r2UploadSmokeTest();
// eslint-disable-next-line no-console -- CLI output
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
