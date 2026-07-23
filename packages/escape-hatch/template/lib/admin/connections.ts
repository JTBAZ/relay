/**
 * Connections + site-health rollups (EH-062).
 * Honest next-safe-action copy — never claims productionSafe.
 */

import { activeCrosspostTokenCount } from "../relay-crosspost/tokens";
import {
  assessVercelDeployReadiness,
  type DeployReadiness
} from "../deploy/vercel-path";
import type { AdapterHealthRow } from "./types";

export type ConnectionCard = {
  id: string;
  title: string;
  implementation: string;
  ok: boolean;
  detail: string;
  ownership: string;
  env_hints: string[];
  what_breaks: string;
  next_action: string;
  deep_link: string | null;
};

export type HealthItem = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
  next_action: string;
};

const NEXT_ACTIONS: Record<string, string> = {
  auth: "Set ESCAPE_HATCH_IDENTITY_PROVIDER=supabase|portable with real non-placeholder env (EH-030/031).",
  database:
    "Configure DATABASE_URL (portable) or Supabase Postgres URL; apply kit SQL migrations.",
  storage:
    "For private_r2 set R2_* signing env; otherwise keep ESCAPE_HATCH_MEDIA_MODE=local_private for preview.",
  billing:
    "Set ESCAPE_HATCH_BILLING_PROVIDER=stripe|nowpayments with secrets, or leave stub and use Patreon/manual grants.",
  patreon:
    "Open /admin/patreon — OAuth choice plus EH-063 optional read-only post sync (conflicts never overwrite local edits).",
  email:
    "Transactional email is a stub until EH-072 — do not treat as delivery-ready.",
  deployment:
    "Open /admin/deploy — EH-070 fixture Vercel preview→promote→rollback rehearsal (not a live Vercel API deploy). Docker remains EH-071."
};

const WHAT_BREAKS: Record<string, string> = {
  auth: "Patron sign-in and staff admin gates fail closed when identity is misconfigured.",
  database: "Memberships, sessions, and entitlement snapshots cannot persist.",
  storage: "Premium media delivery fails closed for private_r2 without credentials.",
  billing: "Independent Checkout stays unavailable; stubs never mint live charges.",
  patreon: "Patreon-derived entitlements stay stale or unavailable.",
  email: "No password-reset / receipt email delivery in this kit.",
  deployment: "No verified production deploy from adapter health alone."
};

const OWNERS: Record<string, string> = {
  auth: "Creator-owned (Supabase or portable Postgres)",
  database: "Creator-owned database",
  storage: "Creator-owned R2 / local private media",
  billing: "Creator-owned Stripe or alternate provider",
  patreon: "Creator OAuth or Relay-managed (explicit choice)",
  email: "Not wired (kit stub)",
  deployment: "Creator host (Vercel Path A / Docker Path B)"
};

const DEEP_LINKS: Record<string, string | null> = {
  auth: "/admin/health",
  database: "/admin/health",
  storage: "/admin/media",
  billing: "/admin/billing/policy",
  patreon: "/admin/patreon",
  email: "/admin/health",
  deployment: "/admin/deploy"
};

const ENV_HINTS: Record<string, string[]> = {
  auth: ["ESCAPE_HATCH_IDENTITY_PROVIDER", "NEXT_PUBLIC_SUPABASE_URL"],
  database: ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  storage: ["R2_ENDPOINT", "R2_BUCKET", "ESCAPE_HATCH_MEDIA_MODE"],
  billing: ["ESCAPE_HATCH_BILLING_PROVIDER", "STRIPE_SECRET_KEY"],
  patreon: ["ESCAPE_HATCH_PATREON_MODE", "PATREON_CLIENT_ID"],
  email: [],
  deployment: ["NEXT_PUBLIC_SITE_URL", "vercel.json"]
};

