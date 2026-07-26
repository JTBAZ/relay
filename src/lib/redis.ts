/**
 * Parse `REDIS_URL` into options compatible with ioredis / BullMQ `ConnectionOptions`.
 * No runtime dependency on `ioredis` here — P1-queue-002 adds the client library.
 *
 * **Production:** `rediss://` enables TLS (`tls: {}` for ioredis). See pilot build plan Phase P1 runbook — Production checklist.
 */

export type RedisConnectionOptions = {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  /** Set for `rediss://` URLs; forward to ioredis as `tls`. */
  tls?: Record<string, never>;
};

export function parseRedisUrl(rawUrl: string): RedisConnectionOptions {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("REDIS_URL is empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`REDIS_URL is not a valid URL: ${trimmed.slice(0, 96)}`);
  }
  const scheme = parsed.protocol.replace(/:$/, "");
  if (scheme !== "redis" && scheme !== "rediss") {
    throw new Error(`REDIS_URL must use redis:// or rediss:// (got ${scheme}:)`);
  }
  const host = parsed.hostname;
  if (!host) {
    throw new Error("REDIS_URL must include a host");
  }
  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`REDIS_URL has invalid port: ${parsed.port || "(default)"}`);
  }

  let db: number | undefined;
  if (parsed.pathname && parsed.pathname !== "/") {
    const seg = parsed.pathname.replace(/^\//, "").split("/")[0] ?? "";
    if (seg !== "") {
      const n = Number(seg);
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(
          `REDIS_URL path must be a non-negative integer DB index (got ${JSON.stringify(seg)})`
        );
      }
      db = n;
    }
  }

  const username =
    parsed.username !== "" ? decodeURIComponent(parsed.username) : undefined;
  const password =
    parsed.password !== "" ? decodeURIComponent(parsed.password) : undefined;
  const tls: Record<string, never> | undefined = scheme === "rediss" ? {} : undefined;

  return { host, port, username, password, db, tls };
}

/**
 * Require `REDIS_URL` (e.g. when `RELAY_JOB_BACKEND=bullmq`).
 */
export function getRedisConnectionOptions(
  env: NodeJS.ProcessEnv = process.env
): RedisConnectionOptions {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Set it to e.g. redis://localhost:6379 when using BullMQ (see .env.example)."
    );
  }
  return parseRedisUrl(url);
}

/** When Redis is optional, returns `undefined` if `REDIS_URL` is unset. */
export function getRedisConnectionOptionsIfConfigured(
  env: NodeJS.ProcessEnv = process.env
): RedisConnectionOptions | undefined {
  const url = env.REDIS_URL?.trim();
  if (!url) return undefined;
  return parseRedisUrl(url);
}
