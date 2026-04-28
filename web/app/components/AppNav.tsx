"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FlaskConical,
  Home,
  Images,
  Palette,
  User
} from "lucide-react";
import { fetchPatronSessionIfPresent, type PatronSessionMe } from "@/lib/relay-api";
import { performRelayLogout } from "@/lib/relay-session-logout";
import { useStudioSession } from "@/lib/studio-session-context";
import { RoleSwitcher } from "./RoleSwitcher";

const baseNavItems: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof Home;
}> = [
  { href: "/", label: "Library", Icon: Home },
  { href: "/designer", label: "Designer", Icon: Palette },
  { href: "/designer/profile", label: "Profile", Icon: User },
  { href: "/action-center", label: "Action Center", Icon: Activity },
  { href: "/visitor", label: "Gallery", Icon: Images }
] as const;

const devBenchNav =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH === "true"
    ? ([{ href: "/dev/bench", label: "Dev bench", Icon: FlaskConical }] as const)
    : [];

/** Dev aid: session + studio id + one-click logout. Set `NEXT_PUBLIC_RELAY_HIDE_ACCOUNT_STRIP=1` to remove. */
const hideAccountDevStrip = process.env.NEXT_PUBLIC_RELAY_HIDE_ACCOUNT_STRIP === "1";

function AccountLogoutDevStrip({
  compact = false
}: {
  compact?: boolean;
}) {
  const router = useRouter();
  const { ready, hasRelaySession, activeRole, creatorId, storedRelayCreatorId } =
    useStudioSession();
  const [me, setMe] = useState<PatronSessionMe | null | "loading">("loading");

  const refreshMe = useCallback(() => {
    void fetchPatronSessionIfPresent().then((m) => setMe(m ?? null));
  }, []);

  useEffect(() => {
    refreshMe();
    window.addEventListener("relay-studio-session", refreshMe);
    return () => window.removeEventListener("relay-studio-session", refreshMe);
  }, [refreshMe]);

  const sessionLine =
    me === "loading"
      ? !ready
        ? "…"
        : hasRelaySession
          ? "loading session…"
          : "no Relay session"
      : me
        ? (me.email?.trim() || me.user_id).slice(0, 48)
        : "signed out";

  const metaLine = `role ${activeRole ?? "—"} · studio ${(storedRelayCreatorId ?? creatorId).slice(0, 18)}`;

  const detailTitle = [
    me && me !== "loading" ? `user: ${me.user_id}` : null,
    me && me !== "loading" && me.email ? `email: ${me.email}` : null,
    `activeRole: ${activeRole ?? "null"}`,
    `creatorId: ${creatorId}`,
    storedRelayCreatorId ? `stored: ${storedRelayCreatorId}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <div className="hidden min-w-0 max-w-[220px] text-right sm:block" title={detailTitle}>
        <div className="truncate font-mono text-[10px] leading-tight text-[#B7C0BC]">{sessionLine}</div>
        {!compact ? (
          <div className="truncate font-mono text-[9px] leading-tight text-[#666]">{metaLine}</div>
        ) : null}
      </div>
      <button
        type="button"
        title={detailTitle ? `${detailTitle}\n\nClick to log out` : "Log out"}
        className="rounded-md border border-[#2A2A2A] bg-[#141414] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#E0E0E0] transition-colors hover:border-[#3A3A3A] hover:bg-[#1A1A1A]"
        onClick={async () => {
          await performRelayLogout();
          router.push("/login");
        }}
      >
        Account / Logout
      </button>
    </div>
  );
}

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Studio primary"
      className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 border-b border-[#1F1F1F] bg-[#0A0A0A]/95 px-3 backdrop-blur-md sm:px-6"
    >
      <Link
        href="/"
        className="mr-3 shrink-0 select-none font-bold tracking-tight text-[16px] text-[#C5B358] transition-colors hover:text-[#d4c47a]"
        aria-label="Relay studio home"
      >
        Relay
      </Link>

      <ul className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {[...baseNavItems, ...devBenchNav].map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/action-center"
                ? pathname === "/action-center" || pathname.startsWith("/action-center/")
                : item.href === "/visitor"
                  ? pathname === "/visitor" || pathname === "/visitor/"
                  : item.href === "/new-post"
                    ? pathname === "/new-post" || pathname.startsWith("/new-post/")
                  : item.href === "/dev/bench"
                    ? pathname === "/dev/bench" || pathname.startsWith("/dev/bench/")
                    : item.href === "/designer"
                      ? pathname === "/designer"
                      : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  isActive
                    ? "bg-[#0D1F17] text-[#9bf0c4]"
                    : "text-[#888] hover:bg-[#141414] hover:text-[#E0E0E0]"
                ].join(" ")}
              >
                <item.Icon size={13} aria-hidden />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* PE-I role switcher: only renders when the account has more than one role available. */}
      <div className="ml-2 hidden shrink-0 items-center md:flex">
        <RoleSwitcher variant="patron" />
      </div>
      {!hideAccountDevStrip ? (
        <AccountLogoutDevStrip compact />
      ) : null}
    </nav>
  );
}
