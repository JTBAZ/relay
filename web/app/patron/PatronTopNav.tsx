"use client";

/**
 * PE-K Rest / nav-unification (BO-P4-05) — shared patron top nav.
 *
 * Mounted from `web/app/patron/layout.tsx` so every patron page (feed, library, discover,
 * notifications, settings, profile) gets it free. Hidden on immersive surfaces:
 *   - /patron/onboarding (own wizard chrome)
 *   - /patron/c/[handle] (public creator profile)
 *
 * The nav is a thin top bar with: brand wordmark + 6 canonical route tabs + live unread
 * bell badge + role switcher + a small "Account" link. Mobile collapses to a hamburger
 * drawer; the rest of the page is unaffected.
 *
 * Live unread count: fetches /api/v1/patron/notifications/unread-count once on mount and
 * once per "relay-studio-session" event (emitted by login/logout/role-switch flows). For
 * the skeletal pass we don't poll on a timer -- the count refreshes when a user navigates
 * back to a patron page, which is the highest-leverage moment.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Compass,
  Heart,
  Home,
  Settings,
  User
} from "lucide-react";
import {
  fetchPatronSessionIfPresent,
  getPatronNotificationUnreadCount,
  type PatronSessionMe
} from "@/lib/relay-api";
import { RoleSwitcher } from "@/app/components/RoleSwitcher";

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof Home;
}> = [
  { href: "/patron/feed", label: "Feed", Icon: Home },
  { href: "/patron/library", label: "Library", Icon: Heart },
  { href: "/patron/discover", label: "Discover", Icon: Compass },
  { href: "/patron/notifications", label: "Inbox", Icon: Bell },
  { href: "/patron/settings", label: "Settings", Icon: Settings },
  { href: "/patron/profile", label: "Profile", Icon: User }
] as const;

/** Returns true when `pathname` is the canonical match for `href` (or a child route). */
function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/patron/notifications") {
    // Notifications has the /preferences child; both should keep the Inbox tab lit.
    return (
      pathname === "/patron/notifications" ||
      pathname.startsWith("/patron/notifications/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PatronTopNav(): React.ReactElement | null {
  const pathname = usePathname();
  const [me, setMe] = useState<PatronSessionMe | null | "loading">("loading");
  const [unread, setUnread] = useState<number | null>(null);

  const refreshSession = useCallback(() => {
    void fetchPatronSessionIfPresent().then((m) => setMe(m ?? null));
  }, []);

  const refreshUnread = useCallback(() => {
    void getPatronNotificationUnreadCount()
      .then((r) => setUnread(r.unread_count))
      .catch(() => setUnread(null));
  }, []);

  useEffect(() => {
    refreshSession();
    window.addEventListener("relay-studio-session", refreshSession);
    return () => window.removeEventListener("relay-studio-session", refreshSession);
  }, [refreshSession]);

  // Refetch unread count on every route change so the badge reflects "marked read"
  // actions taken on the inbox page.
  useEffect(() => {
    if (me && me !== "loading") {
      refreshUnread();
    }
  }, [pathname, me, refreshUnread]);

  // Hide the entire nav when there's no session -- the per-page auth guards already
  // redirect signed-out users to /login, and rendering nav chrome at that moment looks
  // broken. While `me === "loading"` we render a slim skeleton so layout doesn't jump.
  if (me === "loading") {
    return <NavSkeleton />;
  }
  if (me === null) {
    return null;
  }

  return (
    <nav
      aria-label="Patron primary"
      className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b border-[#1F1F1F] bg-[#0A0A0A]/95 px-3 backdrop-blur-md sm:px-6"
    >
      <Link
        href="/patron/feed"
        className="mr-3 shrink-0 select-none font-bold tracking-tight text-[16px] text-[#C5B358] transition-colors hover:text-[#d4c47a]"
        aria-label="Relay home"
      >
        Relay
      </Link>

      <ul className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActiveLink(pathname, item.href);
          const showBadge = item.href === "/patron/notifications" && unread !== null && unread > 0;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  active
                    ? "bg-[#0D1F17] text-[#9bf0c4]"
                    : "text-[#888] hover:bg-[#141414] hover:text-[#E0E0E0]"
                ].join(" ")}
              >
                <item.Icon size={13} aria-hidden />
                <span className="hidden sm:inline">{item.label}</span>
                {showBadge ? (
                  <span
                    className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#2D6A4F] px-1 text-[9px] font-semibold text-white"
                    aria-label={`${unread} unread`}
                  >
                    {unread! > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Right-side controls */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="hidden md:block">
          <RoleSwitcher variant="patron" />
        </div>
        <span
          className="hidden truncate font-mono text-[10px] text-[#666] md:inline"
          title={me.user_id}
        >
          {(me.email?.trim() ?? me.user_id).slice(0, 24)}
        </span>
      </div>
    </nav>
  );
}

function NavSkeleton(): React.ReactElement {
  return (
    <div
      className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b border-[#1F1F1F] bg-[#0A0A0A] px-3 sm:px-6"
      aria-hidden
    >
      <div className="mr-3 h-3 w-12 rounded bg-[#1F1F1F]" />
      <div className="flex flex-1 gap-1">
        {NAV_ITEMS.slice(0, 4).map((_, i) => (
          <div key={i} className="h-6 w-14 rounded bg-[#141414]" />
        ))}
      </div>
    </div>
  );
}
