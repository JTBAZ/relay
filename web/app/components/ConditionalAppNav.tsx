"use client";

import { usePathname } from "next/navigation";
import AppNav from "./AppNav";

/** Full-page flows (e.g. onboarding) supply their own chrome. */
export default function ConditionalAppNav() {
  const pathname = usePathname();
  if (
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/collections" ||
    pathname.startsWith("/collections/")
  ) {
    return null;
  }
  return <AppNav />;
}
