"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_TABS = [
  { href: "/admin", label: "Overview", hint: "Health" },
  { href: "/admin/posts", label: "Posts", hint: "Access" },
  { href: "/admin/media", label: "Media", hint: "Inventory" },
  { href: "/admin/tiers", label: "Tiers", hint: "Mapping" },
  { href: "/admin/patreon", label: "Patreon", hint: "OAuth setup" }
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-subnav" aria-label="Admin sections">
      {ADMIN_TABS.map((tab) => {
        const active =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`admin-subnav-link ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="admin-subnav-label">{tab.label}</span>
            <span className="admin-subnav-hint">{tab.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
