"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  FileText,
  Film,
  Hash,
  ImageIcon,
  Link2,
  Music,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  deleteDiscordStagingMedia,
  fetchDiscordStaging,
  RELAY_API_BASE,
  RelayApiError,
  type DiscordStagingItem
} from "@/lib/relay-api";
import LibrarySectionEyebrow from "./LibrarySectionEyebrow";

export type ImportSource = "discord" | "upload" | "url";

export type ImportBinItem = {
  id: string;
  src: string | null;
  mimeType: string;
  filename: string;
  timestamp: Date;
  source: ImportSource;
};

type Props = {
  creatorId: string;
  onError?: (message: string) => void;
  /** After beam animation: pass selected Discord-staged items into compose modal (parent owns navigation). */
  onAddToNewPost?: (items: ImportBinItem[]) => void;
};

function itemCaption(dc: unknown): string {
  if (!dc || typeof dc !== "object") return "";
  const o = dc as Record<string, unknown>;
  const text = typeof o.message_content === "string" ? o.message_content.trim() : "";
  if (!text) return "";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function absoluteRelayUrl(path: string | undefined): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

function stagingToBinItem(item: DiscordStagingItem): ImportBinItem {
  const cap = itemCaption(item.discord_capture);
  return {
    id: item.media_id,
    src: absoluteRelayUrl(item.content_url_path),
    mimeType: item.mime_type || "application/octet-stream",
    filename: cap || item.media_id.slice(0, 14) + (item.media_id.length > 14 ? "…" : ""),
    timestamp: new Date(item.ingested_at),
    source: "discord"
  };
}

function mediaBadgeLabel(mimeType: string) {
  if (mimeType.startsWith("video/")) return { label: "VIDEO", icon: Film };
  if (mimeType.startsWith("audio/")) return { label: "AUDIO", icon: Music };
  if (mimeType.startsWith("text/")) return { label: "TEXT", icon: FileText };
  return { label: "IMAGE", icon: ImageIcon };
}

function formatTimestamp(d: Date) {
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const SOURCE_TABS: { id: ImportSource; label: string; icon: React.ElementType }[] = [
  { id: "discord", label: "Discord", icon: Hash },
  { id: "upload", label: "Upload Files", icon: Upload },
  { id: "url", label: "URL", icon: Link2 }
];

function MediaTypeBadge({ mimeType }: { mimeType: string }) {
  const { label, icon: Icon } = mediaBadgeLabel(mimeType);
  return (
    <div className="flex items-center gap-0.5 rounded border border-white/10 bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
      <Icon className="h-2.5 w-2.5 text-white/70" aria-hidden />
      <span className="ml-0.5 text-[9px] font-bold tracking-widest text-white/70">{label}</span>
    </div>
  );
}

function BinCard({
  item,
  selected,
  onToggle,
  onDiscard,
  beaming
}: {
  item: ImportBinItem;
  selected: boolean;
  onToggle: () => void;
  onDiscard: () => void;
  beaming?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        transition: beaming ? "opacity 0.5s ease, transform 0.5s ease" : undefined,
        opacity: beaming ? 0 : 1,
        transform: beaming ? "translateY(32px) scale(0.88)" : "none"
      }}
      className={`group/card relative w-40 shrink-0 cursor-pointer select-none overflow-hidden rounded-2xl transition-all duration-200 ${
        selected
          ? "shadow-lg shadow-[color-mix(in_srgb,var(--lib-primary)_20%,transparent)] ring-2 ring-[var(--lib-primary)] ring-offset-2 ring-offset-transparent"
          : "ring-1 ring-white/[0.08] hover:ring-white/20"
      } bg-[var(--lib-card)]`}
    >
      <div className="relative h-32 overflow-hidden bg-black">
        {item.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- relay URLs / data URLs / remote paste
          <img
            src={item.src}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--lib-muted)]">
            <ImageIcon className="h-7 w-7 text-[var(--lib-fg-muted)]" aria-hidden />
          </div>
        )}
        {selected ? <div className="pointer-events-none absolute inset-0 bg-[var(--lib-primary)]/10" /> : null}
        <div
          className={`absolute left-2 top-2 z-10 transition-all duration-150 ${
            selected ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
        >
          <CheckCircle2 className="h-5 w-5 fill-[var(--lib-primary)] text-[var(--lib-primary)] drop-shadow-md" aria-hidden />
        </div>
        <div className="absolute right-2 top-2 z-10">
          <MediaTypeBadge mimeType={item.mimeType} />
        </div>
      </div>

      <div className="px-2.5 pb-1 pt-2">
        <p className="truncate text-[10px] font-semibold text-[var(--lib-fg)]">{item.filename}</p>
        <p className="mt-0.5 text-[9px] tabular-nums text-[var(--lib-fg-muted)]">{formatTimestamp(item.timestamp)}</p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDiscard();
        }}
        className="flex w-full items-center justify-center gap-1 border-t border-white/[0.06] py-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--lib-fg-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
      >
        <Trash2 className="h-2.5 w-2.5" aria-hidden />
        Discard
      </button>
    </div>
  );
}

function DiscordStagingNote() {
  return (
    <p className="text-[11px] leading-relaxed text-[var(--lib-fg-muted)]">
      Media from your Discord capture bot appears here as <span className="text-[var(--lib-fg)]">staged</span> assets.
      Discard removes staging only; composing sends selected items into a new Relay post.
    </p>
  );
}

function UploadZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      className={`flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all duration-200 ${
        dragging
          ? "border-[var(--lib-primary)] bg-[color-mix(in_srgb,var(--lib-primary)_8%,transparent)]"
          : "border-[var(--lib-border)] hover:border-[color-mix(in_srgb,var(--lib-primary)_45%,var(--lib-border))] hover:bg-[var(--lib-muted)]/30"
      }`}
    >
      <Upload className={`h-[22px] w-[22px] ${dragging ? "text-[var(--lib-primary)]" : "text-[var(--lib-fg-muted)]"}`} aria-hidden />
      <div className="text-center">
        <p className="text-[12px] font-semibold text-[var(--lib-fg)]">
          Drop files here or <span className="text-[var(--lib-primary)]">browse</span>
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--lib-fg-muted)]">Preview only here — wire to Relay upload in a later phase.</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function URLInput({ onAdd }: { onAdd: (url: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 transition-all focus-within:ring-1 focus-within:ring-[var(--lib-primary)]">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--lib-fg-muted)]" aria-hidden />
        <input
          type="url"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Paste a media URL and press Enter…"
          className="flex-1 bg-transparent text-[12px] text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && val.trim()) {
              onAdd(val.trim());
              setVal("");
            }
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          if (val.trim()) {
            onAdd(val.trim());
            setVal("");
          }
        }}
        disabled={!val.trim()}
        className="rounded-xl border border-[var(--lib-primary)]/40 px-3 py-2 text-[11px] font-semibold text-[var(--lib-primary)] transition-all hover:bg-[color-mix(in_srgb,var(--lib-primary)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-30"
      >
        Add
      </button>
    </div>
  );
}

export default function LibraryImportBay({ creatorId, onError, onAddToNewPost }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<ImportBinItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeSource, setActiveSource] = useState<ImportSource>("discord");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [beamingIds, setBeamingIds] = useState<Set<string>>(() => new Set());
  const [beamActive, setBeamActive] = useState(false);

  const loadDiscord = useCallback(async () => {
    if (!creatorId.trim()) return;
    setLoading(true);
    try {
      const list = await fetchDiscordStaging(creatorId.trim());
      const mapped = list.items.map(stagingToBinItem);
      setItems((prev) => {
        const local = prev.filter((it) => it.source !== "discord");
        const nextItems = [...mapped, ...local];
        const validIds = new Set(nextItems.map((it) => it.id));
        setSelectedIds((selPrev) => new Set(Array.from(selPrev).filter((id) => validIds.has(id))));
        return nextItems;
      });
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : String(e);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [creatorId, onError]);

  useEffect(() => {
    void loadDiscord();
  }, [loadDiscord]);

  const selectedItems = useMemo(() => items.filter((it) => selectedIds.has(it.id)), [items, selectedIds]);
  const selectedCount = selectedItems.length;
  const selectedDiscordItems = useMemo(() => selectedItems.filter((it) => it.source === "discord"), [selectedItems]);
  const canComposeToPost = selectedDiscordItems.length > 0;

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const handleDiscard = useCallback(
    async (id: string) => {
      const item = items.find((it) => it.id === id);
      if (!item) return;
      if (item.source === "discord") {
        if (!creatorId.trim()) return;
        try {
          await deleteDiscordStagingMedia(creatorId.trim(), id);
          setItems((prev) => prev.filter((it) => it.id !== id));
          setSelectedIds((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        } catch (e) {
          const msg = e instanceof RelayApiError ? e.message : String(e);
          onError?.(msg);
        }
      } else {
        setItems((prev) => prev.filter((it) => it.id !== id));
        setSelectedIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    },
    [creatorId, items, onError]
  );

  const handleRefresh = useCallback(async () => {
    if (activeSource !== "discord") return;
    setRefreshing(true);
    try {
      await loadDiscord();
    } finally {
      setRefreshing(false);
    }
  }, [activeSource, loadDiscord]);

  const handleFiles = useCallback((files: File[]) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setItems((prev) => [
          {
            id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            src: ev.target?.result as string,
            mimeType: file.type || "application/octet-stream",
            filename: file.name,
            timestamp: new Date(),
            source: "upload"
          },
          ...prev
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleAddURL = useCallback((url: string) => {
    setItems((prev) => [
      {
        id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        src: url,
        mimeType: "image/jpeg",
        filename: url.split("/").pop() || "media",
        timestamp: new Date(),
        source: "url"
      },
      ...prev
    ]);
  }, []);

  const handleAddToNewPost = useCallback(() => {
    if (!canComposeToPost) return;
    const ids = new Set(selectedDiscordItems.map((it) => it.id));
    setBeamingIds(ids);
    setBeamActive(true);
    window.setTimeout(() => {
      onAddToNewPost?.(selectedDiscordItems);
      setItems((prev) => prev.filter((it) => !ids.has(it.id)));
      setSelectedIds(new Set());
      setBeamingIds(new Set());
      setBeamActive(false);
    }, 560);
  }, [canComposeToPost, onAddToNewPost, selectedDiscordItems]);

  const visibleItems = items.filter((it) =>
    activeSource === "url" ? it.source === "url" : activeSource === "upload" ? it.source === "upload" : it.source === "discord"
  );

  return (
    <div data-library-import-bay className="shrink-0 select-none border-b border-black bg-black">
      <div className="mx-auto max-w-[118rem] px-4 py-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#050a08] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[160px] w-[min(100%,480px)] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl"
            style={{
              background: "radial-gradient(ellipse at center, var(--lib-primary) 0%, transparent 70%)"
            }}
          />

          <div className="relative flex flex-col items-center px-4 pb-4 pt-6 text-center">
            <LibrarySectionEyebrow dense label="Media staging zone" />

            <h2 className="mt-3 text-2xl font-bold leading-none tracking-tight text-white sm:text-3xl">Import Bay</h2>

            {selectedCount > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--lib-primary)]/35 bg-[color-mix(in_srgb,var(--lib-primary)_10%,transparent)] px-3 py-2">
                  <CheckCircle2 className="h-3 w-3 text-[var(--lib-primary)]" aria-hidden />
                  <span className="text-[11px] font-semibold tabular-nums text-[var(--lib-primary)]">
                    {selectedCount} selected
                  </span>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse import station" : "Open import station"}
              className={`mt-6 flex items-center justify-center rounded-full border transition-all duration-300 ${
                expanded
                  ? "border-white/25 bg-black/50 p-2 text-white/35 hover:border-white/35 hover:bg-white/[0.07] hover:text-white/50"
                  : "gap-2 border-[var(--lib-primary)] bg-[var(--lib-primary)] px-6 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--lib-primary-fg)] shadow-lg shadow-[color-mix(in_srgb,var(--lib-primary)_32%,transparent)] hover:brightness-110"
              }`}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                  Open Import Station
                </>
              )}
            </button>
          </div>

          <div
            style={{
              maxHeight: expanded ? "720px" : "0px",
              opacity: expanded ? 1 : 0,
              marginTop: expanded ? "8px" : "0px",
              marginBottom: expanded ? "12px" : "0px",
              overflow: "hidden",
              pointerEvents: expanded ? "auto" : "none",
              transition: "max-height 380ms cubic-bezier(0.34,1.36,0.64,1), opacity 280ms ease, margin 300ms ease-out"
            }}
          >
            <div className="mx-auto max-w-4xl px-4 pb-4">
              <div className="rounded-3xl border border-white/[0.09] bg-[color-mix(in_srgb,var(--lib-card)_75%,black)] p-5 shadow-xl">
                <div className="flex justify-center">
                  <div className="flex items-center gap-0.5 rounded-2xl border border-[var(--lib-border)] bg-black/35 p-1">
                    {SOURCE_TABS.map((tab) => {
                      const Icon = tab.icon;
                      const active = activeSource === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveSource(tab.id)}
                          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all duration-150 ${
                            active
                              ? "bg-[var(--lib-muted)] text-[var(--lib-fg)] shadow-sm"
                              : "text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                          }`}
                        >
                          <Icon className="h-3 w-3" aria-hidden />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--lib-border)] bg-black/25 p-4">
                  {activeSource === "discord" && (
                    <>
                      <DiscordStagingNote />
                      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--lib-fg-muted)]">
                        Channel picker — coming soon
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 opacity-60">
                        <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-dashed border-[var(--lib-border)] px-3 py-1.5 text-[11px] text-[var(--lib-fg-muted)]">
                          <Plus className="h-3 w-3" aria-hidden />
                          Add channel
                        </span>
                      </div>
                    </>
                  )}
                  {activeSource === "upload" && <UploadZone onFiles={handleFiles} />}
                  {activeSource === "url" && <URLInput onAdd={handleAddURL} />}
                </div>

                {visibleItems.length > 0 ? (
                  <div className="mt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lib-fg-muted)]">
                        Staged <span className="tabular-nums text-[var(--lib-primary)]">{visibleItems.length}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {activeSource === "discord" ? (
                          <button
                            type="button"
                            onClick={() => void handleRefresh()}
                            disabled={loading || refreshing}
                            className="flex items-center gap-1 text-[10px] text-[var(--lib-fg-muted)] transition-colors hover:text-[var(--lib-fg)] disabled:opacity-50"
                          >
                            <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
                            Refresh
                          </button>
                        ) : null}
                        {selectedCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            className="flex items-center gap-1 text-[10px] text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                          >
                            <X className="h-2.5 w-2.5" aria-hidden />
                            Deselect all
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1.5">
                      {visibleItems.map((item) => (
                        <BinCard
                          key={item.id}
                          item={item}
                          selected={selectedIds.has(item.id)}
                          beaming={beamingIds.has(item.id)}
                          onToggle={() => handleToggle(item.id)}
                          onDiscard={() => void handleDiscard(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--lib-border)] py-10 text-center">
                    <ImageIcon className="h-6 w-6 text-[var(--lib-fg-muted)] opacity-50" aria-hidden />
                    <p className="max-w-[18rem] text-[11px] text-[var(--lib-fg-muted)]">
                      {activeSource === "discord"
                        ? loading
                          ? "Loading staged Discord media…"
                          : "Nothing staged yet. When your bot drops media into Discord, it will show up here."
                        : activeSource === "upload"
                          ? "No local previews yet. Uploads stay in this bay until Relay upload wiring lands."
                          : "Add a URL above to preview it here."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative flex flex-col items-center py-3">
            <div
              className={`transition-all duration-300 ${
                canComposeToPost ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={handleAddToNewPost}
                disabled={!canComposeToPost || beamActive}
                title={
                  selectedCount > 0 && !canComposeToPost
                    ? "Select Discord-staged assets to compose a post (upload/URL previews are not wired to Relay yet)."
                    : undefined
                }
                className="flex items-center gap-2 rounded-full border border-[var(--lib-primary)] bg-[var(--lib-primary)] px-6 py-2.5 text-[12px] font-bold text-[var(--lib-primary-fg)] shadow-lg shadow-[color-mix(in_srgb,var(--lib-primary)_28%,transparent)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Add {selectedDiscordItems.length > 0 ? selectedDiscordItems.length : ""} to new post
              </button>
            </div>

            <div className="relative mt-2 flex flex-col items-center">
              <div
                className="w-px bg-gradient-to-b from-[var(--lib-primary)]/40 to-[var(--lib-primary)]/10"
                style={{ height: beamActive ? "48px" : "24px", transition: "height 0.3s ease" }}
              />
              {beamActive ? (
                <div
                  aria-hidden
                  className="absolute top-0 h-2 w-2 rounded-full bg-[var(--lib-primary)] shadow-md shadow-[var(--lib-primary)]/60"
                  style={{ animation: "libraryBeamDrop 0.52s ease-in forwards" }}
                />
              ) : null}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ${
                  beamActive
                    ? "border-[var(--lib-primary)]/60 bg-[color-mix(in_srgb,var(--lib-primary)_15%,transparent)] shadow-md shadow-[color-mix(in_srgb,var(--lib-primary)_30%,transparent)]"
                    : "border-[var(--lib-primary)]/25 bg-[var(--lib-muted)]"
                }`}
              >
                <ChevronsDown className={`h-3.5 w-3.5 ${beamActive ? "text-[var(--lib-primary)]" : "text-[var(--lib-primary)]/55"}`} />
              </div>
              <div className="h-5 w-px bg-gradient-to-b from-[var(--lib-primary)]/10 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {/* beam keyframes */}
      <style>{`
        @keyframes libraryBeamDrop {
          0% { transform: translateY(0); opacity: 1; }
          80% { transform: translateY(48px); opacity: 0.7; }
          100% { transform: translateY(52px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
