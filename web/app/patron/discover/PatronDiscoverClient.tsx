"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Compass,
  Loader2,
  Search,
  X
} from "lucide-react";
import {
  listDiscoverFeed,
  type DiscoverItem,
  type DiscoverPageResult
} from "@/lib/relay-api";

// ─── Dev-only fixtures ─────────────────────────────────────────────────────────

type DiscoverViewState =
  | "loading"
  | "live"
  | "mixed"
  | "empty"
  | "error"
  | "searched";

const DEV_OVERRIDES = new Set<DiscoverViewState>(["mixed", "empty", "error", "searched"]);

function isDevToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

const NOW_ISO = "2026-04-22T00:00:00.000Z";

const FIXTURE_ITEMS: DiscoverItem[] = [
  {
    creator_id: "creator-aurora",
    post_id: "post-aurora-1",
    title: "Sunset over the dunes",
    description: "Long exposure, golden hour series.",
    published_at: NOW_ISO,
    tag_ids: ["landscape", "warm", "long-exposure"],
    cover_media_id: "media-aurora-cover-1"
  },
  {
    creator_id: "creator-mistwood",
    post_id: "post-mistwood-7",
    title: "Forest floor still life",
    description: "Studio closeups of moss + ferns.",
    published_at: "2026-04-21T18:00:00Z",
    tag_ids: ["nature", "macro"],
    cover_media_id: "media-mistwood-cover-7"
  },
  {
    creator_id: "creator-nightshade",
    post_id: "post-nightshade-3",
    title: "Night market sketches",
    published_at: "2026-04-21T12:00:00Z",
    tag_ids: ["urban", "ink"],
    cover_media_id: "media-nightshade-cover-3"
  },
  {
    creator_id: "creator-aurora",
    post_id: "post-aurora-2",
    title: "Coastal storm",
    published_at: "2026-04-20T22:00:00Z",
    tag_ids: ["landscape", "moody"],
    cover_media_id: "media-aurora-cover-2"
  },
  {
    creator_id: "creator-pumice",
    post_id: "post-pumice-4",
    title: "Type specimen — geological survey",
    description: "Field notes typeset for print.",
    published_at: "2026-04-20T09:00:00Z",
    tag_ids: ["typography", "publication"],
    cover_media_id: "media-pumice-cover-4"
  },
  {
    creator_id: "creator-fern",
    post_id: "post-fern-1",
    title: "Riverside walk",
    published_at: "2026-04-19T11:00:00Z",
    tag_ids: ["landscape", "soft-light"],
    cover_media_id: "media-fern-cover-1"
  }
];

function fixtureFor(state: DiscoverViewState): DiscoverPageResult {
  if (state === "empty") return { items: [], next_cursor: null };
  if (state === "searched") {
    // Filter the fixture to titles matching "sunset" so the search-result state is realistic.
    return {
      items: FIXTURE_ITEMS.filter((i) => i.title.toLowerCase().includes("sunset")),
      next_cursor: null
    };
  }
  return { items: FIXTURE_ITEMS, next_cursor: null };
}

// ─── Page client ───────────────────────────────────────────────────────────────

export function PatronDiscoverClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const requestedState = searchParams.get("state");
  const isDevState =
    isDevToolsEnabled() &&
    typeof requestedState === "string" &&
    DEV_OVERRIDES.has(requestedState as DiscoverViewState);
  const devState = isDevState ? (requestedState as DiscoverViewState) : null;

  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial + refresh on submitted query change.
  useEffect(() => {
    if (devState !== null) {
      // Dev override: render the synthetic fixture page immediately.
      const fx = fixtureFor(devState);
      setItems(fx.items);
      setNextCursor(fx.next_cursor);
      setPhase(devState === "error" ? "error" : "ready");
      setErrorMessage(devState === "error" ? "Simulated discover error." : null);
      return;
    }
    let cancelled = false;
    setPhase("loading");
    setErrorMessage(null);
    void (async () => {
      try {
        const page = await listDiscoverFeed({
          q: submittedQuery || undefined
        });
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.next_cursor);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [devState, submittedQuery]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listDiscoverFeed({
        q: submittedQuery || undefined,
        cursor: nextCursor
      });
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0]">
      <Header />

      {devState ? <DevStateBanner state={devState} /> : null}

      <SearchBox
        value={query}
        onChange={setQuery}
        onSubmit={() => setSubmittedQuery(query.trim())}
        onClear={() => {
          setQuery("");
          setSubmittedQuery("");
        }}
      />

      <main className="mx-auto max-w-6xl px-6 pb-12">
        {phase === "loading" ? <LoadingState /> : null}
        {phase === "error" ? (
          <ErrorState
            message={errorMessage ?? "Failed to load Discover."}
            onRetry={() => setSubmittedQuery((q) => q + "")}
          />
        ) : null}
        {phase === "ready" && items.length === 0 ? (
          <EmptyState query={submittedQuery} />
        ) : null}
        {phase === "ready" && items.length > 0 ? (
          <DiscoverGrid items={items} />
        ) : null}

        {phase === "ready" && nextCursor ? (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => void handleLoadMore()}
              disabled={loadingMore}
              className="rounded border border-[#2A2A2A] px-4 py-2 text-sm text-[#bbb] hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Header(): React.ReactElement {
  return (
    <header className="border-b border-[#1F1F1F] px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <Compass size={18} className="text-[#40916C]" aria-hidden />
        <h1 className="text-base font-semibold">Discover</h1>
        <span className="text-xs text-[#666]">PE-F · v1 · free posts only</span>
        <Link
          href="/patron/feed"
          className="ml-auto text-xs text-[#888] underline-offset-2 hover:text-white hover:underline"
        >
          Back to feed
        </Link>
      </div>
    </header>
  );
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  onClear
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="relative flex items-center gap-2"
      >
        <Search
          size={14}
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by title, tag, or description…"
          className="w-full rounded border border-[#2A2A2A] bg-[#141414] py-2 pl-9 pr-9 text-sm text-[#E0E0E0] placeholder:text-[#555] focus:border-[#2D6A4F] focus:outline-none"
          aria-label="Search Discover"
        />
        {value.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#666] hover:text-white"
          >
            <X size={12} />
          </button>
        ) : null}
      </form>
    </div>
  );
}

function DiscoverGrid({ items }: { items: DiscoverItem[] }): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <DiscoverCard key={`${item.creator_id}\0${item.post_id}`} item={item} />
      ))}
    </div>
  );
}

