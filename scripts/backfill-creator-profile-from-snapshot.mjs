/**
 * APD-S4 — Backfill `CreatorProfile` identity columns (display_name, avatar_url,
 * banner_url, username) from the file-backed `CreatorCampaignDisplayStore`
 * captured during Patreon OAuth/sync.
 *
 * Idempotent: only fills NULL columns, never overwrites creator-authored edits.
 *
 * Requires: `npm run build`; repo root `.env` with DATABASE_URL.
 *
 * Usage:
 *   node scripts/backfill-creator-profile-from-snapshot.mjs
 *   node scripts/backfill-creator-profile-from-snapshot.mjs --dry-run
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const dryRun = process.argv.includes("--dry-run");

const { prisma } = await import("../dist/src/lib/db.js");
const { CreatorCampaignDisplayStore } = await import(
  "../dist/src/patreon/creator-campaign-display-store.js"
);
const { promoteSnapshotToProfile } = await import(
  "../dist/src/creator/creator-identity-service.js"
);

const snapshotPath =
  process.env.RELAY_CREATOR_CAMPAIGN_DISPLAY_PATH ??
  join(root, ".relay-data", "creator_campaign_display.json");

const store = new CreatorCampaignDisplayStore(snapshotPath);

const tenants = await prisma.tenant.findMany({
  where: { creators: { some: {} } },
  select: { relayCreatorId: true }
});

let scanned = 0;
let promoted = 0;
let skippedNoSnapshot = 0;
let skippedNoChange = 0;

for (const tenant of tenants) {
  scanned += 1;
  const snap = await store.get(tenant.relayCreatorId);
  if (!snap) {
    skippedNoSnapshot += 1;
    continue;
  }
  if (dryRun) {
    // eslint-disable-next-line no-console -- CLI output
    console.log(
      `[dry-run] would consider relay_creator_id=${tenant.relayCreatorId} snapshot=${JSON.stringify(
        {
          patreon_name: snap.patreon_name,
          image_small_url: snap.image_small_url,
          image_url: snap.image_url
        }
      )}`
    );
    continue;
  }
  const result = await promoteSnapshotToProfile(prisma, store, tenant.relayCreatorId);
  if (result.promoted) {
    promoted += 1;
  } else {
    skippedNoChange += 1;
  }
}

// eslint-disable-next-line no-console -- CLI output
console.log(
  JSON.stringify(
    {
      dryRun,
      snapshotPath,
      scanned,
      promoted,
      skippedNoSnapshot,
      skippedNoChange
    },
    null,
    2
  )
);

await prisma.$disconnect();
