"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Home,
  Compass,
  Store,
  Settings,
  Menu,
  X,
  Search,
  Command,
  Plus,
  ExternalLink,
  History,
} from "lucide-react";
import {
  isPatronPrimaryNavItemActive,
  PatronPrimaryTopNav,
} from "@/components/patron/PatronPrimaryTopNav";
import { DiscoverGrid } from "./discover-grid";
import { FeedCard } from "./feed-card";
import { FeedSectionDivider } from "./feed-section-divider";
import { EmptyState } from "./empty-state";
import { ErrorBanner } from "./error-banner";
import { PatronEntitlementStaleBanner } from "./patron-entitlement-stale-banner";
import { PatronEmptyFeedState } from "./patron-empty-feed-state";
import { CommandPalette } from "./command-palette";
import { GalleryView } from "./gallery-view";
import { ConnectCampaignModal } from "./connect-campaign-modal";
import { SettingsModal } from "./settings-modal";
import type { FeedFilter } from "./filter-chips";
import { PatronFeedDevTools } from "./patron-feed-dev-tools";
import { RelayMarkIcon } from "./relay-mark-icon";
import { WhatYouMissedCarousel } from "./what-you-missed-carousel";
import {
  getPatronFeedFixtureBundle,
  mapPatronFollowApiItemToCreator,
  sortFollowedForSidebar,
  type Creator,
  type FeedPost,
  type DiscoverItem,
  type PatronFeedBundle,
  type PatronFeedDataSource,
} from "@/lib/relay-fixtures";
import { fetchPatronFollows } from "@/lib/patron-follows-api";
import {
  fetchPatronRelayFeedWithOptions,
} from "@/lib/patron-feed-api";
import {
  clearPatronConnectCampaignStorage,
  getSnapshotPatronConnectCampaign,
  readAndConsumeSessionPatronConnectPrompt,
  type PatronConnectCampaignPayload
} from "@/lib/patron-connect-campaign-prompt";
import {
  deletePatronPatreonLink,
  fetchPatronSessionMe,
  hasRelaySignedInCookie,
  type PatronSessionMe,
  RelayApiError,
} from "@/lib/relay-api";
import { emitPatronFeedTelemetryEvent } from "@/lib/patron-feed-telemetry";
import { performRelayLogout } from "@/lib/relay-session-logout";

export interface RelayAppProps {
  /**
   * Default data source before dev-tool override.
   * If omitted, uses `NEXT_PUBLIC_RELAY_PATRON_FEED_DEFAULT` (`fixtures` forces mock; otherwise **live** API — PE-B).
   */
  initialDataSource?: PatronFeedDataSource;
}

type AppView = "home" | "discover";
type FeedPostIntent = "comment" | "snip";

type TransitionState = "idle" | "exiting" | "entering";

const DEMO_EMPTY_FOLLOWS = false;
const DEMO_ERROR_BANNER = false;
const TRANSITION_DURATION = 400;

const showPatronFeedDevTools =
  process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS === "true";

const INVITE_RELAY_MOCK =
  "Relay invite (mock): when your creator links their Relay page, you both unlock shared perks.";

/** Right column: matches green dot column so + aligns vertically with dots above. */
function FollowingStatusColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center">{children}</div>
  );
}

