/**
 * Connections + site-health rollups (EH-062).
 * Honest next-safe-action copy — never claims productionSafe.
 */

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
    "Kit manifests only — verified Vercel/Docker golden paths are EH-070/071."
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
  deployment: "Creator host (Vercel/Docker) — manifests only"
};

const DEEP_LINKS: Record<string, string | null> = {
  auth: "/admin/health",
  database: "/admin/health",
  storage: "/admin/media",
  billing: "/admin/billing/policy",
  patreon: "/admin/patreon",
  email: "/admin/health",
  deployment: "/admin/health"
};

const ENV_HINTS: Record<string, string[]> = {
  auth: ["ESCAPE_HATCH_IDENTITY_PROVIDER", "NEXT_PUBLIC_SUPABASE_URL"],
  database: ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  storage: ["R2_ENDPOINT", "R2_BUCKET", "ESCAPE_HATCH_MEDIA_MODE"],
  billing: ["ESCAPE_HATCH_BILLING_PROVIDER", "STRIPE_SECRET_KEY"],
  patreon: ["ESCAPE_HATCH_PATREON_MODE", "PATREON_CLIENT_ID"],
  email: [],
  deployment: []
};

export function buildConnectionCards(
  adapters: readonly AdapterHealthRow[]
): ConnectionCard[] {
  return adapters.map((row) => {
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
}

export function buildHealthItems(args: {
  adapters: readonly AdapterHealthRow[];
  blockers: readonly string[];
  manifestSlice: string | null;
  publicMediaHonesty: string;
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
