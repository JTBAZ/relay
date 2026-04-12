/**
 * Patreon OAuth **Client ID** for `/patreon/connect` pages.
 *
 * Prefer **`PATREON_CLIENT_ID`** (read at **server runtime**) so Docker/Coolify can inject the
 * value without rebuilding — `NEXT_PUBLIC_*` is inlined at `next build` and is often empty in
 * production if the host only sets runtime env.
 *
 * Fallback: **`NEXT_PUBLIC_PATREON_CLIENT_ID`** (local dev / build-time).
 *
 * Use from Server Components only; pass the string into client components as props (do not read
 * `PATREON_CLIENT_ID` inside `"use client"` modules).
 */
export function resolvePatreonOAuthClientId(): string {
  const runtime = process.env.PATREON_CLIENT_ID?.trim();
  if (runtime) return runtime;
  return process.env.NEXT_PUBLIC_PATREON_CLIENT_ID?.trim() ?? "";
}
