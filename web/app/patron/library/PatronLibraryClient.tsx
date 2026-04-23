"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Heart,
  Layers,
  Loader2,
  Lock,
  Sparkles,
  Wallet,
  type LucideIcon
} from "lucide-react";
import {
  listAllPatronCollectionsEnriched,
  listAllPatronFavoritesEnriched,
  type PatronCollectionWithEnrichedEntries,
  type PatronFavoriteWithViewerEntitlement,
  type ViewerEntitlementState
} from "@/lib/relay-api";

// ─── Dev-only fixtures ─────────────────────────────────────────────────────────

type LibraryViewState = "loading" | "live" | "mixed" | "all-locked" | "empty" | "error";

const DEV_OVERRIDES = new Set<LibraryViewState>([
  "mixed",
  "all-locked",
  "empty",
  "error"
]);

function isDevToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

const NOW_ISO = "2026-04-22T00:00:00.000Z";

const FIXTURE_FAVORITES: PatronFavoriteWithViewerEntitlement[] = [
  {
    user_id: "fixture-user",
    creator_id: "creator-aurora",
    target_kind: "post",
    target_id: "post-aurora-1",
    created_at: NOW_ISO,
    viewer_entitlement: {
      state: "visible",
      required_tier_ids: [],
      source: "free_post"
    }
  },
  {
    user_id: "fixture-user",
    creator_id: "creator-mistwood",
    target_kind: "post",
    target_id: "post-mistwood-7",
    created_at: NOW_ISO,
    viewer_entitlement: {
      state: "visible",
      required_tier_ids: ["tier-mistwood-bronze"],
      source: "active_snapshot"
    }
  },
  {
    user_id: "fixture-user",
    creator_id: "creator-nightshade",
    target_kind: "media",
    target_id: "media-nightshade-cover-3",
    created_at: NOW_ISO,
    viewer_entitlement: {
      state: "preview",
      required_tier_ids: ["tier-nightshade-silver"],
      source: "active_snapshot"
    }
  },
  {
    user_id: "fixture-user",
    creator_id: "creator-saltflats",
    target_kind: "post",
    target_id: "post-saltflats-tip-only",
    created_at: NOW_ISO,
    viewer_entitlement: {
      state: "unlockable",
      required_tier_ids: [],
      source: "active_snapshot"
    }
  },
  {
    user_id: "fixture-user",
    creator_id: "creator-mistwood",
    target_kind: "post",
    target_id: "post-mistwood-locked-22",
    created_at: NOW_ISO,
    viewer_entitlement: {
      state: "locked",
      required_tier_ids: ["tier-mistwood-gold"],
      source: "active_snapshot"
    }
  },
  {
    user_id: "fixture-user",
    creator_id: "creator-aurora",
    target_kind: "post",
    target_id: "post-aurora-lapsed-9",
    created_at: NOW_ISO,
    viewer_entitlement: {
      state: "locked",
      required_tier_ids: ["tier-aurora-platinum"],
      source: "inactive_snapshot"
    }
  }
];

const FIXTURE_COLLECTIONS: PatronCollectionWithEnrichedEntries[] = [
  {
    collection_id: "col-favs",
    user_id: "fixture-user",
    creator_id: "creator-aurora",
    title: "Aurora — saved scenes",
    sort_order: 0,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    is_public: true,
    entries: [
      {
        entry_id: "e1",
        collection_id: "col-favs",
        user_id: "fixture-user",
        creator_id: "creator-aurora",
        post_id: "post-aurora-1",
        media_id: "media-a-1",
        created_at: NOW_ISO,
        viewer_entitlement: {
          state: "visible",
          required_tier_ids: [],
          source: "free_post"
        }
      },
      {
        entry_id: "e2",
        collection_id: "col-favs",
        user_id: "fixture-user",
        creator_id: "creator-aurora",
        post_id: "post-aurora-lapsed-9",
        media_id: "media-a-9",
        created_at: NOW_ISO,
        viewer_entitlement: {
          state: "locked",
          required_tier_ids: ["tier-aurora-platinum"],
          source: "inactive_snapshot"
        }
      }
    ]
  },
  {
    collection_id: "col-comics",
    user_id: "fixture-user",
    creator_id: "creator-mistwood",
    title: "Mistwood — comic pages I love",
    sort_order: 1,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    is_public: false,
    entries: [
      {
        entry_id: "e3",
        collection_id: "col-comics",
        user_id: "fixture-user",
        creator_id: "creator-mistwood",
        post_id: "post-mistwood-7",
        media_id: "media-m-7-pg2",
        created_at: NOW_ISO,
        viewer_entitlement: {
          state: "visible",
          required_tier_ids: ["tier-mistwood-bronze"],
          source: "active_snapshot"
        }
      },
      {
        entry_id: "e4",
        collection_id: "col-comics",
        user_id: "fixture-user",
        creator_id: "creator-mistwood",
        post_id: "post-mistwood-locked-22",
        media_id: "media-m-22-pg1",
        created_at: NOW_ISO,
        viewer_entitlement: {
          state: "locked",
          required_tier_ids: ["tier-mistwood-gold"],
          source: "active_snapshot"
        }
      },
      {
        entry_id: "e5",
        collection_id: "col-comics",
        user_id: "fixture-user",
        creator_id: "creator-nightshade",
        post_id: "post-nightshade-cross",
        media_id: "media-n-3",
        created_at: NOW_ISO,
        viewer_entitlement: {
          state: "preview",
          required_tier_ids: ["tier-nightshade-silver"],
          source: "active_snapshot"
        }
      }
    ]
  }
];

