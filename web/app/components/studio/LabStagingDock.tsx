"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Copy,
  FileText,
  Film,
  Hash,
  ImageIcon,
  Loader2,
  Music,
  Sparkles,
  Trash2
} from "lucide-react";
import {
  deleteRelayLibraryStagingMedia,
  fetchDiscordConnection,
  fetchRelayLibraryStaging,
  mintDiscordLinkCode,
  RELAY_API_BASE,
  RelayApiError,
  type DiscordConnectionData,
  type RelayLibraryStagingItem
} from "@/lib/relay-api";
import { uploadFilesToRelayStaging } from "@/lib/relay-native-staging-upload";
import { RELAY_LIBRARY_STAGING_REFRESH } from "@/lib/library-staging-events";
import LibraryUploadZone from "@/app/components/library/LibraryUploadZone";
import type { ImportBinItem } from "@/app/components/LibraryImportBay";
import { lab2HueFromSeed } from "@/app/components/studio-lab2/lab2-card-chrome";
import {
  RELAY_STAGED_MEDIA_MIME,
  serializeStagedMediaDrag,
  type StagedMediaDragPayload
} from "@/lib/staged-media-dnd";

type Props = {
  creatorId: string;
  onError?: (message: string) => void;
  onAddToNewPost?: (items: ImportBinItem[]) => void;
  onAutopost?: (items: ImportBinItem[]) => void;
  /** studio = lab2 material runway with Bay→Rail corridor cue. */
  variant?: "default" | "studio";
  /** Lab2: bay media drag session — arms the Scheduler intake corridor. */
  onCorridorDragChange?: (dragging: boolean) => void;
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

function manualImportStagingLabel(staging: unknown): string | null {
  if (!staging || typeof staging !== "object") return null;
  const o = staging as Record<string, unknown>;
  if (typeof o.bin_title !== "string" || !o.bin_title.trim()) return null;
  return o.bin_title.trim();
}

function unifiedStagingToBinItem(item: RelayLibraryStagingItem): ImportBinItem {
  const isDiscord = item.ingest_origin === "DISCORD";
  const cap = isDiscord ? itemCaption(item.discord_capture) : "";
  const fallbackName =
    item.media_id.length > 18 ? `${item.media_id.slice(0, 14)}…` : item.media_id;
  const pathForThumb =
    item.mime_type?.toLowerCase() === "image/gif" && item.content_url_path?.trim()
      ? item.content_url_path
      : item.mime_type?.startsWith("image/") && item.thumb_url_path?.trim()
        ? item.thumb_url_path
        : item.content_url_path;

  const manualLabel =
    item.ingest_origin === "RELAY_UPLOAD" ? manualImportStagingLabel(item.manual_import_staging) : null;
  const relayUploadTitle = manualLabel
    ? `Upload · ${manualLabel}`
    : `Upload · ${fallbackName}`;
  return {
    id: item.media_id,
    src: absoluteRelayUrl(pathForThumb),
    mimeType: item.mime_type || "application/octet-stream",
    filename: isDiscord ? cap || fallbackName : relayUploadTitle,
    timestamp: new Date(item.ingested_at),
    source: isDiscord ? "discord" : "upload",
    serverStaged: true
  };
}

function formatShortIso(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function MimeGlyph({ mimeType, className = "h-4 w-4" }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("video/")) return <Film className={className} aria-hidden />;
  if (mimeType.startsWith("audio/")) return <Music className={className} aria-hidden />;
  if (mimeType.startsWith("text/")) return <FileText className={className} aria-hidden />;
  return <ImageIcon className={className} aria-hidden />;
}

function shortThumbLabel(item: ImportBinItem): string {
  const cleaned = item.filename.replace(/^Upload\s*·\s*/i, "").trim();
  const base = cleaned.split(/[/\\]/).pop() ?? cleaned;
  const noExt = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  const label = noExt.trim() || "media";
  return label.length > 11 ? `${label.slice(0, 10)}…` : label;
}

function mediaKind(item: ImportBinItem): "image" | "video" | "other" {
  const mime = item.mimeType.toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "other";
}

/**
 * v0 /4 Import Bay thumb — compact tinted chip with filename + drag cue.
 * Live media is a faint plane; selection / discard stay available.
 */
function Lab2StripThumb({
  item,
  index,
  selected,
  onToggle,
  onDiscard,
  onDragStartPayload,
  onDraggingChange
}: {
  item: ImportBinItem;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onDiscard: () => void;
  onDragStartPayload: () => StagedMediaDragPayload | null;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const canDrag = item.serverStaged === true;
  const [dragging, setDragging] = useState(false);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hue = lab2HueFromSeed(item.id);
  const kind = mediaKind(item);
  const label = shortThumbLabel(item);

  function startHoverTimer() {
    hoverTimer.current = setTimeout(() => {
      if (thumbRef.current) {
        const r = thumbRef.current.getBoundingClientRect();
        setPopupPos({ x: r.left + r.width / 2, y: r.top });
      }
    }, 450);
  }

  function clearHoverTimer() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setPopupPos(null);
  }

  const popup =
    popupPos && !dragging && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-[200px] overflow-hidden rounded-2xl border border-[#2a3a30] bg-[#0b110d] shadow-[0_12px_50px_rgba(0,0,0,0.8)]"
            style={{
              top: popupPos.y - 10,
              left: popupPos.x,
              transform: "translate(-50%, -100%)",
              animation: "lab2-thumb-preview-in 160ms cubic-bezier(0.16,1,0.3,1) both"
            }}
            role="tooltip"
          >
            <div
              className="relative h-[120px] w-full overflow-hidden"
              style={{ backgroundColor: hue }}
            >
              {item.src && kind !== "other" ? (
                // eslint-disable-next-line @next/next/no-img-element -- relay staging thumbs
                <img
                  src={item.src}
                  alt=""
                  className="h-full w-full object-cover opacity-80"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#3a4a44]">
                  <MimeGlyph mimeType={item.mimeType} className="h-6 w-6" />
                </div>
              )}
              {kind === "video" ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ffffff20] bg-[#000]/60">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <path d="M3.5 2.5L11 7L3.5 11.5V2.5Z" fill="#9bf0c4" />
                    </svg>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="block truncate text-[11.5px] font-medium leading-tight text-[#c8d8cc]">
                  {label}
                </span>
                <span className="text-[9.5px] lowercase text-[#4a5a4e]">
                  {kind === "video"
                    ? "video · drag to schedule"
                    : kind === "image"
                      ? "image · drag to schedule"
                      : "file · drag to schedule"}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={thumbRef}
        role="button"
        tabIndex={0}
        data-lab2-bay-thumb
        draggable={canDrag}
        title={
          canDrag
            ? `${item.filename} — drag to Schedule`
            : item.filename
        }
        onDragStart={(e) => {
          if (!canDrag) {
            e.preventDefault();
            return;
          }
          const payload = onDragStartPayload();
          if (!payload || payload.media_ids.length === 0) {
            e.preventDefault();
            return;
          }
          const raw = serializeStagedMediaDrag(payload);
          e.dataTransfer.setData(RELAY_STAGED_MEDIA_MIME, raw);
          e.dataTransfer.setData("text/plain", raw);
          e.dataTransfer.effectAllowed = "copy";
          setDragging(true);
          onDraggingChange(true);
          clearHoverTimer();
        }}
        onDragEnd={() => {
          setDragging(false);
          onDraggingChange(false);
        }}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        onMouseEnter={startHoverTimer}
        onMouseLeave={clearHoverTimer}
        style={{
          animationDelay: `${index * 60}ms`,
          backgroundColor: hue,
          opacity: dragging ? 0.4 : 1
        }}
        className={`group/thumb relative flex h-12 w-[72px] flex-shrink-0 cursor-grab items-end justify-between overflow-hidden rounded-xl border p-1.5 transition-all duration-150 hover:scale-[1.03] hover:border-[#3a5040] active:scale-[0.97] active:cursor-grabbing ${
          selected
            ? "border-[#9bf0c4] ring-1 ring-[#9bf0c466]"
            : "border-[#1e2a22]"
        }`}
      >
        {item.src && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- relay staging thumbs
          <img
            src={item.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.35]"
          />
        ) : null}

        {kind === "video" ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded bg-[#000]/60">
            <svg width="7" height="7" viewBox="0 0 8 8" fill="none" aria-hidden>
              <path d="M2 1.5L6.5 4 2 6.5V1.5Z" fill="#9bf0c4" />
            </svg>
          </span>
        ) : null}

        {selected ? (
          <span className="absolute left-1 top-1">
            <CheckCircle2 className="h-3 w-3 fill-[#9bf0c4] text-[#050706]" aria-hidden />
          </span>
        ) : null}

        <span className="relative z-[1] max-w-[44px] truncate text-[8px] leading-tight text-[#4a6a54]">
          {label}
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          className="relative z-[1] flex-shrink-0 text-[#2e4038] transition-colors group-hover/thumb:text-[#5fb98f]"
          aria-hidden
        >
          <circle cx="2.5" cy="2.5" r="0.8" fill="currentColor" />
          <circle cx="5.5" cy="2.5" r="0.8" fill="currentColor" />
          <circle cx="2.5" cy="5.5" r="0.8" fill="currentColor" />
          <circle cx="5.5" cy="5.5" r="0.8" fill="currentColor" />
        </svg>

        <button
          type="button"
          aria-label={`Discard ${item.filename}`}
          onClick={(e) => {
            e.stopPropagation();
            onDiscard();
          }}
          className="absolute right-0.5 top-0.5 z-[2] rounded p-0.5 text-[#666] opacity-0 transition-opacity hover:text-red-400 group-hover/thumb:opacity-100"
        >
          <Trash2 className="h-2.5 w-2.5" aria-hidden />
        </button>
      </div>
      {popup}
    </>
  );
}

function DiscordLogoIcon({ className = "h-[7px] w-[7px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function DockThumb({
  item,
  selected,
  onToggle,
  onDiscard,
  onDragStartPayload,
  size
}: {
  item: ImportBinItem;
  selected: boolean;
  onToggle: () => void;
  onDiscard: () => void;
  onDragStartPayload: () => StagedMediaDragPayload | null;
  size: "large" | "mini";
}) {
  const canDrag = item.serverStaged === true;
  const fromDiscord = item.source === "discord";
  const isLarge = size === "large";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag}
      title={
        canDrag
          ? `${item.filename} (${fromDiscord ? "Discord" : "Upload"}) — drag to Schedule`
          : item.filename
      }
      onDragStart={(e) => {
        if (!canDrag) return;
        const payload = onDragStartPayload();
        if (!payload || payload.media_ids.length === 0) {
          e.preventDefault();
          return;
        }
        const raw = serializeStagedMediaDrag(payload);
        e.dataTransfer.setData(RELAY_STAGED_MEDIA_MIME, raw);
        e.dataTransfer.setData("text/plain", raw);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`group/thumb relative shrink-0 cursor-grab overflow-hidden border transition-all active:cursor-grabbing active:scale-[0.97] ${
        isLarge ? "h-[88px] w-[112px] rounded-xl" : "h-11 w-11 rounded-lg"
      } ${
        selected
          ? "border-[#9bf0c4] ring-1 ring-[#9bf0c466]"
          : "border-[#1e2420] hover:border-[#2e3c36]"
      } bg-[#0c100e]`}
    >
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- relay / remote staging thumbs
        <img src={item.src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[#3a4a44]">
          <MimeGlyph mimeType={item.mimeType} className={isLarge ? "h-5 w-5" : "h-3 w-3"} />
        </div>
      )}
      {selected ? (
        <span className={`absolute ${isLarge ? "left-1.5 top-1.5" : "left-0.5 top-0.5"}`}>
          <CheckCircle2
            className={`${isLarge ? "h-4 w-4" : "h-3 w-3"} fill-[#9bf0c4] text-[#050706]`}
            aria-hidden
          />
        </span>
      ) : null}
      {isLarge ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-[#050706]/90 to-transparent px-1.5 pb-1 pt-4">
          <span className="truncate text-[9px] font-medium text-[#aab4ae]">
            {fromDiscord ? (
              <span className="inline-flex items-center gap-0.5 text-[#aab4ff]">
                <Hash className="h-2.5 w-2.5 shrink-0" aria-hidden />
                Discord
              </span>
            ) : (
              "Upload"
            )}
          </span>
          <button
            type="button"
            aria-label={`Discard ${item.filename}`}
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            className="rounded p-0.5 text-[#666] opacity-0 transition-opacity hover:text-red-400 group-hover/thumb:opacity-100"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Discard ${item.filename}`}
          onClick={(e) => {
            e.stopPropagation();
            onDiscard();
          }}
          className="absolute inset-x-0 bottom-0 flex h-4 items-center justify-center bg-[#050706]/85 text-[#888] opacity-0 transition-opacity hover:text-red-400 group-hover/thumb:opacity-100"
        >
          <Trash2 className="h-2.5 w-2.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Lab Import Bay — collapsible staging workspace (upload + Discord pool → Schedule Rail).
 */
export function LabStagingDock({
  creatorId,
  onError,
  onAddToNewPost,
  onAutopost,
  variant = "default",
  onCorridorDragChange
}: Props) {
  const isStudio = variant === "studio";
  const [items, setItems] = useState<ImportBinItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [discordOpen, setDiscordOpen] = useState(false);
  const [fileDropArmed, setFileDropArmed] = useState(false);
  const [stripDragging, setStripDragging] = useState(false);
  const [discordConn, setDiscordConn] = useState<DiscordConnectionData | null>(null);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [mintCode, setMintCode] = useState<string | null>(null);
  const [mintExpires, setMintExpires] = useState<string | null>(null);
  const [mintBusy, setMintBusy] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setCorridorDragging = useCallback(
    (dragging: boolean) => {
      setStripDragging(dragging);
      onCorridorDragChange?.(dragging);
    },
    [onCorridorDragChange]
  );

  useEffect(() => {
    if (!stripDragging) return;
    function onDragEnd() {
      setCorridorDragging(false);
    }
    window.addEventListener("dragend", onDragEnd);
    return () => window.removeEventListener("dragend", onDragEnd);
  }, [stripDragging, setCorridorDragging]);

  const loadStaging = useCallback(async () => {
    if (!creatorId.trim()) return;
    setLoading(true);
    try {
      const list = await fetchRelayLibraryStaging(creatorId.trim());
      const mapped = list.items.map(unifiedStagingToBinItem);
      setItems(mapped);
      const validIds = new Set(mapped.map((it) => it.id));
      setSelectedIds((selPrev) => new Set(Array.from(selPrev).filter((id) => validIds.has(id))));
    } catch (e) {
      onError?.(e instanceof RelayApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [creatorId, onError]);

  const loadDiscord = useCallback(async () => {
    if (!creatorId.trim()) return;
    setDiscordLoading(true);
    try {
      setDiscordConn(await fetchDiscordConnection(creatorId.trim()));
    } catch {
      setDiscordConn(null);
    } finally {
      setDiscordLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    void loadStaging();
    void loadDiscord();
  }, [loadStaging, loadDiscord]);

  useEffect(() => {
    const onRefresh = () => {
      void loadStaging();
    };
    window.addEventListener(RELAY_LIBRARY_STAGING_REFRESH, onRefresh);
    return () => window.removeEventListener(RELAY_LIBRARY_STAGING_REFRESH, onRefresh);
  }, [loadStaging]);

  useEffect(() => {
    if (!discordOpen) return;
    function onDoc(e: MouseEvent) {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setDiscordOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDiscordOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [discordOpen]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );
  const selectedComposable = useMemo(
    () => selectedItems.filter((it) => it.serverStaged === true),
    [selectedItems]
  );
  const canCompose = selectedComposable.length > 0;
  const discordLinked = discordConn?.linked === true;

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
      if (item.serverStaged === true) {
        if (!creatorId.trim()) return;
        try {
          await deleteRelayLibraryStagingMedia(creatorId.trim(), id);
          setItems((prev) => prev.filter((it) => it.id !== id));
          setSelectedIds((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        } catch (e) {
          onError?.(e instanceof RelayApiError ? e.message : String(e));
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

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!creatorId.trim()) {
        onError?.("Sign in to upload files to your Library.");
        return;
      }
      if (files.length === 0) return;
      setUploadBusy(true);
      const cid = creatorId.trim();
      try {
        const { uploaded, errors } = await uploadFilesToRelayStaging({
          creatorId: cid,
          files
        });
        for (const item of uploaded) {
          const contentPath = `/api/v1/export/media/${encodeURIComponent(cid)}/${encodeURIComponent(item.media_id)}/content`;
          setItems((prev) => {
            const filtered = prev.filter((it) => it.id !== item.media_id);
            const newItem: ImportBinItem = {
              id: item.media_id,
              src: absoluteRelayUrl(contentPath),
              mimeType: item.content_type,
              filename: item.filename,
              timestamp: new Date(),
              source: "upload",
              serverStaged: true
            };
            return [newItem, ...filtered];
          });
        }
        for (const msg of errors) onError?.(msg);
      } finally {
        setUploadBusy(false);
      }
    },
    [creatorId, onError]
  );

  const onMint = useCallback(async () => {
    if (!creatorId.trim()) return;
    setMintError(null);
    setMintBusy(true);
    try {
      const out = await mintDiscordLinkCode(creatorId.trim());
      setMintCode(out.code);
      setMintExpires(out.expires_at);
      await loadDiscord();
    } catch (e) {
      setMintError(e instanceof RelayApiError ? e.message : String(e));
    } finally {
      setMintBusy(false);
    }
  }, [creatorId, loadDiscord]);

  const dragPayloadFor = useCallback(
    (item: ImportBinItem): StagedMediaDragPayload | null => {
      if (item.serverStaged !== true) return null;
      const selectedComposableItems = items.filter(
        (it) => selectedIds.has(it.id) && it.serverStaged === true
      );
      const dragItems =
        selectedComposableItems.length > 0 && selectedIds.has(item.id)
          ? selectedComposableItems
          : [item];
      return {
        media_ids: dragItems.map((it) => it.id),
        items: dragItems.map((it) => ({
          id: it.id,
          src: it.src,
          filename: it.filename,
          mimeType: it.mimeType
        }))
      };
    },
    [items, selectedIds]
  );

  const discordAria = discordLoading
    ? "Discord import — checking…"
    : discordLinked
      ? "Discord import — connected"
      : "Discord import — set up";

  const armFileDrop = useCallback(() => {
    setFileDropArmed(true);
  }, []);

  const selectionActions =
    selectedIds.size > 0 || canCompose ? (
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {selectedIds.size > 0 ? (
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="rounded-md px-1.5 py-1 text-[10px] text-[#555] hover:text-[#888]"
          >
            Clear
          </button>
        ) : null}

        {canCompose && onAutopost ? (
          <button
            type="button"
            onClick={() => {
              onAutopost(selectedComposable);
              setSelectedIds(new Set());
            }}
            className="flex h-7 items-center gap-1 rounded-lg border border-[#1d211e] bg-[#0c0e0c] px-2 text-[10px] text-[#9bf0c4] hover:border-[#2a302c]"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            Autopost
          </button>
        ) : null}

        {canCompose ? (
          <button
            type="button"
            onClick={() => {
              onAddToNewPost?.(selectedComposable);
              setSelectedIds(new Set());
            }}
            className="flex h-7 items-center rounded-lg border border-[#9bf0c433] bg-[#9bf0c40e] px-2 text-[10px] font-medium text-[#9bf0c4] hover:border-[#9bf0c466]"
          >
            New post
          </button>
        ) : null}
      </div>
    ) : null;

  const discordControl = (
    <div className="relative">
      <button
        type="button"
        aria-expanded={discordOpen}
        aria-controls="lab-import-discord"
        aria-label={discordAria}
        title={discordAria}
        onClick={() => {
          setDiscordOpen((o) => !o);
          if (!discordConn) void loadDiscord();
        }}
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-md transition-all active:scale-[0.96] ${
          discordLoading
            ? "text-[#555]"
            : discordLinked
              ? "text-[#5865F2] hover:bg-[#5865F214]"
              : "text-[#e8c45a] hover:bg-[#e8c45a14]"
        } ${discordOpen ? (discordLinked ? "bg-[#5865F214]" : "bg-[#e8c45a14]") : ""}`}
      >
        <DiscordLogoIcon className="h-[7px] w-[7px]" />
      </button>

      {discordOpen ? (
        <div
          id="lab-import-discord"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(92vw,300px)] rounded-xl border border-[#1e2420] bg-[#0f1210] p-3 shadow-xl shadow-black/60"
          role="dialog"
          aria-label="Discord import status"
        >
          <p className="text-[11px] font-medium text-[#c8cec9]">Discord import</p>
          {discordLoading && !discordConn ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7a8480]">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Checking connection…
            </p>
          ) : discordLinked ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#7a8480]">
              Connected. Captures land in this Import Bay with uploads — no separate tab.
              {discordConn?.discord_channel_id ? (
                <>
                  {" "}
                  Channel{" "}
                  <span className="font-mono text-[10px] text-[#aab4ae]">
                    …{discordConn.discord_channel_id.slice(-6)}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#7a8480]">
              No channel linked. Mint a one-time code, then run{" "}
              <code className="rounded bg-[#1a1e1b] px-1 py-0.5 text-[10px] text-[#c8cec9]">
                /relay-link
              </code>{" "}
              in Discord with that code.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onMint()}
              disabled={mintBusy}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#1d211e] bg-[#0c0e0c] px-2.5 text-[11px] text-[#c8cec9] hover:border-[#2a302c] disabled:opacity-50"
            >
              {mintBusy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              Mint link code
            </button>
            {mintCode ? (
              <>
                <code className="rounded border border-[#1d211e] bg-[#0a0c0a] px-2 py-1 font-mono text-[11px] text-[#e8e8e8]">
                  {mintCode}
                </code>
                <button
                  type="button"
                  aria-label="Copy code"
                  onClick={() => void navigator.clipboard.writeText(mintCode)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1d211e] px-2 text-[11px] text-[#7a8480] hover:text-[#aab4ae]"
                >
                  <Copy className="h-3 w-3" aria-hidden />
                  Copy
                </button>
              </>
            ) : null}
          </div>
          {mintExpires ? (
            <p className="mt-2 text-[10px] text-[#555]">Expires {formatShortIso(mintExpires)}</p>
          ) : null}
          {mintError ? (
            <p className="mt-2 text-[11px] text-red-400" role="alert">
              {mintError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const dockShellProps = {
    ref: dockRef,
    "data-lab-staging-dock": true,
    "data-import-bay": true,
    "data-variant": variant,
    "aria-expanded": "true" as const,
    onDragEnter: (e: DragEvent) => {
      if ([...e.dataTransfer.types].includes("Files")) armFileDrop();
    },
    onDragLeave: (e: DragEvent) => {
      if (!dockRef.current?.contains(e.relatedTarget as Node)) setFileDropArmed(false);
    },
    onDragOver: (e: DragEvent) => {
      if ([...e.dataTransfer.types].includes("Files")) {
        e.preventDefault();
        armFileDrop();
      }
    },
    onDrop: (e: DragEvent) => {
      setFileDropArmed(false);
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) void handleFiles(files);
    }
  };

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) void handleFiles(files);
        e.target.value = "";
      }}
    />
  );

  const dropOverlay = fileDropArmed ? (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border border-dashed border-[#9bf0c455] bg-[#050706]/55"
      aria-hidden
    >
      <span className="rounded-full border border-[#9bf0c466] bg-[#0c1510] px-3 py-1 text-[11px] text-[#9bf0c4]">
        Drop to Import Bay
      </span>
    </div>
  ) : null;

  /* ── lab2 / studio: v0 compact strip ── */
  if (isStudio) {
    return (
      <div
        {...dockShellProps}
        className={`relative w-full min-w-0 shrink-0 ${
          discordOpen || fileDropArmed ? "z-40" : "z-20"
        }`}
      >
        {hiddenFileInput}
        <div
          className={`relative flex h-[76px] flex-shrink-0 items-center gap-3 px-5 transition-colors duration-200 ${
            stripDragging || fileDropArmed ? "bg-[#0a120c]" : "bg-[#080c09]"
          }`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px transition-opacity duration-200"
            style={{
              background:
                stripDragging || fileDropArmed
                  ? "linear-gradient(to left, transparent, #9bf0c42e 45%, #9bf0c42e 100%)"
                  : "linear-gradient(to left, transparent, #101813 40%, #101813 100%)"
            }}
          />

          <div className="flex flex-shrink-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#404a44]">
                Import Bay
              </span>
              {discordControl}
            </div>
            <span className="text-[10px] text-[#2e3a32]">
              {uploadBusy ? "uploading…" : "drag to schedule →"}
            </span>
          </div>

          <div className="h-8 w-px flex-shrink-0 bg-[#141a16]" aria-hidden />

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto library-hide-scrollbars">
            {items.length === 0 && !loading ? (
              <p className="text-[10px] text-[#2e3a32]">
                Drop files or press + to stage media
              </p>
            ) : null}
            {loading && items.length === 0 ? (
              <p className="text-[10px] text-[#2e3a32]">Loading…</p>
            ) : null}
            {items.map((item, i) => (
              <Lab2StripThumb
                key={item.id}
                item={item}
                index={i}
                selected={selectedIds.has(item.id)}
                onToggle={() => handleToggle(item.id)}
                onDiscard={() => void handleDiscard(item.id)}
                onDragStartPayload={() => dragPayloadFor(item)}
                onDraggingChange={setCorridorDragging}
              />
            ))}

            <button
              type="button"
              onClick={openFilePicker}
              disabled={uploadBusy}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-[#1e2a22] bg-transparent text-[#2e3a32] transition-all hover:border-[#3a5040] hover:text-[#5fb98f] disabled:opacity-50"
              aria-label="Add files"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M7 2v10M2 7h10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {selectionActions}

          <div
            className={`flex flex-shrink-0 items-center gap-1.5 transition-colors duration-200 ${
              stripDragging ? "text-[#9bf0c4]" : "text-[#1e2a22]"
            }`}
            aria-hidden
          >
            {[0, 1, 2, 3].map((i) => (
              <svg
                key={i}
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                style={{
                  opacity: 0.3 + i * 0.2,
                  animation: stripDragging
                    ? `lab2-runway-pulse 900ms ease-in-out ${i * 120}ms infinite`
                    : undefined
                }}
              >
                <path
                  d="M1 4h6M4.5 1.5L7 4l-2.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ))}
          </div>
        </div>
        {dropOverlay}
      </div>
    );
  }

  return (
    <div
      {...dockShellProps}
      className={`relative w-full min-w-0 shrink-0 border-b border-[#111] bg-[#080c0a] ${
        discordOpen || fileDropArmed ? "z-40" : "z-20"
      }`}
    >
      {hiddenFileInput}

      {/* Header */}
      <div
        className={`relative flex min-h-12 items-center gap-2.5 px-5 py-2 transition-colors ${
          fileDropArmed ? "bg-[#9bf0c40a]" : ""
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="min-w-0">
            <span className="text-[17px] font-semibold tracking-tight text-[#c8cec9]">
              Import Bay
            </span>
          </div>
          {discordControl}
        </div>

        {selectionActions}
      </div>

      {/* Body — always open */}
      <div id="lab-import-bay-body" className="relative">
        <div
          className={`border-t border-[#111] px-5 pb-3.5 pt-3 transition-colors ${
            fileDropArmed ? "bg-[#9bf0c406]" : "bg-[#050505]"
          }`}
        >
          <div className="flex min-h-[7.5rem] flex-col gap-3 md:flex-row md:items-stretch">
            <div className="w-full shrink-0 md:w-[30%] md:max-w-[280px]">
              <LibraryUploadZone
                compact
                onFiles={(f) => void handleFiles(f)}
                disabled={uploadBusy}
                helperText={
                  uploadBusy
                    ? "Uploading…"
                    : "Joins the same pool as Discord captures."
                }
                className="h-full"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#3e4e48]">
                  Drag to Schedule
                </p>
              <div className="flex min-h-[88px] flex-1 items-stretch gap-2 overflow-x-auto library-hide-scrollbars">
                {items.length === 0 ? (
                  <div className="flex flex-1 items-center rounded-xl border border-dashed border-[#1a211e] px-4 py-6">
                    <p className="text-[12px] leading-relaxed text-[#3e4742]">
                      {loading
                        ? "Loading staged media…"
                        : "Nothing staged yet. Drop files here or wait for Discord captures — then drag thumbs to the Schedule Rail."}
                    </p>
                  </div>
                ) : (
                  items.map((item) => (
                    <DockThumb
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onToggle={() => handleToggle(item.id)}
                      onDiscard={() => void handleDiscard(item.id)}
                      onDragStartPayload={() => dragPayloadFor(item)}
                      size="large"
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {dropOverlay}
    </div>
  );
}
