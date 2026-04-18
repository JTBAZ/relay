"use client";

import type { ReactNode } from "react";
import { AuthBootSplash } from "./AuthBootSplash";

/**
 * Render the boot splash while a guard is resolving or while a redirect is in flight;
 * otherwise render children.
 *
 * @example
 * ```tsx
 * const guard = useYourAuthGuard(); // Tier 1.4 hooks return { ready, blocked }
 * return <BootSplashOr guard={guard}>{actualPageContent}</BootSplashOr>;
 * ```
 */
export function BootSplashOr({
  guard,
  children
}: {
  guard: { ready: boolean; blocked: boolean };
  children: ReactNode;
}) {
  if (!guard.ready || guard.blocked) {
    return <AuthBootSplash />;
  }
  return <>{children}</>;
}
