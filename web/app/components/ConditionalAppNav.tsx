"use client";

import { usePathname } from "next/navigation";
import AppNav from "./AppNav";

function shouldShowStudioNav(pathname: string): boolean {
  if (pathname === "/studio/lab" || pathname.startsWith("/studio/lab/")) {
    return false;
  }
  if (pathname === "/studio/lab2" || pathname.startsWith("/studio/lab2/")) {
    return false;
  }
  return (
    pathname === "/studio" ||
    pathname.startsWith("/studio/") ||
    pathname === "/dev/bench" ||
    pathname.startsWith("/dev/bench/")
  );
}

/** Studio chrome only belongs on creator-tool routes. */
export default function ConditionalAppNav() {
  const pathname = usePathname() ?? "";

  if (!shouldShowStudioNav(pathname)) {
    return null;
  }

  return <AppNav />;
}
