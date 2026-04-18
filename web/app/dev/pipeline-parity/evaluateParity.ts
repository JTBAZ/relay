import type { PatreonSyncStateData } from "@/lib/relay-api";
import { syncStateNeedsAttention } from "@/lib/relay-api";

/** Truth-matrix honest UI (see docs/architecture/TRUTH_MATRIX_DISCOVERY.md). */
export type HonestStatus = "ok" | "degraded" | "not_applicable" | "unknown";

export type ParitySeverityHint = 0 | 1 | 2;

export type ParityNode = {
  id: string;
  label: string;
  status: HonestStatus;
  severity_hint: ParitySeverityHint;
  summary: string;
  prove: Record<string, unknown>;
  display: Record<string, unknown>;
};

export type RelayRuntimeManifestPayload = {
  relay_db_store: {
    identity: { envVar: string; effective: boolean; readPath: string };
    canonical: { envVar: string; effective: boolean; readPath: string };
    watermark: { envVar: string; effective: boolean; readPath: string };
    sync_health: { envVar: string; effective: boolean; readPath: string };
    creator_oauth: { envVar: string; effective: boolean; readPath: string };
  };
  always_file: {
    patreon_session_cookies: true;
    patreon_webhook_metadata: true;
    patreon_campaign_creator_index: true;
  };
  webhook_endpoint_table: { wired_as_live: boolean };
  public_webhook_base_configured: boolean;
  prisma_configured: boolean;
};

export type PipelineParitySnapshotPayload = {
  runtime_manifest: RelayRuntimeManifestPayload;
  paths: Record<string, string>;
  account: {
    id: string;
    email_norm: string | null;
    supabase_user_id: string | null;
    primary_relay_creator_id: string | null;
  } | null;
  studio: { relay_creator_id: string; tenant_id: string | null };
  creator_profile: {
    public_slug: string;
    patreon_campaign_id: string | null;
  } | null;
  oauth_credential_db: {
    health_status: string;
    expires_at_hint: string | null;
  } | null;
  sync_cursor: { last_synced_at: string; updated_at: string } | null;
  creator_sync_state: unknown;
  webhook_endpoint_db: {
    id: string;
    relay_creator_id: string;
    patreon_campaign_numeric_id: string | null;
    opaque_delivery_token: string | null;
    patreon_webhook_id: string | null;
    uri_registered: string | null;
    registration_status: string | null;
    triggers: unknown;
    key_id: string | null;
    has_encrypted_secret: boolean;
    created_at: string;
    updated_at: string;
  } | null;
  canonical_counts_db: { posts: number; media_assets: number } | null;
  patron_entitlement_row: {
    as_of: string;
    stale_after: string | null;
    entitled_tier_ids: string[];
    active: boolean;
  } | null;
  isolation: {
    campaign_numeric_id: string | null;
    file_index_maps_to_creator_id: string | null;
    webhook_ownership: { ok: boolean; reason?: string };
  };
};

function sevForIsolation(ok: boolean): ParitySeverityHint {
  return ok ? 2 : 0;
}

/** Compare file-store webhook summary to `WebhookEndpoint` dual-write row (WI-7). */
function webhookFileDbParityStatus(
  wr: PatreonSyncStateData["webhook_registration"],
  db: PipelineParitySnapshotPayload["webhook_endpoint_db"]
): HonestStatus {
  if (!db) {
    if (wr?.registration_status === "ok") return "degraded";
    return "unknown";
  }
  const f = wr?.registration_status;
  const d = db.registration_status?.trim() || null;
  if (!f) return "unknown";
  if (f === d) return "ok";
  if (f === "skipped_no_public_url" && d === "skipped_no_public_url") return "ok";
  return "degraded";
}

