"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/library", label: "Library", hint: "Truth audit" },
  { href: "/structure", label: "Structure", hint: "Tiers & posts" },
  { href: "/style", label: "Style", hint: "Few dials" },
  { href: "/admin", label: "Admin", hint: "Operate site" },
  { href: "/account", label: "Account", hint: "Sign-in & membership" },
  { href: "/preview", label: "Preview", hint: "Visitor walk" }
] as const;

type Props = {
  /** Quieter chrome on immersive Preview */
  quiet?: boolean;
};

export function ConsoleNav({ quiet = false }: Props) {
  const pathname = usePathname();

  return (
    <header className={`console-nav ${quiet ? "console-nav--quiet" : ""}`}>
      <div className="console-brand">
        <Link href="/library" className="console-wordmark">
          Escape Hatch
        </Link>
        <span className="console-tag">Console</span>
      </div>
      <nav className="console-tabs" aria-label="Hatch Console">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === "/admin" && pathname.startsWith("/admin")) ||
            (tab.href === "/account" && pathname.startsWith("/account")) ||
            (tab.href === "/preview" && pathname.startsWith("/p/")) ||
            (tab.href === "/library" && pathname === "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`console-tab ${active ? "is-active" : ""}`}
              title={tab.hint}
              aria-current={active ? "page" : undefined}
            >
              <span className="console-tab-label">{tab.label}</span>
              {!quiet ? (
                <span className="console-tab-hint">{tab.hint}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