function FollowingCreatorRow({ creator }: { creator: Creator }) {
  const onRelay = creator.onRelay !== false;
  const tier = creator.patronTierLabel;

  const copyInvite = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const extra = creator.patreonCreatorUrl ? `\n${creator.patreonCreatorUrl}` : "";
    void navigator.clipboard?.writeText(`${INVITE_RELAY_MOCK}${extra}`);
  };

  const avatar = (
    <div
      className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[#2A2A2A]"
      aria-hidden="true"
    >
      <img
        src={creator.avatarUrl}
        alt=""
        className="h-full w-full object-cover"
        width={24}
        height={24}
      />
    </div>
  );

  const nameAndTier = onRelay ? (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="truncate text-[#5A5A5A]">{creator.displayName}</span>
      {tier ? (
        <span className="shrink-0 rounded border border-[#2A2A2A] px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-[#6B7280]">
          {tier}
        </span>
      ) : null}
    </div>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="truncate text-[#52525b]">{creator.displayName}</span>
      {tier ? (
        <span className="shrink-0 rounded border border-[#1f1f1f] px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-[#5c5c62]">
          {tier}
        </span>
      ) : null}
      <ExternalLink className="h-3 w-3 shrink-0 text-[#3f3f46]" aria-hidden="true" />
    </div>
  );

  if (onRelay) {
    return (
      <div className="flex w-full items-center gap-1 pr-1">
        <Link
          href={`/${encodeURIComponent(creator.handle)}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-xs transition-colors duration-150 hover:bg-[#141414]"
        >
          {avatar}
          {nameAndTier}
        </Link>
        <FollowingStatusColumn>
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#2D6A4F]"
            title="On Relay"
            aria-label="On Relay"
            role="img"
          />
        </FollowingStatusColumn>
      </div>
    );
  }

  const href = creator.patreonCreatorUrl?.trim() || "#";
  return (
    <div className="flex w-full items-center gap-1 pr-1 opacity-[0.92]">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-xs transition-colors duration-150 hover:bg-[#141414]"
      >
        {avatar}
        {nameAndTier}
      </a>
      <FollowingStatusColumn>
        <button
          type="button"
          onClick={copyInvite}
          className="flex h-full w-full items-center justify-center rounded-md text-[#5A5A5A] transition-colors hover:text-[#40916C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2D6A4F]/50"
          aria-label={`Invite ${creator.displayName} to link Relay — copies a short message`}
          title="Invite to Relay (copies a short message)"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </FollowingStatusColumn>
    </div>
  );
}

function emptyLiveShell(fixture: PatronFeedBundle): PatronFeedBundle {
  return {
    feedPosts: [],
    lockedPosts: [],
    discoverItems: [],
    currentViewer: fixture.currentViewer,
    followedCreators: [],
    notifications: [],
    entitlement_degraded: false,
    entitlement_stale_since: null
  };
}

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "marketplace", label: "Marketplace", icon: Store },
] as const;

function filterPosts(posts: FeedPost[], filter: FeedFilter): FeedPost[] {
  switch (filter) {
    case "following":
      return posts.filter((p) => p.kind === "followed");
    case "free":
      return posts.filter((p) => p.tierLabel === "Free" || p.kind === "discovery");
    case "photos":
      return posts.filter((p) => p.mediaType === "photo");
    case "audio":
      return posts.filter((p) => p.mediaType === "audio");
    case "writing":
      return posts.filter((p) => p.mediaType === "writing");
    default:
      return posts;
  }
}

/** Maps UI chip → `GET /api/v1/patron/relay_feed?filter=` (omit for `all`). */
function feedFilterToApiParam(filter: FeedFilter): string | undefined {
  if (filter === "all") return undefined;
  return filter;
}

function discoverItemToPost(item: DiscoverItem): FeedPost {
  return {
    id: item.id,
    kind: "discovery",
    feed_item_source: "discover",
    creator: item.creator,
    title: item.title,
    excerpt: `A ${item.mediaType} by ${item.creator.displayName}`,
    mediaType: item.mediaType,
    coverImageUrl: item.imageUrl,
    highResImageUrl: item.imageUrl.replace("height=", "height=800&width=1200&orig_height="),
    publishedAt: "Recent",
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    tierLabel: "Free",
  };
}

export function RelayApp({ initialDataSource }: RelayAppProps = {}) {
  const [dataSource, setDataSource] = useState<PatronFeedDataSource>(() => {
    if (initialDataSource) return initialDataSource;
    const env = process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEFAULT?.trim();
    if (env === "fixtures") return "fixtures";
    return "live";
  });
  const fixtureBundle = useMemo(() => getPatronFeedFixtureBundle(), []);
  const [liveBundle, setLiveBundle] = useState<PatronFeedBundle | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveLoadingMore, setLiveLoadingMore] = useState(false);
  const [liveFeedError, setLiveFeedError] = useState<{
    message: string;
    status: number;
    code?: string;
  } | null>(null);
  const [liveFetchGen, setLiveFetchGen] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");

  /** PE-C — sidebar source from `GET /api/v1/patron/follows` (null = not loaded yet). */
  const [followsApiCreators, setFollowsApiCreators] = useState<Creator[] | null>(null);
  const [followsApiUseFeedOnly, setFollowsApiUseFeedOnly] = useState(false);
  const [followsApiLoading, setFollowsApiLoading] = useState(false);

  const effectiveBundle = useMemo((): PatronFeedBundle => {
    if (dataSource === "fixtures") return fixtureBundle;
    if (liveBundle) return liveBundle;
    return emptyLiveShell(fixtureBundle);
  }, [dataSource, fixtureBundle, liveBundle]);

  const sidebarFollowedList = useMemo(() => {
    if (dataSource === "fixtures") {
      return sortFollowedForSidebar(effectiveBundle.followedCreators);
    }
    if (followsApiUseFeedOnly || followsApiCreators === null) {
      return sortFollowedForSidebar(effectiveBundle.followedCreators);
    }
    const feedMap = new Map(
      effectiveBundle.followedCreators.map((c) => [c.id, c])
    );
    const merged = followsApiCreators.map((c) => feedMap.get(c.id) ?? c);
    return sortFollowedForSidebar(merged);
  }, [
    dataSource,
    effectiveBundle.followedCreators,
    followsApiCreators,
    followsApiUseFeedOnly
  ]);

  const { onRelayFollowed, offRelayFollowed } = useMemo(() => {
    const on: Creator[] = [];
    const off: Creator[] = [];
    for (const c of sidebarFollowedList) {
      if (c.onRelay === false) off.push(c);
      else on.push(c);
    }
    return { onRelayFollowed: on, offRelayFollowed: off };
  }, [sidebarFollowedList]);

  useEffect(() => {
    if (dataSource !== "live") {
      setFollowsApiCreators(null);
      setFollowsApiUseFeedOnly(false);
      setFollowsApiLoading(false);
      return;
    }
    let cancelled = false;
    setFollowsApiLoading(true);
    setFollowsApiUseFeedOnly(false);
    void fetchPatronFollows()
      .then((payload) => {
        if (cancelled) return;
        setFollowsApiCreators(
          payload.items.map((item) => mapPatronFollowApiItemToCreator(item))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setFollowsApiUseFeedOnly(true);
        setFollowsApiCreators([]);
      })
      .finally(() => {
        if (!cancelled) setFollowsApiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource, liveFetchGen]);

  const retryLiveFeed = useCallback(() => {
    setLiveFeedError(null);
    setLiveBundle(null);
    setLiveFetchGen((g) => g + 1);
  }, []);

  useEffect(() => {
    if (dataSource !== "live") return;
    let cancelled = false;
    setLiveLoading(true);
    setLiveFeedError(null);
    const filterParam = feedFilterToApiParam(activeFilter);
    void fetchPatronRelayFeedWithOptions({ filter: filterParam ?? null, limit: 30 })
      .then((b) => {
        if (!cancelled) {
          setLiveBundle(b);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLiveBundle(null);
          if (e instanceof RelayApiError) {
            let message = e.message;
            if (e.status === 401) {
              message =
                "Sign in to load your feed (Relay session required). Use mock fixtures while offline, or sign in at /login.";
            } else if (e.status === 403) {
              message =
                "This session can’t load this feed. Try signing in again or use mock fixtures.";
            } else if (e.status >= 500) {
              message = `Relay API error (${e.status}). Try again or switch to mock fixtures in dev tools.`;
            } else if (e.status === 0 || e.code === "NETWORK") {
              message =
                "Couldn’t reach the Relay API. Start the API (e.g. npm start at the repo root) or check NEXT_PUBLIC_RELAY_API_URL.";
            }
            setLiveFeedError({ message, status: e.status, code: e.code });
          } else {
            setLiveFeedError({
              message: e instanceof Error ? e.message : String(e),
              status: 0
            });
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource, liveFetchGen, activeFilter]);

  useEffect(() => {
    if (dataSource !== "live" || liveLoading || liveFeedError || !liveBundle) return;
    void fetchPatronSessionMe()
      .then((session) => {
        emitPatronFeedTelemetryEvent({
          event_name: "feed_open",
          actor_key: session.user_id,
          surface: "patron_feed"
        });
      })
      .catch(() => {});
  }, [dataSource, liveLoading, liveFeedError, liveBundle]);

  const loadMoreLiveFeed = useCallback(() => {
    if (dataSource !== "live" || !liveBundle?.next_cursor?.trim()) return;
    const cursor = liveBundle.next_cursor.trim();
    const filterParam = feedFilterToApiParam(activeFilter);
    setLiveLoadingMore(true);
    setLiveFeedError(null);
    void fetchPatronRelayFeedWithOptions({
      cursor,
      filter: filterParam ?? null,
      limit: 30
    })
      .then((more) => {
        setLiveBundle((prev) => {
          if (!prev) return more;
          return {
            ...more,
            feedPosts: [...prev.feedPosts, ...more.feedPosts],
            next_cursor: more.next_cursor ?? null
          };
        });
      })
      .catch((e: unknown) => {
        if (e instanceof RelayApiError) {
          setLiveFeedError({
            message: e.message,
            status: e.status,
            code: e.code
          });
        } else {
          setLiveFeedError({
            message: e instanceof Error ? e.message : String(e),
            status: 0
          });
        }
      })
      .finally(() => setLiveLoadingMore(false));
  }, [dataSource, liveBundle?.next_cursor, activeFilter]);

  const [currentView, setCurrentView] = useState<AppView>("home");
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectCampaignOpen, setConnectCampaignOpen] = useState(false);
  const [connectCampaignPayload, setConnectCampaignPayload] =
    useState<PatronConnectCampaignPayload | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();
  const [sessionMe, setSessionMe] = useState<PatronSessionMe | null>(null);

  /** PE-A: Supabase email must be confirmed before session-first Patreon `/link` (when API reports false). */
  const peAShowVerifyEmailBanner = Boolean(sessionMe && sessionMe.email_verified === false);
  /** Signed in, email OK (or unknown), Patreon identity not linked yet — show connect CTA. */
  const peAShowConnectPatreonBanner = Boolean(
    sessionMe &&
      sessionMe.email_verified !== false &&
      !(sessionMe.patreon_user_id && sessionMe.patreon_user_id.trim().length > 0)
  );

  /** Dismissal state for the "become a creator" banner. Initialise from localStorage on mount. */
  const [creatorCtaDismissed, setCreatorCtaDismissed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("relay_dismiss_creator_cta") === "1") {
        setCreatorCtaDismissed(true);
      }
    } catch { /* ignore */ }
  }, []);

  const dismissCreatorCta = () => {
    setCreatorCtaDismissed(true);
    try { localStorage.setItem("relay_dismiss_creator_cta", "1"); } catch { /* ignore */ }
  };

  /**
   * Show a "build your gallery" CTA for supporter-only accounts who:
   * - Have completed supporter onboarding (flag set by StepSupporterReady)
   * - Have linked Patreon (so we know they're a real Patreon user)
   * - Do not yet have a creator role (available_roles excludes "creator")
   * - Haven't dismissed the banner
   */
  const showBecomeCreatorBanner = Boolean(
    sessionMe &&
      !peAShowVerifyEmailBanner &&
      !peAShowConnectPatreonBanner &&
      sessionMe.patreon_user_id &&
      sessionMe.patreon_user_id.trim().length > 0 &&
      sessionMe.available_roles &&
      !sessionMe.available_roles.includes("creator") &&
      !creatorCtaDismissed &&
      (() => { try { return localStorage.getItem("relay_supporter_onboarding_done") === "1"; } catch { return false; } })()
  );

  const loadSessionMe = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!hasRelaySignedInCookie()) {
      setSessionMe(null);
      return;
    }
    void fetchPatronSessionMe()
      .then(setSessionMe)
      .catch(() => setSessionMe(null));
  }, []);

  useEffect(() => {
    loadSessionMe();
    window.addEventListener("relay-studio-session", loadSessionMe);
    return () => window.removeEventListener("relay-studio-session", loadSessionMe);
  }, [loadSessionMe]);

  /** Post–Patreon `/link` redirect: one-shot prompt from sessionStorage. */
  useEffect(() => {
    const p = readAndConsumeSessionPatronConnectPrompt();
    if (p) {
      setConnectCampaignPayload(p);
      setConnectCampaignOpen(true);
    }
  }, []);

  const openCommand = () => setCommandOpen(true);

  // Smooth view transition with sidebar slide
  const navigateTo = useCallback((targetView: AppView) => {
    if (targetView === currentView || transitionState !== "idle") return;
    
    setTransitionState("exiting");
    
    setTimeout(() => {
      setCurrentView(targetView);
      setTransitionState("entering");
      
      setTimeout(() => {
        setTransitionState("idle");
      }, TRANSITION_DURATION);
    }, TRANSITION_DURATION);
  }, [currentView, transitionState]);

  // Command+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openCommand();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Close mobile sidebar on wide viewports
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /** Live feed: server applies `filter` query; fixtures keep client-side chip filtering. */
  const filteredPosts = useMemo(() => {
    if (dataSource === "live") return effectiveBundle.feedPosts;
    return filterPosts(effectiveBundle.feedPosts, activeFilter);
  }, [dataSource, activeFilter, effectiveBundle.feedPosts]);

  const enrichedPosts = useMemo(() => {
    let dividerInserted = false;
    let sawSubscribed = false;
    return filteredPosts.map((post) => {
      const isDiscover = post.kind === "discovery";
      if (!isDiscover) sawSubscribed = true;
      const showDivider =
        isDiscover && sawSubscribed && !dividerInserted;
      if (showDivider) dividerInserted = true;
      return { post, showDivider };
    });
  }, [filteredPosts]);

  const selectedPostIndex = selectedPost
    ? filteredPosts.findIndex((p) => p.id === selectedPost.id)
    : -1;

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (selectedPostIndex === -1) return;
      const newIndex =
        direction === "prev" ? selectedPostIndex - 1 : selectedPostIndex + 1;
      if (newIndex >= 0 && newIndex < filteredPosts.length) {
        setSelectedPost(filteredPosts[newIndex]);
      }
    },
    [selectedPostIndex, filteredPosts]
  );

  const handleDiscoverItemClick = (item: DiscoverItem) => {
    const post = discoverItemToPost(item);
    setSelectedPost(post);
  };

  const openLivePostDetail = useCallback(
    (args: { creatorId: string; postId: string; mediaId?: string; intent?: FeedPostIntent }) => {
      const base = `/feed/post/${encodeURIComponent(args.creatorId)}/${encodeURIComponent(
        args.postId
      )}`;
      const query = new URLSearchParams();
      if (args.mediaId?.trim()) {
        query.set("media_id", args.mediaId.trim());
      }
      if (args.intent) {
        query.set("intent", args.intent);
      }
      const suffix = query.toString();
      router.push(suffix ? `${base}?${suffix}` : base);
    },
    [router]
  );

  const handleSignOut = useCallback(async () => {
    setSettingsOpen(false);
    await performRelayLogout();
    router.replace("/login?role=supporter");
  }, [router]);

  const handleDisconnectPatreon = useCallback(async () => {
    if (
      !window.confirm(
        "Disconnect Patreon? Relay will remove stored tokens and mark your tier access as stale until you link again."
      )
    ) {
      return;
    }
    try {
      await deletePatronPatreonLink();
      clearPatronConnectCampaignStorage();
      setConnectCampaignOpen(false);
      setSettingsOpen(false);
      loadSessionMe();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not disconnect Patreon.");
    }
  }, [loadSessionMe]);

  const isDiscover = currentView === "discover";

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-[#0A0A0A]">
        {/* Mobile overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Persistent Sidebar - animates width, condenses to icons */}
        <aside
          style={{
            transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
          className={[
            "fixed lg:static top-0 left-0 z-40 h-full bg-[#0E0E0E] border-r border-[#1A1A1A] flex flex-col overflow-hidden",
            // Mobile: slide in/out
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            // Desktop: animate width based on view (240px -> 72px)
            isDiscover ? "lg:w-[72px]" : "lg:w-60",
            "w-60",
          ].join(" ")}
          aria-label="Main navigation"
        >
          <div 
            style={{
              transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)",
            }}
            className={[
              "flex flex-col h-full",
              isDiscover ? "lg:w-[72px]" : "w-60",
            ].join(" ")}
          >
            {/* Wordmark — logo + Relay, centered in header; navigates to Home */}
            <div
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "relative flex h-[56px] shrink-0 items-center justify-center border-b border-[#1A1A1A] px-5",
                isDiscover ? "lg:px-2" : "",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => {
                  navigateTo("home");
                  setMobileSidebarOpen(false);
                }}
                className={[
                  "flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[#40916C] transition-colors duration-150",
                  "hover:bg-[#141414] hover:text-[#9bf0c4]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#40916C]/35",
                  isDiscover ? "lg:gap-0 lg:px-0 lg:py-2" : "",
                ].join(" ")}
                aria-label="Relay home"
                title="Home"
              >
                <RelayMarkIcon
                  size={isDiscover ? 32 : 36}
                  className={isDiscover ? "shrink-0 lg:scale-95" : "shrink-0"}
                />
                <span
                  style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                  className={[
                    "select-none font-bold tracking-tight text-[#40916C]",
                    isDiscover ? "text-[18px] lg:hidden" : "text-[20px]",
                  ].join(" ")}
                >
                  Relay
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className={[
                  "absolute right-4 top-1/2 -translate-y-1/2 p-1 text-[#4B5563] transition-colors duration-150 hover:text-[#9CA3AF] lg:hidden",
                ].join(" ")}
                aria-label="Close navigation"
              >
                <X size={17} />
              </button>
            </div>

            {/* Primary nav */}
            <nav 
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "pt-4 space-y-0.5",
                isDiscover ? "lg:px-2 px-3" : "px-3",
              ].join(" ")}
            >
              {NAV_ITEMS.map((item) => {
                const navItemClass = [
                  "w-full flex items-center rounded-lg text-sm font-medium",
                  isDiscover ? "lg:justify-center lg:px-0 lg:py-3 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5",
                  (item.id === "home" && currentView === "home") ||
                  (item.id === "discover" && currentView === "discover")
                    ? "bg-[#0D1F17] text-[#40916C] border border-[#1B4332]/40"
                    : "text-[#5A5A5A] hover:bg-[#141414] hover:text-[#9CA3AF]",
                ].join(" ");

                const labelSpan = (
                  <span
                    style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                    className={[
                      "whitespace-nowrap overflow-hidden",
                      isDiscover ? "lg:w-0 lg:opacity-0" : "w-auto opacity-100",
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                );

                if (item.id === "marketplace") {
                  return (
                    <Link
                      key={item.id}
                      href="/commission-hub"
                      onClick={() => setMobileSidebarOpen(false)}
                      style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                      className={navItemClass}
                      title={isDiscover ? item.label : undefined}
                      aria-label="Marketplace — Commission Hub"
                    >
                      <item.icon size={isDiscover ? 18 : 15} aria-hidden="true" className="shrink-0" />
                      {labelSpan}
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === "home") navigateTo("home");
                      if (item.id === "discover") navigateTo("discover");
                    }}
                    style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                    className={navItemClass}
                    aria-current={item.id === currentView ? "page" : undefined}
                    title={isDiscover ? item.label : undefined}
                  >
                    <item.icon size={isDiscover ? 18 : 15} aria-hidden="true" className="shrink-0" />
                    {labelSpan}
                  </button>
                );
              })}
            </nav>

            {/* Divider */}
            <div 
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "mt-4 mb-4 border-t border-[#1A1A1A]",
                isDiscover ? "lg:mx-2 mx-5" : "mx-5",
              ].join(" ")} 
            />

            {/* Following list - hidden in icon mode */}
            <div 
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "patron-following-scroll flex-1 min-h-0 overflow-y-auto",
                isDiscover ? "lg:hidden px-3" : "px-3",
              ].join(" ")}
            >
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-[#3A3A3A]">
                  Following
                </span>
                <span className="text-[10px] text-[#3A3A3A]">
                  {sidebarFollowedList.length}
                </span>
              </div>
              <ul className="space-y-0.5">
                {dataSource === "live" &&
                followsApiLoading &&
                sidebarFollowedList.length === 0 ? (
                  <li className="list-none px-3 py-1" aria-hidden="true">
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="flex animate-pulse items-center gap-3 rounded-lg px-2 py-2"
                        >
                          <div className="h-6 w-6 shrink-0 rounded-full bg-[#1A1A1A]" />
                          <div className="h-2.5 flex-1 rounded bg-[#1A1A1A]" />
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1A1A1A]" />
                        </div>
                      ))}
                    </div>
                  </li>
                ) : null}
                {onRelayFollowed.map((creator) => (
                  <li key={creator.id} className="px-1">
                    <FollowingCreatorRow creator={creator} />
                  </li>
                ))}
                {onRelayFollowed.length > 0 && offRelayFollowed.length > 0 ? (
                  <li className="list-none px-3 py-2" aria-hidden="true">
                    <div className="h-px w-full bg-[#252525]" />
                  </li>
                ) : null}
                {offRelayFollowed.map((creator) => (
                  <li key={creator.id} className="px-1">
                    <FollowingCreatorRow creator={creator} />
                  </li>
                ))}
              </ul>
              {!isDiscover ? (
                <div className="mt-2 px-3">
                  <button
                    type="button"
                    onClick={() => navigateTo("discover")}
                    className="w-full rounded-lg border border-[#222222] bg-[#111111] py-2 text-[11px] font-medium text-[#9CA3AF] transition-colors hover:bg-[#141414] hover:text-[#C8C8C8]"
                  >
                    Find more creators
                  </button>
                  <p className="mt-1.5 px-0.5 text-[9px] leading-snug text-[#3A3A3A]">
                    Opens Discover — recommendations come later.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Divider */}
            <div 
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "mt-3 mb-3 border-t border-[#1A1A1A]",
                isDiscover ? "lg:mx-2 mx-5" : "mx-5",
              ].join(" ")} 
            />

            {/* Footer: settings */}
            <div 
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "pb-4 space-y-0.5 shrink-0",
                isDiscover ? "lg:px-2 px-3" : "px-3",
              ].join(" ")}
            >
              <Link
                href="/former-subscriptions"
                style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                className={[
                  "w-full flex items-center rounded-lg text-sm text-[#5A5A5A] hover:bg-[#141414] hover:text-[#9CA3AF]",
                  isDiscover ? "lg:justify-center lg:px-0 lg:py-3 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5",
                ].join(" ")}
                title={isDiscover ? "Former subscriptions" : undefined}
              >
                <History size={isDiscover ? 18 : 14} aria-hidden="true" className="shrink-0" />
                <span
                  style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                  className={[
                    "whitespace-nowrap overflow-hidden",
                    isDiscover ? "lg:w-0 lg:opacity-0" : "w-auto opacity-100",
                  ].join(" ")}
                >
                  Former subscriptions
                </span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  setMobileSidebarOpen(false);
                }}
                style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                className={[
                  "w-full flex items-center rounded-lg text-sm text-[#5A5A5A] hover:bg-[#141414] hover:text-[#9CA3AF]",
                  isDiscover ? "lg:justify-center lg:px-0 lg:py-3 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5",
                ].join(" ")}
                title={isDiscover ? "Settings" : undefined}
              >
                <Settings size={isDiscover ? 18 : 14} aria-hidden="true" className="shrink-0" />
                <span 
                  style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                  className={[
                    "whitespace-nowrap overflow-hidden",
                    isDiscover ? "lg:w-0 lg:opacity-0" : "w-auto opacity-100",
                  ].join(" ")}
                >
                  Settings
                </span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Top bar */}
          <header className={[
            "relative flex items-center gap-3 px-4 lg:px-5 h-[56px] border-b border-[#1A1A1A] shrink-0",
            isDiscover ? "bg-[#0A0A0A]/80 backdrop-blur-sm" : "bg-[#0A0A0A]",
          ].join(" ")}>
            {/* Hamburger - mobile (above centered brand layer) */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="relative z-20 lg:hidden p-1.5 text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150 shrink-0"
              aria-label="Open navigation"
              aria-expanded={mobileSidebarOpen}
            >
              <Menu size={19} />
            </button>

            {/* Logo + Relay — centered in top bar (mobile); tap = Home */}
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center lg:hidden">
              <button
                type="button"
                onClick={() => navigateTo("home")}
                className="pointer-events-auto flex items-center gap-2 rounded-lg px-1.5 py-1 text-[#40916C] transition-colors duration-150 hover:bg-[#141414] hover:text-[#9bf0c4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#40916C]/35"
                aria-label="Relay home"
                title="Home"
              >
                <RelayMarkIcon size={30} className="shrink-0" />
                <span className="select-none font-bold tracking-tight text-[18px] text-[#40916C]">
                  Relay
                </span>
              </button>
            </div>

            <PatronPrimaryTopNav
              as="div"
              showBrand={false}
              className="relative z-20 min-w-0 flex-1 border-0 bg-transparent p-0 h-auto gap-1"
              navClassName="hidden lg:flex"
              isNavItemActive={(pathname, href) => {
                if (href === "/feed") {
                  return currentView === "home";
                }
                return isPatronPrimaryNavItemActive(pathname, href);
              }}
            />
          </header>

          {/* PE-A skeletal: verified-email gate + connect Patreon before a linked identity exists */}
          {currentView === "home" && peAShowVerifyEmailBanner ? (
            <div
              className="shrink-0 border-b border-amber-800/40 bg-amber-950/35 px-4 py-3 lg:px-5"
              role="status"
            >
              <p className="text-sm text-amber-100/95">
                <span className="font-medium text-amber-50">Verify your email</span> before linking
                Patreon. Check your inbox for Relay&apos;s confirmation message, then return here.
              </p>
              <p className="mt-1 text-xs text-amber-200/80">
                After verifying, refresh this page or sign out and back in if the banner stays.
              </p>
            </div>
          ) : null}
          {currentView === "home" && !peAShowVerifyEmailBanner && peAShowConnectPatreonBanner ? (
            <div
              className="shrink-0 border-b border-[#1B4332]/50 bg-[#0D1F17]/90 px-4 py-3 lg:px-5"
              role="region"
              aria-label="Connect Patreon"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm text-[#C8C8C8]">
                  <span className="font-medium text-[#E5E7EB]">Connect Patreon</span> to sync the
                  creators you support and load your feed.
                </p>
                <Link
                  href="/connect/patreon/patron/connect"
                  className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-[#F9FAFB] transition-colors hover:bg-[#40916C]"
                >
                  Continue to Patreon
                </Link>
              </div>
            </div>
          ) : null}
          {currentView === "home" && showBecomeCreatorBanner ? (
            <div
              className="shrink-0 border-b border-[var(--relay-electric)]/20 bg-[var(--relay-green-950)]/60 px-4 py-3 lg:px-5"
              role="region"
              aria-label="Build your Relay gallery"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm text-[#C8C8C8]">
                  <span className="font-medium text-[#E5E7EB]">Also create on Patreon?</span>{" "}
                  Build your Relay gallery and give your supporters a better way to browse your work.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href="/onboarding?path=creator&step=3"
                    className="inline-flex items-center justify-center rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-[#F9FAFB] transition-colors hover:bg-[#40916C]"
                  >
                    Build my gallery
                  </Link>
                  <button
                    type="button"
                    onClick={dismissCreatorCta}
                    className="rounded-lg border border-[var(--relay-border)] px-2.5 py-2 text-xs text-[var(--relay-fg-muted)] transition-colors hover:text-[var(--relay-fg)]"
                    aria-label="Dismiss creator gallery prompt"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto" id="feed-main">
            <div
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                transitionState === "idle"
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4",
              ].join(" ")}
            >
              {currentView === "home" ? (
                <div className="max-w-[820px] mx-auto px-4 lg:px-6 py-5">
                  <button
                    onClick={openCommand}
                    className="group mb-4 flex w-full items-center gap-2.5 rounded-lg border border-[#222222] bg-[#111111] px-3.5 py-2 text-sm text-[#555555] transition-colors duration-150 hover:border-[#2E2E2E] hover:text-[#888888]"
                    aria-label="Open search (Command K)"
                  >
                    <Search size={13} aria-hidden="true" />
                    <span className="flex-1 text-left text-sm">
                      Search creators and posts…
                    </span>
                    <span className="hidden items-center gap-0.5 rounded border border-[#222222] px-1.5 py-0.5 font-mono text-[10px] text-[#333333] transition-colors duration-150 group-hover:border-[#2E2E2E] sm:flex">
                      <Command size={8} aria-hidden="true" />K
                    </span>
                  </button>
                  <div className="space-y-3">
                    {DEMO_ERROR_BANNER && <ErrorBanner />}
                    {dataSource === "live" && liveFeedError ? (
                      <ErrorBanner
                        message={liveFeedError.message}
                        onRetry={retryLiveFeed}
                        actionSlot={
                          liveFeedError.status === 401 ? (
                            <Link
                              href="/connect/patreon/patron/connect"
                              className="whitespace-nowrap text-xs font-medium text-[#2D6A4F] transition-colors hover:text-[#40916C]"
                            >
                              Connect Patreon
                            </Link>
                          ) : undefined
                        }
                      />
                    ) : null}
                    {dataSource === "live" &&
                    !liveFeedError &&
                    effectiveBundle.entitlement_degraded ? (
                      <PatronEntitlementStaleBanner
                        staleSinceIso={effectiveBundle.entitlement_stale_since ?? null}
                      />
                    ) : null}

                    {liveLoading && dataSource === "live" ? (
                      <div className="flex flex-col items-center py-24 text-center">
                        <p className="text-sm text-[#5A5A5A]">Loading your feed…</p>
                      </div>
                    ) : DEMO_EMPTY_FOLLOWS ? (
                      <EmptyState onSearch={openCommand} />
                    ) : filteredPosts.length === 0 ? (
                      liveFeedError && activeFilter === "all" ? null : activeFilter !== "all" ? (
                        <PatronEmptyFeedState
                          variant="filter_mismatch"
                          onShowAll={() => setActiveFilter("all")}
                        />
                      ) : dataSource === "live" ? (
                        <PatronEmptyFeedState
                          variant={
                            peAShowConnectPatreonBanner
                              ? "live_oauth"
                              : effectiveBundle.followedCreators.length === 0
                                ? "live_no_follows"
                                : "live_no_posts"
                          }
                        />
                      ) : (
                        <PatronEmptyFeedState variant="fixtures_empty" />
                      )
                    ) : (
                      enrichedPosts.map(({ post, showDivider }) => (
                        <div key={post.id}>
                          {showDivider && (
                            <FeedSectionDivider
                              label="Free to read"
                              sublabel="Creators you don't follow yet"
                            />
                          )}
                          <FeedCard
                            post={post}
                            onClick={
                              dataSource === "live"
                                ? () =>
                                    openLivePostDetail({
                                      creatorId: post.creator.id,
                                      postId: post.id
                                    })
                                : () => setSelectedPost(post)
                            }
                            onCommentClick={
                              dataSource === "live"
                                ? ({ creatorId, postId, mediaId }) =>
                                    openLivePostDetail({
                                      creatorId,
                                      postId,
                                      mediaId,
                                      intent: "comment"
                                    })
                                : undefined
                            }
                            onSnipClick={
                              dataSource === "live"
                                ? ({ creatorId, postId, mediaId }) =>
                                    openLivePostDetail({
                                      creatorId,
                                      postId,
                                      mediaId,
                                      intent: "snip"
                                    })
                                : undefined
                            }
                            liveCommentCountScope={
                              dataSource === "live"
                                ? {
                                    relayCreatorId: post.creator.id,
                                    postId: post.id,
                                  }
                                : null
                            }
                          />
                        </div>
                      ))
                    )}
                    {dataSource === "live" &&
                    liveBundle?.next_cursor &&
                    !liveFeedError &&
                    filteredPosts.length > 0 ? (
                      <div className="flex justify-center pt-2 pb-8">
                        <button
                          type="button"
                          onClick={() => void loadMoreLiveFeed()}
                          disabled={liveLoadingMore}
                          className="rounded-lg border border-[#2A2A2A] bg-[#111111] px-4 py-2.5 text-sm font-medium text-[#9CA3AF] transition-colors hover:border-[#333333] hover:text-[#E5E7EB] disabled:opacity-50"
                        >
                          {liveLoadingMore ? "Loading…" : "Load more"}
                        </button>
                      </div>
                    ) : null}
                    {!liveLoading && !liveFeedError ? (
                      <WhatYouMissedCarousel posts={effectiveBundle.lockedPosts ?? []} />
                    ) : null}
                  </div>
                </div>
              ) : (
                <DiscoverGrid
                  items={effectiveBundle.discoverItems}
                  onItemClick={handleDiscoverItemClick}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSignOut={handleSignOut}
        onPatreonCreatorConnection={() => {
          setSettingsOpen(false);
          setConnectCampaignPayload(getSnapshotPatronConnectCampaign());
          setConnectCampaignOpen(true);
        }}
        onDisconnectPatreon={handleDisconnectPatreon}
      />

      <ConnectCampaignModal
        isOpen={connectCampaignOpen}
        payload={connectCampaignPayload}
        onClose={() => setConnectCampaignOpen(false)}
      />

      {/* Gallery view modal */}
      {selectedPost && (
        <GalleryView
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onNavigate={handleNavigate}
          hasPrev={selectedPostIndex > 0}
          hasNext={selectedPostIndex < filteredPosts.length - 1}
        />
      )}

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        followedCreators={sidebarFollowedList}
      />

      {showPatronFeedDevTools ? (
        <PatronFeedDevTools
          dataSource={dataSource}
          onDataSourceChange={setDataSource}
          liveLoading={liveLoading}
          liveError={liveFeedError?.message ?? null}
        />
      ) : null}
    </>
  );
}
