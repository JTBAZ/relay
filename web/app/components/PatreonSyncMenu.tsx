"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import {
  fetchPatreonSyncState,
  postPatreonScrape,
  type PatreonOAuthHealthData,
  type PatreonSyncStateData
} from "@/lib/relay-api";

type SyncPhase = "idle" | "syncing" | "error";

type Props = {
  creatorId: string;
  campaignId?: string;
  onAfterScrape: () => void | Promise<void>;
  onSyncActivity?: (phase: SyncPhase) => void;
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
  if (oauth.access_token_expired) {
    return { className: "text-[var(--lib-destructive)]", text: "Access expired — reconnect." };
  }
  if (oauth.credential_health_status === "refresh_failed") {
    return { className: "text-[var(--lib-destructive)]", text: "Token refresh failed — reconnect." };
  }
  if (oauth.access_token_expires_soon) {
    return { className: "text-[var(--lib-warning)]", text: "Token expires soon." };
  }
  return { className: "text-[var(--lib-success)]", text: "OAuth healthy." };
}

export default function PatreonSyncMenu({
  creatorId,
  campaignId,
  onAfterScrape,
  onSyncActivity
}: Props) {
  const [open, setOpen] = useState(false);
  const [loadingState, setLoadingState] = useState(false);
  const [state, setState] = useState<PatreonSyncStateData | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadState = useCallback(async () => {
    setLoadingState(true);
    setStateError(null);
    try {
      const s = await fetchPatreonSyncState(creatorId, {
        campaignId: campaignId?.trim() || undefined,
        probeUpstream: true
      });
      setState(s);
    } catch (e) {
      setState(null);
      setStateError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingState(false);
    }
  }, [creatorId, campaignId]);

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

  /** Live ingest: respects sync watermark (no force_refresh_post_access). */
  const runLiveScrape = async () => {
    setActionError(null);
    setPosting(true);
    onSyncActivity?.("syncing");
    try {
      await postPatreonScrape({
        creator_id: creatorId,
        campaign_id: campaignId?.trim() || undefined,
        dry_run: false,
        force_refresh_post_access: false,
        max_post_pages: 20
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
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
        Patreon
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[var(--lib-border)] bg-[var(--lib-card)] p-3 shadow-lg"
          role="dialog"
          aria-label="Patreon sync"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Sync state
          </p>
          {loadingState && (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading…
            </div>
          )}
          {stateError && (
            <p className="mt-2 text-xs text-[var(--lib-destructive)]">{stateError}</p>
          )}
          {state && !loadingState && (
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
                  {state.likely_has_newer_posts && (
                    <p className="rounded-md border border-[var(--lib-warning)]/40 bg-[var(--lib-warning)]/10 px-2 py-1.5 text-[11px] text-[var(--lib-fg)]">
                      Patreon may have posts newer than your last sync — run{" "}
                      <strong>Live scrape</strong> below.
                    </p>
                  )}
                </dl>
              )}

              {state && !loadingState && (
                <div className="mt-3 rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)]/20 px-2 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
                    Connection
                  </p>
                  <p
                    className={`mt-1.5 text-xs font-medium ${oauthLine(state.oauth).className}`}
                  >
                    {oauthLine(state.oauth).text}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">
                    Token expires {fmtIso(state.oauth.access_token_expires_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <Link
                      href="/patreon/connect"
                      className="text-[var(--lib-primary)] underline-offset-2 hover:underline"
                    >
                      Creator OAuth
                    </Link>
                    <Link
                      href="/patreon/cookie"
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
                  </div>
                </div>
              )}

              <div className="mt-3 border-t border-[var(--lib-border)] pt-3">
                <button
                  type="button"
                  disabled={Boolean(loadingState || stateError || posting)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--lib-primary)] px-3 py-2.5 text-xs font-medium text-[var(--lib-primary-fg)] disabled:opacity-50"
                  onClick={() => void runLiveScrape()}
                >
                  {posting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                  ) : null}
                  Live scrape
                </button>
                <p className="mt-2 text-[10px] leading-snug text-[var(--lib-fg-muted)]">
                  Pulls new posts from Patreon and applies them to your library. Respects your
                  saved sync watermark (only fetches posts newer than your last successful sync).
                </p>
              </div>
          {actionError && (
            <p className="mt-2 text-xs text-[var(--lib-destructive)]">{actionError}</p>
          )}
        </div>
      )}
    </div>
  );
}