export function evaluatePipelineParity(input: {
  snapshot: PipelineParitySnapshotPayload | null;
  snapshotError?: string;
  syncState: PatreonSyncStateData | null;
  syncStateError?: string;
  browser: {
    supabaseUserId: string | null;
    relayCreatorId: string | null;
    relaySessionPresent: boolean;
    meSessionCreatorId: string | null;
  };
  selectedCreatorId: string;
  selectedCampaignId: string | undefined;
}): ParityNode[] {
  const { snapshot, syncState, browser, selectedCreatorId, selectedCampaignId } = input;
  const nodes: ParityNode[] = [];
  const manifest = snapshot?.runtime_manifest;

  const campaignId =
    selectedCampaignId?.trim() ||
    snapshot?.creator_profile?.patreon_campaign_id?.trim() ||
    snapshot?.isolation.campaign_numeric_id?.trim() ||
    syncState?.patreon_campaign_id?.trim() ||
    "";

  /* --- Studio provision --- */
  if (!snapshot || input.snapshotError) {
    nodes.push({
      id: "studio_provision",
      label: "Studio provision (Tenant / CreatorProfile)",
      status: "unknown",
      severity_hint: 2,
      summary: input.snapshotError ?? "No snapshot — Relay secret or API error.",
      prove: {},
      display: { snapshot_error: input.snapshotError ?? null }
    });
  } else if (!manifest?.prisma_configured) {
    nodes.push({
      id: "studio_provision",
      label: "Studio provision (Tenant / CreatorProfile)",
      status: "unknown",
      severity_hint: 2,
      summary: "Prisma not configured on Relay — cannot verify DB rows.",
      prove: {},
      display: { prisma_configured: false }
    });
  } else if (!snapshot.creator_profile && !snapshot.studio.tenant_id) {
    nodes.push({
      id: "studio_provision",
      label: "Studio provision (Tenant / CreatorProfile)",
      status: "degraded",
      severity_hint: 1,
      summary: "No tenant or CreatorProfile for this creator_id.",
      prove: { creator_id: selectedCreatorId },
      display: { studio: snapshot.studio }
    });
  } else {
    nodes.push({
      id: "studio_provision",
      label: "Studio provision (Tenant / CreatorProfile)",
      status: "ok",
      severity_hint: 2,
      summary: "Tenant + creator profile present in Postgres (diagnostic).",
      prove: {},
      display: {
        creator_profile: snapshot.creator_profile,
        tenant_id: snapshot.studio.tenant_id
      }
    });
  }

  /* --- Supabase ↔ account (browser) --- */
  if (snapshot?.account?.supabase_user_id && browser.supabaseUserId) {
    const match = snapshot.account.supabase_user_id === browser.supabaseUserId;
    nodes.push({
      id: "supabase_account_link",
      label: "Supabase session ↔ Account.supabase_user_id",
      status: match ? "ok" : "degraded",
      severity_hint: match ? 2 : 1,
      summary: match
        ? "Browser Supabase user matches Account row."
        : "Supabase session user id does not match selected Account row.",
      prove: {
        account_supabase_user_id: snapshot.account.supabase_user_id,
        browser_supabase_user_id: browser.supabaseUserId
      },
      display: {}
    });
  } else {
    nodes.push({
      id: "supabase_account_link",
      label: "Supabase session ↔ Account.supabase_user_id",
      status: "unknown",
      severity_hint: 2,
      summary:
        "Skipped — log in via Supabase in this browser and select an account with supabase_user_id, or configure NEXT_PUBLIC_SUPABASE_*.",
      prove: {
        account_has_id: Boolean(snapshot?.account?.supabase_user_id),
        browser_has_id: Boolean(browser.supabaseUserId)
      },
      display: {}
    });
  }

  /* --- relay_creator_id local --- */
  if (browser.relayCreatorId) {
    const match = browser.relayCreatorId.trim() === selectedCreatorId.trim();
    nodes.push({
      id: "local_relay_creator_id",
      label: "localStorage relay_creator_id ↔ selected studio",
      status: match ? "ok" : "degraded",
      severity_hint: match ? 2 : 1,
      summary: match
        ? "localStorage relay_creator_id matches selected creator."
        : "localStorage relay_creator_id does not match selected studio (stale tab or wrong env).",
      prove: { local: browser.relayCreatorId, selected: selectedCreatorId },
      display: {}
    });
  } else {
    nodes.push({
      id: "local_relay_creator_id",
      label: "localStorage relay_creator_id ↔ selected studio",
      status: "unknown",
      severity_hint: 2,
      summary: "No relay_creator_id in localStorage (set after workspace bootstrap).",
      prove: {},
      display: {}
    });
  }

  /* --- Bearer session creator (patron path) --- */
  if (browser.relaySessionPresent && browser.meSessionCreatorId != null) {
    const match = browser.meSessionCreatorId.trim() === selectedCreatorId.trim();
    nodes.push({
      id: "me_session_creator",
      label: "GET /api/v1/me/session creator_id ↔ selected studio",
      status: match ? "ok" : "degraded",
      severity_hint: match ? 2 : 1,
      summary: match
        ? "Opaque Bearer session is scoped to the selected creator."
        : "Bearer session creator_id differs from selected studio (wrong session tab).",
      prove: {
        me_session_creator_id: browser.meSessionCreatorId,
        selected_creator_id: selectedCreatorId
      },
      display: {}
    });
  } else if (browser.relaySessionPresent) {
    nodes.push({
      id: "me_session_creator",
      label: "GET /api/v1/me/session creator_id ↔ selected studio",
      status: "unknown",
      severity_hint: 2,
      summary: "Could not read session (call failed or no token).",
      prove: { relay_session_present: true },
      display: {}
    });
  } else {
    nodes.push({
      id: "me_session_creator",
      label: "GET /api/v1/me/session creator_id ↔ selected studio",
      status: "not_applicable",
      severity_hint: 2,
      summary: "No Relay session cookie — not applicable for patron session scope check.",
      prove: {},
      display: {}
    });
  }

  /* --- sync-state aggregate --- */
  if (input.syncStateError || !syncState) {
    nodes.push({
      id: "sync_state_live",
      label: "Live sync-state (GET /api/v1/patreon/sync-state)",
      status: "unknown",
      severity_hint: 2,
      summary: input.syncStateError ?? "sync-state unavailable (OAuth/creator missing).",
      prove: {},
      display: { error: input.syncStateError ?? null }
    });
  } else {
    const needs = syncStateNeedsAttention(syncState);
    nodes.push({
      id: "sync_state_live",
      label: "Live sync-state (aggregate attention)",
      status: needs ? "degraded" : "ok",
      severity_hint: 2,
      summary: needs
        ? "syncStateNeedsAttention — see OAuth/cookie/scrape/webhook nodes."
        : "No attention flags on sync-state.",
      prove: { sync_state_needs_attention: needs },
      display: { patreon_campaign_id: syncState.patreon_campaign_id }
    });
  }

  /* --- Creator OAuth --- */
  if (!syncState) {
    nodes.push({
      id: "creator_oauth",
      label: "Creator OAuth tokens",
      status: "unknown",
      severity_hint: 2,
      summary: "No sync-state — cannot evaluate OAuth health.",
      prove: {},
      display: {}
    });
  } else {
    const oauth = syncState.oauth;
    const expired = oauth.access_token_expired || oauth.credential_health_status === "refresh_failed";
    let status: HonestStatus = expired ? "degraded" : "ok";
    let summary = expired
      ? "Patreon access token unhealthy — reconnect creator OAuth."
      : "OAuth credential healthy on live sync-state.";
    if (manifest?.relay_db_store.creator_oauth.effective && snapshot?.oauth_credential_db) {
      const dbOk = snapshot.oauth_credential_db.health_status === "healthy";
      if (dbOk && expired) {
        status = "degraded";
        summary += " (Postgres row still healthy — refresh live token.)";
      }
    }
    if (!manifest?.relay_db_store.creator_oauth.effective) {
      summary += " DB OAuth row: not_applicable (RELAY_DB_STORE_CREATOR_OAUTH off — file store).";
    }
    nodes.push({
      id: "creator_oauth",
      label: "Creator OAuth tokens",
      status,
      severity_hint: expired ? 1 : 2,
      summary,
      prove: {
        sync_state_oauth: oauth,
        db_store_creator_oauth: manifest?.relay_db_store.creator_oauth.effective ?? false
      },
      display: { oauth_credential_db: snapshot?.oauth_credential_db ?? null }
    });
  }

  /* --- Canonical ingest DB --- */
  if (!snapshot) {
    nodes.push({
      id: "canonical_ingest_db",
      label: "Canonical ingest (Postgres)",
      status: "unknown",
      severity_hint: 2,
      summary: "No snapshot — cannot evaluate canonical DB flags.",
      prove: {},
      display: {}
    });
  } else if (!manifest?.relay_db_store.canonical.effective) {
    nodes.push({
      id: "canonical_ingest_db",
      label: "Canonical ingest (Postgres)",
      status: "not_applicable",
      severity_hint: 2,
      summary:
        "RELAY_DB_STORE_CANONICAL is off — runtime uses file canonical; do not claim Postgres parity.",
      prove: { read_path: manifest?.relay_db_store.canonical.readPath },
      display: { canonical_file: snapshot?.paths.canonical_ingest_file }
    });
  } else if (snapshot?.canonical_counts_db) {
    nodes.push({
      id: "canonical_ingest_db",
      label: "Canonical ingest (Postgres)",
      status: "ok",
      severity_hint: 2,
      summary: `Diagnostic counts: ${snapshot.canonical_counts_db.posts} posts, ${snapshot.canonical_counts_db.media_assets} media rows for creator scope.`,
      prove: { counts: snapshot.canonical_counts_db },
      display: {}
    });
  } else {
    nodes.push({
      id: "canonical_ingest_db",
      label: "Canonical ingest (Postgres)",
      status: "unknown",
      severity_hint: 2,
      summary: "Canonical DB on but no campaign id for counts.",
      prove: {},
      display: {}
    });
  }

  /* --- Watermark --- */
  if (!snapshot) {
    nodes.push({
      id: "sync_watermark",
      label: "Sync watermark",
      status: "unknown",
      severity_hint: 2,
      summary: "No snapshot — cannot evaluate watermark store.",
      prove: {},
      display: {}
    });
  } else if (!manifest?.relay_db_store.watermark.effective) {
    nodes.push({
      id: "sync_watermark",
      label: "Sync watermark",
      status: "not_applicable",
      severity_hint: 2,
      summary: "RELAY_DB_STORE_WATERMARK off — watermark lives in file store; compare sync-state only.",
      prove: {},
      display: {}
    });
  } else if (syncState && snapshot?.sync_cursor && campaignId) {
    const wm = syncState.watermark_published_at;
    const db = snapshot.sync_cursor.last_synced_at;
    const close =
      wm && db && Math.abs(new Date(wm).getTime() - new Date(db).getTime()) < 60_000;
    nodes.push({
      id: "sync_watermark",
      label: "Sync watermark (sync-state vs SyncCursor)",
      status: wm === db || close ? "ok" : "degraded",
      severity_hint: 2,
      summary:
        wm === db || close
          ? "Watermark aligns between sync-state and Postgres SyncCursor."
          : "Watermark differs — investigate dual-write or stale read.",
      prove: { sync_state_watermark: wm, db_last_synced: db },
      display: {}
    });
  } else {
    nodes.push({
      id: "sync_watermark",
      label: "Sync watermark (sync-state vs SyncCursor)",
      status: "unknown",
      severity_hint: 2,
      summary: "Cannot compare — missing sync-state, DB row, or campaign id.",
      prove: {},
      display: {}
    });
  }

  /* --- Sync health --- */
  if (!snapshot) {
    nodes.push({
      id: "sync_health_store",
      label: "Sync health persistence",
      status: "unknown",
      severity_hint: 2,
      summary: "No snapshot — cannot evaluate sync health store.",
      prove: {},
      display: {}
    });
  } else if (!manifest?.relay_db_store.sync_health.effective) {
    nodes.push({
      id: "sync_health_store",
      label: "Sync health persistence",
      status: "not_applicable",
      severity_hint: 2,
      summary: "RELAY_DB_STORE_SYNC_HEALTH off — health JSON file; live truth is sync-state.",
      prove: {},
      display: {}
    });
  } else {
    nodes.push({
      id: "sync_health_store",
      label: "Sync health persistence (DB diagnostic)",
      status: snapshot?.creator_sync_state ? "ok" : "unknown",
      severity_hint: 2,
      summary: snapshot?.creator_sync_state
        ? "creator_sync_states row present (compare with sync-state for drift)."
        : "No CreatorSyncState row yet.",
      prove: { last_post_scrape: syncState?.last_post_scrape ?? null },
      display: { creator_sync_state: snapshot?.creator_sync_state ?? null }
    });
  }

  /* --- Patreon cookies (always file) --- */
  if (syncState) {
    const c = syncState.cookie_session_status;
    let st: HonestStatus = "ok";
    if (c === "expired_local" || c === "rejected_remote") st = "degraded";
    nodes.push({
      id: "patreon_cookies",
      label: "Patreon session cookies (file store)",
      status: st,
      severity_hint: st === "ok" ? 2 : 2,
      summary:
        st === "ok"
          ? "Cookie session OK or not in error state (see sync-state)."
          : "Cookie session needs attention — re-enter session key if required for media.",
      prove: {
        has_cookie_session: syncState.has_cookie_session,
        cookie_session_status: c ?? null,
        store: "FilePatreonCookieStore"
      },
      display: { cookie_store_file: snapshot?.paths.cookie_store_file }
    });
  }

  /* --- Public webhook base URL (delivery registration) --- */
  if (manifest) {
    const cfg = manifest.public_webhook_base_configured;
    nodes.push({
      id: "public_webhook_base_env",
      label: "RELAY_PUBLIC_WEBHOOK_BASE_URL",
      status: cfg ? "ok" : "degraded",
      severity_hint: cfg ? 2 : 1,
      summary: cfg
        ? "Public webhook base URL is configured on the Relay API."
        : "Missing RELAY_PUBLIC_WEBHOOK_BASE_URL — Patreon cannot deliver webhooks to Relay.",
      prove: { public_webhook_base_configured: cfg },
      display: {
        sync_state_flag: syncState?.public_webhook_base_configured ?? null
      }
    });
  }

  /* --- Webhook file metadata --- */
  if (syncState) {
    const wr = syncState.webhook_registration;
    let st: HonestStatus = "ok";
    if (wr?.registration_status === "failed") st = "degraded";
    if (wr?.registration_status === "skipped_no_public_url") st = "degraded";
    nodes.push({
      id: "webhook_file_metadata",
      label: "Webhook registration (file metadata + Patreon)",
      status: st,
      severity_hint: 2,
      summary:
        wr?.registration_status === "ok"
          ? "Webhook registration OK on sync-state (file-backed store)."
          : `Webhook: ${wr?.registration_status ?? "unknown"}`,
      prove: { webhook_registration: wr ?? null, store: "PatreonWebhookMetadataStore" },
      display: { webhook_metadata_file: snapshot?.paths.webhook_metadata_file }
    });
  }

  {
    const wired = manifest?.webhook_endpoint_table.wired_as_live ?? false;
    const wr = syncState?.webhook_registration;
    const db = snapshot?.webhook_endpoint_db ?? null;
    let st: HonestStatus = "not_applicable";
    let summary =
      !manifest?.prisma_configured
        ? "Prisma not configured on Relay — cannot verify WebhookEndpoint row."
        : "WebhookEndpoint dual-write inactive or not applicable — parity vs file store not required.";
    if (wired && manifest?.prisma_configured) {
      st = webhookFileDbParityStatus(wr, db);
      summary =
        st === "ok"
          ? "File metadata and Postgres WebhookEndpoint agree (registration_status)."
          : st === "degraded"
            ? "File store and WebhookEndpoint row diverge — re-run registration or inspect dual-write."
            : db
              ? "Compare file webhook_registration to DB row when sync-state is available."
              : "No WebhookEndpoint row for this creator — dual-write may not have run yet.";
    }
    nodes.push({
      id: "webhook_prisma_row",
      label: "Postgres WebhookEndpoint row (dual-write)",
      status: wired ? st : "not_applicable",
      severity_hint: 2,
      summary,
      prove: {
        wired_as_live: wired,
        parity: st,
        webhook_registration_status: wr?.registration_status ?? null,
        db_registration_status: db?.registration_status ?? null
      },
      display: { webhook_endpoint_db: db }
    });
  }

  /* --- Campaign ↔ tenant routing --- */
  if (snapshot?.isolation) {
    const own = snapshot.isolation.webhook_ownership;
    const st: HonestStatus = own.ok ? "ok" : "degraded";
    nodes.push({
      id: "campaign_tenant_routing",
      label: "Campaign ↔ tenant isolation",
      status: st,
      severity_hint: sevForIsolation(own.ok),
      summary: own.ok
        ? "File index and CreatorProfile agree with route creator for this campaign."
        : `Isolation conflict: ${"reason" in own ? own.reason : "policy"}`,
      prove: {
        campaign_numeric_id: snapshot.isolation.campaign_numeric_id,
        file_index_maps_to: snapshot.isolation.file_index_maps_to_creator_id,
        route_creator: selectedCreatorId
      },
      display: { webhook_ownership: own }
    });
  }

  /* --- Campaign id alignment --- */
  if (syncState && campaignId) {
    const align = syncState.patreon_campaign_id === campaignId;
    nodes.push({
      id: "campaign_id_alignment",
      label: "Campaign id alignment (selection / profile / sync-state)",
      status: align ? "ok" : "degraded",
      severity_hint: 1,
      summary: align
        ? "Selected/profile campaign matches sync-state patreon_campaign_id."
        : "Campaign id mismatch across UI selection, profile, or sync-state.",
      prove: {
        selected_or_profile: campaignId,
        sync_state: syncState.patreon_campaign_id
      },
      display: { creator_profile_campaign: snapshot?.creator_profile?.patreon_campaign_id }
    });
  }

  /* --- Patron entitlements --- */
  if (snapshot?.patron_entitlement_row) {
    const row = snapshot.patron_entitlement_row;
    let st: HonestStatus = "ok";
    if (row.stale_after && new Date(row.stale_after) < new Date()) {
      st = "degraded";
    }
    nodes.push({
      id: "patron_entitlements",
      label: "Patron entitlement snapshot (diagnostic)",
      status: st,
      severity_hint: 2,
      summary:
        st === "ok"
          ? "Entitlement snapshot present; stale_after not passed (or unset)."
          : "Entitlement snapshot stale — user should have a manual verify/refresh path (product).",
      prove: { patron_entitlement_row: row },
      display: {}
    });
  } else {
    nodes.push({
      id: "patron_entitlements",
      label: "Patron entitlement snapshot",
      status: "unknown",
      severity_hint: 2,
      summary:
        "No row — pass account_id + patron membership context, or identity DB off.",
      prove: {},
      display: {}
    });
  }

  return nodes;
}
