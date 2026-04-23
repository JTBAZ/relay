"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  Share2,
  Pencil,
  ImageIcon,
  Heart,
  MessageSquare,
  Bookmark,
  ArrowRight,
  Clock,
  ExternalLink,
} from "lucide-react";
import {
  CURRENT_VIEWER,
  FOLLOWED_CREATORS,
  type TierLabel,
} from "@/lib/relay-fixtures";

// ── Placeholder data (collections / favorites / comments — mock until API) ───

const COLLECTIONS = [
  {
    id: "col1",
    title: "Fog & Silence",
    itemCount: 12,
    coverColor: "#141414",
  },
  {
    id: "col2",
    title: "Inspiration Board",
    itemCount: 8,
    coverColor: "#101a14",
  },
  {
    id: "col3",
    title: "Architecture",
    itemCount: 5,
    coverColor: "#141414",
  },
];

const RECENT_FAVORITES = [
  { id: "f1", label: "Golden Hour at the Cliffs" },
  { id: "f2", label: "Character Study #42" },
  { id: "f3", label: "Monsoon Fishermen" },
  { id: "f4", label: "Fog Composition" },
  { id: "f5", label: "Urban Negative Space" },
];

const TIER_COLOR: Record<TierLabel, string> = {
  Studio: "#C5B358",
  Supporter: "#40916C",
  Free: "#6B7280",
};

const SUPPORT_SINCE = ["Jan 2024", "Mar 2024", "Aug 2023", "Apr 2023"];

const SUPPORTED_CREATORS = FOLLOWED_CREATORS.slice(0, 4).map((c, i) => {
  const tier = c.patronTierLabel ?? "Supporter";
  return {
    id: c.id,
    handle: c.handle,
    displayName: c.displayName,
    discipline: c.discipline,
    avatarUrl: c.avatarUrl,
    tier,
    tierColor: TIER_COLOR[tier],
    status: i === 3 ? ("Lapsed" as const) : ("Active" as const),
    since: SUPPORT_SINCE[i] ?? "—",
  };
});

