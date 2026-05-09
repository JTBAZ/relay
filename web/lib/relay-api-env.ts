/** Default Relay Express base when NEXT_PUBLIC_RELAY_API_URL is unset (browser client + Next rewrites). */
export const DEFAULT_RELAY_API_BASE = "http://127.0.0.1:8787";

/**
 * Normalize NEXT_PUBLIC_RELAY_API_URL for browser `fetch` and Next.js `rewrites`.
 * Trims whitespace, strips trailing slashes, defaults to {@link DEFAULT_RELAY_API_BASE} when empty.
 * Throws if the value is non-empty but not an absolute http(s) URL so misconfiguration fails at build time.
 */
export function resolveRelayApiBaseFromEnv(envValue: string | undefined): string {
  const fromEnv = (envValue ?? "").trim();
  const raw = fromEnv.length > 0 ? fromEnv : DEFAULT_RELAY_API_BASE;
  const trimmed = raw.replace(/\/+$/, "");
  const candidate = trimmed.length > 0 ? trimmed : DEFAULT_RELAY_API_BASE;

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_RELAY_API_URL: "${raw}". Expected an absolute URL such as http://127.0.0.1:8787. See web/.env.local.example.`
    );
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(
      `NEXT_PUBLIC_RELAY_API_URL must use http: or https: (got "${u.protocol}"). See web/.env.local.example.`
    );
  }
  return candidate;
}
