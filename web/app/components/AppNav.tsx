"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Library" },
  { href: "/designer", label: "Designer" }
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-[#0d0a08] border-b border-[#3d342b] px-6 py-0 flex items-center gap-0">
      <span className="font-[family-name:var(--font-display)] text-[#e8a077] text-sm mr-6 py-2">
        Relay
      </span>
      {navItems.map((item) => {
        const isActive = item.href === "/"
          ? pathname === "/"
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-xs px-4 py-2.5 border-b-2 transition-colors ${
              isActive
                ? "border-[#c45c2d] text-[#f0e6d8]"
                : "border-transparent text-[#8a7f72] hover:text-[#c9bfb3]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
