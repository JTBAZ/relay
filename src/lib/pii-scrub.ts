/**
 * Shared PII / secret scrubbing for Pino serializers and Sentry beforeSend.
 * @see docs/pilot-build-plan.md P2-obs-008
 */

/** Distinctive string used in tests — must never appear post-serialize/scrub. */
export const TEST_RAW_TOKEN_LEAK_MARK = "relay_pii_test_token_z9xq7wm2";

const SENSITIVE_OBJECT_KEY_LOWER = new Set([
  "access_token",
  "refresh_token",
  "accesstoken",
  "refreshtoken",
  "id_token",
  "authorization",
  "password",
  "secret",
  "client_secret",
  "api_key",
  "apikey",
  "cookie",
  "email",
  "ip",
  "ip_address",
  "remoteaddress",
  "forwarded"
]);

export function isSensitivePlainObjectKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/-/g, "_");
  if (SENSITIVE_OBJECT_KEY_LOWER.has(norm)) return true;
  if (norm.includes("email")) return true;
  if (norm === "traceid" || norm === "trace_id") return false;
  if (norm.endsWith("_token") || norm.endsWith("token")) return true;
  return false;
}

const HEADER_REDACT_LOWER = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-forwarded-for",
  "x-real-ip",
  "forwarded"
]);

export function scrubRequestHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  const out = { ...headers };
  for (const key of Object.keys(out)) {
    if (HEADER_REDACT_LOWER.has(key.toLowerCase())) {
      out[key] = "[Redacted]";
    }
  }
  return out;
}

/**
 * Remove common token patterns from free-form strings (error message, stack).
 */
export function scrubTokenSubstrings(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bBearer\s+[\w-._~+/]+=*\b/gi, "Bearer [Redacted]")
    .replace(/\baccess_token\s*[=:]\s*["']?[^\s"',}\]]+/gi, "access_token=[Redacted]")
    .replace(/\brefresh_token\s*[=:]\s*["']?[^\s"',}\]]+/gi, "refresh_token=[Redacted]");
}

export function redactSensitiveKeysInObject(
  value: unknown,
  depth = 0,
  maxDepth = 10
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > maxDepth) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitiveKeysInObject(v, depth + 1, maxDepth));
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitivePlainObjectKey(k)) {
      out[k] = "[Redacted]";
    } else if (typeof v === "string") {
      out[k] = scrubTokenSubstrings(v);
    } else {
      out[k] = redactSensitiveKeysInObject(v, depth + 1, maxDepth);
    }
  }
  return out;
}
