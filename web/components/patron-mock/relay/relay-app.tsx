"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Home,
  Compass,
  Store,
  Settings,
  Bell,
  Menu,
  X,
  Search,
  Command,
  Plus,
  ExternalLink,
  History,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { DiscoverGrid } from "./discover-grid";
import { FeedCard } from "./feed-card";
import { FeedSectionDivider } from "./feed-section-divider";
import { EmptyState } from "./empty-state";
import { ErrorBanner } from "./error-banner";
import { CommandPalette } from "./command-palette";
import { GalleryView } from "./gallery-view";
import { SettingsModal } from "./settings-modal";
import { NotificationsTray } from "./notifications-tray";
import { FilterChips, type FeedFilter } from "./filter-chips";
import { PatronFeedDevTools } from "./patron-feed-dev-tools";
import { RelayMarkIcon } from "./relay-mark-icon";
import {
  getPatronFeedFixtureBundle,
  sortFollowedForSidebar,
  type Creator,
  type FeedPost,
  type DiscoverItem,
  type PatronFeedBundle,
  type PatronFeedDataSource,
} from "@/lib/relay-fixtures";
import { fetchPatronRelayFeed } from "@/lib/patron-feed-api";
import {
  fetchPatronSessionMe,
  type PatronSessionMe,
  RelayApiError,
} from "@/lib/relay-api";
import { performRelayLogout } from "@/lib/relay-session-logout";

export interface RelayAppProps {
  /**
   * Default data source before dev-tool override.
   * If omitted, uses `NEXT_PUBLIC_RELAY_PATRON_FEED_DEFAULT` or `fixtures`.
   */
  initialDataSource?: PatronFeedDataSource;
}

type AppView = "home" | "discover";

type TransitionState = "idle" | "exiting" | "entering";

