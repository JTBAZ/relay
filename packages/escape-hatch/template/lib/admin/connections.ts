/**
 * Connections + site-health rollups (EH-062).
 * Honest next-safe-action copy — never claims productionSafe.
 */

import { activeCrosspostTokenCount } from "../relay-crosspost/tokens";
import {
  assessVercelDeployReadiness,
  type DeployReadiness
} from "../deploy/vercel-path";
import { assessPathBRecipe, type PathBRecipeReport } from "../deploy/path-b-recipe";
import {
  assessEmailReadiness,
  type EmailReadiness
} from "../email/readiness";
import type { BackupReadiness } from "../backup/readiness";
import type { LaunchReadiness } from "../deploy/launch-wizard";
import type { OwnershipReadiness } from "../ownership/readiness";
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
    "Set ESCAPE_HATCH_EMAIL_PROVIDER=resend with RESEND_API_KEY + EMAIL_FROM, or memory for kit-local outbox (EH-072). Complete SPF/DKIM/DMARC at your DNS host.",
  deployment:
    "Open /admin/deploy — EH-070 Vercel or EH-071 Docker Path B fixture rehearsal (not live provider APIs)."
};

const WHAT_BREAKS: Record<string, string> = {
  auth: "Patron sign-in and staff admin gates fail closed when identity is misconfigured.",
  database: "Memberships, sessions, and entitlement snapshots cannot persist.",
  storage: "Premium media delivery fails closed for private_r2 without credentials.",
  billing: "Independent Checkout stays unavailable; stubs never mint live charges.",
  patreon: "Patreon-derived entitlements stay stale or unavailable.",
  email: "No password-reset / security email delivery when the adapter is stub.",
  deployment: "No verified production deploy from adapter health alone."
};

const OWNERS: Record<string, string> = {
  auth: "Creator-owned (Supabase or portable Postgres)",
  database: "Creator-owned database",
  storage: "Creator-owned R2 / local private media",
  billing: "Creator-owned Stripe or alternate provider",
  patreon: "Creator OAuth or Relay-managed (explicit choice)",
  email: "Creator-owned ESP (Resend golden path)",
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
  email: ["ESCAPE_HATCH_EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM"],
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
  pathBRecipe?: PathBRecipeReport | null;
  emailReadiness?: EmailReadiness | null;
  backupReadiness?: BackupReadiness | null;
  launchReadiness?: LaunchReadiness | null;
  ownershipReadiness?: OwnershipReadiness | null;
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
      title: "Deployment / version (EH-070/071)",
      ok: r.ok,
      detail: r.detail,
      next_action: r.ok
        ? "Fixture rehearsal only — live Vercel/Docker daemon and MojoHost support remain open; productionSafe false."
        : "Run Path A or Path B rehearsal on /admin/deploy, then register callbacks from the checklist."
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
        "Promote twice in /admin/deploy rehearsal to retain a rollback target; live provider instant rollback deferred."
    });
  }

  if (args.pathBRecipe) {
    const p = args.pathBRecipe;
    items.push({
      id: "path_b_recipe",
      title: "Docker Path B recipe",
      ok: p.ok,
      detail: `${p.detail} Host: ${p.host_candidate.title} (${p.host_candidate.status}; wizard=${p.host_candidate.wizard_supported}).`,
      next_action: p.ok
        ? "Recipe present — still kit-local; MojoHost not wizard-supported; live compose/TLS deferred."
        : "Restore deploy/docker recipe files from the template chassis."
    });
  }

  if (args.emailReadiness) {
    const e = args.emailReadiness;
    items.push({
      id: "email_delivery",
      title: "Transactional email (EH-072)",
      ok: e.ok,
      detail: e.detail,
      next_action: e.ok
        ? "Preview readiness only — complete SPF/DKIM/DMARC attestations and a real test-inbox send outside CI; productionSafe false."
        : "Configure Resend recipe env or ESCAPE_HATCH_EMAIL_PROVIDER=memory for fixture outbox."
    });
    items.push({
      id: "email_dns_checklist",
      title: "Email DNS / delivery checklist",
      ok: e.checklist.ok,
      detail: e.checklist.detail,
      next_action: e.checklist.ok
        ? "Checklist attested — still no live DNS probe; re-verify after domain changes."
        : "Follow SPF/DKIM/DMARC guidance at your DNS host; set EMAIL_FROM and public site URL."
    });
  }

  if (args.backupReadiness) {
    const b = args.backupReadiness;
    items.push({
      id: "backup_freshness",
      title: "Backup freshness (EH-073)",
      ok: b.schedule_ok,
      detail: b.detail,
      next_action: b.schedule_ok
        ? `Within RPO ${b.rpo_hours}h (fixture) — still not live Postgres/R2; productionSafe false.`
        : "POST /api/admin/backup with action=run_backup (kit-local redacted snapshot)."
    });
    items.push({
      id: "restore_rehearsal",
      title: "Isolated restore rehearsal",
      ok: b.restore_ok,
      detail: `Status: ${b.restore_status}. RTO documented ${b.rto_minutes}m (kit-local).`,
      next_action: b.restore_ok
        ? "Last rehearsal passed into data/restore-rehearsal/ — full production restore deferred."
        : "POST /api/admin/backup action=restore_rehearsal after a successful fixture backup."
    });
    items.push({
      id: "update_compatibility",
      title: "Update / compatibility",
      ok:
        b.compatibility.verdict === "compatible" ||
        b.compatibility.verdict === "compatible_with_notes",
      detail: b.compatibility.detail,
      next_action:
        b.compatibility.verdict === "unknown"
          ? "Run a fixture backup to capture previous_stable, then re-check compatibility."
          : "Fixture guidance only — not a live migrate; review schema notes before updating."
    });
    items.push({
      id: "diagnostic_bundle",
      title: "Audit / diagnostic download",
      ok: b.diagnostics_available,
      detail: b.diagnostics_available
        ? "GET /api/admin/backup?diagnostics=1 — versions, statuses, error codes; secrets stripped."
        : "Diagnostics unavailable until escape-hatch.manifest.json is readable.",
      next_action: b.diagnostics_available
        ? "Download diagnostics for support; never paste secrets into tickets."
        : "Rebuild kit so the manifest is present."
    });
  }

  if (args.launchReadiness) {
    const l = args.launchReadiness;
    items.push({
      id: "launch_wizard",
      title: "Launch wizard (EH-074)",
      ok: Boolean(l.wizard.launch_completed_at) || l.can_complete || l.ok,
      detail: l.detail,
      next_action: l.wizard.launch_completed_at
        ? "Launch marked complete in fixture — still not productionSafe; live provider proofs deferred."
        : l.can_complete
          ? "Open /admin/deploy and Complete launch."
          : "Open /admin/deploy launch wizard; clear blockers (path, callbacks, backup/restore, promote, smoke)."
    });
  }

  if (args.ownershipReadiness) {
    const o = args.ownershipReadiness;
    items.push({
      id: "ownership_packet",
      title: "Ownership packet (EH-080 / EH-082)",
      ok: o.ok,
      detail: o.detail,
      next_action: o.packet_generated
        ? "Download from /admin/deploy — env names only; local native QC passed; live provider independence open."
        : "Generate ownership packet on /admin/deploy (manifesto, credentials names, warranty)."
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