const FIXTURE_FAVORITES_ALL_LOCKED = FIXTURE_FAVORITES.map((f) => ({
  ...f,
  viewer_entitlement: {
    ...f.viewer_entitlement,
    state: "locked" as ViewerEntitlementState,
    source: "inactive_snapshot" as const
  }
}));

const FIXTURE_COLLECTIONS_ALL_LOCKED = FIXTURE_COLLECTIONS.map((c) => ({
  ...c,
  entries: c.entries.map((e) => ({
    ...e,
    viewer_entitlement: {
      ...e.viewer_entitlement,
      state: "locked" as ViewerEntitlementState,
      source: "inactive_snapshot" as const
    }
  }))
}));

// ─── Component ─────────────────────────────────────────────────────────────────

export function PatronLibraryClient() {
  const search = useSearchParams();
  const overrideRaw = search.get("state");
  const override =
    overrideRaw && DEV_OVERRIDES.has(overrideRaw as LibraryViewState)
      ? (overrideRaw as LibraryViewState)
      : null;
  const devTools = isDevToolsEnabled();

  const [view, setView] = useState<LibraryViewState>(override ?? "loading");
  const [favorites, setFavorites] = useState<PatronFavoriteWithViewerEntitlement[]>(
    []
  );
  const [collections, setCollections] = useState<
    PatronCollectionWithEnrichedEntries[]
  >([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (override === "mixed") {
      setFavorites(FIXTURE_FAVORITES);
      setCollections(FIXTURE_COLLECTIONS);
      setView("mixed");
      return;
    }
    if (override === "all-locked") {
      setFavorites(FIXTURE_FAVORITES_ALL_LOCKED);
      setCollections(FIXTURE_COLLECTIONS_ALL_LOCKED);
      setView("all-locked");
      return;
    }
    if (override === "empty") {
      setFavorites([]);
      setCollections([]);
      setView("empty");
      return;
    }
    if (override === "error") {
      setErrorText("Simulated relay error (dev fixture).");
      setView("error");
      return;
    }

    let cancelled = false;
    setView("loading");
    Promise.all([
      listAllPatronFavoritesEnriched(),
      listAllPatronCollectionsEnriched()
    ])
      .then(([favs, cols]) => {
        if (cancelled) return;
        setFavorites(favs);
        setCollections(cols);
        setView("live");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorText(err instanceof Error ? err.message : String(err));
        setView("error");
      });
    return () => {
      cancelled = true;
    };
  }, [override]);

  const counts = useMemo(() => summarize(favorites, collections), [
    favorites,
    collections
  ]);

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-8 px-4 py-10">
        <Header counts={counts} view={view} />

        <main aria-live="polite" className="flex flex-col gap-10">
          {view === "loading" ? <SectionLoading /> : null}
          {view === "error" ? <SectionError message={errorText} /> : null}
          {view === "empty" ? <SectionEmpty /> : null}
          {view === "live" || view === "mixed" || view === "all-locked" ? (
            <>
              <FavoritesSection items={favorites} />
              <CollectionsSection collections={collections} />
            </>
          ) : null}
        </main>

        {devTools ? <DevStateSwitcher current={override ?? "(live)"} /> : null}
      </div>
    </div>
  );
}

// ─── Sections ──────────────────────────────────────────────────────────────────

