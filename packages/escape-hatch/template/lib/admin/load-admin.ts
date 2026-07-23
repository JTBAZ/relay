/**
 * Server-side admin data loaders (EH-022 / EH-030).
 * Prefer data/ kit artifacts; never treat public/media as private-verified.
 * When Supabase identity is configured, staff session is required before inventory.
 * Soft persona never authorizes admin. productionSafe remains false.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSiteAdapters } from "../adapters";
import type { AdapterHealth } from "../adapters/types";
import {
  assertAdminReadAccess,
  type AdminIdentityState,
  type AdminReadDeniedReason
} from "../identity/admin-access";
import { loadSite } from "../load-site";
import { loadAdminAttention } from "./attention";
import {
  ADMIN_ATTENTION_CONTRACT_VERSION,
  type AdapterHealthRow,
  type AdminAttentionState,
  type AdminMediaRow,
  type AdminTierRow
} from "./types";

export type AdminOverviewModel = {
  site_id: string;
  creator_display_name: string;
  creator_handle: string;
  base_url: string;
  post_count: number;
  media_count: number;
  tier_count: number;
  production_safe: false;
  manifest_slice: string | null;
  adapters: AdapterHealthRow[];
  blockers: string[];
  attention_count: number;
  identity: AdminIdentityState;
  read_allowed: boolean;
  deny_reason: AdminReadDeniedReason | null;
};

export type AdminPostsModel = {
  site_id: string;
  production_safe: false;
  attention: AdminAttentionState;
  posts: Array<{
    post_id: string;
    slug: string;
    title: string;
    published_at: string;
    access_level: string;
    tier_ids: string[];
    media_count: number;
    attention_note: string | null;
    status: "draft" | "published";
    feature_order: number | null;
    body_plain: string | null;
    public_cover_media_id: string | null;
  }>;
  identity: AdminIdentityState;
  read_allowed: boolean;
  deny_reason: AdminReadDeniedReason | null;
};

export type AdminMediaModel = {
  site_id: string;
  production_safe: false;
  ledger_present: boolean;
  rows: AdminMediaRow[];
  honesty: string[];
  identity: AdminIdentityState;
  read_allowed: boolean;
  deny_reason: AdminReadDeniedReason | null;
};

export type AdminTiersModel = {
  site_id: string;
  production_safe: false;
  tiers: AdminTierRow[];
  unmapped_warnings: string[];
  identity: AdminIdentityState;
  read_allowed: boolean;
  deny_reason: AdminReadDeniedReason | null;
};

function kitDir(): string {
  return process.cwd();
}

function readManifestSlice(): string | null {
  const path = join(kitDir(), "escape-hatch.manifest.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      slice?: unknown;
    };
    return typeof parsed.slice === "string" ? parsed.slice : null;
  } catch {
    return null;
  }
}

async function healthDetail(h: AdapterHealth): Promise<{ ok: boolean; detail: string }> {
  if (h.ok) return { ok: true, detail: h.detail ?? "ok" };
  return { ok: false, detail: h.reason };
}

function denyBlocker(reason: AdminReadDeniedReason): string {
  return reason === "sign_in_required"
    ? "Supabase identity configured — sign in required for admin reads"
    : "Signed in but no admin/operator membership for this site — inventory withheld";
}

export async function loadAdminOverview(): Promise<AdminOverviewModel> {
  const site = loadSite();
  const access = await assertAdminReadAccess(site.site_id);

  if (!access.allowed) {
    return {
      site_id: site.site_id,
      creator_display_name: "",
      creator_handle: "",
      base_url: "",
      post_count: 0,
      media_count: 0,
      tier_count: 0,
      production_safe: false,
      manifest_slice: null,
      adapters: [],
      blockers: [denyBlocker(access.reason)],
      attention_count: 0,
      identity: access.identity,
      read_allowed: false,
      deny_reason: access.reason
    };
  }

  const identity = access.identity;
  const adapters = createSiteAdapters();
  const healthPairs = await Promise.all([
    adapters.auth.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.auth.id,
        implementation: adapters.auth.implementation,
        ...d
      }))
    ),
    adapters.database.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.database.id,
        implementation: adapters.database.implementation,
        ...d
      }))
    ),
    adapters.storage.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.storage.id,
        implementation: adapters.storage.implementation,
        ...d
      }))
    ),
    adapters.billing.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.billing.id,
        implementation: adapters.billing.implementation,
        ...d
      }))
    ),
    adapters.patreon.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.patreon.id,
        implementation: adapters.patreon.implementation,
        ...d
      }))
    ),
    adapters.email.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.email.id,
        implementation: adapters.email.implementation,
        ...d
      }))
    ),
    adapters.deployment.health().then((h) =>
      healthDetail(h).then((d) => ({
        id: adapters.deployment.id,
        implementation: adapters.deployment.implementation,
        ...d
      }))
    )
  ]);

  const mediaIds = new Set<string>();
  for (const post of site.posts) {
    for (const m of post.media) mediaIds.add(m.media_id);
  }

  const attention = loadAdminAttention(site.site_id);

  const blockers: string[] = [
    "No signed private media delivery (EH-033) — public/media may still leak premium bytes",
    "Billing adapter: EH-050 contract + stub (Stripe live is EH-051)",
    "Entitlement service freshness/audit (EH-032) not fully wired"
  ];
  if (identity.mode === "local_preview") {
    blockers.unshift(
      "Identity not configured — admin mutations remain local-operator only (not authentication)"
    );
  } else if (identity.mode === "invalid") {
    blockers.unshift(
      "ESCAPE_HATCH_IDENTITY_PROVIDER is invalid — use none, supabase, or portable"
    );
  }

  return {
    site_id: site.site_id,
    creator_display_name: site.creator.display_name,
    creator_handle: site.creator.handle,
    base_url: site.base_url,
    post_count: site.posts.length,
    media_count: mediaIds.size,
    tier_count: site.tiers.length,
    production_safe: false,
    manifest_slice: readManifestSlice(),
    adapters: healthPairs,
    blockers,
    attention_count: Object.keys(attention.marks).length,
    identity,
    read_allowed: true,
    deny_reason: null
  };
}

export async function loadAdminPosts(): Promise<AdminPostsModel> {
  const site = loadSite();
  const access = await assertAdminReadAccess(site.site_id);

  if (!access.allowed) {
    return {
      site_id: site.site_id,
      production_safe: false,
      attention: {
        contract_version: ADMIN_ATTENTION_CONTRACT_VERSION,
        site_id: site.site_id,
        production_safe: false,
        updated_at: "",
        marks: {}
      } satisfies AdminAttentionState,
      posts: [],
      identity: access.identity,
      read_allowed: false,
      deny_reason: access.reason
    };
  }

  const attention = loadAdminAttention(site.site_id);
  return {
    site_id: site.site_id,
    production_safe: false,
    attention,
    posts: site.posts.map((p) => ({
      post_id: p.post_id,
      slug: p.slug,
      title: p.title,
      published_at: p.published_at,
      access_level: p.access.level,
      tier_ids: [...p.access.tier_ids],
      media_count: p.media.length,
      attention_note: attention.marks[p.post_id]?.note ?? null,
      status: p.status === "draft" ? "draft" : "published",
      feature_order:
        typeof p.feature_order === "number" ? p.feature_order : null,
      body_plain: p.body_plain ?? null,
      public_cover_media_id: p.public_cover_media_id ?? null
    })),
    identity: access.identity,
    read_allowed: true,
    deny_reason: null
  };
}

function tryParseLedgerObjects():
  | Record<
      string,
      {
        status?: string;
        access_class?: string;
        private_required?: boolean;
        private_read_verified?: boolean;
        failure_reason?: string;
        mime_type?: string;
      }
    >
  | null {
  const path = join(kitDir(), "data", "media-migration-ledger.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      objects?: Record<string, unknown>;
      production_safe?: boolean;
    };
    if (parsed.production_safe === true) {
      // Refuse to trust a ledger claiming production-safe.
      return null;
    }
    if (!parsed.objects || typeof parsed.objects !== "object") return null;
    return parsed.objects as Record<
      string,
      {
        status?: string;
        access_class?: string;
        private_required?: boolean;
        private_read_verified?: boolean;
        failure_reason?: string;
        mime_type?: string;
      }
    >;
  } catch {
    return null;
  }
}

export async function loadAdminMedia(): Promise<AdminMediaModel> {
  const site = loadSite();
  const access = await assertAdminReadAccess(site.site_id);

  if (!access.allowed) {
    return {
      site_id: site.site_id,
      production_safe: false,
      ledger_present: false,
      rows: [],
      honesty: [
        "Admin inventory withheld — staff session required when Supabase identity is configured."
      ],
      identity: access.identity,
      read_allowed: false,
      deny_reason: access.reason
    };
  }

  const ledger = tryParseLedgerObjects();
  const byId = new Map<string, AdminMediaRow>();

  for (const post of site.posts) {
    for (const m of post.media) {
      const existing = byId.get(m.media_id);
      if (existing) continue;
      const entry = ledger?.[m.media_id];
      byId.set(m.media_id, {
        media_id: m.media_id,
        mime_type: m.mime_type ?? entry?.mime_type,
        access_class: entry?.access_class ?? post.access.level,
        has_export: m.has_export,
        content_path: m.content_path,
        ledger_status: entry?.status,
        private_required: entry?.private_required,
        private_read_verified: entry?.private_read_verified === true,
        failure_reason: entry?.failure_reason,
        public_media_only: !entry
      });
    }
  }

  if (ledger) {
    for (const [mediaId, entry] of Object.entries(ledger)) {
      if (byId.has(mediaId)) continue;
      byId.set(mediaId, {
        media_id: mediaId,
        mime_type: entry.mime_type,
        access_class: entry.access_class ?? "unknown",
        ledger_status: entry.status,
        private_required: entry.private_required,
        private_read_verified: entry.private_read_verified === true,
        failure_reason: entry.failure_reason,
        public_media_only: false
      });
    }
  }

  return {
    site_id: site.site_id,
    production_safe: false,
    ledger_present: Boolean(ledger),
    rows: [...byId.values()].sort((a, b) =>
      a.media_id.localeCompare(b.media_id)
    ),
    honesty: [
      "public/media paths are never treated as private-read verification.",
      ledger
        ? "Migration ledger present — verified flags come from private-read checks only."
        : "No media-migration-ledger.json — inventory is from site bundle only (fixture/kit state)."
    ],
    identity: access.identity,
    read_allowed: true,
    deny_reason: null
  };
}

export async function loadAdminTiers(): Promise<AdminTiersModel> {
  const site = loadSite();
  const access = await assertAdminReadAccess(site.site_id);

  if (!access.allowed) {
    return {
      site_id: site.site_id,
      production_safe: false,
      tiers: [],
      unmapped_warnings: [],
      identity: access.identity,
      read_allowed: false,
      deny_reason: access.reason
    };
  }

  const counts = new Map<string, number>();
  for (const post of site.posts) {
    if (post.access.level !== "tier_gated") continue;
    for (const tid of post.access.tier_ids) {
      counts.set(tid, (counts.get(tid) ?? 0) + 1);
    }
  }

  const catalogIds = new Set(site.tiers.map((t) => t.tier_id));
  const unmapped_warnings: string[] = [];
  for (const tid of counts.keys()) {
    if (!catalogIds.has(tid)) {
      unmapped_warnings.push(
        `Post access references tier_id "${tid}" that is not in the tier catalog.`
      );
    }
  }

  const tiers: AdminTierRow[] = site.tiers.map((t) => {
    const post_count = counts.get(t.tier_id) ?? 0;
    const mapping_warning =
      post_count === 0
        ? "No posts currently map to this tier (preview catalog only)."
        : undefined;
    return {
      tier_id: t.tier_id,
      title: t.title,
      access_level: t.access_level,
      post_count,
      mapping_warning
    };
  });

  return {
    site_id: site.site_id,
    production_safe: false,
    tiers,
    unmapped_warnings,
    identity: access.identity,
    read_allowed: true,
    deny_reason: null
  };
}