export function buildConnectionCards(
  adapters: readonly AdapterHealthRow[],
  opts?: { siteId?: string; kitDir?: string }
): ConnectionCard[] {
  const cards = adapters.map((row) => {
    const id = row.id;
    return {
      id,
      title: id.charAt(0).toUpperCase() + id.slice(1),
      implementation: row.implementation,
      ok: row.ok,
      detail: row.detail,
      ownership: OWNERS[id] ?? "Creator-owned",
      env_hints: ENV_HINTS[id] ?? [],
      what_breaks: WHAT_BREAKS[id] ?? "Related visitor or admin flows degrade.",
      next_action:
        row.ok
          ? "Configured for preview only — productionSafe remains false; re-check after env rotation."
          : NEXT_ACTIONS[id] ??
            "Review OPERATIONS.md and adapter detail; do not claim production readiness.",
      deep_link: DEEP_LINKS[id] ?? null
    };
  });

  const siteId = opts?.siteId;
  if (siteId) {
    const active = activeCrosspostTokenCount(siteId, opts?.kitDir);
    cards.push({
      id: "crosspost",
      title: "Relay Crosspost",
      implementation: "optional_scoped_bearer",
      ok: true,
      detail:
        active > 0
          ? `${active} active scoped token(s) — inbound drafts/publish only; never admin.`
          : "Optional — no active tokens. Mint on /admin/crosspost when Relay Crosspost is desired.",
      ownership: "Creator-owned site API (revocable)",
      env_hints: ["ESCAPE_HATCH_CROSSPOST_TOKEN_PEPPER"],
      what_breaks:
        "Revoking Crosspost tokens stops inbound Relay posts only — native CMS publishing continues.",
      next_action:
        active > 0
          ? "Rotate/revoke unused tokens on /admin/crosspost; productionSafe remains false."
          : "Open /admin/crosspost to mint draft/publish scopes if needed — not required for daily ops.",
      deep_link: "/admin/crosspost"
    });
  }

  return cards;
}

export function buildHealthItems(args: {
  adapters: readonly AdapterHealthRow[];
  blockers: readonly string[];
  manifestSlice: string | null;
  publicMediaHonesty: string;
  deployReadiness?: DeployReadiness | null;
}): HealthItem[] {
  const items: HealthItem[] = [
    {
      id: "kit_version",
      title: "Kit / manifest slice",
      ok: Boolean(args.manifestSlice),
      detail: args.manifestSlice
        ? `Manifest slice ${args.manifestSlice} (preview chassis).`
        : "escape-hatch.manifest.json missing or unreadable.",
      next_action: args.manifestSlice
        ? "Treat slice stamps as prototype markers — not a verified deploy proof."
        : "Rebuild the kit with fill-template so the manifest is present."
    },
    {
      id: "private_media_honesty",
      title: "Private media honesty",
      ok: false,
      detail: args.publicMediaHonesty,
      next_action:
        "Keep ESCAPE_HATCH_MEDIA_MODE away from public_legacy; use /api/media after entitlement checks."
    }
  ];

  if (args.deployReadiness) {
    const r = args.deployReadiness;
    items.push({
      id: "deploy_version",
      title: "Deployment / version (EH-070)",
      ok: r.ok,
      detail: r.detail,
      next_action: r.ok
        ? "Fixture rehearsal only — live Vercel promote and Docker Path B remain open; productionSafe false."
        : "Run preview→promote on /admin/deploy, then register callbacks from the checklist."
    });
    items.push({
      id: "callback_checklist",
      title: "Domain / callback checklist",
      ok: r.callbacks.ok,
      detail: `${r.callbacks.detail} (${r.callbacks.slots.filter((s) => s.absolute_url).length}/${r.callbacks.slots.length} absolute URLs)`,
      next_action: r.callbacks.ok
        ? "Copy absolute URLs into provider dashboards (Patreon/Stripe/auth). Live DNS/TLS probe deferred."
        : "Set a non-placeholder NEXT_PUBLIC_SITE_URL (preview or custom domain) before registering callbacks."
    });
    items.push({
      id: "rollback_pointer",
      title: "Rollback pointer",
      ok: Boolean(r.previous_stable_deployment_id || r.active_deployment_id),
      detail: r.previous_stable_deployment_id
        ? `Prior stable retained: ${r.previous_stable_deployment_id}`
        : r.active_deployment_id
          ? `Active ${r.active_deployment_id} — no prior stable yet (first promote).`
          : "No active or prior stable deployment pointer in kit state.",
      next_action:
        "Promote twice in /admin/deploy rehearsal to retain a rollback target; live Vercel instant rollback deferred."
    });
  }

  for (const row of args.adapters) {
    items.push({
      id: `adapter_${row.id}`,
      title: `Adapter: ${row.id}`,
      ok: row.ok,
      detail: `${row.implementation} — ${row.detail}`,
      next_action: row.ok
        ? "Preview readiness only — not production certification."
        : NEXT_ACTIONS[row.id] ??
          "See adapter detail and OPERATIONS.md for the next safe fix."
    });
  }

  for (const [i, b] of args.blockers.entries()) {
    items.push({
      id: `blocker_${i}`,
      title: "Known blocker",
      ok: false,
      detail: b,
      next_action:
        "Track in Milestone 3 / later EH slices — do not mask as healthy."
    });
  }

  return items;
}

/** Convenience for admin pages that already know site id + public URL. */
export function loadDeployReadinessForAdmin(
  siteId: string,
  siteUrl: string | null | undefined,
  kitDir?: string
): DeployReadiness {
  return assessVercelDeployReadiness({ siteId, siteUrl, kitDir });
}
