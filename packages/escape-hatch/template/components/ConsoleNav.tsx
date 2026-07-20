"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/structure", label: "Structure", hint: "Tiers & posts" },
  { href: "/style", label: "Style", hint: "Few dials" },
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
        <Link href="/structure" className="console-wordmark">
          Escape Hatch
        </Link>
        <span className="console-tag">Console</span>
      </div>
      <nav className="console-tabs" aria-label="Hatch Console">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === "/preview" && pathname.startsWith("/p/"));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`console-tab ${active ? "is-active" : ""}`}
              title={tab.hint}
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
