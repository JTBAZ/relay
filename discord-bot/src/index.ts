import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { startBot } from "./bot.js";

/** `dist/` → package root; parent → Relay repo root (shared `.env` with the API). */
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgRoot, "..");
// Root first so shared secrets (`RELAY_DISCORD_*`) apply. discord-bot `.env` second only fills gaps.
// Important: dotenv never overwrites existing keys — if discord-bot `.env` is loaded first, empty lines
// like `RELAY_DISCORD_INGEST_HMAC_SECRET=` block the repo from supplying real values.
dotenv.config({ path: resolve(repoRoot, ".env") });
dotenv.config({ path: resolve(pkgRoot, ".env") });

const config = loadConfig();
await startBot(config);
