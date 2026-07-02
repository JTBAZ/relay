"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Clock, ArrowRight, Trash2 } from "lucide-react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  isPatronSearchQueryReady,
  isPatronSearchRequestReady,
  PATRON_SEARCH_MIN_QUERY_LENGTH,
  patronSearchUserMessage,
  searchPatronPosts,
  type PatronSearchHit,
  type PatronSearchMediaFilter,
  type PatronSearchResult,
  type PatronSearchSortMode,
} from "@/lib/patron-search-api";
import type { Creator } from "@/lib/relay-fixtures";
import {
  clearPatronSearchRecentInBrowser,
  loadPatronSearchRecentEnabledFromBrowser,
  loadPatronSearchRecentFromBrowser,
  rememberPatronSearchInBrowser,
  setPatronSearchRecentEnabledInBrowser,
} from "@/lib/patron-search-recent";
import {
  PatronSearchAccessibleRow,
  PatronSearchLockedRow,
  PatronSearchResultSection,
} from "./patron-search-result-row";
import { PatronSearchCreatorPicker } from "./patron-search-creator-picker";

const SEARCH_DEBOUNCE_MS = 320;

const MEDIA_FILTER_OPTIONS: { id: PatronSearchMediaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photo", label: "Image" },
  { id: "video", label: "Video" },
  { id: "writing", label: "Text" },
];

const SORT_OPTIONS: { id: PatronSearchSortMode; label: string }[] = [
  { id: "newest", label: "Most recent" },
  { id: "oldest", label: "Oldest" },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Followed creators from the feed shell (Option B — no extra API call). */
  followedCreators?: Creator[];
  /** Override default navigation (live post detail or creator page for locked hits). */
  onHitSelect?: (hit: PatronSearchHit) => void;
}

