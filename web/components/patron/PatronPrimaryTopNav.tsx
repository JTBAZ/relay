"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Heart, Home, LogOut, User, type LucideIcon } from "lucide-react";
import { PatronProfileAssetImage } from "@/components/patron/PatronProfileAssetImage";
import { RelayMarkIcon } from "@/components/patron/relay/relay-mark-icon";
import { fetchPatronProfileMe } from "@/lib/patron-profile-api";
import {
  fetchPatronSessionIfPresent,
  getPatronNotificationUnreadCount,
  type PatronSessionMe,
} from "@/lib/relay-api";
import { performRelayLogout } from "@/lib/relay-session-logout";

export const PATRON_PRIMARY_NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: LucideIcon;
}> = [
  { href: "/feed", label: "Feed", Icon: Home },
  { href: "/library", label: "Library", Icon: Heart },
  { href: "/notifications", label: "Inbox", Icon: Bell },
  { href: "/profile", label: "Profile", Icon: User },
] as const;

const AVATAR_FALLBACK = "/placeholder.svg?height=80&width=80";

function truncateMiddleId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function isPatronPrimaryNavItemActive(pathname: string, href: string): boolean {
  if (href === "/notifications") {
    return (
      pathname === "/notifications" ||
      pathname.startsWith("/notifications/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type PatronPrimaryTopNavProps = {
  className?: string;
  /** Root element — use `div` when embedding inside the feed shell header. */
  as?: "header" | "div";
  /** Hide Relay wordmark (feed desktop keeps brand in the sidebar). */
  showBrand?: boolean;
  /** Extra classes on the `<nav>` list wrapper. */
  navClassName?: string;
  /** Override pathname-based active tab (feed shell uses this for in-app discover). */
  isNavItemActive?: (pathname: string, href: string) => boolean;
};

export function PatronPrimaryTopNav({
  className,
  as: Root = "header",
  showBrand = true,
  navClassName = "",
  isNavItemActive = isPatronPrimaryNavItemActive,
}: PatronPrimaryTopNavProps): React.ReactElement | null {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<PatronSessionMe | null | "loading">("loading");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const refreshSession = useCallback(() => {
    void fetchPatronSessionIfPresent().then((session) => setMe(session ?? null));
  }, []);

  const refreshProfile = useCallback(() => {
    void fetchPatronProfileMe({ suppressAuthRedirect: true })
      .then((profile) => {
        setAvatarUrl(profile.avatar_url?.trim() || null);
      })
      .catch(() => {
        setAvatarUrl(null);
      });
  }, []);

  const refreshUnread = useCallback(() => {
    void getPatronNotificationUnreadCount()
      .then((result) => setUnread(result.unread_count))
      .catch(() => setUnread(null));
  }, []);

  useEffect(() => {
    refreshSession();
    refreshProfile();
    window.addEventListener("relay-studio-session", refreshSession);
    return () => window.removeEventListener("relay-studio-session", refreshSession);
  }, [refreshSession, refreshProfile]);

  useEffect(() => {
    if (me && me !== "loading") {
      refreshUnread();
    }
  }, [pathname, me, refreshUnread]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const el = accountMenuRef.current;
      if (el && !el.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountMenuOpen]);

  const handleSignOut = useCallback(async () => {
    setAccountMenuOpen(false);
    await performRelayLogout();
    router.replace("/login?role=supporter");
  }, [router]);

  if (me === "loading") {
    return <PatronPrimaryTopNavSkeleton className={className} />;
  }
  if (me === null) {
    return null;
  }

  return (
    <Root
      className={[
        "relative flex h-14 shrink-0 items-center gap-3 border-b border-[#1A1A1A] bg-[#0A0A0A] px-4 sm:px-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showBrand ? (
        <Link
          href="/feed"
          className="mr-1 inline-flex shrink-0 select-none items-center gap-2 rounded-lg px-1.5 py-1 font-bold tracking-tight text-[18px] text-[#40916C] transition-colors hover:bg-[#141414] hover:text-[#9bf0c4]"
          aria-label="Relay home"
        >
          <RelayMarkIcon size={30} className="shrink-0" />
          <span>Relay</span>
        </Link>
      ) : null}

      <nav
        aria-label="Patron primary"
        className={[
          "relative z-20 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto",
          navClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {PATRON_PRIMARY_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const showBadge =
            item.href === "/notifications" && unread !== null && unread > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                active
                  ? "bg-[#0D1F17] text-[#9bf0c4]"
                  : "text-[#777777] hover:bg-[#141414] hover:text-[#D1D5DB]",
              ].join(" ")}
            >
              <item.Icon size={13} aria-hidden />
              <span>{item.label}</span>
              {showBadge ? (
                <span
                  className="ml-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#2D6A4F] px-1 text-[9px] font-semibold text-white"
                  aria-label={`${unread} unread`}
                >
                  {unread! > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="relative z-20 ml-auto flex shrink-0 items-center" ref={accountMenuRef}>
        <button
          type="button"
          onClick={() => setAccountMenuOpen((open) => !open)}
          className="flex items-center gap-0.5 rounded-lg p-0.5 pr-1 text-[#4B5563] transition-colors hover:bg-[#111111] hover:text-[#9CA3AF]"
          aria-expanded={accountMenuOpen}
          aria-haspopup="menu"
          aria-label="Account menu"
        >
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#222222] bg-[#2A2A2A]">
            <PatronProfileAssetImage
              storedUrl={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              width={32}
              height={32}
              fallback={
                // eslint-disable-next-line @next/next/no-img-element -- default avatar
                <img
                  src={AVATAR_FALLBACK}
                  alt=""
                  className="h-full w-full object-cover"
                  width={32}
                  height={32}
                />
              }
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
                {me.email?.trim() || "Patron session"}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-[#555555]">
                User {truncateMiddleId(me.user_id)}
              </p>
            </div>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setAccountMenuOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#888888] transition-colors hover:bg-[#1f1f1f] hover:text-[#E0E0E0]"
            >
              Settings
            </Link>
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
    </Root>
  );
}

function PatronPrimaryTopNavSkeleton({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={[
        "flex h-14 shrink-0 items-center gap-3 border-b border-[#1A1A1A] bg-[#0A0A0A] px-4 sm:px-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <div className="mr-1 h-8 w-24 rounded bg-[#141414]" />
      <div className="flex flex-1 gap-1">
        {PATRON_PRIMARY_NAV_ITEMS.map((item) => (
          <div key={item.href} className="h-7 w-16 rounded bg-[#141414]" />
        ))}
      </div>
      <div className="h-8 w-8 rounded-full bg-[#141414]" />
    </div>
  );
}
