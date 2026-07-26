"use client";

/**
 * Patron Patreon OAuth bridge layout — matches /patron feed shell (dark, Relay mark).
 */

import type { ReactNode } from "react";

import { PatronPrimaryTopNav as PatronTopNav } from "@/components/patron/PatronPrimaryTopNav";
import { patronFlowColors } from "@/components/patron/patron-flow-ui";

export default function PatreonPatronLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-dvh antialiased"
      style={{ background: patronFlowColors.pageBg, color: patronFlowColors.pageFg }}
    >
      <PatronTopNav />
      {children}
    </div>
  );
}