function DiscoverCard({ item }: { item: DiscoverItem }): React.ReactElement {
  return (
    <Link
      href={`/patron/feed?post_id=${encodeURIComponent(item.post_id)}`}
      className="group rounded-lg border border-[#1F1F1F] bg-[#141414] transition-colors hover:border-[#2A2A2A]"
    >
      <CoverPlaceholder mediaId={item.cover_media_id} title={item.title} />
      <div className="p-3">
        <h2 className="line-clamp-2 text-sm font-medium text-[#E0E0E0] group-hover:text-white">
          {item.title}
        </h2>
        {item.description ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-[#888]">{item.description}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[#666]">
          <span className="truncate">{item.creator_id}</span>
          <span>·</span>
          <span>{humanise(item.published_at)}</span>
        </div>
        {item.tag_ids.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tag_ids.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#1B4332]/50 bg-[#0D1F17] px-1.5 py-0.5 text-[9px] text-[#40916C]"
              >
                #{tag}
              </span>
            ))}
            {item.tag_ids.length > 4 ? (
              <span className="text-[9px] text-[#555]">+{item.tag_ids.length - 4}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function CoverPlaceholder({
  mediaId,
  title
}: {
  mediaId?: string;
  title: string;
}): React.ReactElement {
  return (
    <div
      className="flex aspect-[4/3] items-center justify-center rounded-t-lg bg-gradient-to-br from-[#1B4332] via-[#161616] to-[#1F1F1F] text-[10px] uppercase tracking-wide text-[#40916C]/70"
      aria-label={mediaId ? `Cover for ${title}` : "No cover image"}
    >
      {mediaId ? mediaId.slice(-12) : "no cover"}
    </div>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-xs text-[#666]">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Loading Discover…
    </div>
  );
}

function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="mx-auto mt-8 flex max-w-md items-start gap-3 rounded-md border border-[#3a1414] bg-[#1f0808] p-4 text-xs text-[#d36a6a]">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">
        <div className="mb-1 font-medium">Couldn't load Discover</div>
        <div className="text-[11px] text-[#a06a6a]">{message}</div>
        <button
          onClick={onRetry}
          className="mt-2 rounded border border-[#3a1414] px-2 py-0.5 text-[11px] text-white hover:border-[#5a2424]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: string }): React.ReactElement {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-md border border-[#2A2A2A] bg-[#141414] p-6 text-center text-xs text-[#888]">
      <Compass size={20} aria-hidden className="mx-auto mb-2 text-[#40916C]/60" />
      {query ? (
        <>
          <div className="font-medium text-[#E0E0E0]">No results for "{query}".</div>
          <div className="mt-1 text-[11px] text-[#666]">
            Try fewer keywords, or clear the search to browse everything.
          </div>
        </>
      ) : (
        <>
          <div className="font-medium text-[#E0E0E0]">Nothing here yet.</div>
          <div className="mt-1 text-[11px] text-[#666]">
            Discover surfaces creator-opted-in free posts. Check back soon, or explore from your
            feed.
          </div>
        </>
      )}
    </div>
  );
}

function DevStateBanner({ state }: { state: DiscoverViewState }): React.ReactElement {
  return (
    <div className="px-6 pt-4">
      <div className="mx-auto flex max-w-6xl items-start gap-2 rounded-md border border-[#2A2A2A] bg-[#141414] p-3 text-xs text-[#bbb]">
        <span className="mt-0.5 inline-block rounded bg-[#1B4332] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#9bf0c4]">
          dev
        </span>
        <div>
          <div className="font-medium text-[#E0E0E0]">
            Preview state: <code className="text-[#9bf0c4]">{state}</code>
          </div>
          <div className="mt-0.5 text-[10px] text-[#666]">
            Fixture data is being shown so design / QA can review without seeded backend rows.
            Remove the <code>?state=</code> query parameter to hit the live API.
          </div>
        </div>
      </div>
    </div>
  );
}

function humanise(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
