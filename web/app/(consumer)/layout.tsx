"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import "./feed/patron-mock.css";
import { PatronTopNav } from "./PatronTopNav";

function navHiddenFor(pathname: string): boolean {
  if (pathname === "/onboarding/patron") return true;
  if (pathname.startsWith("/onboarding/patron/")) return true;
  if (pathname === "/feed") return true;
  if (pathname === "/profile") return true;
  return false;
}

export default function ConsumerShellLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const showNav = !navHiddenFor(pathname);
  return (
    <div className="patron-mock-root dark min-h-screen bg-background text-foreground antialiased">
      {showNav ? <PatronTopNav /> : null}
      {children}
    </div>
  );
}