function Header({
  counts,
  view
}: {
  counts: { favs: number; cols: number; locked: number };
  view: LibraryViewState;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={16} aria-hidden style={{ color: "#C5B358" }} />
        <span
          className="text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "#9CA3AF" }}
        >
          Your library
        </span>
        {view !== "live" && view !== "loading" ? (
          <span
            className="ml-auto rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
            style={{ color: "#C5B358", borderColor: "#3a3315" }}
          >
            dev fixture · {view}
          </span>
        ) : null}
      </div>
      <h1 className="text-2xl font-semibold" style={{ color: "#F9FAFB" }}>
        Favorites &amp; collections
      </h1>
      <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
        Everything you&apos;ve saved across every creator you support. Items reflect
        your current tier — anything that&apos;s lapsed will re-unlock automatically
        when you renew.
      </p>
      <div
        className="flex flex-wrap gap-3 text-[11px]"
        style={{ color: "#9CA3AF" }}
      >
        <Stat icon={<Heart size={11} aria-hidden />} label={`${counts.favs} favorites`} />
        <Stat icon={<Layers size={11} aria-hidden />} label={`${counts.cols} collections`} />
        <Stat
          icon={<Lock size={11} aria-hidden />}
          label={`${counts.locked} locked right now`}
        />
      </div>
    </header>
  );
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1"
      style={{ borderColor: "#2A2A2A", background: "#111111" }}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

function FavoritesSection({
  items
}: {
  items: PatronFavoriteWithViewerEntitlement[];
}) {
  if (items.length === 0) {
    return (
      <Section title="Favorites" subtitle="Heart any post or page to keep it here.">
        <EmptyTile label="No favorites yet" />
      </Section>
    );
  }
  return (
    <Section
      title="Favorites"
      subtitle="Quick-access list. Items dim when their tier lapses."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((fav) => (
          <GatedTile
            key={`${fav.creator_id}:${fav.target_kind}:${fav.target_id}`}
            creatorId={fav.creator_id}
            label={`${fav.target_kind} · ${shortId(fav.target_id)}`}
            state={fav.viewer_entitlement.state}
            requiredTierIds={fav.viewer_entitlement.required_tier_ids}
            source={fav.viewer_entitlement.source}
          />
        ))}
      </div>
    </Section>
  );
}

