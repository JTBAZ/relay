"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStudioSession } from "@/lib/studio-session-context";

const NAV_ITEMS = [
  { label: "Library", href: "/studio/lab" },
  { label: "Designer", href: "/studio/designer" },
  { label: "Analytics", href: "/studio/analytics" },
  { label: "Distribution", href: "/studio/autopost" }
] as const;

/**
 * Lab-only Studio chrome — places nav only.
 * Tools (Goals, Automations, …) live in LabFloorspaceHeader.
 */
export function StudioLabNav({
  labVariant = "lab"
}: {
  labVariant?: "lab" | "lab2";
}) {
  const pathname = usePathname() ?? "";
  const { creatorId } = useStudioSession();
  const initials = (creatorId.replace(/^creator[_-]?/i, "").slice(0, 2) || "CR").toUpperCase();
  const libraryHref = labVariant === "lab2" ? "/studio/lab2" : "/studio/lab";

  return (
    <nav
      className="sticky top-0 z-40 flex h-11 shrink-0 items-center justify-between border-b border-[#1a1a1a] bg-[#050706]/90 px-4 backdrop-blur-sm"
      aria-label="Studio lab navigation"
    >
      <div className="flex items-center gap-2.5">
        <Link
          href="/studio"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#0d0d0d] text-[#9bf0c4]"
          aria-label="Relay studio home (production)"
          title="Back to production Library"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M4 7C4 5.343 5.343 4 7 4C8.657 4 10 5.343 10 7C10 8.657 8.657 10 7 10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M7 10C5.343 10 4 8.657 4 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
          </svg>
        </Link>
        <span className="hidden text-[12px] font-medium tracking-tight text-[#e8e8e8] sm:block">
          Relay
        </span>
        <span className="hidden rounded-md border border-[#9bf0c433] bg-[#9bf0c40e] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9bf0c4] sm:inline">
          {labVariant === "lab2" ? "Lab 2" : "Lab"}
        </span>
      </div>

      <div className="flex items-center gap-0.5 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-0.5">
        {NAV_ITEMS.map((item) => {
          const href = item.label === "Library" ? libraryHref : item.href;
          const active =
            item.label === "Library"
              ? pathname === "/studio/lab" ||
                pathname.startsWith("/studio/lab/") ||
                pathname === "/studio/lab2" ||
                pathname.startsWith("/studio/lab2/")
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.label}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-[12px] transition-all ${
                active
                  ? "border border-[#2a2a2a] bg-[#1a1a1a] text-[#e8e8e8]"
                  : "border border-transparent text-[#555] hover:text-[#888]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/studio/autopost"
          className="hidden rounded-lg border border-[#1f1f1f] px-3 py-1.5 text-[11.5px] text-[#555] transition-all hover:border-[#2a2a2a] hover:text-[#888] sm:block"
        >
          Autopost
        </Link>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#1a1a1a]"
          aria-hidden
        >
          <span className="text-[10px] font-medium text-[#666]">{initials}</span>
        </div>
      </div>
    </nav>
  );
}
