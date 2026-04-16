#!/usr/bin/env node
/**
 * Headless pipeline parity smoke check (truth matrix).
 * Requires Relay running and RELAY_PIPELINE_PARITY_SECRET set on the server.
 *
 * Exit codes:
 *   0 — isolation + OAuth + webhook routing OK (no severity-0/1 failures)
 *   1 — isolation / campaign routing conflict (S0) or OAuth hard failure (S1)
 *   2 — only freshness/staleness issues (S2+) or missing optional data
 *
 * Usage:
 *   RELAY_PIPELINE_PARITY_SECRET=... node scripts/pipeline-parity-check.mjs --creator=creator_x
 *   RELAY_API_BASE=http://127.0.0.1:8787 (optional)
 */

const base = (process.env.RELAY_API_BASE ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const secret = process.env.RELAY_PIPELINE_PARITY_SECRET?.trim();

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : "";
}

const creatorId = arg("creator").trim();
const campaignId = arg("campaign").trim();

async function getJson(path, headers) {
  const res = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...headers },
    cache: "no-store"
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `${res.status} ${path}`);
  }
  return json;
}

async function main() {
  if (!secret) {
    // eslint-disable-next-line no-console -- CLI
    console.error("Missing RELAY_PIPELINE_PARITY_SECRET");
    process.exit(1);
  }
  if (!creatorId) {
    // eslint-disable-next-line no-console -- CLI
    console.error("Usage: --creator=<relay_creator_id> [--campaign=<numeric_id>]");
    process.exit(1);
  }

  const parityHeaders = { "X-Relay-Pipeline-Parity-Secret": secret };

  const q = new URLSearchParams({ creator_id: creatorId });
  if (campaignId) q.set("campaign_id", campaignId);

  const snapEnvelope = await getJson(`/api/dev/pipeline-parity/snapshot?${q}`, parityHeaders);
  const snap = snapEnvelope.data ?? snapEnvelope;

  const syncQ = new URLSearchParams({ creator_id: creatorId });
  if (campaignId) syncQ.set("campaign_id", campaignId);
  const syncEnvelope = await getJson(`/api/v1/patreon/sync-state?${syncQ}`);
  const syncState = syncEnvelope.data ?? syncEnvelope;

  const isolation = snap.isolation;
  let exit = 0;

  if (isolation?.webhook_ownership && isolation.webhook_ownership.ok === false) {
    // eslint-disable-next-line no-console -- CLI
    console.error(
      "S0 isolation: webhook/campaign ownership conflict",
      isolation.webhook_ownership
    );
    exit = Math.max(exit, 1);
  }

  const oauth = syncState.oauth;
  if (
    oauth?.access_token_expired ||
    oauth?.credential_health_status === "refresh_failed"
  ) {
    // eslint-disable-next-line no-console -- CLI
    console.error("S1 OAuth: token expired or refresh failed", oauth);
    exit = Math.max(exit, 1);
  }

  if (syncState.webhook_registration?.registration_status === "failed") {
    // eslint-disable-next-line no-console -- CLI
    console.error("S1 webhook registration failed", syncState.webhook_registration);
    exit = Math.max(exit, 1);
  }

  const stale =
    syncState.last_post_scrape &&
    !syncState.last_post_scrape.ok &&
    syncState.last_post_scrape.finished_at;
  if (stale && exit === 0) {
    // eslint-disable-next-line no-console -- CLI
    console.warn("S2: last_post_scrape not ok", syncState.last_post_scrape?.error);
    exit = 2;
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        creator_id: creatorId,
        campaign_id: campaignId || null,
        isolation_ok: isolation?.webhook_ownership?.ok ?? null,
        oauth_ok: !oauth?.access_token_expired && oauth?.credential_health_status !== "refresh_failed"
      },
      null,
      2
    )
  );

  process.exit(exit);
}

main().catch((e) => {
  // eslint-disable-next-line no-console -- CLI
  console.error(e);
  process.exit(1);
});
