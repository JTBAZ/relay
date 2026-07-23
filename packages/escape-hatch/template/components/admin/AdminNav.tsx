"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_TABS = [
  { href: "/admin", label: "Overview", hint: "Health" },
  { href: "/admin/posts", label: "Posts", hint: "Access" },
  { href: "/admin/media", label: "Media", hint: "Inventory" },
  { href: "/admin/tiers", label: "Tiers", hint: "Mapping" },
  { href: "/admin/patrons", label: "Patrons", hint: "Grants" },
  { href: "/admin/appearance", label: "Appearance", hint: "Brand" },
  { href: "/admin/connections", label: "Connections", hint: "Adapters" },
  { href: "/admin/health", label: "Health", hint: "Actions" },
  { href: "/admin/patreon", label: "Patreon", hint: "Choice / health" },
  { href: "/admin/patreon/choice", label: "OAuth choice", hint: "Paths" },
  { href: "/admin/billing/policy", label: "Billing policy", hint: "Attest / route" }
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
