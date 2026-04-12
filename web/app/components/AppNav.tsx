"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const baseNavItems = [
  { href: "/landing", label: "Landing Page" },
  { href: "/", label: "Library" },
  { href: "/action-center", label: "Action Center" },
  { href: "/visitor", label: "Gallery" },
  { href: "/visitor/favorites", label: "Saved" },
  { href: "/designer", label: "Designer" }
] as const;

const devBenchNav =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_RELAY_SHOW_DEV_BENCH === "true"
    ? [{ href: "/dev/bench", label: "Dev bench" }] as const
    : [];

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
      <span className={`mr-6 py-2 font-[family-name:var(--font-display)] text-sm ${brand}`}>
        Relay
      </span>
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
                  : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b-2 px-4 py-2.5 text-xs transition-colors ${
              isActive ? linkActive : linkIdle
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
