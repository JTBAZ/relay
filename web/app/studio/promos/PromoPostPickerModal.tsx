"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  fetchCreatorGalleryItems,
  RELAY_API_BASE,
  type CreatorPromoSlotRow,
  type GalleryItem
} from "@/lib/relay-api";
import {
  MAX_PROMO_SLOTS,
  galleryItemsToPostOptions,
  rankForPostId,
  selectionFromSlots,
  selectionToPutRows,
  togglePostSelection,
  type PromoPostOption,
  type SelectedPromoPost
} from "./promo-post-picker-model";

const SEARCH_DEBOUNCE_MS = 320;
const PAGE_LIMIT = 100;

function optionThumbUrl(path?: string): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (p.startsWith("http")) return p;
  return `${RELAY_API_BASE}${p.startsWith("/") ? "" : "/"}${p}`;
}

type Props = {
  open: boolean;
  creatorId: string;
  currentSlots: CreatorPromoSlotRow[];
  saving?: boolean;
  saveError?: string | null;
  onClose: () => void;
  onMakePromos: (putRows: ReturnType<typeof selectionToPutRows>) => void;
};

async function loadAllActivePostPages(args: {
  creatorId: string;
  q?: string;
  signal?: { cancelled: boolean };
}): Promise<GalleryItem[]> {
  const all: GalleryItem[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    if (args.signal?.cancelled) return all;
    const page = await fetchCreatorGalleryItems({
      creator_id: args.creatorId,
      q: args.q || undefined,
      display: "post_primary",
      visibility: "visible",
      limit: PAGE_LIMIT,
      cursor: cursor ?? undefined
    });
    all.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return all;
}

export default function PromoPostPickerModal({
  open,
  creatorId,
  currentSlots,
  saving = false,
  saveError = null,
  onClose,
  onMakePromos
}: Props) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  const [options, setOptions] = useState<PromoPostOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<number, SelectedPromoPost>>(new Map());
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const resetOnOpen = useCallback(() => {
    setQ("");
    setListError(null);
    setSelected(selectionFromSlots(currentSlots));
  }, [currentSlots]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resetOnOpen();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, resetOnOpen]);

  useEffect(() => {
    if (!open || !creatorId.trim()) return;
    const signal = { cancelled: false };
    void (async () => {
      setLoading(true);
      setListError(null);
      try {
        const items = await loadAllActivePostPages({
          creatorId,
          q: debouncedQ.trim() || undefined,
          signal
        });
        if (signal.cancelled) return;
        setOptions(galleryItemsToPostOptions(items));
      } catch (e) {
        if (signal.cancelled) return;
        setListError(e instanceof Error ? e.message : "Could not load your gallery.");
        setOptions([]);
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [open, creatorId, debouncedQ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const selectedCount = selected.size;
  const canSubmit = selectedCount >= 1 && selectedCount <= MAX_PROMO_SLOTS && !saving;

  const onToggle = (option: PromoPostOption) => {
    if (saving) return;
    setSelected((prev) => togglePostSelection(prev, option));
  };

  const handleMakePromos = () => {
    if (!canSubmit) return;
    onMakePromos(selectionToPutRows(selected));
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-post-picker-title"
        className="flex max-h-[min(92dvh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--relay-border)] bg-[var(--relay-bg)] shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--relay-border)] px-4 py-4 sm:px-6">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--relay-green-400)]">
              Promo pieces
            </p>
            <h2
              id="promo-post-picker-title"
              className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]"
            >
              Add posts to your promo pool
            </h2>
            <p className="text-sm text-[var(--relay-fg-muted)]">
              Select up to {MAX_PROMO_SLOTS} active posts. Linked Set members appear separately.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg border border-[var(--relay-border)] p-2 text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)] disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--relay-fg-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles and tags…"
              disabled={saving}
              className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] py-2.5 pl-10 pr-3 text-sm text-[var(--relay-fg)] outline-none ring-[var(--relay-green-600)] focus:ring-2 disabled:opacity-50"
            />
          </div>

          <section aria-label="Active posts grid">
            {loading ? (
              <p className="flex items-center gap-2 py-10 text-sm text-[var(--relay-fg-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading your gallery…
              </p>
            ) : listError ? (
              <p
                className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200"
                role="alert"
              >
                {listError}
              </p>
            ) : options.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--relay-fg-muted)]">
                No active posts match. Try a different search.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {options.map((option) => {
                  const rank = rankForPostId(selected, option.post_id);
                  const isSelected = rank != null;
                  const atCap = !isSelected && selectedCount >= MAX_PROMO_SLOTS;
                  const thumb = optionThumbUrl(option.thumb_url_path);

                  return (
                    <button
                      key={option.post_id}
                      type="button"
                      onClick={() => onToggle(option)}
                      disabled={saving || atCap}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? "Remove" : "Add"} ${option.title} as promo piece`}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-xl border text-left transition-colors",
                        isSelected
                          ? "border-[var(--relay-green-600)] ring-2 ring-[var(--relay-green-600)]/40"
                          : "border-[var(--relay-border)] hover:border-[var(--relay-green-600)]/60",
                        atCap ? "cursor-not-allowed opacity-50" : ""
                      )}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- gallery thumb
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[var(--relay-surface-1)] px-2 text-center text-xs text-[var(--relay-fg-muted)]">
                          {option.title}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
                        <p className="line-clamp-2 text-xs font-medium text-white">
                          {option.title}
                        </p>
                        {option.linked_set_member && option.member_label ? (
                          <p className="mt-0.5 truncate text-[10px] text-[var(--relay-green-400)]">
                            Linked · {option.member_label}
                          </p>
                        ) : option.linked_set_member ? (
                          <p className="mt-0.5 truncate text-[10px] text-white/70">
                            Linked Set member
                          </p>
                        ) : null}
                      </div>
                      {isSelected ? (
                        <span className="absolute left-2 top-2 rounded bg-[var(--relay-green-600)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          #{rank}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-[var(--relay-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-[var(--relay-fg-muted)]">
            {selectedCount < 1
              ? "Pick at least one post to continue."
              : `${selectedCount} / ${MAX_PROMO_SLOTS} selected — click a post again to remove it.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-[var(--relay-border)] px-4 py-2.5 text-sm font-medium text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMakePromos}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--relay-green-600)] px-5 py-2.5 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Make Promos
            </button>
          </div>
          {saveError ? (
            <p className="w-full text-sm text-red-300" role="alert">
              {saveError}
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
