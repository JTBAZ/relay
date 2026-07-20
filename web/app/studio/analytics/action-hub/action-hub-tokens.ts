import type { CSSProperties } from "react";

/**
 * Relay branding tokens for Insights Action Hub (v0 port).
 * Maps v0 hardcodes onto established Studio / Coach accents.
 */
export const IAH = {
  accent: "#00aa6f",
  onAccent: "var(--relay-bg, #0a0a0a)",
  bg: "var(--relay-bg, #0a0a0a)",
  surface: "var(--relay-surface-1, #111111)",
  surface2: "var(--relay-surface-2, #1a1a1a)",
  fg: "var(--relay-fg, #f9fafb)",
  fgMuted: "var(--relay-fg-muted, #9ca3af)",
  fgSubtle: "var(--relay-fg-subtle, #6b7280)",
  border: "rgba(255, 255, 255, 0.07)",
  accentSoft: "rgba(0, 170, 111, 0.12)",
  accentBorder: "rgba(0, 170, 111, 0.3)",
  accentGlow: "rgba(0, 170, 111, 0.06)",
  paceBehind: "#e8833a",
  overlay: "rgba(10, 10, 10, 0.8)"
} as const;

/** Scoped CSS variables for hooks inside the hub. */
export const IAH_ROOT_STYLE: CSSProperties = {
  ["--iah-accent" as string]: IAH.accent,
  ["--iah-fg" as string]: IAH.fg,
  ["--iah-fg-muted" as string]: IAH.fgMuted,
  ["--iah-border" as string]: IAH.border,
  ["--iah-surface" as string]: IAH.surface,
  color: IAH.fg
};