function truncateMiddleId(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

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
          href={`/patron/c/${encodeURIComponent(creator.handle)}`}
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
    discoverItems: [],
    currentViewer: fixture.currentViewer,
    followedCreators: [],
    notifications: [],
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

function discoverItemToPost(item: DiscoverItem): FeedPost {
  return {
    id: item.id,
    kind: "discovery",
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
    return process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEFAULT === "live"
      ? "live"
      : "fixtures";
  });
  const fixtureBundle = useMemo(() => getPatronFeedFixtureBundle(), []);
  const [liveBundle, setLiveBundle] = useState<PatronFeedBundle | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveFeedError, setLiveFeedError] = useState<{
    message: string;
    status: number;
    code?: string;
  } | null>(null);
  const [liveFetchGen, setLiveFetchGen] = useState(0);

  const effectiveBundle = useMemo((): PatronFeedBundle => {
    if (dataSource === "fixtures") return fixtureBundle;
    if (liveBundle) return liveBundle;
    return emptyLiveShell(fixtureBundle);
  }, [dataSource, fixtureBundle, liveBundle]);

  const sortedFollowed = useMemo(
    () => sortFollowedForSidebar(effectiveBundle.followedCreators),
    [effectiveBundle.followedCreators]
  );

  const { onRelayFollowed, offRelayFollowed } = useMemo(() => {
    const on: Creator[] = [];
    const off: Creator[] = [];
    for (const c of sortedFollowed) {
      if (c.onRelay === false) off.push(c);
      else on.push(c);
    }
    return { onRelayFollowed: on, offRelayFollowed: off };
  }, [sortedFollowed]);

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
    void fetchPatronRelayFeed()
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
                "Sign in with Patreon to load your live feed. Mock fixtures still work offline.";
            } else if (e.status === 403) {
              message =
                "This session can’t load this feed. Try signing in again or use mock fixtures.";
            } else if (e.status >= 500) {
              message = `Relay API error (${e.status}). Try again or use mock fixtures while the server is fixed.`;
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
  }, [dataSource, liveFetchGen]);

  const [currentView, setCurrentView] = useState<AppView>("home");
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const router = useRouter();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sessionMe, setSessionMe] = useState<PatronSessionMe | null>(null);

  const loadSessionMe = useCallback(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("relay_session_token")?.trim();
    if (!token) {
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

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDocMouseDown = (e: globalThis.MouseEvent) => {
      const el = accountMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountMenuOpen]);

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

  const filteredPosts = useMemo(
    () => filterPosts(effectiveBundle.feedPosts, activeFilter),
    [activeFilter, effectiveBundle.feedPosts]
  );

  const enrichedPosts = useMemo(() => {
    let dividerInserted = false;
    return filteredPosts.map((post) => {
      const showDivider = post.kind === "discovery" && !dividerInserted;
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

  const handleSignOut = useCallback(async () => {
    setAccountMenuOpen(false);
    setSettingsOpen(false);
    setNotificationsOpen(false);
    await performRelayLogout();
    router.replace("/login?role=supporter");
  }, [router]);

  const isDiscover = currentView === "discover";
  const viewer = effectiveBundle.currentViewer;
  const unreadNotifications = effectiveBundle.notifications.filter((n) => !n.read).length;

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
                  "flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[#C5B358] transition-colors duration-150",
                  "hover:bg-[#141414] hover:text-[#d4c47a]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B358]/35",
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
                    "select-none font-bold tracking-tight text-[#C5B358]",
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
                      href="/patron/commission-hub"
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
                  {sortedFollowed.length}
                </span>
              </div>
              <ul className="space-y-0.5">
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

            {/* Footer: settings + viewer */}
            <div 
              style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
              className={[
                "pb-4 space-y-0.5 shrink-0",
                isDiscover ? "lg:px-2 px-3" : "px-3",
              ].join(" ")}
            >
              <Link
                href="/patron/former-subscriptions"
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
              <Link
                href="/patron/profile"
                style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                className={[
                  "w-full flex items-center rounded-lg hover:bg-[#141414]",
                  isDiscover ? "lg:justify-center lg:px-0 lg:py-2 gap-3 px-3 py-2.5" : "gap-3 px-3 py-2.5",
                ].join(" ")}
                title="Your profile"
              >
                <div
                  className="w-7 h-7 rounded-full overflow-hidden bg-[#2A2A2A] shrink-0"
                  aria-hidden="true"
                >
                  <img
                    src={viewer.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    width={28}
                    height={28}
                  />
                </div>
                <div 
                  style={{ transition: "all 400ms cubic-bezier(0.25, 0.1, 0.25, 1)" }}
                  className={[
                    "flex-1 text-left overflow-hidden",
                    isDiscover ? "lg:hidden" : "",
                  ].join(" ")}
                >
                  <div className="text-xs text-[#C8C8C8] truncate font-medium">
                    {viewer.displayName}
                  </div>
                  <div className="text-[10px] text-[#444444] truncate">
                    @{viewer.handle}
                  </div>
                </div>
              </Link>
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
                className="pointer-events-auto flex items-center gap-2 rounded-lg px-1.5 py-1 text-[#C5B358] transition-colors duration-150 hover:bg-[#141414] hover:text-[#d4c47a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B358]/35"
                aria-label="Relay home"
                title="Home"
              >
                <RelayMarkIcon size={30} className="shrink-0" />
                <span className="select-none font-bold tracking-tight text-[18px] text-[#C5B358]">
                  Relay
                </span>
              </button>
            </div>

            {/* Search trigger — inset so it clears centered brand */}
            <div className="relative z-20 flex min-w-0 flex-1 justify-center pl-[7.5rem] pr-2 sm:pl-32 sm:pr-4 lg:pl-0">
              <button
                onClick={openCommand}
                className={[
                  "flex items-center gap-2.5 px-3.5 py-2 bg-[#111111] border border-[#222222] rounded-lg text-sm text-[#444444] hover:border-[#2E2E2E] hover:text-[#666666] transition-colors duration-150 group",
                  isDiscover ? "w-auto" : "w-full max-w-[480px]",
                ].join(" ")}
                aria-label="Open search (Command K)"
              >
                <Search size={13} aria-hidden="true" />
                <span className={[
                  "text-left text-sm",
                  isDiscover ? "hidden sm:inline" : "flex-1",
                ].join(" ")}>
                  {isDiscover ? "Search" : "Search creators and posts…"}
                </span>
                <span className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#222222] text-[10px] font-mono text-[#333333] group-hover:border-[#2E2E2E] transition-colors duration-150">
                  <Command size={8} aria-hidden="true" />K
                </span>
              </button>
            </div>

            {/* Right controls */}
            <div className="relative z-20 flex shrink-0 items-center gap-1">
              <Link
                href="/patron/commission-hub"
                className="p-2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150 rounded-lg hover:bg-[#111111]"
                aria-label="Marketplace — Commission Hub"
                title="Marketplace"
              >
                <Store size={17} aria-hidden="true" />
              </Link>

              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150 rounded-lg hover:bg-[#111111]"
                aria-label={`Notifications (${unreadNotifications} unread)`}
                title="Notifications"
              >
                <Bell size={17} aria-hidden="true" />
                {unreadNotifications > 0 && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"
                    aria-hidden="true"
                  />
                )}
              </button>

              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="p-2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150 rounded-lg hover:bg-[#111111]"
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={17} aria-hidden="true" />
              </button>

              <div className="relative shrink-0" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  className="flex items-center gap-0.5 rounded-lg p-0.5 pr-1 text-[#4B5563] transition-colors hover:bg-[#111111] hover:text-[#9CA3AF]"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#222222] bg-[#2A2A2A]">
                    <img
                      src={viewer.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      width={32}
                      height={32}
                    />
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {accountMenuOpen ? (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-[#222222] bg-[#141414] py-1 shadow-xl"
                    role="menu"
                  >
                    <div className="border-b border-[#222222] px-3 py-2">
                      <p className="truncate text-xs font-medium text-[#E0E0E0]">
                        {sessionMe?.email?.trim() || "Patreon session"}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#555555]">
                        {sessionMe
                          ? `User ${truncateMiddleId(sessionMe.user_id)}`
                          : "Sign in to see account details"}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#888888] transition-colors hover:bg-[#1f1f1f] hover:text-[#E0E0E0]"
                    >
                      <LogOut size={14} aria-hidden />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          {/* Notifications Tray */}
          {notificationsOpen && (
            <div className="absolute top-[56px] right-4 z-30">
              <NotificationsTray
                notifications={effectiveBundle.notifications}
                isOpen={notificationsOpen}
              />
            </div>
          )}

          {/* Filter subnav - only for Home */}
          {!isDiscover && (
            <div className="flex items-center justify-between gap-4 px-4 lg:px-5 py-3 border-b border-[#151515] bg-[#0A0A0A] shrink-0">
              <FilterChips value={activeFilter} onChange={setActiveFilter} />
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"
                  aria-hidden="true"
                />
                <span className="text-[11px] text-[#3A3A3A] font-medium whitespace-nowrap">
                  Chronological
                </span>
              </div>
            </div>
          )}

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
                <div className="max-w-[880px] mx-auto px-4 lg:px-6 py-6">
                  <div className="space-y-3">
                    {DEMO_ERROR_BANNER && <ErrorBanner />}
                    {dataSource === "live" && liveFeedError ? (
                      <ErrorBanner
                        message={liveFeedError.message}
                        onRetry={retryLiveFeed}
                        actionSlot={
                          liveFeedError.status === 401 ? (
                            <Link
                              href="/patreon/patron/connect"
                              className="whitespace-nowrap text-xs font-medium text-[#2D6A4F] transition-colors hover:text-[#40916C]"
                            >
                              Connect Patreon
                            </Link>
                          ) : undefined
                        }
                      />
                    ) : null}

                    {liveLoading && dataSource === "live" ? (
                      <div className="flex flex-col items-center py-24 text-center">
                        <p className="text-sm text-[#5A5A5A]">Loading your feed…</p>
                      </div>
                    ) : DEMO_EMPTY_FOLLOWS ? (
                      <EmptyState onSearch={openCommand} />
                    ) : filteredPosts.length === 0 ? (
                      liveFeedError && activeFilter === "all" ? null : (
                        <div className="flex flex-col items-center py-20 text-center">
                          <p className="text-sm text-[#5A5A5A]">
                            {activeFilter !== "all"
                              ? "No posts match this filter."
                              : dataSource === "live"
                                ? "No posts yet."
                                : "No posts match this filter."}
                          </p>
                          {activeFilter !== "all" ? (
                            <button
                              type="button"
                              onClick={() => setActiveFilter("all")}
                              className="mt-4 text-sm text-[#2D6A4F] hover:text-[#40916C] transition-colors duration-150"
                            >
                              Show all posts
                            </button>
                          ) : null}
                        </div>
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
                          <FeedCard post={post} onClick={() => setSelectedPost(post)} />
                        </div>
                      ))
                    )}
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
