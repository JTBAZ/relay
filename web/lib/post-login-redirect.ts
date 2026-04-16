import { RELAY_PUBLIC_SLUG_STORAGE_KEY } from "./relay-api";

/** Public creator page by vanity slug (after workspace bootstrap). */
export function getCreatorPublicProfilePathFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const slug = window.localStorage.getItem(RELAY_PUBLIC_SLUG_STORAGE_KEY)?.trim();
  if (!slug) return null;
  return `/patron/c/${encodeURIComponent(slug)}`;
}

/**
 * Where to send the user after Supabase sign-in / email confirm.
 * Honors `returnTo` when safe; otherwise studio Library at `/`.
 */
export function resolvePostAuthPath(returnTo: string | null | undefined): string {
  const r = returnTo?.trim();
  if (r && r.startsWith("/") && !r.startsWith("//")) return r;
  return "/";
}
