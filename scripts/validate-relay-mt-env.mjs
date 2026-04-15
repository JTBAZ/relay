#!/usr/bin/env node
/**
 * Validates environment variables for multi-tenant Relay (Supabase Auth + Prisma + Relay API + Next.js).
 *
 * Usage:
 *   npm run validate:mt-env
 *   node scripts/validate-relay-mt-env.mjs --profile=relayapp
 *   node scripts/validate-relay-mt-env.mjs --profile=local
 *   node scripts/validate-relay-mt-env.mjs --api-only
 *   node scripts/validate-relay-mt-env.mjs --web-only
 *   node scripts/validate-relay-mt-env.mjs --probe
 *   node scripts/validate-relay-mt-env.mjs --help
 *
 * Env files (repo root): `.env` = API; `web/.env.local` merged on top for browser-facing checks.
 * Exit 1 if any check fails.
 */

import dotenv from "dotenv";
const { parse } = dotenv;
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {
    profile: "relayapp",
    apiOnly: false,
    webOnly: false,
    probe: false,
    help: false
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--api-only") out.apiOnly = true;
    else if (a === "--web-only") out.webOnly = true;
    else if (a === "--probe") out.probe = true;
    else if (a.startsWith("--profile=")) out.profile = a.slice("--profile=".length).trim() || "relayapp";
  }
  return out;
}

/** Merge env files in order (later overrides). */
function readMergedEnv(paths) {
  let merged = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const parsed = parse(readFileSync(p, "utf8"));
    merged = { ...merged, ...parsed };
  }
  return merged;
}

function getApiEnv() {
  return readMergedEnv([join(repoRoot, ".env")]);
}

/** API base + web/.env.local (same as local dev). */
function getWebMergedEnv() {
  return readMergedEnv([join(repoRoot, ".env"), join(repoRoot, "web", ".env.local")]);
}

