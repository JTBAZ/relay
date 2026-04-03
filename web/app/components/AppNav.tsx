"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Library" },
  { href: "/visitor", label: "Gallery" },
  { href: "/visitor/favorites", label: "Saved" },
  { href: "/designer", label: "Designer" }
];

export default function AppNav() {
  const pathname = usePathname();
  const visitorShell = pathname.startsWith("/visitor");

  if (pathname === "/") {
    return null;
  }

  /* Visitor matches `.library-shell` tokens; nav sits outside that wrapper so we use literals. */
  const bar = visitorShell
    ? "border-b border-[oklch(0.22_0.008_160)] bg-[oklch(0.16_0.008_160)]"
    : "border-b border-[#3d342b] bg-[#0d0a08]";
  const brand = visitorShell ? "text-[#00aa6f]" : "text-[#e8a077]";
  const linkActive = visitorShell
    ? "border-[#00aa6f] text-[oklch(0.92_0.008_160)]"
    : "border-[#c45c2d] text-[#f0e6d8]";
  const linkIdle = visitorShell
    ? "border-transparent text-[oklch(0.55_0.008_160)] hover:text-[oklch(0.92_0.008_160)]"
    : "border-transparent text-[#8a7f72] hover:text-[#c9bfb3]";

  return (
    <nav
      className={`flex items-center gap-0 px-6 py-0 ${bar} ${visitorShell ? "sticky top-0 z-50" : ""}`}
    >
      <span className={`mr-6 py-2 font-[family-name:var(--font-display)] text-sm ${brand}`}>
        Relay
      </span>
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/visitor"
              ? pathname === "/visitor" || pathname === "/visitor/"
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
