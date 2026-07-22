/**
 * Visitor-theme CSS token helpers (client-side Style studio + live dials).
 * Soft-gate preview only — not production branding enforcement.
 */

import type {
  ColorScheme,
  CoverCrop,
  EscapeHatchTheme,
  GalleryDensity,
  TypePairing
} from "@/lib/access";

export const SCHEME_TOKENS: Record<
  ColorScheme,
  {
    bg: string;
    fg: string;
    muted: string;
    card: string;
    deep: string;
    hover: string;
    border: string;
    atmosphere: string;
    colorScheme: "dark" | "light";
  }
> = {
  dark: {
    bg: "#141210",
    fg: "#f4efe6",
    muted: "#a89f93",
    card: "#1c1a17",
    deep: "#0c0b09",
    hover: "#26221c",
    border: "#2e2a24",
    atmosphere:
      "radial-gradient(ellipse 90% 55% at 50% -10%, color-mix(in srgb, var(--eh-accent) 22%, transparent), transparent 70%), linear-gradient(180deg, #1a1714 0%, #141210 42%, #0c0b09 100%)",
    colorScheme: "dark"
  },
  light: {
    bg: "#f0ebe3",
    fg: "#1a1814",
    muted: "#5c564c",
    card: "#faf7f2",
    deep: "#e4ddd2",
    hover: "#ebe4d8",
    border: "#d4cdc0",
    atmosphere:
      "radial-gradient(ellipse 90% 50% at 50% -8%, color-mix(in srgb, var(--eh-accent) 16%, transparent), transparent 68%), linear-gradient(180deg, #f7f3ec 0%, #f0ebe3 50%, #e8e1d6 100%)",
    colorScheme: "light"
  },
  warm: {
    bg: "#10141a",
    fg: "#eef2f6",
    muted: "#9aa6b2",
    card: "#161b22",
    deep: "#0a0d11",
    hover: "#1e2530",
    border: "#2a3340",
    atmosphere:
      "radial-gradient(ellipse 85% 50% at 50% -12%, color-mix(in srgb, var(--eh-accent) 20%, transparent), transparent 72%), linear-gradient(180deg, #141a22 0%, #10141a 45%, #0a0d11 100%)",
    colorScheme: "dark"
  }
};

export const TYPE_PAIRING_FONTS: Record<
  TypePairing,
  { display: string; body: string }
> = {
  editorial: {
    display:
      'var(--font-fraunces), "Iowan Old Style", "Palatino Linotype", Palatino, serif',
    body: 'var(--font-source-sans), "Segoe UI", system-ui, sans-serif'
  },
  studio: {
    display: 'var(--font-instrument-serif), "Iowan Old Style", Georgia, serif',
    body: 'var(--font-dm-sans), "Segoe UI", system-ui, sans-serif'
  },
  signal: {
    display:
      'var(--font-space-grotesk), "Avenir Next", "Segoe UI", system-ui, sans-serif',
    body: 'var(--font-newsreader), "Iowan Old Style", Georgia, serif'
  }
};

const COVER_POSITIONS: Record<CoverCrop, string> = {
  center: "center",
  top: "center top",
  safe: "center 30%"
};

const GRID_MINS: Record<GalleryDensity, string> = {
  comfortable: "280px",
  compact: "180px"
};

export function applyThemeTokens(theme: {
  color_scheme: ColorScheme | string;
  accent_color?: string;
  type_pairing?: TypePairing | string;
  gallery_density?: GalleryDensity | string;
  cover_crop?: CoverCrop | string;
}): void {
  if (typeof document === "undefined") return;
  const scheme =
    SCHEME_TOKENS[theme.color_scheme as ColorScheme] ?? SCHEME_TOKENS.dark;
  const pairing =
    TYPE_PAIRING_FONTS[theme.type_pairing as TypePairing] ??
    TYPE_PAIRING_FONTS.editorial;
  const accent = theme.accent_color ?? "#c4784a";
  const cover =
    COVER_POSITIONS[theme.cover_crop as CoverCrop] ?? COVER_POSITIONS.center;
  const gridMin =
    GRID_MINS[theme.gallery_density as GalleryDensity] ?? GRID_MINS.comfortable;
  const root = document.documentElement;
  root.style.setProperty("--eh-bg", scheme.bg);
  root.style.setProperty("--eh-fg", scheme.fg);
  root.style.setProperty("--eh-muted", scheme.muted);
  root.style.setProperty("--eh-card", scheme.card);
  root.style.setProperty("--eh-accent", accent);
  root.style.setProperty("--eh-bg-deep", scheme.deep);
  root.style.setProperty("--eh-hover", scheme.hover);
  root.style.setProperty("--eh-border", scheme.border);
  root.style.setProperty("--eh-atmosphere", scheme.atmosphere);
  root.style.setProperty("--eh-font-display", pairing.display);
  root.style.setProperty("--eh-font-body", pairing.body);
  root.style.setProperty("--eh-cover-position", cover);
  root.style.setProperty("--eh-grid-min", gridMin);
  root.style.colorScheme = scheme.colorScheme;
}

export function paywallCopy(
  theme: Pick<EscapeHatchTheme, "paywall_style" | "paywall_message">,
  styleOverride?: EscapeHatchTheme["paywall_style"]
): string {
  if (theme.paywall_message?.trim()) return theme.paywall_message.trim();
  const style = styleOverride ?? theme.paywall_style ?? "blur";
  if (style === "hard") return "Members only";
  if (style === "teaser") return "Peek reserved for subscribers";
  return "Unlock to view";
}
