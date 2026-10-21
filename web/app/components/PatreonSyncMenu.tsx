"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { patreonScrapePreset, PATREON_SYNC_POST_ACCESS_MAX_PAGES } from "@/lib/patreon-scrape-presets";
import {
  fetchPatreonSyncState,
  formatSyncHealthRollupBanner,
  patreonOAuthReconnectNeeded,
  postPatreonScrape,
  postPatreonSyncMembers,
  postPatreonSyncPostAccess,
  postPatreonRepair,
  registerPatreonWebhooks,
  type PatreonOAuthHealthData,
  type PatreonRepairTargetData,
  type PatreonSyncStateData
} from "@/lib/relay-api";

type SyncPhase = "idle" | "syncing" | "error";
const verificationSources: Record<string, string> = { targeted: "post refresh", reconciliation: "scheduled recheck", access_only: "tier access update", catchup: "post scan" };

type Props = {
  creatorId: string;
  campaignId?: string;
  onAfterScrape: () => void | Promise<void>;
  onSyncActivity?: (phase: SyncPhase) => void;
  /** Increment (e.g. from SyncHealthBanner) to open the menu and refresh sync state. */
  detailsSignal?: number;
  /** Trigger button label (default Patreon). Lab hotbar uses “Patreon Health”. */
  triggerLabel?: string;
};

function fmtIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function oauthLine(oauth: PatreonOAuthHealthData): { className: string; text: string } {
  if (oauth.availability === "unavailable") return { className: "text-[var(--lib-warning)]", text: "OAuth unavailable. Reconnect Patreon." };
  if (oauth.access_token_expired) {
    return { className: "text-[var(--lib-destructive)]", text: "Access expired — reconnect." };
  }
  if (oauth.credential_health_status === "refresh_failed") {
    return { className: "text-[var(--lib-destructive)]", text: "Token refresh failed — reconnect." };
  }
  if (oauth.access_token_expires_soon) {
    return { className: "text-[var(--lib-warning)]", text: "Token expires soon." };
  }
  return { className: "text-[var(--lib-success)]", text: "Token has not expired locally." };
}

function syncHealthLine(
  s: PatreonSyncStateData
): { className: string; text: string } {
  const sh = s.sync_health;
  if (sh.status === "healthy") {
    return { className: "text-[var(--lib-success)]", text: "Sync health: healthy." };
  }
  if (sh.status === "degraded") {
    return {
      className: "text-[var(--lib-warning)]",
      text: formatSyncHealthRollupBanner(s)
    };
  }
  if (sh.status === "failed") {
    return {
      className: "text-[var(--lib-destructive)]",
      text: formatSyncHealthRollupBanner(s)
    };
  }
  return {
    className: "text-[var(--lib-fg-muted)]",
    text: "Sync health not recorded yet — check for new posts when ready."
  };
}

function webhookRegistrationLine(
  w: PatreonSyncStateData["webhook_registration"]
): { className: string; text: string } | null {
  if (!w) return null;
  if (w.registration_status === "ok") {
    return { className: "text-[var(--lib-success)]", text: "Patreon webhooks registered." };
  }
  if (w.registration_status === "skipped_no_public_url") {
    return {
      className: "text-[var(--lib-fg-muted)]",
      text: "Webhooks skipped — set RELAY_PUBLIC_WEBHOOK_BASE_URL on the API host."
    };
  }
  return {
    className: "text-[var(--lib-destructive)]",
    text: w.last_registration_error
      ? `Webhook registration failed: ${w.last_registration_error}`
      : "Webhook registration failed."
  };
}

function cookieSessionLine(
  s: PatreonSyncStateData
): { className: string; text: string } | null {
  if (s.cookie_session_status === "expired_local") {
    return {
      className: "text-[var(--lib-warning)]",
      text: "Session key expired — re-enter to restore full media sync."
    };
  }
  if (s.cookie_session_status === "rejected_remote") {
    return {
      className: "text-[var(--lib-destructive)]",
      text: "Session key was rejected by Patreon and removed. Re-enter to restore."
    };
  }
  return null;
}

