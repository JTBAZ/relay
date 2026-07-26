/**
 * Destination QR for Previewizer overlays — encodes a real HTTPS URL (Patreon home, etc.).
 * Prefer PNG for html2canvas export safety. Distinct from tracked `/go/:slug` QR helpers.
 */

import QRCode from "qrcode";

/** Trim and coerce a user/display URL into an absolute https URL, or null if invalid. */
export function normalizeExternalHttpsUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:";
    // Drop trailing slash on bare paths for stable QR payloads.
    if (u.pathname === "/") {
      return u.origin;
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Match LibraryTopBar / public-profile-hero homepage construction. */
export function buildPatreonHomepageUrl(patreonName: string): string {
  const slug = patreonName.trim().replace(/^@+/, "").replace(/^\/+/, "");
  return `https://www.patreon.com/${encodeURIComponent(slug)}`;
}

export function buildPatreonDisplayText(patreonName: string): string {
  const slug = patreonName.trim().replace(/^@+/, "").replace(/^\/+/, "");
  return `patreon.com/${slug}`;
}

export function buildBlueskyProfileUrl(handle: string): string {
  const h = handle.trim().replace(/^@+/, "");
  return `https://bsky.app/profile/${encodeURIComponent(h)}`;
}

export function buildBlueskyDisplayText(handle: string): string {
  const h = handle.trim().replace(/^@+/, "");
  return `bsky.app/profile/${h}`;
}

/** PNG data URL for baking into Previewizer composition exports. */
export async function previewizerDestinationQrPngDataUrl(href: string): Promise<string> {
  const url = href.trim();
  if (!url) throw new Error("Destination URL is required for QR.");
  const normalized = normalizeExternalHttpsUrl(url) ?? url;
  return QRCode.toDataURL(normalized, { margin: 1, width: 256, type: "image/png" });
}
