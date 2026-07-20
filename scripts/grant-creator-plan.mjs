/**
 * Grant a CreatorPlan entitlement via the ops HTTP route (MB-4).
 * Requires a running API (`npm run dev:stack` or `npm start`) and
 * `RELAY_OPS_FEATURE_FLAG_SECRET` in repo root `.env`.
 *
 * Usage:
 *   node scripts/grant-creator-plan.mjs <creator_id> <studio_core|autopost|growth_engine> [expires_at_iso]
 *
 * Example:
 *   node scripts/grant-creator-plan.mjs rcx_pilot_dev_ava autopost
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const PLANS = new Set(["studio_core", "autopost", "growth_engine"]);

const [creatorId, planRaw, expiresAt] = process.argv.slice(2);
if (!creatorId || !planRaw) {
  // eslint-disable-next-line no-console -- CLI usage
  console.error(
    "Usage: node scripts/grant-creator-plan.mjs <creator_id> <studio_core|autopost|growth_engine> [expires_at_iso]"
  );
  process.exit(1);
}

const plan = planRaw.trim();
if (!PLANS.has(plan)) {
  // eslint-disable-next-line no-console -- CLI usage
  console.error(`Invalid plan "${plan}". Expected: studio_core | autopost | growth_engine`);
  process.exit(1);
}

const secret = process.env.RELAY_OPS_FEATURE_FLAG_SECRET?.trim();
if (!secret) {
  // eslint-disable-next-line no-console -- CLI usage
  console.error("RELAY_OPS_FEATURE_FLAG_SECRET is not set in .env");
  process.exit(1);
}

const base = (
  process.env.RELAY_API_BASE ||
  process.env.NEXT_PUBLIC_RELAY_API_URL ||
  "http://127.0.0.1:8787"
).replace(/\/$/, "");

const body = {
  creator_id: creatorId.trim(),
  plan,
  ...(expiresAt ? { expires_at: expiresAt.trim() } : {})
};

const res = await fetch(`${base}/api/v1/ops/creator-plan-grant`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Relay-Ops-Feature-Flag-Secret": secret
  },
  body: JSON.stringify(body)
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  // eslint-disable-next-line no-console -- CLI output
  console.error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  process.exit(1);
}

if (!res.ok) {
  // eslint-disable-next-line no-console -- CLI output
  console.error(`HTTP ${res.status}:`, json);
  process.exit(1);
}

// eslint-disable-next-line no-console -- CLI output
console.log("grant-creator-plan:", JSON.stringify(json.data?.entitlement ?? json, null, 2));
