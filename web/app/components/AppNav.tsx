"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchPatronSessionIfPresent, type PatronSessionMe } from "@/lib/relay-api";
import { performRelayLogout } from "@/lib/relay-session-logout";
import { useStudioSession } from "@/lib/studio-session-context";
import { RoleSwitcher } from "./RoleSwitcher";

const baseNavItems = [
  { href: "/landing", label: "Landing Page" },
  { href: "/", label: "Library" },
  { href: "/action-center", label: "Action Center" },
  { href: "/visitor", label: "Gallery" },
  { href: "/visitor/favorites", label: "Saved" },
  { href: "/designer", label: "Designer" },
  { href: "/designer/profile", label: "Profile" }
] as const;

const devBenchNav =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH === "true"
    ? [{ href: "/dev/bench", label: "Dev bench" }] as const
    : [];

/** Dev aid: session + studio id + one-click logout. Set `NEXT_PUBLIC_RELAY_HIDE_ACCOUNT_STRIP=1` to remove. */
const hideAccountDevStrip = process.env.NEXT_PUBLIC_RELAY_HIDE_ACCOUNT_STRIP === "1";

function AccountLogoutDevStrip({
  primaryShell,
  landingShell
}: {
  primaryShell: boolean;
  landingShell: boolean;
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

  const btnBase =
    primaryShell
      ? "border-[oklch(0.35_0.02_160)] bg-[oklch(0.2_0.01_160)] text-[oklch(0.88_0.008_160)] hover:border-[#00aa6f]/50 hover:bg-[oklch(0.24_0.02_160)]"
      : landingShell
        ? "border-[#2d6a4f]/40 bg-[#0d1f17]/80 text-[#40916c] hover:border-[#2d6a4f] hover:bg-[#0d1f17]"
        : "border-[#5c4030] bg-[#1a1410] text-[#e8c4a8] hover:border-[#c45c2d]/60";

  const textMuted = primaryShell
    ? "text-[oklch(0.55_0.008_160)]"
    : landingShell
      ? "text-[#6b7280]"
      : "text-[#8a7f72]";
  const textHi = primaryShell
    ? "text-[oklch(0.82_0.008_160)]"
    : landingShell
      ? "text-[#e5e7eb]"
      : "text-[#f0e6d8]";

  return (
    <div
      className={`ml-auto flex shrink-0 items-center gap-3 border-l pl-4 ${
        primaryShell
          ? "border-[oklch(0.28_0.01_160)]"
          : landingShell
            ? "border-[#2a2a2a]"
            : "border-[#4a3d32]"
      }`}
    >
      <div className="hidden min-w-0 max-w-[220px] text-right sm:block" title={detailTitle}>
        <div className={`truncate font-mono text-[10px] leading-tight ${textHi}`}>{sessionLine}</div>
        <div className={`truncate font-mono text-[9px] leading-tight ${textMuted}`}>{metaLine}</div>
      </div>
      <button
        type="button"
        title={detailTitle ? `${detailTitle}\n\nClick to log out` : "Log out"}
        className={`rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${btnBase}`}
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
  /** Library home + subscriber surfaces + dev bench share cool green chrome (design ledger: Relay shell). */
  const primaryShell =
    pathname === "/" ||
    pathname === "/action-center" ||
    pathname.startsWith("/action-center/") ||
    pathname.startsWith("/visitor") ||
    pathname.startsWith("/dev/bench");

  /* Marketing landing + creator onboarding: match v0 canvas (#0A0A0A). */
  const landingShell =
    pathname === "/landing" ||
    pathname.startsWith("/landing/") ||
    pathname === "/creator/connect" ||
    pathname.startsWith("/creator/connect/");
  const bar = primaryShell
    ? "border-b border-[oklch(0.22_0.008_160)] bg-[oklch(0.16_0.008_160)]"
    : landingShell
      ? "border-b border-[#2a2a2a] bg-[#0a0a0a]"
      : "border-b border-[#3d342b] bg-[#0d0a08]";
  const brand = primaryShell ? "text-[#c5b358]" : "text-[#e8a077]";
  const linkActive = primaryShell
    ? "border-[#00aa6f] text-[oklch(0.92_0.008_160)]"
    : landingShell
      ? "border-[#2d6a4f] text-[#f9fafb]"
      : "border-[#c45c2d] text-[#f0e6d8]";
  const linkIdle = primaryShell
    ? "border-transparent text-[oklch(0.55_0.008_160)] hover:text-[oklch(0.92_0.008_160)]"
    : landingShell
      ? "border-transparent text-[#6b7280] hover:text-[#f9fafb]"
      : "border-transparent text-[#8a7f72] hover:text-[#c9bfb3]";

  return (
    <nav
      className={`flex h-[var(--relay-app-nav-height)] shrink-0 items-center gap-0 px-6 py-0 ${bar} sticky top-0 z-50`}
    >
      <span className={`mr-6 shrink-0 py-2 font-[family-name:var(--font-display)] text-sm ${brand}`}>
        Relay
      </span>
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
        {[...baseNavItems, ...devBenchNav].map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/landing"
                ? pathname === "/landing" ||
                  pathname.startsWith("/landing/") ||
                  pathname === "/creator/connect" ||
                  pathname.startsWith("/creator/connect/")
                : item.href === "/action-center"
                ? pathname === "/action-center" || pathname.startsWith("/action-center/")
                : item.href === "/visitor"
                  ? pathname === "/visitor" || pathname === "/visitor/"
                  : item.href === "/dev/bench"
                    ? pathname === "/dev/bench" || pathname.startsWith("/dev/bench/")
                    : item.href === "/designer"
                      ? pathname === "/designer"
                      : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-xs transition-colors ${
                isActive ? linkActive : linkIdle
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {/* PE-I role switcher: only renders when the account has more than one role available. */}
      <div className="ml-2 hidden shrink-0 items-center md:flex">
        <RoleSwitcher variant="studio" />
      </div>
      {!hideAccountDevStrip ? (
        <AccountLogoutDevStrip primaryShell={primaryShell} landingShell={landingShell} />
      ) : null}
    </nav>
  );
}
