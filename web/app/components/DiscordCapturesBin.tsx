"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Sparkles,
  Trash2
} from "lucide-react";
import {
  deleteDiscordStagingMedia,
  fetchDiscordStaging,
  RELAY_API_BASE,
  RelayApiError,
  type DiscordStagingItem
} from "@/lib/relay-api";

function itemCaption(dc: unknown): string {
  if (!dc || typeof dc !== "object") return "";
  const o = dc as Record<string, unknown>;
  const text = typeof o.message_content === "string" ? o.message_content.trim() : "";
  if (!text) return "";
  return text.length > 88 ? `${text.slice(0, 88)}...` : text;
}

function itemKind(mime: string | null): "image" | "video" | "audio" | "file" {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  return "file";
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function absoluteRelayUrl(path: string | undefined): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

/** Matches `DiscordCaptureTile` / collection shelf tile width for horizontal shelves. */
export const LIBRARY_SHELF_TILE_CLASS = "w-[7.25rem] sm:w-[7.75rem] shrink-0";

function ShelfPlaceholderTile() {
  return (
    <div
      className={`${LIBRARY_SHELF_TILE_CLASS} overflow-hidden rounded-xl border border-white/[0.08] bg-[#090d0b]`}
      aria-hidden
    >
      <div className="aspect-square bg-gradient-to-br from-[#121c18] to-[#0a100d]" />
      <div className="min-h-[2.8rem] border-t border-white/10 bg-[#080b09]" />
      <div className="h-7 border-t border-white/10 bg-[#080b09]" />
    </div>
  );
}

export function LibraryShelfPlaceholderStrip() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <ShelfPlaceholderTile key={index} />
      ))}
    </>
  );
}

function DiscordCapturePlaceholders() {
  return <LibraryShelfPlaceholderStrip />;
}

function DiscordCaptureTile({
  item,
  selected,
  deleting,
  onToggle,
  onDelete
}: {
  item: DiscordStagingItem;
  selected: boolean;
  deleting: boolean;
  onToggle: (mediaId: string) => void;
  onDelete: (mediaId: string) => void;
}) {
  const kind = itemKind(item.mime_type);
  const src = absoluteRelayUrl(item.content_url_path);
  const caption = itemCaption(item.discord_capture);

  return (
    <div
      className={`group relative ${LIBRARY_SHELF_TILE_CLASS} overflow-hidden rounded-xl border bg-[#090d0b] shadow-sm transition ${
        selected
          ? "border-[#52b788] ring-2 ring-[#52b788]/40"
          : "border-white/[0.08] hover:border-[#52b788]/50"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(item.media_id)}
        className="block w-full text-left"
        aria-pressed={selected}
      >
        <div className="relative aspect-square overflow-hidden bg-black">
          {kind === "image" && src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
          ) : kind === "video" && src ? (
            <video
              src={src}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
              onMouseEnter={(event) => {
                event.currentTarget.currentTime = Math.min(event.currentTarget.currentTime || 0, 0.2);
                void event.currentTarget.play().catch(() => {});
              }}
              onMouseLeave={(event) => {
                event.currentTarget.pause();
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#101713] to-[#050706] text-white/70">
              <MessageCircle className="h-6 w-6 text-[#52b788]" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                {kind === "audio" ? "Audio" : "Media"}
              </span>
            </div>
          )}
          <span
            className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border text-white transition ${
              selected ? "border-[#52b788] bg-[#2d6a4f]" : "border-white/40 bg-black/50"
            }`}
            aria-hidden
          >
            {selected ? <Check className="h-3.5 w-3.5" /> : null}
          </span>
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-white/80">
            {kind}
          </span>
        </div>
        <div className="min-h-[2.8rem] border-t border-white/10 bg-[#080b09] px-2 py-1.5">
          <p className="truncate font-mono text-[9px] text-white/55">{item.media_id}</p>
          <p className="mt-0.5 truncate text-[9px] text-white/32">{caption || formatShortDate(item.ingested_at)}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onDelete(item.media_id)}
        disabled={deleting}
        className="flex h-7 w-full items-center justify-center gap-1 border-t border-white/10 bg-[#080b09] text-[9px] font-medium uppercase tracking-wide text-white/22 transition hover:bg-red-500/10 hover:text-red-200/95 group-hover:text-red-200/80 disabled:opacity-40"
      >
        {deleting ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
        Discard
      </button>
    </div>
  );
}

