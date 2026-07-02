"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, RefreshCw } from "lucide-react";
import {
  fetchRelayLibraryStaging,
  RELAY_API_BASE,
  type RelayLibraryStagingItem
} from "@/lib/relay-api";

type Props = {
  creatorId: string;
  initialSelectedIds?: string[];
  onContinue: (mediaIds: string[]) => void;
  onEditStyle?: () => void;
  busy?: boolean;
};

function thumbUrl(item: RelayLibraryStagingItem): string | null {
  const pathForThumb =
    item.mime_type?.toLowerCase() === "image/gif" && item.content_url_path?.trim()
      ? item.content_url_path
      : item.mime_type?.startsWith("image/") && item.thumb_url_path?.trim()
        ? item.thumb_url_path
        : item.content_url_path;
  const p = pathForThumb?.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

export function AutopostMediaPicker({
  creatorId,
  initialSelectedIds,
  onContinue,
  onEditStyle,
  busy = false
}: Props) {
  const [items, setItems] = useState<RelayLibraryStagingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds ?? [])
  );

  const load = useCallback(async (refresh = false) => {
    if (!creatorId.trim()) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { items: rows } = await fetchRelayLibraryStaging(creatorId.trim());
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--lib-fg)]">Pick from your bin</h2>
          <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
            Choose one or more staged assets. They&apos;ll be reserved while you draft.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onEditStyle ? (
            <button
              type="button"
              onClick={onEditStyle}
              className="text-[10px] font-semibold text-[var(--lib-primary)] hover:text-[var(--lib-fg)]"
            >
              Edit Style
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-8 flex justify-center text-xs text-[var(--lib-fg-muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Loading staging bin…
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--lib-border)] py-12 text-center">
          <ImageIcon className="h-6 w-6 text-[var(--lib-fg-muted)] opacity-50" aria-hidden />
          <p className="max-w-xs text-xs text-[var(--lib-fg-muted)]">
            Nothing in your bin yet. Drop WIPs via Discord or upload from the Library Import Bay.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {items.map((item) => {
            const src = thumbUrl(item);
            const isSelected = selected.has(item.media_id);
            return (
              <button
                key={item.media_id}
                type="button"
                onClick={() => toggle(item.media_id)}
                className={[
                  "relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border-2 transition-colors",
                  isSelected
                    ? "border-[var(--lib-primary)] ring-2 ring-[var(--lib-primary)]/30"
                    : "border-[var(--lib-border)] hover:border-[var(--lib-primary)]/40"
                ].join(" ")}
                aria-pressed={isSelected}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Relay API thumb URLs
                  <img src={src} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--lib-muted)] text-[10px] text-[var(--lib-fg-muted)]">
                    {item.mime_type?.split("/")[0] ?? "media"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={busy || selectedIds.length === 0}
        onClick={() => onContinue(selectedIds)}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--lib-primary)] px-4 text-xs font-semibold text-[var(--lib-primary-fg)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Draft {selectedIds.length > 0 ? `${selectedIds.length} selected` : ""}
      </button>
    </div>
  );
}
