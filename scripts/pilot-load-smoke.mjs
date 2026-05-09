#!/usr/bin/env node
/**
 * P9-test-004 — Optional pilot load smoke: steady light traffic against the Relay API.
 *
 * Prerequisites: API listening (e.g. `npm run start` after `npm run build`).
 *
 * Env:
 *   RELAY_LOAD_SMOKE_BASE_URL   default http://127.0.0.1:8787
 *   RELAY_LOAD_SMOKE_DURATION_SEC  default 300 (5 minutes)
 *   RELAY_LOAD_SMOKE_RPS           default 2 (approx requests/sec; one path per tick, round-robin)
 *   RELAY_LOAD_SMOKE_CREATOR_ID    optional — if set, also GET /api/v1/gallery/items?creator_id=…&visitor=1
 *   RELAY_LOAD_SMOKE_BEARER        optional — if set, adds Authorization to the gallery request (and feed if used)
 *   RELAY_LOAD_SMOKE_FEED          default 0 — set to 1 to include GET /api/v1/patron/feed (needs RELAY_LOAD_SMOKE_BEARER)
 *   RELAY_LOAD_SMOKE_STRICT        default 0 — set to 1 to exit 1 if any request is non-OK
 *
 * Usage:
 *   node scripts/pilot-load-smoke.mjs
 *   RELAY_LOAD_SMOKE_DURATION_SEC=30 RELAY_LOAD_SMOKE_RPS=1 node scripts/pilot-load-smoke.mjs
 */
const base = (process.env.RELAY_LOAD_SMOKE_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const durationSec = Math.max(1, Number.parseInt(process.env.RELAY_LOAD_SMOKE_DURATION_SEC ?? "300", 10) || 300);
const targetRps = Math.max(0.1, Number.parseFloat(process.env.RELAY_LOAD_SMOKE_RPS ?? "2") || 2);
const creatorId = (process.env.RELAY_LOAD_SMOKE_CREATOR_ID ?? "").trim();
const bearer = (process.env.RELAY_LOAD_SMOKE_BEARER ?? "").trim();
const includeFeed = process.env.RELAY_LOAD_SMOKE_FEED === "1" || process.env.RELAY_LOAD_SMOKE_FEED === "true";

/** @type {{ path: string; headers?: Record<string, string> }[]} */
const paths = [
  { path: "/api/v1/health/platform" },
  { path: "/api/v1/health/analytics" }
];
if (creatorId) {
  paths.push({
    path: `/api/v1/gallery/items?creator_id=${encodeURIComponent(creatorId)}&visitor=1`,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined
  });
}
if (includeFeed && bearer) {
  paths.push({
    path: "/api/v1/patron/feed",
    headers: { Authorization: `Bearer ${bearer}` }
  });
}

let idx = 0;
let ok = 0;
let fail = 0;
const started = Date.now();
const endAt = started + durationSec * 1000;

function nextUrl() {
  const { path, headers } = paths[idx % paths.length];
  idx += 1;
  return { url: `${base}${path}`, headers };
}

async function oneRequest() {
  const { url, headers } = nextUrl();
  const init = { method: "GET", headers: { Accept: "application/json", ...headers } };
  try {
    const res = await fetch(url, init);
    if (res.ok) {
      ok += 1;
    } else {
      fail += 1;
      console.error(`[load-smoke] ${res.status} ${url}`);
    }
  } catch (e) {
    fail += 1;
    console.error(`[load-smoke] fetch error ${url}:`, e instanceof Error ? e.message : e);
  }
}

const tickMs = Math.max(10, Math.floor(1000 / targetRps));
const strict = process.env.RELAY_LOAD_SMOKE_STRICT === "1" || process.env.RELAY_LOAD_SMOKE_STRICT === "true";

const timer = setInterval(() => {
  if (Date.now() >= endAt) {
    clearInterval(timer);
    const elapsed = (Date.now() - started) / 1000;
    console.log(
      `[load-smoke] done ${elapsed.toFixed(1)}s — ok=${ok} fail=${fail} (base=${base}, paths=${paths.length})`
    );
    if (strict && fail > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
  void oneRequest();
}, tickMs);

console.log(
  `[load-smoke] ${durationSec}s @ ~${targetRps} req/s — ${paths.length} path(s) — base ${base}`
);