export function DiscordCapturesBin({
  creatorId,
  onError
}: {
  creatorId: string;
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<DiscordStagingItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const selectedCount = selectedIds.size;
  const selectedList = useMemo(() => items.filter((item) => selectedIds.has(item.media_id)), [items, selectedIds]);

  const load = useCallback(async () => {
    if (!creatorId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchDiscordStaging(creatorId.trim());
      setItems(list.items);
      setSelectedIds((prev) => new Set(list.items.filter((item) => prev.has(item.media_id)).map((item) => item.media_id)));
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : String(e);
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [creatorId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(mediaId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }
      return next;
    });
  }

  async function discard(mediaId: string) {
    if (!creatorId.trim()) return;
    setDeletingId(mediaId);
    setError(null);
    try {
      await deleteDiscordStagingMedia(creatorId.trim(), mediaId);
      setItems((prev) => prev.filter((item) => item.media_id !== mediaId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : String(e);
      setError(msg);
      onError?.(msg);
    } finally {
      setDeletingId(null);
    }
  }

  function addToNewPost() {
    if (selectedList.length === 0) return;
    // Relay mirroring hook checkpoint: this route seeds a draft from staged Discord media.
    // Future platform adapters can enqueue mirroring after the created Relay post returns.
    const ids = selectedList.map((item) => item.media_id).join(",");
    router.push(`/new-post?media_ids=${encodeURIComponent(ids)}&source=discord_capture`);
  }

  return (
    <section
      aria-labelledby="discord-captures-heading"
      className="shrink-0 border-b border-black bg-[#030604] shadow-[0_12px_30px_rgba(0,0,0,0.28)]"
    >
      <div className="mx-auto max-w-[118rem] px-4 py-3">
        <div className="rounded-2xl border border-white/[0.09] bg-[#050a08] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          {/* Single header row */}
          <div className="relative flex items-center">
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/[0.14] bg-[#0b1410] text-white/80 hover:border-[#52b788]/45 hover:text-white"
                aria-expanded={expanded}
                aria-controls="discord-captures-bin-body"
                aria-label={expanded ? "Collapse Discord captures" : "Expand Discord captures"}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <h2
                id="discord-captures-heading"
                className="select-none text-sm font-semibold tracking-tight text-white/95"
              >
                Discord Captures
              </h2>
            </div>
            {/* Right: actions */}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.14] bg-[#0b1410] px-2.5 text-[11px] font-medium uppercase tracking-wide text-white/85 hover:border-[#52b788]/45 hover:text-white disabled:opacity-50"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
                Refresh
              </button>
              {selectedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="h-8 rounded-md border border-white/[0.14] bg-[#0b1410] px-2.5 text-[11px] font-medium uppercase tracking-wide text-white/75 hover:text-white"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={addToNewPost}
                disabled={selectedCount === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#52b788]/35 bg-[#10241b] px-3 text-[11px] font-semibold uppercase tracking-wide text-white/90 hover:bg-[#183528] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-[#07100c] disabled:text-white/35"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Add {selectedCount > 0 ? selectedCount : ""} to new post
              </button>
            </div>
          </div>

          {expanded ? (
            <div id="discord-captures-bin-body" className="mt-3">
              {error ? (
                <p className="mx-auto mb-2 max-w-2xl rounded border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-center text-[12px] text-red-100" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mx-auto flex max-w-4xl gap-3 overflow-x-auto px-1 py-1.5 [scrollbar-width:thin]">
                {items.length === 0 ? (
                  <DiscordCapturePlaceholders />
                ) : (
                  items.map((item) => (
                    <DiscordCaptureTile
                      key={item.media_id}
                      item={item}
                      selected={selectedIds.has(item.media_id)}
                      deleting={deletingId === item.media_id}
                      onToggle={toggle}
                      onDelete={(mediaId) => void discard(mediaId)}
                    />
                  ))
                )}
              </div>
              {items.length === 0 ? (
                <p className="mt-1 text-center text-[11px] text-white/45">
                  Discord media will stage here before it enters your Library.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
