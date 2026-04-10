"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home,
  Compass,
  Store,
  Settings,
  Bell,
  Menu,
  X,
  Search,
  Command,
} from "lucide-react";
import { CURRENT_VIEWER, FOLLOWED_CREATORS } from "@/lib/relay-fixtures";
import { FilterChips, type FeedFilter } from "./filter-chips";
import { RelayMarkIcon } from "./relay-mark-icon";

interface RelayShellProps {
  activeFilter: FeedFilter;
  onFilterChange: (f: FeedFilter) => void;
  onSearchOpen: () => void;
  onNavigateDiscover?: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home, active: true },
  { id: "discover", label: "Discover", icon: Compass, active: false },
  { id: "marketplace", label: "Marketplace", icon: Store, active: false },
] as const;

export function RelayShell({
  activeFilter,
  onFilterChange,
  onSearchOpen,
  onNavigateDiscover,
  children,
}: RelayShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ⌘K shortcut — delegate to parent
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSearchOpen();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSearchOpen]);

  // Close sidebar on wide viewports
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A]">
      {/* ── Mobile overlay ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={[
          "fixed lg:static top-0 left-0 z-40 h-full w-60 bg-[#0E0E0E] border-r border-[#1A1A1A] flex flex-col",
          "transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* Wordmark — logo + Relay, centered; links to patron feed home */}
        <div className="relative flex h-[56px] shrink-0 items-center justify-center border-b border-[#1A1A1A] px-5">
          <Link
            href="/patron/feed"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[#C5B358] transition-colors duration-150 hover:bg-[#141414] hover:text-[#d4c47a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5B358]/35"
            aria-label="Relay home"
            title="Home"
          >
            <RelayMarkIcon size={36} className="shrink-0" />
            <span className="select-none font-bold tracking-tight text-[20px] text-[#C5B358]">
              Relay
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-[#4B5563] transition-colors duration-150 hover:text-[#9CA3AF] lg:hidden"
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        </div>

        {/* Primary nav */}
        <nav className="px-3 pt-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const className = [
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150",
              item.active
                ? "bg-[#0D1F17] text-[#40916C] border border-[#1B4332]/40"
                : "text-[#5A5A5A] hover:bg-[#141414] hover:text-[#9CA3AF]",
            ].join(" ");

            if (item.id === "marketplace") {
              return (
                <Link
                  key={item.id}
                  href="/patron/commission-hub"
                  onClick={() => setSidebarOpen(false)}
                  className={className}
                  aria-label="Marketplace — Commission Hub"
                >
                  <item.icon size={15} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "discover" && onNavigateDiscover) {
                    onNavigateDiscover();
                  }
                }}
                className={className}
                aria-current={item.active ? "page" : undefined}
              >
                <item.icon size={15} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-5 mt-4 mb-4 border-t border-[#1A1A1A]" />

        {/* Following list */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-[#3A3A3A]">
              Following
            </span>
            <span className="text-[10px] text-[#3A3A3A]">
              {FOLLOWED_CREATORS.length}
            </span>
          </div>
          <ul className="space-y-0.5">
            {FOLLOWED_CREATORS.map((creator) => (
              <li key={creator.id}>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-[#5A5A5A] hover:bg-[#141414] hover:text-[#9CA3AF] transition-colors duration-150">
                  <div
                    className="w-6 h-6 rounded-full overflow-hidden bg-[#2A2A2A] shrink-0"
                    aria-hidden="true"
                  >
                    <img
                      src={creator.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      width={24}
                      height={24}
                    />
                  </div>
                  <span className="truncate flex-1 text-left">
                    {creator.displayName}
                  </span>
                  {/* "New content" indicator */}
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] shrink-0"
                    aria-label="New content"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Divider */}
        <div className="mx-5 mt-3 mb-3 border-t border-[#1A1A1A]" />

        {/* Footer: settings + viewer */}
        <div className="px-3 pb-4 space-y-0.5 shrink-0">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#5A5A5A] hover:bg-[#141414] hover:text-[#9CA3AF] transition-colors duration-150">
            <Settings size={14} aria-hidden="true" />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#141414] transition-colors duration-150">
            <div
              className="w-7 h-7 rounded-full overflow-hidden bg-[#2A2A2A] shrink-0"
              aria-hidden="true"
            >
              <img
                src={CURRENT_VIEWER.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
                width={28}
                height={28}
              />
            </div>
            <div className="flex-1 text-left overflow-hidden">
              <div className="text-xs text-[#C8C8C8] truncate font-medium">
                {CURRENT_VIEWER.displayName}
              </div>
              <div className="text-[10px] text-[#444444] truncate">
                @{CURRENT_VIEWER.handle}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 lg:px-5 h-[56px] border-b border-[#1A1A1A] bg-[#0A0A0A] shrink-0">
          {/* Hamburger — mobile */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150 shrink-0"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu size={19} />
          </button>

          {/* Mobile wordmark */}
          <span
            className="lg:hidden font-bold tracking-tight text-[18px] shrink-0 select-none"
            style={{ color: "#C5B358" }}
            aria-hidden="true"
          >
            Relay
          </span>

          {/* Search trigger — central, prominent */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={onSearchOpen}
              className="flex items-center gap-2.5 px-3.5 py-2 w-full max-w-[480px] bg-[#111111] border border-[#222222] rounded-lg text-sm text-[#444444] hover:border-[#2E2E2E] hover:text-[#666666] transition-colors duration-150 group"
              aria-label="Open search (⌘K)"
            >
              <Search size={13} aria-hidden="true" />
              <span className="flex-1 text-left text-sm">
                Search creators and posts…
              </span>
              <span className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#222222] text-[10px] font-mono text-[#333333] group-hover:border-[#2E2E2E] transition-colors duration-150">
                <Command size={8} aria-hidden="true" />K
              </span>
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="relative p-2 text-[#4B5563] hover:text-[#9CA3AF] transition-colors duration-150 rounded-lg hover:bg-[#111111]"
              aria-label={`Notifications (${CURRENT_VIEWER.notificationCount} unread)`}
            >
              <Bell size={17} aria-hidden="true" />
              {CURRENT_VIEWER.notificationCount > 0 && (
                <span
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"
                  aria-hidden="true"
                />
              )}
            </button>
            <div
              className="w-8 h-8 rounded-full overflow-hidden bg-[#2A2A2A] border border-[#222222] shrink-0"
              aria-hidden="true"
            >
              <img
                src={CURRENT_VIEWER.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
                width={32}
                height={32}
              />
            </div>
          </div>
        </header>

        {/* Filter subnav */}
        <div className="flex items-center justify-between gap-4 px-4 lg:px-5 py-3 border-b border-[#151515] bg-[#0A0A0A] shrink-0">
          <FilterChips value={activeFilter} onChange={onFilterChange} />
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"
              aria-hidden="true"
            />
            <span className="text-[11px] text-[#3A3A3A] font-medium whitespace-nowrap">
              Chronological
            </span>
          </div>
        </div>

        {/* Scrollable feed */}
        <main className="flex-1 overflow-y-auto" id="feed-main">
          <div className="max-w-[880px] mx-auto px-4 lg:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