function CollectionsSection({
  collections
}: {
  collections: PatronCollectionWithEnrichedEntries[];
}) {
  if (collections.length === 0) {
    return (
      <Section title="Collections" subtitle="Group saved pages into themed sets.">
        <EmptyTile label="No collections yet" />
      </Section>
    );
  }
  return (
    <Section
      title="Collections"
      subtitle="Each set can be private or shared on your public profile."
    >
      <div className="flex flex-col gap-6">
        {collections.map((c) => (
          <article
            key={c.collection_id}
            className="rounded-xl border p-4"
            style={{ borderColor: "#2A2A2A", background: "#111111" }}
          >
            <header className="mb-3 flex items-center gap-2">
              <h3
                className="text-sm font-semibold"
                style={{ color: "#F9FAFB" }}
              >
                {c.title}
              </h3>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  color: c.is_public ? "#40916C" : "#6B7280",
                  borderColor: c.is_public ? "#1f3d2c" : "#2A2A2A"
                }}
              >
                {c.is_public ? (
                  <span className="inline-flex items-center gap-1">
                    <Eye size={10} aria-hidden /> public
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <EyeOff size={10} aria-hidden /> private
                  </span>
                )}
              </span>
              <span
                className="ml-auto text-[10px]"
                style={{ color: "#6B7280" }}
              >
                {c.entries.length} item{c.entries.length === 1 ? "" : "s"}
              </span>
            </header>
            {c.entries.length === 0 ? (
              <EmptyTile label="Empty collection" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {c.entries.map((e) => (
                  <GatedTile
                    key={e.entry_id}
                    creatorId={e.creator_id}
                    label={`page · ${shortId(e.media_id)}`}
                    state={e.viewer_entitlement.state}
                    requiredTierIds={e.viewer_entitlement.required_tier_ids}
                    source={e.viewer_entitlement.source}
                  />
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "#E5E7EB" }}
        >
          {title}
        </h2>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          {subtitle}
        </p>
      </div>
      {children}
    </section>
  );
}

// ─── GatedTile + EntitlementBadge ──────────────────────────────────────────────

function GatedTile({
  creatorId,
  label,
  state,
  requiredTierIds,
  source
}: {
  creatorId: string;
  label: string;
  state: ViewerEntitlementState;
  requiredTierIds: string[];
  source: string;
}) {
  const isFullyVisible = state === "visible";
  const isPreview = state === "preview";
  const isUnlockable = state === "unlockable";
  const blur = isFullyVisible ? "0px" : isPreview ? "6px" : "14px";
  const dim = isFullyVisible ? 1 : 0.55;

  return (
    <div
      className="group relative overflow-hidden rounded-lg border"
      style={{ borderColor: "#2A2A2A", background: "#0d0d0d" }}
    >
      <div
        aria-hidden
        className="aspect-[4/5] w-full"
        style={{
          background:
            "linear-gradient(135deg, #1d2433 0%, #2a1d3a 50%, #1d2433 100%)",
          filter: `blur(${blur})`,
          opacity: dim,
          transition: "filter 200ms ease, opacity 200ms ease"
        }}
      />

      <div className="absolute left-2 top-2">
        <EntitlementBadge state={state} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2">
        <span
          className="truncate text-[10px]"
          style={{ color: "#9CA3AF" }}
          title={creatorId}
        >
          {creatorId}
        </span>
        <span className="truncate text-[11px]" style={{ color: "#E5E7EB" }}>
          {label}
        </span>
      </div>

      {!isFullyVisible ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center"
          style={{ background: "rgba(10,10,10,0.45)" }}
        >
          <GateCallout
            state={state}
            requiredTierIds={requiredTierIds}
            source={source}
          />
          {isUnlockable ? (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md border px-3 py-1.5 text-[11px] font-medium opacity-90"
              style={{
                background: "#2D6A4F",
                borderColor: "#40916C",
                color: "#F9FAFB"
              }}
              title="Tip-to-unlock arrives in PE-L."
            >
              Tip to unlock (soon)
            </button>
          ) : null}
          {state === "locked" ? (
            <Link
              href={`/patron/c/${encodeURIComponent(creatorId)}`}
              className="rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors hover:border-[#40916C] hover:text-[#F9FAFB]"
              style={{ borderColor: "#2A2A2A", color: "#E5E7EB" }}
            >
              Upgrade tier
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EntitlementBadge({ state }: { state: ViewerEntitlementState }) {
  const config: Record<
    ViewerEntitlementState,
    { label: string; color: string; bg: string; border: string; Icon: LucideIcon }
  > = {
    visible: {
      label: "Visible",
      color: "#86efac",
      bg: "rgba(20, 35, 25, 0.85)",
      border: "#1f3d2c",
      Icon: Eye
    },
    preview: {
      label: "Preview",
      color: "#93c5fd",
      bg: "rgba(20, 25, 40, 0.85)",
      border: "#1e3a5f",
      Icon: EyeOff
    },
    unlockable: {
      label: "Tip to unlock",
      color: "#fcd34d",
      bg: "rgba(40, 30, 10, 0.85)",
      border: "#3a3315",
      Icon: Wallet
    },
    locked: {
      label: "Locked",
      color: "#fca5a5",
      bg: "rgba(40, 18, 18, 0.85)",
      border: "#5a1f1f",
      Icon: Lock
    }
  };
  const { label, color, bg, border, Icon } = config[state];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{ background: bg, borderColor: border, color }}
    >
      <Icon size={10} aria-hidden />
      {label}
    </span>
  );
}

function GateCallout({
  state,
  requiredTierIds,
  source
}: {
  state: ViewerEntitlementState;
  requiredTierIds: string[];
  source: string;
}) {
  const tierBlurb =
    requiredTierIds.length === 0
      ? null
      : `Tier${requiredTierIds.length === 1 ? "" : "s"}: ${requiredTierIds
          .map(shortId)
          .join(", ")}`;
  const sourceBlurb =
    source === "inactive_snapshot"
      ? "Your tier here lapsed."
      : source === "missing_snapshot"
        ? "We don't have an active tier for this creator yet."
        : null;
  const headline =
    state === "preview"
      ? "Preview only"
      : state === "unlockable"
        ? "Available with a tip"
        : "Locked";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold" style={{ color: "#F9FAFB" }}>
        {headline}
      </span>
      {tierBlurb ? (
        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
          {tierBlurb}
        </span>
      ) : null}
      {sourceBlurb ? (
        <span className="text-[10px]" style={{ color: "#fca5a5" }}>
          {sourceBlurb}
        </span>
      ) : null}
    </div>
  );
}

function EmptyTile({ label }: { label: string }) {
  return (
    <div
      className="flex aspect-[4/5] max-w-[160px] flex-col items-center justify-center rounded-lg border text-[11px]"
      style={{
        borderColor: "#2A2A2A",
        background: "#0d0d0d",
        color: "#6B7280"
      }}
    >
      {label}
    </div>
  );
}

// ─── Status panes ──────────────────────────────────────────────────────────────

function SectionLoading() {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-xl border py-12"
      style={{ background: "#111111", borderColor: "#2A2A2A", color: "#9CA3AF" }}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">Loading your library…</span>
    </div>
  );
}

function SectionError({ message }: { message: string | null }) {
  return (
    <section
      className="space-y-3 rounded-xl border p-6"
      style={{ background: "#111111", borderColor: "#5a1f1f" }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} aria-hidden style={{ color: "#fca5a5" }} />
        <h2 className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
          Couldn&apos;t load your library
        </h2>
      </div>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>
        {message ??
          "The Relay API didn't respond. If you're a developer, make sure `npm start` is running."}
      </p>
      <p className="text-[11px]" style={{ color: "#6B7280" }}>
        You also need to be signed in as a supporter for the cross-creator endpoints
        to return data.
      </p>
      <div className="flex gap-2">
        <Link
          href="/patron/library"
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: "#2A2A2A", color: "#E5E7EB" }}
        >
          Retry
        </Link>
        <Link
          href="/login?role=supporter"
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: "#2A2A2A", color: "#E5E7EB" }}
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}

function SectionEmpty() {
  return (
    <section
      className="space-y-3 rounded-xl border p-6"
      style={{ background: "#111111", borderColor: "#2A2A2A" }}
    >
      <div className="flex items-center gap-2">
        <Heart size={16} aria-hidden style={{ color: "#C5B358" }} />
        <h2 className="text-sm font-semibold" style={{ color: "#F9FAFB" }}>
          Nothing saved yet
        </h2>
      </div>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>
        Heart a post in your feed or pin a page into a collection — they&apos;ll
        show up here, organized across every creator you support.
      </p>
      <Link
        href="/patron/feed"
        className="inline-block rounded-md border px-3 py-1.5 text-xs"
        style={{ borderColor: "#40916C", color: "#F9FAFB", background: "#2D6A4F" }}
      >
        Open your feed
      </Link>
    </section>
  );
}

// ─── Dev switcher ──────────────────────────────────────────────────────────────

function DevStateSwitcher({ current }: { current: string }) {
  const options: { id: LibraryViewState; label: string }[] = [
    { id: "mixed", label: "Mixed states" },
    { id: "all-locked", label: "All locked (lapsed)" },
    { id: "empty", label: "Empty library" },
    { id: "error", label: "API error" }
  ];
  return (
    <div
      className="rounded-lg border px-3 py-3 text-[11px]"
      style={{ background: "#0d0d0d", borderColor: "#2A2A2A", color: "#6B7280" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={11} aria-hidden />
        <span className="uppercase tracking-wide">Dev state switcher</span>
        <span className="ml-auto" style={{ color: "#9CA3AF" }}>
          current: {current}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/patron/library"
          className="rounded border px-2 py-1 transition-colors hover:border-[#40916C] hover:text-[#E5E7EB]"
          style={{ borderColor: "#2A2A2A" }}
        >
          live
        </Link>
        {options.map((opt) => (
          <Link
            key={opt.id}
            href={`/patron/library?state=${opt.id}`}
            className="rounded border px-2 py-1 transition-colors hover:border-[#40916C] hover:text-[#E5E7EB]"
            style={{ borderColor: "#2A2A2A" }}
          >
            {opt.label}
          </Link>
        ))}
      </div>
      <p className="mt-2 leading-relaxed">
        Hidden in production (NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS).
      </p>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function summarize(
  favs: PatronFavoriteWithViewerEntitlement[],
  cols: PatronCollectionWithEnrichedEntries[]
): { favs: number; cols: number; locked: number } {
  let locked = 0;
  for (const f of favs) {
    if (f.viewer_entitlement.state === "locked") locked += 1;
  }
  for (const c of cols) {
    for (const e of c.entries) {
      if (e.viewer_entitlement.state === "locked") locked += 1;
    }
  }
  return { favs: favs.length, cols: cols.length, locked };
}
