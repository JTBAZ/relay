/**
 * Upload Collect-test PNG fixtures to R2 for pilot UX dev creator posts.
 *
 * Usage (after build + seed):
 *   npm run build
 *   npm run seed:pilot-ux
 *   npm run stage:pilot-collect-assets
 *
 * Requires DATABASE_URL and R2_* env (see .env.example).
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const FIXTURE_DIR = join(root, "tests", "fixtures", "pilot-collect-assets");

/** Maps test PNG → pilot media row (permission tier noted for manual QA). */
const STAGING = [
  {
    file: "test-1.png",
    creatorId: "rcx_pilot_dev_ava",
    mediaId: "pilot_media_ava_intro",
    label: "Test 1 — public (Ava)"
  },
  {
    file: "test-2.png",
    creatorId: "rcx_pilot_dev_ava",
    mediaId: "pilot_media_ava_supporter",
    label: "Test 2 — Supporter (Riley entitled)"
  },
  {
    file: "test-3.png",
    creatorId: "rcx_pilot_dev_ava",
    mediaId: "pilot_media_ava_studio",
    label: "Test 3 — Studio (Riley locked)"
  },
  {
    file: "test-4.png",
    creatorId: "rcx_pilot_dev_milo",
    mediaId: "pilot_media_milo_video",
    label: "Test 4 — Supporter (Riley locked)"
  },
  {
    file: "test-5.png",
    creatorId: "rcx_pilot_dev_milo",
    mediaId: "pilot_media_milo_backstage",
    label: "Test 5 — Backstage (Riley entitled)"
  },
  {
    file: "test-2.png",
    creatorId: "rcx_pilot_dev_quinn",
    mediaId: "pilot_media_quinn_unsub_lab",
    label: "Unsub lab — Supporter (Riley entitled until pilot:unsub)"
  }
];

function pilotStorageKey(creatorId, mediaId) {
  return `pilot-ux/${creatorId}/${mediaId}/asset`;
}

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("DATABASE_URL is required.");
}

const { getR2ClientConfigFromEnv } = await import("../dist/src/storage/r2-config.js");
const { putR2ObjectBuffer } = await import("../dist/src/storage/relay-upload-r2.js");
const { prisma } = await import("../dist/src/lib/db.js");

const r2 = getR2ClientConfigFromEnv();
if (!r2) {
  throw new Error("R2 is not configured. Set R2_* vars in .env before staging collect assets.");
}

const results = [];

for (const row of STAGING) {
  const path = join(FIXTURE_DIR, row.file);
  const buffer = readFileSync(path);
  const key = pilotStorageKey(row.creatorId, row.mediaId);
  await putR2ObjectBuffer(r2, key, buffer, "image/png");

  const updated = await prisma.mediaAsset.updateMany({
    where: { id: row.mediaId, creatorId: row.creatorId },
    data: {
      currentMimeType: "image/png",
      currentStorageKey: key,
      processingStatus: "READY",
      upstreamStatus: "active"
    }
  });
  if (updated.count === 0) {
    throw new Error(
      `Media row not found for ${row.mediaId} (${row.creatorId}). Run npm run seed:pilot-ux first.`
    );
  }
  results.push({ label: row.label, key, bytes: buffer.byteLength });
}

// eslint-disable-next-line no-console -- CLI output
console.log(
  "stage-pilot-collect-test-assets: ok\n" +
    results.map((r) => `  ${r.label}\n    r2://${r.key} (${r.bytes} bytes)`).join("\n") +
    "\n\nManual QA as Dev Riley (/login/pilot-ux):\n" +
    "  Dev Ava gallery → Tests 1–3 (Test 3 locked in library after snip)\n" +
    "  Dev Milo gallery → Tests 4–5 (Test 4 locked after snip)\n" +
    "  Dev Quinn → Unsub lab post (npm run pilot:unsub-sim:setup)\n" +
    "  Snip from visitor gallery or patron feed, then check /patron/library"
);

await prisma.$disconnect();
