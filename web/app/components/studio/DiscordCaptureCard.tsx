"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, MessageCircle, Trash2 } from "lucide-react";
import {
  deleteRelayLibraryStagingMedia,
  discordStagingItemsFromUnifiedLibrary,
  fetchDiscordConnection,
  fetchRelayLibraryStaging,
  mintDiscordLinkCode,
  RelayApiError,
  type DiscordConnectionData,
  type DiscordStagingItem
} from "@/lib/relay-api";
import { useStudioSession } from "@/lib/studio-session-context";

function stagingSubtitle(dc: unknown): string {
  if (!dc || typeof dc !== "object") return "";
  const o = dc as Record<string, unknown>;
  if (typeof o.message_content === "string" && o.message_content.trim()) {
    const t = o.message_content.trim();
    return t.length > 96 ? `${t.slice(0, 96)}…` : t;
  }
  return "";
}

function formatShortIso(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function DiscordCaptureCard() {
  const { creatorId } = useStudioSession();
  const [connection, setConnection] = useState<DiscordConnectionData | null>(null);
  const [staging, setStaging] = useState<DiscordStagingItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [mintCode, setMintCode] = useState<string | null>(null);
  const [mintExpires, setMintExpires] = useState<string | null>(null);
  const [mintBusy, setMintBusy] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!creatorId.trim()) return;
    setLoadError(null);
    setLoadingMeta(true);
    try {
      const [conn, unified] = await Promise.all([
        fetchDiscordConnection(creatorId.trim()),
        fetchRelayLibraryStaging(creatorId.trim())
      ]);
      setConnection(conn);
      setStaging(discordStagingItemsFromUnifiedLibrary(unified));
    } catch (e) {
      setLoadError(e instanceof RelayApiError ? e.message : String(e));
    } finally {
      setLoadingMeta(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onMint() {
    if (!creatorId.trim()) return;
    setMintError(null);
    setMintBusy(true);
    try {
      const out = await mintDiscordLinkCode(creatorId.trim());
      setMintCode(out.code);
      setMintExpires(out.expires_at);
    } catch (e) {
      setMintError(e instanceof RelayApiError ? e.message : String(e));
    } finally {
      setMintBusy(false);
    }
  }

  async function onCopyCode() {
    if (!mintCode) return;
    try {
      await navigator.clipboard.writeText(mintCode);
    } catch {
      /* ignore */
    }
  }

  async function onDelete(mediaId: string) {
    if (!creatorId.trim()) return;
    setDeletingId(mediaId);
    setLoadError(null);
    try {
      await deleteRelayLibraryStagingMedia(creatorId.trim(), mediaId);
      setStaging((prev) => prev.filter((x) => x.media_id !== mediaId));
    } catch (e) {
      setLoadError(e instanceof RelayApiError ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  if (!creatorId.trim()) {
    return (
      <section className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
        <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Discord capture</h2>
        <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
          Open your studio workspace and return here to link a Discord channel and manage staged uploads.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
      <div className="flex flex-wrap items-start gap-2">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lib-primary)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Discord capture</h2>
          <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
            Stage attachments from Discord (via the Relay bot), then publish them like any upload from{" "}
            <Link href="/new-post" className="font-medium text-[#2D6A4F] underline-offset-4 hover:underline">
              New post
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)]/40 px-3 py-2.5">
        <p className="text-[11px] font-medium text-[var(--lib-fg)]">Channel link</p>
        {loadingMeta && !connection ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-[var(--lib-fg-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : connection?.linked ? (
          <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
            Linked server <span className="font-mono text-[11px] text-[var(--lib-fg)]">…{connection.discord_guild_id?.slice(-6) ?? "?"}</span>
            {" · "}
            channel <span className="font-mono text-[11px] text-[var(--lib-fg)]">…{connection.discord_channel_id?.slice(-6) ?? "?"}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
            No channel linked yet. Mint a one-time code and run <code className="text-[11px]">/relay-link</code>{" "}
            in Discord with that code.
          </p>
        )}

        {loadError ? (
          <p className="mt-2 text-[11px] text-red-400" role="alert">
            {loadError}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onMint()}
            disabled={mintBusy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 text-xs font-medium text-[var(--lib-fg)] hover:border-[#2D6A4F]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mintBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Mint link code
          </button>
          {mintCode ? (
            <>
              <code className="rounded border border-[var(--lib-border)] bg-[var(--lib-muted)]/50 px-2 py-1 font-mono text-[11px] text-[var(--lib-fg)]">
                {mintCode}
              </code>
              <button
                type="button"
                onClick={() => void onCopyCode()}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--lib-border)] px-2 text-xs text-[var(--lib-fg)] hover:border-[#2D6A4F]/40"
                aria-label="Copy code"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </button>
            </>
          ) : null}
        </div>
        {mintExpires ? (
          <p className="mt-2 text-[10px] text-[var(--lib-fg-muted)]">
            Expires {formatShortIso(mintExpires)} — paste into Discord before it lapses.
          </p>
        ) : null}
        {mintError ? (
          <p className="mt-2 text-[11px] text-red-400" role="alert">
            {mintError}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
            Staged media ({staging.length})
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loadingMeta}
            className="text-[11px] font-medium text-[#2D6A4F] hover:underline disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {staging.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--lib-fg-muted)]">
            Nothing in staging. When the bot ingests attachments, they appear here until you publish or delete
            them.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {staging.map((item) => {
              const sub = stagingSubtitle(item.discord_capture);
              const mime = item.mime_type?.split("/").pop() ?? "file";
              return (
                <li
                  key={item.media_id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)]/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-[var(--lib-fg)]">{item.media_id}</p>
                    <p className="text-[11px] text-[var(--lib-fg-muted)]">
                      {mime} · {formatShortIso(item.ingested_at)}
                      {sub ? ` · ${sub}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/new-post?media_ids=${encodeURIComponent(item.media_id)}`}
                      className="inline-flex h-8 items-center rounded-md border border-[var(--lib-primary)]/50 bg-[var(--lib-primary)]/15 px-3 text-xs font-medium text-[var(--lib-fg)] hover:bg-[var(--lib-primary)]/25"
                    >
                      Use in new post
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onDelete(item.media_id)}
                      disabled={deletingId === item.media_id}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/30 px-2 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Remove staged media"
                    >
                      {deletingId === item.media_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Discard
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
