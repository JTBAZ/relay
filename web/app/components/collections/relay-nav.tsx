"use client";

import Link from "next/link";
import { Library, LayoutGrid, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Library", icon: Library, href: "/" as const },
  { label: "Collections", icon: LayoutGrid, href: "/collections" as const, active: true as const },
  { label: "Profile", icon: User, href: "#" as const },
] as const;

export function RelayNav() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-[#2A2A2A] bg-[#111111] px-5">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2A2A2A] bg-[#1A1A1A]">
          <Zap className="h-4 w-4" style={{ color: "#C5B358" }} />
        </div>
        <span
          className="text-base font-bold tracking-tight"
          style={{ color: "#C5B358", letterSpacing: "-0.02em" }}
        >
          Relay
        </span>
      </div>

      <div className="h-5 w-px bg-[#2A2A2A]" />

      <nav className="flex flex-1 items-center gap-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = "active" in item && item.active;
          const className = cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
            isActive
              ? "border border-[#1B4332] bg-[#0D1F17] text-[#F9FAFB]"
              : "text-[#9CA3AF] hover:bg-[#1A1A1A] hover:text-[#F9FAFB]",
          );
          const inner = (
            <>
              <Icon className={cn("h-4 w-4", isActive ? "text-[#40916C]" : "text-[#9CA3AF]")} />
              <span className="font-medium">{item.label}</span>
            </>
          );
          if (item.href === "#") {
            return (
              <a key={item.label} href="#" className={className} aria-current={isActive ? "page" : undefined}>
                {inner}
              </a>
            );
          }
          return (
            <Link key={item.label} href={item.href} className={className} aria-current={isActive ? "page" : undefined}>
              {inner}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        className="flex shrink-0 items-center gap-2 rounded-lg border border-[#2A2A2A] px-2.5 py-1.5 transition-colors hover:border-[#333333] hover:bg-[#1A1A1A]"
        aria-label="Account menu"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2D6A4F] text-[9px] font-bold text-[#F9FAFB]">
          A
        </div>
        <span className="text-xs font-medium text-[#F9FAFB]">Arlo</span>
      </button>
    </header>
  );
}
