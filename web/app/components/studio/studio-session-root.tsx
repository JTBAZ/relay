"use client";

import type { ReactNode } from "react";
import { StudioSessionProvider } from "@/lib/studio-session-context";

export function StudioSessionRoot({ children }: { children: ReactNode }) {
  return <StudioSessionProvider>{children}</StudioSessionProvider>;
}