const RECENT_COMMENTS = [
  {
    id: "rc1",
    quote:
      "The way light hits the edge of that cliff is extraordinary — it almost reads as grief made visible.",
    postTitle: "Golden Hour at the Cliffs",
    creatorName: "Mara Osei",
    timestamp: "3 days ago",
    pinned: true,
  },
  {
    id: "rc2",
    quote:
      "This series keeps getting better. The restraint in the composition is doing a lot of heavy lifting.",
    postTitle: "Winter Light Series, Vol. 3",
    creatorName: "Elena Vasquez",
    timestamp: "1 week ago",
    pinned: false,
  },
  {
    id: "rc3",
    quote:
      "I didn't expect to feel something during a music piece about infrastructure — here we are.",
    postTitle: "Sound Waves Visualized",
    creatorName: "James Thorne",
    timestamp: "2 weeks ago",
    pinned: false,
  },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#C8C8C8]">
      {children}
    </h2>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[#1A1A1A] bg-[#0E0E0E] p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export interface ProfilePageProps {
  /** When embedded in RelayApp, switches home/discover. Otherwise links to `/patron/feed`. */
  onNavigate?: (view: "home" | "discover") => void;
}

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const [collectionsEmpty] = useState(false);

  const activeCount = SUPPORTED_CREATORS.filter((c) => c.status === "Active").length;
  const lapsedCount = SUPPORTED_CREATORS.filter((c) => c.status === "Lapsed").length;

  const feedDiscoverActions = onNavigate ? (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onNavigate("home")}
        className="flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-3 py-1.5 text-xs text-[#888888] transition-colors duration-150 hover:border-[#333333] hover:text-[#C8C8C8]"
      >
        Go to feed
        <ArrowRight size={11} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate("discover")}
        className="flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-3 py-1.5 text-xs text-[#888888] transition-colors duration-150 hover:border-[#333333] hover:text-[#C8C8C8]"
      >
        Discover
        <ArrowRight size={11} aria-hidden="true" />
      </button>
    </div>
  ) : (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/patron/feed"
        className="flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-3 py-1.5 text-xs text-[#888888] transition-colors duration-150 hover:border-[#333333] hover:text-[#C8C8C8]"
      >
        Go to feed
        <ArrowRight size={11} aria-hidden="true" />
      </Link>
      <Link
        href="/patron/feed"
        className="flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-3 py-1.5 text-xs text-[#888888] transition-colors duration-150 hover:border-[#333333] hover:text-[#C8C8C8]"
      >
        Discover
        <ArrowRight size={11} aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <div className="min-h-full bg-[#0A0A0A] font-sans text-[#C8C8C8]">
      <div className="mx-auto max-w-[960px] space-y-10 px-4 py-10 sm:px-6">
        {/* ── 1. Identity header ── */}
        <section className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#242424] bg-[#1A1A1A] sm:h-24 sm:w-24">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixture URL */}
            <img
              src={CURRENT_VIEWER.avatarUrl}
              alt={CURRENT_VIEWER.displayName}
              className="h-full w-full object-cover"
              width={96}
              height={96}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {CURRENT_VIEWER.displayName}
            </h1>
            <p className="mt-0.5 text-sm text-[#555555]">@{CURRENT_VIEWER.handle}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#888888]">
              Collector of quiet images and slow ideas. Patron of work that resists the feed.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-[#242424] bg-[#141414] px-4 py-2 text-sm text-[#C8C8C8] transition-colors duration-150 hover:border-[#333333] hover:text-white"
            >
              <Pencil size={13} aria-hidden="true" />
              Edit profile
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-[#1A1A1A] px-4 py-2 text-sm text-[#555555] transition-colors duration-150 hover:border-[#2A2A2A] hover:text-[#888888]"
            >
              <Share2 size={13} aria-hidden="true" />
              Share
            </button>
          </div>
        </section>

        {/* ── 2. Taste ── */}
        <section>
          <SectionHeading>Collections</SectionHeading>

          {collectionsEmpty ? (
            <Card>
              <div className="py-8 text-center">
                <Bookmark size={28} className="mx-auto mb-3 text-[#2A2A2A]" aria-hidden="true" />
                <p className="mb-1 text-sm text-[#555555]">No collections yet</p>
                <p className="mb-5 text-xs text-[#3A3A3A]">
                  Save work you love and build collections around ideas that matter to you.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#40916C]"
                  >
                    Save your first favorite
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#242424] px-4 py-2 text-sm text-[#555555] transition-colors duration-150 hover:border-[#333333] hover:text-[#888888]"
                  >
                    Create a collection
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COLLECTIONS.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  className="group overflow-hidden rounded-xl border border-[#1A1A1A] bg-[#0E0E0E] text-left transition-colors duration-150 hover:border-[#2A2A2A]"
                >
                  <div
                    className="flex h-28 items-center justify-center"
                    style={{ background: col.coverColor }}
                    aria-hidden="true"
                  >
                    <ImageIcon
                      size={22}
                      className="text-[#2A2A2A] transition-colors duration-150 group-hover:text-[#3A3A3A]"
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-[#C8C8C8] transition-colors duration-150 group-hover:text-white">
                        {col.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#3A3A3A]">{col.itemCount} items</p>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-[#3A3A3A] transition-colors duration-150 group-hover:text-[#555555]"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}

          {!collectionsEmpty ? (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#3A3A3A]">
                  Recent favorites
                </h3>
                <button
                  type="button"
                  className="text-xs text-[#40916C] transition-colors duration-150 hover:text-[#52a87d]"
                >
                  View all
                </button>
              </div>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                {RECENT_FAVORITES.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    className="group flex shrink-0 flex-col gap-1.5"
                    title={fav.label}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[#1A1A1A] bg-[#141414] transition-colors duration-150 group-hover:border-[#2A2A2A]">
                      <Heart
                        size={14}
                        className="text-[#2A2A2A] transition-colors duration-150 group-hover:text-[#3A3A3A]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="w-16 truncate text-center text-[10px] leading-tight text-[#444444]">
                      {fav.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* ── 3. Support network ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <SectionHeading>Creators you support</SectionHeading>
            <span className="-mt-4 text-xs text-[#444444]">
              {activeCount} active · {lapsedCount} lapsed
            </span>
          </div>

          <div className="space-y-2">
            {SUPPORTED_CREATORS.map((creator) => (
              <Link
                key={creator.id}
                href={`/patron/c/${encodeURIComponent(creator.handle)}`}
                className="group flex w-full items-center gap-4 rounded-xl border border-[#1A1A1A] bg-[#0E0E0E] px-4 py-3.5 transition-colors duration-150 hover:border-[#2A2A2A]"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#222222] bg-[#1A1A1A]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={creator.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    width={36}
                    height={36}
                  />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-[#C8C8C8] transition-colors duration-150 group-hover:text-white">
                      {creator.displayName}
                    </span>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: creator.tierColor,
                        borderColor: `${creator.tierColor}33`,
                        backgroundColor: `${creator.tierColor}11`,
                      }}
                    >
                      {creator.tier}
                    </span>
                    <span
                      className={[
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
                        creator.status === "Active"
                          ? "border-[#40916C]/20 bg-[#40916C]/10 text-[#40916C]"
                          : "border-[#333333] bg-[#141414] text-[#555555]",
                      ].join(" ")}
                    >
                      {creator.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#444444]">
                    {creator.discipline} · since {creator.since}
                  </p>
                </div>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-[#2A2A2A] transition-colors duration-150 group-hover:text-[#444444]"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>

          <Link
            href="/patron/former-subscriptions"
            className="mt-3 inline-block text-xs text-[#3A3A3A] transition-colors duration-150 hover:text-[#555555]"
          >
            Former subscriptions
          </Link>
        </section>

        {/* ── 4. Voice on work ── */}
        <section>
          <SectionHeading>Recent on posts</SectionHeading>

          <div className="space-y-2">
            {RECENT_COMMENTS.map((comment) => (
              <Card key={comment.id} className="group">
                <div className="flex items-start gap-3">
                  <MessageSquare
                    size={13}
                    className={[
                      "mt-0.5 shrink-0",
                      comment.pinned ? "text-[#C5B358]" : "text-[#333333]",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm italic leading-relaxed text-[#A0A0A0]">
                      &ldquo;{comment.quote}&rdquo;
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <p className="truncate text-xs text-[#444444]">
                        on <span className="text-[#555555]">{comment.postTitle}</span> by{" "}
                        {comment.creatorName}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="flex items-center gap-1 text-xs text-[#3A3A3A]">
                          <Clock size={10} aria-hidden="true" />
                          {comment.timestamp}
                        </span>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-[#40916C] transition-colors duration-150 hover:text-[#52a87d]"
                        >
                          Open
                          <ExternalLink size={10} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ── 5. What’s next ── */}
        <section>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#C8C8C8]">
                  Commission Hub
                </h2>
                <p className="text-sm leading-relaxed text-[#555555]">
                  You have 1 bookmarked brief and 1 draft inquiry.
                </p>
                <Link
                  href="/patron/commission-hub"
                  className="mt-2 inline-block text-xs text-[#C5B358] transition-colors duration-150 hover:text-[#d4c370]"
                >
                  Browse marketplace
                </Link>
              </div>
              {feedDiscoverActions}
            </div>
          </Card>
        </section>

        {/* ── 6. Footer strip ── */}
        <footer className="border-t border-[#141414] pb-4 pt-6">
          <nav className="flex flex-wrap items-center gap-6" aria-label="Account">
            {["Notifications", "Preferences", "Settings"].map((label) => (
              <button
                key={label}
                type="button"
                className="text-xs text-[#3A3A3A] transition-colors duration-150 hover:text-[#666666]"
              >
                {label}
              </button>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  );
}
