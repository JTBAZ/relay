/**
 * Dev simulation: subscribe → snip → unsubscribe → locked collection entry.
 *
 * Prerequisites:
 *   npm run seed:pilot-ux
 *   npm run stage:pilot-collect-assets   (optional; setup copies storage keys if R2 missing)
 *
 * Workflow:
 *   1. npm run pilot:unsub-sim:setup     — active sub + collection snip (idempotent)
 *   2. Sign in as Dev Riley, confirm snip visible in collection
 *   3. npm run pilot:unsub               — lapse Quinn entitlement only
 *   4. Refresh collection → locked media
 *   5. npm run pilot:resub               — restore Quinn entitlement
 *
 * Commands: setup | unsub | resub | status
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const API = process.env.RELAY_API_URL?.trim() || "http://127.0.0.1:8787";
const DEV_PASSWORD = process.env.RELAY_PILOT_UX_DEV_PASSWORD?.trim() || "pilot-ux-dev-only";

const CREATOR_ID = "rcx_pilot_dev_quinn";
const POST_ID = "pilot_post_quinn_unsub_lab";
const MEDIA_ID = "pilot_media_quinn_unsub_lab";
const TIER_ID = "patreon_tier_quinn_supporter";
const COLLECTION_TITLE = "Unsub lab";
const RILEY_EMAIL = "patron_dev_riley@pilot.relay.test";
const STALE_AFTER = new Date("2099-01-01T00:00:00.000Z");

const { prisma } = await import("../dist/src/lib/db.js");
const { EntitlementSource } = await import("@prisma/client");
const { upsertPatronEntitlementSnapshot } = await import(
  "../dist/src/identity/patron-entitlement-snapshot.js"
);

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`${path}: ${message}`);
  }
  return json?.data;
}

async function login(email) {
  const data = await api("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: DEV_PASSWORD })
  });
  return data.token;
}

async function rileyMembershipId() {
  const membership = await prisma.tenantMembership.findFirst({
    where: {
      account: { legacyFileId: "patron_dev_riley" },
      role: "patron"
    },
    select: { id: true }
  });
  if (!membership) {
    throw new Error("Riley patron membership not found. Run npm run seed:pilot-ux first.");
  }
  return membership.id;
}

async function ensureMediaStorageKey() {
  const target = await prisma.mediaAsset.findFirst({
    where: { id: MEDIA_ID, creatorId: CREATOR_ID },
    select: { currentStorageKey: true }
  });
  if (target?.currentStorageKey) {
    return target.currentStorageKey;
  }
  const source = await prisma.mediaAsset.findFirst({
    where: { id: "pilot_media_ava_supporter", creatorId: "rcx_pilot_dev_ava" },
    select: { currentStorageKey: true, currentMimeType: true }
  });
  if (!source?.currentStorageKey) {
    throw new Error(
      "Quinn media has no storage key and Ava supporter fallback is missing. Run npm run stage:pilot-collect-assets."
    );
  }
  await prisma.mediaAsset.updateMany({
    where: { id: MEDIA_ID, creatorId: CREATOR_ID },
    data: {
      currentStorageKey: source.currentStorageKey,
      currentMimeType: source.currentMimeType ?? "image/png",
      processingStatus: "READY",
      upstreamStatus: "active"
    }
  });
  return source.currentStorageKey;
}

async function ensureCollectionSnip(rileyToken) {
  const list = await api(
    `/api/v1/patron/collections?creator_id=${encodeURIComponent(CREATOR_ID)}`,
    { headers: { authorization: `Bearer ${rileyToken}` } }
  );
  let collection = list.collections.find((c) => c.title === COLLECTION_TITLE);
  if (!collection) {
    const created = await api("/api/v1/patron/collections", {
      method: "POST",
      headers: { authorization: `Bearer ${rileyToken}` },
      body: JSON.stringify({
        creator_id: CREATOR_ID,
        title: COLLECTION_TITLE
      })
    });
    collection = created.collection;
  }

  const hasSnip = collection.entries?.some(
    (e) => e.post_id === POST_ID && e.media_id === MEDIA_ID
  );
  if (!hasSnip) {
    await api(
      `/api/v1/patron/collections/${encodeURIComponent(collection.collection_id)}/entries`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${rileyToken}` },
        body: JSON.stringify({
          creator_id: CREATOR_ID,
          post_id: POST_ID,
          media_id: MEDIA_ID
        })
      }
    );
  }

  return collection.collection_id;
}

async function readQuinnSnapshot(membershipId) {
  return prisma.patronEntitlementSnapshot.findUnique({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: membershipId,
        relayCreatorId: CREATOR_ID
      }
    },
    select: { active: true, entitledTierIds: true, asOf: true }
  });
}

async function resubscribe(membershipId) {
  await upsertPatronEntitlementSnapshot(prisma, {
    patronMembershipId: membershipId,
    relayCreatorId: CREATOR_ID,
    entitledTierIds: [TIER_ID],
    source: EntitlementSource.manual_support,
    campaignId: "pilot_patreon_campaign_quinn"
  });
  await prisma.patronEntitlementSnapshot.update({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: membershipId,
        relayCreatorId: CREATOR_ID
      }
    },
    data: { staleAfter: STALE_AFTER }
  });
}

async function unsubscribe(membershipId) {
  await prisma.patronEntitlementSnapshot.update({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: membershipId,
        relayCreatorId: CREATOR_ID
      }
    },
    data: {
      active: false,
      entitledTierIds: [],
      source: EntitlementSource.manual_support,
      asOf: new Date(),
      staleAfter: new Date()
    }
  });
}

async function printStatus(membershipId) {
  const snap = await readQuinnSnapshot(membershipId);
  const rileyToken = await login(RILEY_EMAIL);
  const detail = await api(
    `/api/v1/patron/collections?creator_id=${encodeURIComponent(CREATOR_ID)}`,
    { headers: { authorization: `Bearer ${rileyToken}` } }
  );
  const collection = detail.collections.find((c) => c.title === COLLECTION_TITLE);
  const entry = collection?.entries?.find(
    (e) => e.post_id === POST_ID && e.media_id === MEDIA_ID
  );

  console.log("Quinn entitlement snapshot:");
  if (!snap) {
    console.log("  (missing — run npm run seed:pilot-ux)");
  } else {
    console.log(`  active: ${snap.active}`);
    console.log(`  entitledTierIds: ${JSON.stringify(snap.entitledTierIds)}`);
    console.log(`  asOf: ${snap.asOf.toISOString()}`);
  }
  if (entry) {
    console.log(`Collection snip viewer_entitlement: ${entry.viewer_entitlement?.state ?? "?"}`);
  } else {
    console.log("Collection snip: not found (run setup)");
  }
}

async function setup() {
  const membershipId = await rileyMembershipId();
  await ensureMediaStorageKey();
  await resubscribe(membershipId);
  const rileyToken = await login(RILEY_EMAIL);
  const collectionId = await ensureCollectionSnip(rileyToken);

  console.log("pilot-unsub-simulation: setup ok");
  console.log("");
  console.log("Dev Quinn post (Riley subscribed):");
  console.log(`  /patron/feed/post/${CREATOR_ID}/${POST_ID}?media_id=${MEDIA_ID}`);
  console.log("");
  console.log("Collection:");
  console.log(`  /patron/collections/${collectionId}`);
  console.log("");
  console.log("Next: snip is pre-loaded. To simulate unsubscribe:");
  console.log("  npm run pilot:unsub");
  console.log("Then refresh the collection page — media should lock.");
  console.log("Restore access:");
  console.log("  npm run pilot:resub");
}

async function main() {
  const command = (process.argv[2] ?? "setup").trim().toLowerCase();
  const membershipId = await rileyMembershipId();

  if (command === "setup") {
    await setup();
    return;
  }
  if (command === "unsub") {
    await unsubscribe(membershipId);
    console.log("pilot-unsub-simulation: unsub ok");
    console.log(`Lapsed entitlement for ${CREATOR_ID} only (Ava/Milo unchanged).`);
    console.log("Refresh Riley's Unsub lab collection to see locked media.");
    await printStatus(membershipId);
    return;
  }
  if (command === "resub") {
    await resubscribe(membershipId);
    console.log("pilot-unsub-simulation: resub ok");
    console.log("Restored Quinn Supporter entitlement for Riley.");
    await printStatus(membershipId);
    return;
  }
  if (command === "status") {
    await printStatus(membershipId);
    return;
  }

  throw new Error(`Unknown command "${command}". Use: setup | unsub | resub | status`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