export function CommandPalette({
  open,
  onClose,
  followedCreators = [],
  onHitSelect,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const [result, setResult] = useState<PatronSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMoreAccessible, setLoadingMoreAccessible] = useState(false);
  const [loadingMoreLocked, setLoadingMoreLocked] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentSearchesEnabled, setRecentSearchesEnabled] = useState(true);
  const [mediaFilter, setMediaFilter] = useState<PatronSearchMediaFilter>("all");
  const [sort, setSort] = useState<PatronSearchSortMode>("newest");
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRecordedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResult(null);
    setError(null);
    setLoading(false);
    setLoadingMoreAccessible(false);
    setLoadingMoreLocked(false);
    setRecentSearches(loadPatronSearchRecentFromBrowser());
    setRecentSearchesEnabled(loadPatronSearchRecentEnabledFromBrowser());
    setMediaFilter("all");
    setSort("newest");
    setSelectedCreatorIds([]);
    lastRecordedQueryRef.current = null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  const apiCreatorIds =
    selectedCreatorIds.length > 0 ? selectedCreatorIds : undefined;
  const browseMode = (apiCreatorIds?.length ?? 0) > 0 && trimmedQuery.length === 0;
  const effectiveQuery = browseMode ? "" : debouncedQuery;
  const requestReady = isPatronSearchRequestReady({
    q: trimmedQuery,
    creator_ids: apiCreatorIds,
  });

  useEffect(() => {
    if (!open) return;

    if (!requestReady) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!browseMode && isPatronSearchQueryReady(trimmedQuery) && trimmedQuery !== debouncedQuery) {
      return;
    }

    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    void searchPatronPosts({
      q: effectiveQuery,
      creator_ids: apiCreatorIds,
      media_filter: mediaFilter,
      sort,
    })
      .then((data) => {
        if (id !== requestIdRef.current) return;
        setResult(data);
        setLoading(false);
        if (
          isPatronSearchQueryReady(debouncedQuery) &&
          lastRecordedQueryRef.current !== debouncedQuery
        ) {
          lastRecordedQueryRef.current = debouncedQuery;
          setRecentSearches(rememberPatronSearchInBrowser(debouncedQuery));
        }
      })
      .catch((err) => {
        if (id !== requestIdRef.current) return;
        setResult(null);
        setError(patronSearchUserMessage(err));
        setLoading(false);
      });
  }, [
    open,
    effectiveQuery,
    debouncedQuery,
    trimmedQuery,
    browseMode,
    requestReady,
    apiCreatorIds,
    mediaFilter,
    sort,
    selectedCreatorIds,
  ]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const navigateHit = useCallback(
    (hit: PatronSearchHit) => {
      onClose();
      if (onHitSelect) {
        onHitSelect(hit);
        return;
      }
      if (hit.viewer_entitlement === "locked") {
        router.push(`/${encodeURIComponent(hit.creator.handle)}`);
        return;
      }
      router.push(
        `/${encodeURIComponent(hit.creator.handle)}/post/${encodeURIComponent(hit.post_id)}`
      );
    },
    [onClose, onHitSelect, router]
  );

  const loadMore = useCallback(
    async (section: "accessible" | "locked") => {
      if (
        !result ||
        !isPatronSearchRequestReady({ q: effectiveQuery, creator_ids: apiCreatorIds })
      ) {
        return;
      }
      const cursor =
        section === "accessible"
          ? result.accessible.next_cursor
          : result.locked.next_cursor;
      if (!cursor) return;

      const setLoadingMore =
        section === "accessible" ? setLoadingMoreAccessible : setLoadingMoreLocked;
      setLoadingMore(true);
      try {
        const page = await searchPatronPosts({
          q: effectiveQuery,
          cursor,
          section,
          creator_ids: apiCreatorIds,
          media_filter: mediaFilter,
          sort,
        });
        setResult((prev) => {
          if (!prev) return page;
          const bin = section === "accessible" ? "accessible" : "locked";
          return {
            ...prev,
            [bin]: {
              items: [...prev[bin].items, ...page[bin].items],
              next_cursor: page[bin].next_cursor,
            },
          };
        });
      } catch (err) {
        setError(patronSearchUserMessage(err));
      } finally {
        setLoadingMore(false);
      }
    },
    [effectiveQuery, apiCreatorIds, result, mediaFilter, sort]
  );

  const selectRecentSearch = useCallback((recentQuery: string) => {
    setQuery(recentQuery);
    inputRef.current?.focus();
  }, []);

  const handleClearRecentSearches = useCallback(() => {
    clearPatronSearchRecentInBrowser();
    setRecentSearches([]);
    inputRef.current?.focus();
  }, []);

  const handleToggleRecentSearches = useCallback((enabled: boolean) => {
    setPatronSearchRecentEnabledInBrowser(enabled);
    setRecentSearchesEnabled(enabled);
    inputRef.current?.focus();
  }, []);

  if (!open) return null;

  const isDebouncing =
    !browseMode &&
    isPatronSearchQueryReady(trimmedQuery) &&
    trimmedQuery !== debouncedQuery;
  const showSpinner = loading || isDebouncing;
  const accessibleItems = result?.accessible.items ?? [];
  const lockedItems = result?.locked.items ?? [];
  const hasResults = accessibleItems.length > 0 || lockedItems.length > 0;
  const showEmptyResults = requestReady && !showSpinner && !error && !hasResults;
  const showIdle = !requestReady && trimmedQuery.length === 0;
  const showTooShortHint =
    !requestReady && trimmedQuery.length > 0 && trimmedQuery.length < PATRON_SEARCH_MIN_QUERY_LENGTH;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Search posts"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75" aria-hidden="true" />

      <div
        className="relative w-full max-w-[640px] bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1E1E1E]">
          <Search size={17} className="text-[#4B5563] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts from creators you follow…"
            className="flex-1 bg-transparent text-[#F9FAFB] placeholder-[#4B5563] text-sm outline-none"
            aria-label="Search query"
            autoComplete="off"
            spellCheck={false}
          />
          {showSpinner ? (
            <Loader2
              size={16}
              className="text-[#4B5563] shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150"
            aria-label="Close search"
          >
            <X size={15} />
          </button>
        </div>

        <PatronSearchFilters
          creators={followedCreators}
          selectedCreatorIds={selectedCreatorIds}
          onSelectedCreatorIdsChange={setSelectedCreatorIds}
          mediaFilter={mediaFilter}
          sort={sort}
          onMediaFilterChange={setMediaFilter}
          onSortChange={setSort}
        />

        <div
          className="max-h-[480px] overflow-y-auto p-2"
          aria-live="polite"
          aria-busy={showSpinner}
        >
          {showIdle ? (
            <PatronSearchIdleState
              recentSearches={recentSearches}
              recentEnabled={recentSearchesEnabled}
              onSelectRecent={selectRecentSearch}
              onClearRecent={handleClearRecentSearches}
              onToggleRecentEnabled={handleToggleRecentSearches}
            />
          ) : null}

          {showTooShortHint ? (
            <HintMessage>
              Enter at least {PATRON_SEARCH_MIN_QUERY_LENGTH} characters to search, or pick
              creators above to browse their posts.
            </HintMessage>
          ) : null}

          {error ? <ErrorMessage message={error} /> : null}

          {browseMode && hasResults ? (
            <p className="px-2 pb-2 text-[11px] text-[#6B7280]">
              Showing recent posts from selected creators. Add keywords to narrow results.
            </p>
          ) : null}

          {showEmptyResults ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Search size={22} className="text-[#222222] mb-3" aria-hidden="true" />
              <p className="text-sm text-[#4B5563]">
                {browseMode
                  ? "No posts from the selected creators match these filters."
                  : `No posts match “${debouncedQuery}”`}
              </p>
              <p className="mt-1 text-xs text-[#333333]">
                Try different keywords, creators, or media type filters.
              </p>
            </div>
          ) : null}

          {accessibleItems.length > 0 ? (
            <PatronSearchResultSection
              variant="accessible"
              label="Posts you can read"
              count={accessibleItems.length}
            >
              {accessibleItems.map((hit) => (
                <PatronSearchAccessibleRow
                  key={`${hit.creator_id}:${hit.post_id}`}
                  hit={hit}
                  onSelect={navigateHit}
                />
              ))}
              {result?.accessible.next_cursor ? (
                <LoadMoreButton
                  loading={loadingMoreAccessible}
                  onClick={() => void loadMore("accessible")}
                  label="Load more accessible posts"
                />
              ) : null}
            </PatronSearchResultSection>
          ) : null}

          {lockedItems.length > 0 ? (
            <PatronSearchResultSection
              variant="locked"
              label="What you missed"
              count={lockedItems.length}
            >
              {lockedItems.map((hit) => (
                <PatronSearchLockedRow
                  key={`${hit.creator_id}:${hit.post_id}`}
                  hit={hit}
                  onSelect={navigateHit}
                />
              ))}
              {result?.locked.next_cursor ? (
                <LoadMoreButton
                  loading={loadingMoreLocked}
                  onClick={() => void loadMore("locked")}
                  label="Load more locked posts"
                />
              ) : null}
            </PatronSearchResultSection>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-[#1A1A1A] bg-[#0C0C0C]">
          <div className="flex items-center gap-4 text-[10px] text-[#333333] font-mono select-none">
            <span>↵ Open</span>
            <span>Esc Close</span>
          </div>
          <kbd className="text-[10px] text-[#333333] font-mono">⌘K</kbd>
        </div>
      </div>
    </div>
  );
}

function PatronSearchIdleState({
  recentSearches,
  recentEnabled,
  onSelectRecent,
  onClearRecent,
  onToggleRecentEnabled,
}: {
  recentSearches: string[];
  recentEnabled: boolean;
  onSelectRecent: (query: string) => void;
  onClearRecent: () => void;
  onToggleRecentEnabled: (enabled: boolean) => void;
}) {
  return (
    <div className="px-2 py-3">
      <div className="rounded-lg border border-[#1E1E1E] bg-[#0C0C0C] px-4 py-4 text-center">
        <Search size={20} className="mx-auto mb-2.5 text-[#2A2A2A]" aria-hidden="true" />
        <p className="text-sm font-medium text-[#9CA3AF]">
          Search posts from creators you follow
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#4B5563]">
          Match by title, tags, description, or creator name. Results split into posts
          you have tier access to.
        </p>
      </div>

      <section className="mt-5" aria-label="Recent searches">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] uppercase tracking-widest font-medium text-[#3D3D3D]">
            Recent searches
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={recentEnabled}
              aria-label="Show recent searches"
              onClick={() => onToggleRecentEnabled(!recentEnabled)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] transition-colors ${
                recentEnabled
                  ? "border-[#2A2A2A] bg-[#141414] text-[#9CA3AF]"
                  : "border-[#1A1A1A] bg-[#0C0C0C] text-[#4B5563]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full transition-colors ${
                  recentEnabled ? "bg-[#6B7280]" : "bg-[#2A2A2A]"
                }`}
              />
              {recentEnabled ? "On" : "Off"}
            </button>
            {recentEnabled && recentSearches.length > 0 ? (
              <button
                type="button"
                onClick={onClearRecent}
                className="inline-flex items-center gap-1 text-[10px] text-[#4B5563] transition-colors hover:text-[#9CA3AF]"
              >
                <Trash2 size={11} aria-hidden="true" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
        {!recentEnabled ? (
          <p className="px-1 text-center text-[11px] text-[#333333]">
            Recent searches are turned off.
          </p>
        ) : recentSearches.length > 0 ? (
          <div className="space-y-1">
            {recentSearches.map((recentQuery) => (
              <button
                key={recentQuery}
                type="button"
                onClick={() => onSelectRecent(recentQuery)}
                className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[#1A1A1A]"
              >
                <Clock size={13} className="shrink-0 text-[#4B5563]" aria-hidden="true" />
                <span className="flex-1 truncate text-sm text-[#D1D5DB]">{recentQuery}</span>
                <ArrowRight
                  size={12}
                  className="shrink-0 text-[#2A2A2A] transition-colors group-hover:text-[#4B5563]"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 text-center text-[11px] text-[#333333]">
            Your recent searches will appear here.
          </p>
        )}
      </section>
    </div>
  );
}

function PatronSearchFilters({
  creators,
  selectedCreatorIds,
  onSelectedCreatorIdsChange,
  mediaFilter,
  sort,
  onMediaFilterChange,
  onSortChange,
}: {
  creators: Creator[];
  selectedCreatorIds: string[];
  onSelectedCreatorIdsChange: (ids: string[]) => void;
  mediaFilter: PatronSearchMediaFilter;
  sort: PatronSearchSortMode;
  onMediaFilterChange: (value: PatronSearchMediaFilter) => void;
  onSortChange: (value: PatronSearchSortMode) => void;
}) {
  return (
    <div className="space-y-2 border-b border-[#1A1A1A] bg-[#0C0C0C] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-1 shrink-0 text-[10px] uppercase tracking-widest text-[#3D3D3D]">
          Creators
        </span>
        <PatronSearchCreatorPicker
          creators={creators}
          selectedIds={selectedCreatorIds}
          onChange={onSelectedCreatorIdsChange}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Media type">
        <span className="mr-1 text-[10px] uppercase tracking-widest text-[#3D3D3D]">Type</span>
        {MEDIA_FILTER_OPTIONS.map((option) => {
          const active = mediaFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onMediaFilterChange(option.id)}
              className={[
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "border border-[#2D6A4F]/60 bg-[#0D1F17] text-[#40916C]"
                  : "border border-[#2A2A2A] bg-[#111111] text-[#6B7280] hover:border-[#333333] hover:text-[#9CA3AF]",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-[#6B7280]">
        <span className="text-[10px] uppercase tracking-widest text-[#3D3D3D]">Sort</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as PatronSearchSortMode)}
          className="rounded-md border border-[#2A2A2A] bg-[#111111] px-2 py-1 text-[11px] text-[#D1D5DB] outline-none focus:border-[#2D6A4F]/50"
          aria-label="Sort search results"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      </div>
    </div>
  );
}

function HintMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-6 text-center text-sm text-[#4B5563]">{children}</p>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      className="mx-2 my-3 rounded-lg border border-[#3D1F1F] bg-[#1A1010] px-3 py-2.5 text-sm text-[#F87171]"
      role="alert"
    >
      {message}
    </div>
  );
}

function LoadMoreButton({
  loading,
  onClick,
  label,
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="px-2 py-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full rounded-lg border border-[#2A2A2A] bg-[#0C0C0C] px-3 py-2 text-xs font-medium text-[#9CA3AF] transition-colors hover:border-[#333333] hover:text-[#E5E7EB] disabled:opacity-50"
      >
        {loading ? "Loading…" : label}
      </button>
    </div>
  );
}
