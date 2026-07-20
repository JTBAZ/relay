/**
 * Flip the Posting Assistant (Premium) feature flag for a creator.
 * Requires: `npm run build` first; DATABASE_URL in repo root `.env`.
 *
 * Usage:
 *   node scripts/set-creator-posting-assistant.mjs <creator_id> on
 *   node scripts/set-creator-posting-assistant.mjs <creator_id> off
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { setCreatorPostingAssistantEnabled, getCreatorFeatureFlags } = await import(
  "../dist/src/creator/creator-feature-flags-service.js"
);

const [creatorId, rawState] = process.argv.slice(2);
if (!creatorId || !rawState) {
  // eslint-disable-next-line no-console -- CLI usage
  console.error("Usage: node scripts/set-creator-posting-assistant.mjs <creator_id> <on|off>");
  process.exit(1);
}

const enabled = rawState.trim().toLowerCase() === "on";
if (!enabled && rawState.trim().toLowerCase() !== "off") {
  // eslint-disable-next-line no-console -- CLI usage
  console.error(`Expected "on" or "off", got "${rawState}".`);
  process.exit(1);
}

const flags = await setCreatorPostingAssistantEnabled(prisma, creatorId, enabled);
// eslint-disable-next-line no-console -- CLI output
console.log(
  `set-creator-posting-assistant: creator_id=${flags.creator_id} posting_assistant_enabled=${flags.posting_assistant_enabled}`
);

const check = await getCreatorFeatureFlags(prisma, creatorId);
// eslint-disable-next-line no-console -- CLI output
console.log(`verified: ${JSON.stringify(check)}`);

await prisma.$disconnect();