function refFromSupabaseProjectUrl(urlStr) {
  if (!urlStr?.trim()) return null;
  try {
    const raw = urlStr.trim().startsWith("http") ? urlStr.trim() : `https://${urlStr.trim()}`;
    const u = new URL(raw);
    const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function resolvedWebSupabase(env) {
  const prod = env.NODE_ENV === "production";
  const url =
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    (prod ? env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL?.trim() : env.NEXT_PUBLIC_SUPABASE_STAGING_URL?.trim());
  const anon =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    (prod
      ? env.NEXT_PUBLIC_SUPABASE_PRODUCTION_ANON_KEY?.trim()
      : env.NEXT_PUBLIC_SUPABASE_STAGING_ANON_KEY?.trim());
  return { url, anon, prod };
}

function pushIssue(issues, msg) {
  issues.push(msg);
}

async function probeRelayApi(apiBase, issues) {
  const base = apiBase.replace(/\/+$/, "");
  try {
    const health = await fetch(`${base}/api/v1/health`, { cache: "no-store" });
    const ht = await health.text();
    if (!ht.trim().startsWith("{")) {
      pushIssue(issues, `[probe] GET ${base}/api/v1/health did not return JSON (status ${health.status}).`);
    }
  } catch (e) {
    pushIssue(issues, `[probe] GET /api/v1/health failed: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  try {
    const sync = await fetch(`${base}/api/v1/auth/supabase/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store"
    });
    const st = await sync.text();
    const jsonOk = st.trim().startsWith("{");
    if (!jsonOk) {
      pushIssue(
        issues,
        `[probe] POST ${base}/api/v1/auth/supabase/sync returned non-JSON (HTTP ${sync.status}) — API image may be missing studio routes.`
      );
    }
  } catch (e) {
    pushIssue(issues, `[probe] POST /auth/supabase/sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function printReferenceTable() {
  console.log(`
=== relayapp.me multi-tenant — where each var lives ===

Coolify (production):
  • Relay API container  → same keys as repo ROOT .env (DATABASE_URL, SUPABASE_*, RELAY_*, PATREON_*)
  • Next.js container    → Coolify injects NEXT_PUBLIC_* (match web/.env.production / host UI)

Local dev:
  • ROOT .env            → Relay API (npm run start from repo root)
  • web/.env.local       → Next dev server (overrides; browser-visible NEXT_PUBLIC_*)

Rule: one Supabase project — API SUPABASE_URL + ANON_KEY must match the project used in
NEXT_PUBLIC_SUPABASE_* on the web app. DATABASE_URL must be that project’s Postgres URI.

--- Relay API (root .env / Coolify API) — required for MT login ---
  DATABASE_URL                      Postgres (pooler from Supabase; Prisma migrations applied)
  SUPABASE_URL                      https://<ref>.supabase.co
  SUPABASE_ANON_KEY                 anon JWT (Settings → API)
  RELAY_DB_STORE_IDENTITY=1       Postgres identity (Account, sessions)
  RELAY_TOKEN_ENCRYPTION_KEY        32-byte secret (base64); required to boot API
  RELAY_PATREON_OAUTH_STATE_SECRET  min 16 chars (signed Patreon OAuth state)
  PATREON_CLIENT_ID / SECRET        Patreon developer app

--- Next.js (web/.env.local or Coolify Next) — browser ---
  NEXT_PUBLIC_RELAY_API_URL         https://api.relayapp.me (prod, no trailing slash) or http://127.0.0.1:8787 (local)
  NEXT_PUBLIC_SUPABASE_URL          same project as API (preferred)
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  (or PRODUCTION_/STAGING_ pairs — see web/lib/supabase-browser.ts)

--- Patreon ---
  Register redirect URIs for https://relayapp.me/patreon/callback (and patron callback if used).
`);
}

function validateApi(env, issues, profile) {
  const db = env.DATABASE_URL?.trim();
  if (!db) pushIssue(issues, "DATABASE_URL is missing (Relay API).");
  else if (!/^postgres(ql)?:\/\//i.test(db)) pushIssue(issues, "DATABASE_URL must be a postgres:// or postgresql:// URI.");

  const su = env.SUPABASE_URL?.trim();
  if (!su) pushIssue(issues, "SUPABASE_URL is missing (API validates Supabase JWTs).");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(su)) {
    pushIssue(issues, "SUPABASE_URL should be https://<ref>.supabase.co");
  }

  const anon = env.SUPABASE_ANON_KEY?.trim();
  if (!anon) pushIssue(issues, "SUPABASE_ANON_KEY is missing.");
  else if (!anon.startsWith("eyJ")) pushIssue(issues, "SUPABASE_ANON_KEY should look like a JWT (starts with eyJ).");

  const idb = env.RELAY_DB_STORE_IDENTITY?.trim().toLowerCase();
  if (idb !== "1" && idb !== "true" && idb !== "yes") {
    pushIssue(issues, "RELAY_DB_STORE_IDENTITY must be 1 (or true) for multi-tenant Postgres identity.");
  }

  const tok = env.RELAY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!tok) pushIssue(issues, "RELAY_TOKEN_ENCRYPTION_KEY is missing.");
  else if (tok.length < 32) pushIssue(issues, "RELAY_TOKEN_ENCRYPTION_KEY looks too short.");

  const oauthSec = env.RELAY_PATREON_OAUTH_STATE_SECRET?.trim();
  if (!oauthSec) pushIssue(issues, "RELAY_PATREON_OAUTH_STATE_SECRET is missing.");
  else if (oauthSec.length < 16) pushIssue(issues, "RELAY_PATREON_OAUTH_STATE_SECRET must be at least 16 characters.");

  if (!env.PATREON_CLIENT_ID?.trim()) pushIssue(issues, "PATREON_CLIENT_ID is missing.");
  if (!env.PATREON_CLIENT_SECRET?.trim()) pushIssue(issues, "PATREON_CLIENT_SECRET is missing.");

  const ref = refFromSupabaseProjectUrl(su || "");
  if (ref && db && !db.toLowerCase().includes(ref)) {
    pushIssue(
      issues,
      `DATABASE_URL should reference the same Supabase project as SUPABASE_URL (expected ref "${ref}" in connection string).`
    );
  }
}

/**
 * @param {Record<string, string | undefined>} env  Merged web env (root .env + web/.env.local)
 * @param {Record<string, string | undefined>} [rootEnvOnly]  Root `.env` only — used to detect local-dev override
 */
function validateWeb(env, issues, profile, rootEnvOnly) {
  const relayApi = env.NEXT_PUBLIC_RELAY_API_URL?.trim().replace(/\/+$/, "");
  const rootRelay = rootEnvOnly?.NEXT_PUBLIC_RELAY_API_URL?.trim().replace(/\/+$/, "");
  const mergedIsLocalLoopback =
    Boolean(relayApi) &&
    (relayApi.includes("127.0.0.1") || relayApi.includes("localhost"));
  /** web/.env.local overrides root: loopback in merge + https api in root = intentional local Next → local API. */
  const localNextOverridesRelayUrl =
    Boolean(rootRelay) &&
    mergedIsLocalLoopback &&
    !rootRelay.includes("127.0.0.1") &&
    !rootRelay.includes("localhost");

  if (!relayApi) pushIssue(issues, "NEXT_PUBLIC_RELAY_API_URL is missing.");
  else if (profile === "relayapp" && mergedIsLocalLoopback && !localNextOverridesRelayUrl) {
    pushIssue(
      issues,
      `NEXT_PUBLIC_RELAY_API_URL is localhost — for relayapp profile set https://api.relayapp.me in root .env, or use --profile=local, or add production URL in root .env and keep localhost only in web/.env.local (local Next override).`
    );
  } else if (profile === "local" && relayApi.startsWith("https://api.relayapp.me")) {
    pushIssue(issues, `Profile "local" but NEXT_PUBLIC_RELAY_API_URL is production — use http://127.0.0.1:8787 for local API.`);
  } else if (profile === "relayapp" && relayApi.startsWith("http://") && !relayApi.includes("127.0.0.1")) {
    pushIssue(issues, "For relayapp profile, NEXT_PUBLIC_RELAY_API_URL should use https in production.");
  }

  const simProd = profile === "relayapp";
  const wenv = { ...env, NODE_ENV: simProd ? "production" : env.NODE_ENV || "development" };
  const { url, anon } = resolvedWebSupabase(wenv);
  if (!url) {
    pushIssue(
      issues,
      "Web Supabase URL missing: set NEXT_PUBLIC_SUPABASE_URL (+ ANON) or PRODUCTION_/STAGING_ pair (see web/lib/supabase-browser.ts)."
    );
  }
  if (!anon) {
    pushIssue(issues, "Web Supabase anon key missing (NEXT_PUBLIC_SUPABASE_ANON_KEY or PRODUCTION_/STAGING_ variant).");
  }
  if (anon && !anon.startsWith("eyJ")) {
    pushIssue(issues, "NEXT_PUBLIC Supabase anon key should look like a JWT (eyJ…).");
  }

  if (profile === "relayapp" && simProd && !env.NEXT_PUBLIC_SUPABASE_URL?.trim() && !env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL?.trim()) {
    pushIssue(
      issues,
      "For production Next builds, set NEXT_PUBLIC_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_PRODUCTION_URL) — STAGING_* alone is ignored when NODE_ENV=production."
    );
  }
}

function validateCrossApiWeb(apiEnv, webEnv, issues) {
  const apiRef = refFromSupabaseProjectUrl(apiEnv.SUPABASE_URL || "");
  const w = { ...webEnv, NODE_ENV: "production" };
  const { url: wUrl } = resolvedWebSupabase(w);
  const webRef = refFromSupabaseProjectUrl(wUrl || "");
  if (apiRef && webRef && apiRef !== webRef) {
    pushIssue(
      issues,
      `Supabase project mismatch: API SUPABASE_URL ref "${apiRef}" vs web NEXT_PUBLIC ref "${webRef}".`
    );
  }
  const apiAnon = apiEnv.SUPABASE_ANON_KEY?.trim();
  const wAnon = resolvedWebSupabase({ ...webEnv, NODE_ENV: "production" }).anon?.trim();
  if (apiAnon && wAnon && apiAnon !== wAnon) {
    pushIssue(issues, "SUPABASE_ANON_KEY (API) and NEXT_PUBLIC Supabase anon key (web) must match.");
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printReferenceTable();
    process.exit(0);
  }

  const apiEnv = opts.webOnly ? {} : getApiEnv();
  const webEnv = opts.apiOnly ? {} : getWebMergedEnv();

  if (!opts.webOnly && !existsSync(join(repoRoot, ".env"))) {
    console.error("Missing .env at repo root — create from .env.example or point Coolify at your secrets.");
    process.exit(1);
  }
  if (!opts.apiOnly && !existsSync(join(repoRoot, "web", ".env.local"))) {
    console.warn("Note: web/.env.local not found — web checks use root .env only.\n");
  }

  const issues = [];

  if (opts.apiOnly) {
    validateApi(apiEnv, issues, opts.profile);
  } else if (opts.webOnly) {
    validateWeb(webEnv, issues, opts.profile);
  } else {
    validateApi(apiEnv, issues, opts.profile);
    validateWeb(webEnv, issues, opts.profile, apiEnv);
    const mergedRelay = webEnv.NEXT_PUBLIC_RELAY_API_URL?.trim() ?? "";
    const rootRelay = apiEnv.NEXT_PUBLIC_RELAY_API_URL?.trim() ?? "";
    if (
      (mergedRelay.includes("127.0.0.1") || mergedRelay.includes("localhost")) &&
      rootRelay &&
      !rootRelay.includes("127.0.0.1") &&
      !rootRelay.includes("localhost")
    ) {
      console.warn(
        "Note: web/.env.local overrides NEXT_PUBLIC_RELAY_API_URL for local Next (merged value is localhost; root .env documents production URL).\n"
      );
    }
    validateCrossApiWeb(apiEnv, webEnv, issues);
  }

  const relayUrl = webEnv.NEXT_PUBLIC_RELAY_API_URL?.trim().replace(/\/+$/, "");
  if (opts.probe) {
    if (!relayUrl) pushIssue(issues, "[probe] NEXT_PUBLIC_RELAY_API_URL not set.");
    else await probeRelayApi(relayUrl, issues);
  }

  if (issues.length > 0) {
    console.error("Relay MT env validation FAILED:\n");
    for (const line of issues) console.error(`  • ${line}`);
    console.error("\nRun: node scripts/validate-relay-mt-env.mjs --help");
    process.exit(1);
  }

  console.log("Relay MT env validation OK.");
  if (opts.probe) console.log("HTTP probe passed (health + sync route returns JSON).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
