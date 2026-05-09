/** @type {import('next').NextConfig} */

/** Keep in sync with web/lib/relay-api-env.ts (this file must stay plain JS for Node). */
function resolveRelayApiBaseFromEnv(envValue) {
  const DEFAULT_RELAY_API_BASE = "http://127.0.0.1:8787";
  const fromEnv = (envValue ?? "").trim();
  const raw = fromEnv.length > 0 ? fromEnv : DEFAULT_RELAY_API_BASE;
  const trimmed = raw.replace(/\/+$/, "");
  const candidate = trimmed.length > 0 ? trimmed : DEFAULT_RELAY_API_BASE;
  let u;
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

const nextConfig = {
  async rewrites() {
    const relay = resolveRelayApiBaseFromEnv(process.env.NEXT_PUBLIC_RELAY_API_URL);
    return [
      {
        source: "/api/relay/library-zip",
        destination: `${relay}/api/v1/export/library-zip`
      }
    ];
  }
};

export default nextConfig;