export default function PatreonSyncMenu({
  creatorId,
  campaignId,
  onAfterScrape,
  onSyncActivity,
  detailsSignal,
  triggerLabel = "Patreon"
}: Props) {
  const [open, setOpen] = useState(false);
  const [loadingState, setLoadingState] = useState(false);
  const [state, setState] = useState<PatreonSyncStateData | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [registeringWebhooks, setRegisteringWebhooks] = useState(false);
  const [webhookRegisterError, setWebhookRegisterError] = useState<string | null>(null);
  const [webhookRegisterOk, setWebhookRegisterOk] = useState<string | null>(null);
  const [syncingMembers, setSyncingMembers] = useState(false);
  const [memberSyncError, setMemberSyncError] = useState<string | null>(null);
  const [memberSyncOk, setMemberSyncOk] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const statusRefreshRef = useRef<HTMLButtonElement>(null);
  const binding = `${creatorId}\0${campaignId ?? ""}`;
  const currentBinding = useRef(binding);
  currentBinding.current = binding;
  const readGeneration = useRef(0);
  const repairInFlight = useRef(false);
  const repairFocusBinding = useRef<string | null>(null);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  const panelId = "patreon-sync-menu-panel";

  const loadState = useCallback(async () => {
    if (currentBinding.current !== binding) return;
    const generation = ++readGeneration.current;
    setLoadingState(true);
    setStateError(null);
    try {
      const s = await fetchPatreonSyncState(creatorId, {
        campaignId: campaignId?.trim() || undefined,
        probeUpstream: false
      });
      if (generation === readGeneration.current) setState(s);
    } catch (e) {
      if (generation === readGeneration.current) setStateError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === readGeneration.current) setLoadingState(false);
    }
  }, [creatorId, campaignId, binding]);

  useEffect(() => { const requests = readGeneration; setState(null); setRepairMessage(null); return () => { requests.current++; }; }, [creatorId, campaignId]);

  useEffect(() => {
    if (repairFocusBinding.current !== binding || repairing !== null || loadingState) return;
    repairFocusBinding.current = null;
    statusRefreshRef.current?.focus();
  }, [binding, repairing, loadingState]);

  const prevDetailsSignal = useRef(0);
  useEffect(() => {
    const sig = typeof detailsSignal === "number" ? detailsSignal : 0;
    if (sig <= prevDetailsSignal.current) return;
    prevDetailsSignal.current = sig;
    setOpen(true);
    setActionError(null);
    void loadState();
  }, [detailsSignal, loadState]);

  useEffect(() => {
    if (!open) return;
    void loadState();
  }, [open, loadState]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const runScrape = async (opts: {
    force_refresh_post_access: boolean;
    max_post_pages: number;
  }) => {
    setActionError(null);
    setPosting(true);
    onSyncActivity?.("syncing");
    try {
      await postPatreonScrape({
        creator_id: creatorId,
        campaign_id: campaignId?.trim() || undefined,
        dry_run: false,
        force_refresh_post_access: opts.force_refresh_post_access,
        max_post_pages: opts.max_post_pages
      });
      setOpen(false);
      await onAfterScrape();
      onSyncActivity?.("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
      onSyncActivity?.("error");
    } finally {
      setPosting(false);
    }
  };

  const runLiveScrape = () => void runScrape(patreonScrapePreset("live"));

  const runFullRescrape = () => {
    if (
      !window.confirm(
        "This may take several minutes and re-process your whole Patreon catalog. Continue?"
      )
    ) {
      return;
    }
    void runScrape(patreonScrapePreset("full_rescrape"));
  };

  /** OAuth metadata diff — tier gates only, no media scrape or full ingest. */
  const runTierAccessResync = async () => {
    setActionError(null);
    setPosting(true);
    onSyncActivity?.("syncing");
    try {
      await postPatreonSyncPostAccess({
        creator_id: creatorId,
        campaign_id: campaignId?.trim() || undefined,
        max_post_pages: PATREON_SYNC_POST_ACCESS_MAX_PAGES
      });
      setOpen(false);
      await onAfterScrape();
      onSyncActivity?.("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(msg);
      onSyncActivity?.("error");
    } finally {
      setPosting(false);
    }
  };

  const runRegisterWebhooks = async () => {
    setWebhookRegisterError(null);
    setWebhookRegisterOk(null);
    setRegisteringWebhooks(true);
    try {
      const out = await registerPatreonWebhooks(creatorId);
      setWebhookRegisterOk(`Registered — webhook ${out.webhook_id.slice(0, 8)}…`);
      await loadState();
    } catch (e) {
      setWebhookRegisterError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegisteringWebhooks(false);
    }
  };

  const runSyncMembers = async () => {
    setMemberSyncError(null);
    setMemberSyncOk(null);
    setSyncingMembers(true);
    onSyncActivity?.("syncing");
    try {
      const out = await postPatreonSyncMembers({
        creator_id: creatorId,
        campaign_id: campaignId?.trim() || undefined
      });
      setMemberSyncOk(`Accepted ${out.members_synced} member observation(s). Saved coverage shows scan progress.`);
      await loadState();
      onSyncActivity?.("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMemberSyncError(msg);
      onSyncActivity?.("error");
    } finally {
      setSyncingMembers(false);
    }
  };

  const runRepair = async (target: PatreonRepairTargetData) => {
    if (repairInFlight.current) return;
    repairInFlight.current = true; setRepairing(target.resource_id); setRepairMessage(null); setActionError(null);
    try {
      await postPatreonRepair({ creator_id: creatorId, ...target });
      if (currentBinding.current !== binding) return;
      setRepairMessage("Repair accepted. Existing backoff still applies; completion appears after the worker verifies this item.");
      await loadState();
    } catch (error) { if (currentBinding.current === binding) setActionError(error instanceof Error ? error.message : String(error)); }
    finally { repairInFlight.current = false; if (currentBinding.current === binding) repairFocusBinding.current = binding; setRepairing(null); }
  };

  /**
   * Always show the register/re-register button so the user can sync webhooks after
   * re-connecting OAuth. When status is already "ok", label it "Re-register".
   */
  const webhookRegistered =
    state?.webhook_registration?.registration_status === "ok";

  const showReconnectCta = patreonOAuthReconnectNeeded(state, [
    stateError,
    actionError,
    memberSyncError,
    webhookRegisterError
  ]);

  const reconnectPatreonCta = showReconnectCta ? (
    <div className="mt-2">
      <Link
        href="/connect/patreon/connect"
        className="flex w-full items-center justify-center rounded-md bg-[var(--lib-destructive)] px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
      >
        Reconnect Patreon
      </Link>
      <p className="mt-1.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
        Sync actions need a valid creator OAuth session. Reconnect, then retry scrape or
        re-register webhooks.
      </p>
    </div>
  ) : null;

  const webhookRegisterControls = state != null ? (
    <div className="mt-2">
      <button
        type="button"
        disabled={registeringWebhooks || Boolean(loadingState || stateError)}
        className="w-full rounded-md border border-[var(--lib-primary)]/50 bg-[var(--lib-primary)]/15 px-2 py-1.5 text-[11px] font-medium text-[var(--lib-primary)] transition-colors hover:bg-[var(--lib-primary)]/25 disabled:opacity-50"
        onClick={() => void runRegisterWebhooks()}
      >
        {registeringWebhooks ? (
          <span className="inline-flex items-center justify-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Registering…
          </span>
        ) : webhookRegistered ? (
          "Re-register webhooks"
        ) : (
          "Register webhooks"
        )}
      </button>
      {webhookRegisterOk && (
        <p className="mt-1.5 text-[11px] text-[var(--lib-success)]">{webhookRegisterOk}</p>
      )}
      {webhookRegisterError && (
        <p className="mt-1.5 text-[11px] text-[var(--lib-destructive)]">{webhookRegisterError}</p>
      )}
    </div>
  ) : null;

  return (
    <div className="relative" ref={rootRef} onKeyDown={(event) => { if (open && event.key === "Escape") { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); } }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          setActionError(null);
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/55"
        title="Patreon: connection status and live scrape from Patreon"
      >
        {posting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--lib-primary)]" aria-hidden />
        ) : (
          <CloudDownload className="h-3.5 w-3.5 text-[var(--lib-primary)]" aria-hidden />
        )}
        {triggerLabel}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-50 mt-1 max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain break-words rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] p-3 shadow-lg"
          role="dialog"
          aria-label="Patreon sync"
        >
          <div className="mb-2 flex justify-end"><button type="button" className="rounded px-2 py-1 text-xs text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lib-primary)]" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Close</button></div>
          <p className="text-[11px] leading-snug text-[var(--lib-fg-muted)]">
            Pulls from Patreon into your Library. What you curate here (visibility, collections)
            controls what visitors see on your public page — layout is in Designer.
          </p>
          <button ref={statusRefreshRef} type="button" disabled={loadingState} className="mt-2 rounded border border-[var(--lib-border)] px-2 py-1 text-[11px] text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lib-primary)]" onClick={() => void loadState()}>Refresh saved status</button>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Sync state
          </p>
          {loadingState && (
            <div role="status" className="mt-2 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading…
            </div>
          )}
          {stateError && (
            <p role="alert" className="mt-2 text-xs text-[var(--lib-destructive)]">{stateError} {state && "Showing the previous saved status."}</p>
          )}
          {!state && !loadingState && reconnectPatreonCta}
          {state && (
            <dl className="mt-2 space-y-1.5 text-xs text-[var(--lib-fg)]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--lib-fg-muted)]">Campaign</dt>
                    <dd className="truncate font-mono text-[10px]">{state.patreon_campaign_id}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--lib-fg-muted)]">Last synced post time</dt>
                    <dd className="text-right">{fmtIso(state.watermark_published_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--lib-fg-muted)]">Watermark saved</dt>
                    <dd className="text-right">{fmtIso(state.watermark_updated_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--lib-fg-muted)]">Cookie session</dt>
                    <dd>{state.has_cookie_session ? "Yes" : "No"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--lib-fg-muted)]">Saved upstream check</dt>
                    <dd className="text-right">{fmtIso(state.upstream_probe?.observed_at)}</dd>
                  </div>
                  {state.likely_has_newer_posts && (
                    <p className="rounded-md border border-[var(--lib-warning)]/40 bg-[var(--lib-warning)]/10 px-2 py-1.5 text-[11px] text-[var(--lib-fg)]">
                      Patreon may have posts newer than your last sync — use{" "}
                      <strong>Check for new posts</strong> below.
                    </p>
                  )}
                </dl>
              )}

              {state?.completeness && (
                <section className="mt-3 border-t border-[var(--lib-border)] pt-2" aria-label="Saved Patreon coverage">
                  <p className="text-xs font-medium text-[var(--lib-fg)]">Saved coverage</p>
                  <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">Status read {fmtIso(state.server_checked_at)}. Opening this menu does not contact Patreon.</p>
                  <dl className="mt-2 space-y-3 text-[11px]">
                    {([["archive", "Archive"], ["posts_access", "Posts and access"], ["members", "Members"], ["media", "Media"]] as const).map(([key, label]) => {
                      const item = state.completeness![key];
                      return <div key={key}>
                        <dt className="font-medium text-[var(--lib-fg)]">{label}: {item.status}</dt>
                        <dd className="mt-0.5 text-[var(--lib-fg-muted)]">
                          <p>Verified {fmtIso(item.last_verified_at)}{item.scope === "bounded" ? " · bounded scope" : ""}</p>
                          {item.sources?.length ? <p>Source: {item.sources.map((source) => verificationSources[source] ?? "saved verification").join(", ")}</p> : null}
                          {item.last_attempt_at && <p>Last attempt {fmtIso(item.last_attempt_at)}</p>}
                          <p>{item.counts ? Object.entries(item.counts).map(([name, count]) => `${name.replaceAll("_", " ")}: ${count}`).join(" · ") : "Counts unavailable."}</p>
                          {item.next_action === "sync_members" && <p>Use Update patron list below.</p>}
                          {item.next_action === "continue_sync" && <p>Use Check for new posts below to continue bounded work.</p>}
                          {item.next_action === "retry_change" && !item.repairs?.length && <p>A current repair target is unavailable. Check the connection, then continue post sync.</p>}
                          {item.repairs?.map((target) => <div key={`${target.kind}:${target.resource_id}`} className="mt-1">
                            <button type="button" disabled={repairing !== null || loadingState} className="min-w-0 max-w-full whitespace-normal rounded border border-[var(--lib-border)] px-2 py-1 text-left text-[var(--lib-fg)] hover:border-[var(--lib-primary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lib-primary)]" onClick={() => void runRepair(target)}>{repairing === target.resource_id ? "Scheduling…" : <>Retry {target.kind} <span className="break-all">{target.resource_id}</span></>}</button>
                          </div>)}
                        </dd>
                      </div>;
                    })}
                  </dl>
                  {repairMessage && <p role="status" className="mt-2 text-xs text-[var(--lib-fg)]">{repairMessage}</p>}
                </section>
              )}

              {state && !loadingState && (
                <div className="mt-3 rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)]/20 px-2 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                    Connection
                  </p>
                  {(() => {
                    const sh = syncHealthLine(state);
                    return (
                      <p className={`mt-1.5 text-xs font-medium ${sh.className}`}>{sh.text}</p>
                    );
                  })()}
                  {state.sync_health.last_success_at && (
                    <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                      Last successful sync {fmtIso(state.sync_health.last_success_at)}
                    </p>
                  )}
                  {state.public_webhook_base_configured === false && (
                    <p className="mt-1.5 text-[11px] text-[var(--lib-warning)]/95">
                      API host has no public webhook URL — set RELAY_PUBLIC_WEBHOOK_BASE_URL on the
                      Relay API, then register webhooks below.
                    </p>
                  )}
                  {(() => {
                    const oauth = oauthLine(state.oauth);
                    return (
                  <p
                    className={`mt-1.5 text-xs font-medium ${oauth.className}`}
                  >
                    {oauth.text}
                  </p>
                    );
                  })()}
                  <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                    Token expires {fmtIso(state.oauth.access_token_expires_at)}
                  </p>
                  {reconnectPatreonCta}
                  {(() => {
                    const line = cookieSessionLine(state);
                    if (!line) return null;
                    return (
                      <p className={`mt-2 text-xs font-medium ${line.className}`}>
                        {line.text}{" "}
                        <Link
                          href="/connect/creator"
                          className="font-normal text-[var(--lib-primary)] underline-offset-2 hover:underline"
                        >
                          Creator Connect
                        </Link>
                      </p>
                    );
                  })()}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    {!showReconnectCta && (
                      <Link
                        href="/connect/patreon/connect"
                        className="text-[var(--lib-primary)] underline-offset-2 hover:underline"
                      >
                        Creator OAuth
                      </Link>
                    )}
                    <Link
                      href="/connect/patreon/cookie"
                      className="text-[var(--lib-primary)] underline-offset-2 hover:underline"
                    >
                      Patreon cookie
                    </Link>
                  </div>

                  <div className="mt-3 border-t border-[var(--lib-border)] pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                      Last post scrape
                    </p>
                    {state.last_post_scrape ? (
                      <div className="mt-1 space-y-1 text-[11px] text-[var(--lib-fg)]">
                        <p>
                          {fmtIso(state.last_post_scrape.finished_at)} —{" "}
                          {state.last_post_scrape.ok ? (
                            <span className="text-[var(--lib-success)]">OK</span>
                          ) : (
                            <span className="text-[var(--lib-destructive)]">Failed</span>
                          )}
                        </p>
                        {state.last_post_scrape.ok &&
                          (state.last_post_scrape.posts_fetched !== undefined ||
                            state.last_post_scrape.posts_written !== undefined) && (
                            <p className="text-[var(--lib-fg-muted)]">
                              Fetched {state.last_post_scrape.posts_fetched ?? "—"} · wrote{" "}
                              {state.last_post_scrape.posts_written ?? "—"}
                            </p>
                          )}
                        {!state.last_post_scrape.ok && state.last_post_scrape.error && (
                          <p className="text-[var(--lib-fg)]">{state.last_post_scrape.error.hint}</p>
                        )}
                        {state.last_post_scrape.warning_snippets &&
                          state.last_post_scrape.warning_snippets.length > 0 && (
                            <ul className="list-inside list-disc text-[10px] text-[var(--lib-fg-muted)]">
                              {state.last_post_scrape.warning_snippets.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">Not recorded yet.</p>
                    )}
                  </div>

                  <div className="mt-2 border-t border-[var(--lib-border)] pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                      Last member sync
                    </p>
                    {state.last_member_sync ? (
                      <div className="mt-1 space-y-1 text-[11px] text-[var(--lib-fg)]">
                        <p>
                          {fmtIso(state.last_member_sync.finished_at)} —{" "}
                          {state.last_member_sync.ok ? (
                            <span className="text-[var(--lib-success)]">OK</span>
                          ) : (
                            <span className="text-[var(--lib-destructive)]">Failed</span>
                          )}
                        </p>
                        {state.last_member_sync.ok &&
                          state.last_member_sync.members_synced !== undefined && (
                            <p className="text-[var(--lib-fg-muted)]">
                              {state.last_member_sync.members_synced} member(s)
                            </p>
                          )}
                        {!state.last_member_sync.ok && state.last_member_sync.error && (
                          <p className="text-[var(--lib-fg)]">{state.last_member_sync.error.hint}</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">Not recorded yet.</p>
                    )}
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={Boolean(
                          loadingState || stateError || syncingMembers || posting
                        )}
                        className="w-full rounded-md border border-[var(--lib-primary)]/50 bg-[var(--lib-primary)]/15 px-2 py-1.5 text-[11px] font-medium text-[var(--lib-primary)] transition-colors hover:bg-[var(--lib-primary)]/25 disabled:opacity-50"
                        onClick={() => void runSyncMembers()}
                      >
                        {syncingMembers ? (
                          <span className="inline-flex items-center justify-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            Updating patron list…
                          </span>
                        ) : (
                          "Update patron list"
                        )}
                      </button>
                      <p className="mt-1.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                        Refreshes who is pledged on Patreon (for your stats). Does not change what
                        fans see in their feeds.
                      </p>
                      {memberSyncOk && (
                        <p className="mt-1.5 text-[11px] text-[var(--lib-success)]">{memberSyncOk}</p>
                      )}
                      {memberSyncError && (
                        <p className="mt-1.5 text-[11px] text-[var(--lib-destructive)]">
                          {memberSyncError}
                        </p>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const wh = webhookRegistrationLine(state.webhook_registration);
                    const whUpdatedAt = state.webhook_registration?.updated_at;
                    return (
                      <div className="mt-2 border-t border-[var(--lib-border)] pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                          Patreon webhooks
                        </p>
                        {wh ? (
                          <p className={`mt-1 text-[11px] font-medium ${wh.className}`}>{wh.text}</p>
                        ) : (
                          <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">
                            No registration data yet. Register below to receive real-time Patreon events.
                          </p>
                        )}
                        {whUpdatedAt && (
                          <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                            Last registered {fmtIso(whUpdatedAt)}
                          </p>
                        )}
                        {webhookRegistered && (
                          <p className="mt-1 text-[10px] text-[var(--lib-warning)]/90">
                            After reconnecting Patreon OAuth, re-register webhooks so Patreon delivers events to the new token.
                          </p>
                        )}
                        {webhookRegisterControls}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="mt-3 border-t border-[var(--lib-border)] pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                  Keep my gallery up to date
                </p>
                <button
                  type="button"
                  disabled={Boolean(loadingState || stateError || posting)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--lib-primary)] px-3 py-2.5 text-xs font-medium text-[var(--lib-primary-fg)] disabled:opacity-50"
                  onClick={runLiveScrape}
                >
                  {posting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                  ) : null}
                  Check for new posts
                </button>
                <p className="mt-1.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                  Pull in anything published on Patreon since your last sync.
                </p>

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                  When access looks wrong
                </p>
                <button
                  type="button"
                  disabled={Boolean(loadingState || stateError || posting)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--lib-primary)]/40 bg-[var(--lib-primary)]/10 px-3 py-2 text-xs font-medium text-[var(--lib-primary)] transition-colors hover:bg-[var(--lib-primary)]/20 disabled:opacity-50"
                  onClick={runTierAccessResync}
                >
                  Update Tier Access
                </button>
                <p className="mt-1.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                  Compares Patreon tier settings via OAuth and updates only posts whose access changed — no media re-download.
                </p>

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                  When a lot looks broken
                </p>
                <button
                  type="button"
                  disabled={Boolean(loadingState || stateError || posting)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)]/30 px-3 py-2 text-xs font-medium text-[var(--lib-fg)] transition-colors hover:border-[var(--lib-primary)]/45 disabled:opacity-50"
                  onClick={runFullRescrape}
                >
                  Refresh everything from Patreon
                </button>
                <p className="mt-1.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                  Re-download your full library. Use if something looks very wrong. (Slower.)
                </p>
                <p className="mt-2 rounded-md border border-[var(--lib-warning)]/30 bg-[var(--lib-warning)]/8 px-2 py-1.5 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                  <strong className="text-[var(--lib-fg)]">Blurry images?</strong> Patreon bakes a
                  blur into cover thumbnails for patron-only posts. Try{" "}
                  <strong className="text-[var(--lib-fg)]">Refresh everything from Patreon</strong>{" "}
                  after reconnecting your Patreon session cookie — if images remain blurred, the CDN
                  URL Patreon is generating contains the blur transform and the post may need to be
                  re-uploaded on Patreon.
                </p>
              </div>
          {actionError && (
            <div className="mt-2 space-y-1.5">
              <p role="alert" className="text-xs text-[var(--lib-destructive)]">{actionError}</p>
              {showReconnectCta && (
                <Link
                  href="/connect/patreon/connect"
                  className="inline-flex text-xs font-medium text-[var(--lib-primary)] underline-offset-2 hover:underline"
                >
                  Reconnect Patreon
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
