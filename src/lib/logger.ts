/**
 * Structured logging (Pino). Instantiate via `createLogger()` only after `loadEnv` in process entrypoints.
 * @see docs/pilot-build-plan.md P2-obs-001
 */
import pino, { type DestinationStream } from "pino";
import pinoStdSerializers from "pino-std-serializers";
import {
  isSensitivePlainObjectKey,
  scrubRequestHeaders,
  scrubTokenSubstrings
} from "./pii-scrub.js";

const { wrapErrorSerializer, wrapRequestSerializer } = pinoStdSerializers;

const relayErrSerializer = wrapErrorSerializer((serialized) => {
  const out: Record<string, unknown> = { ...serialized };
  delete out.raw;
  for (const k of Object.keys(out)) {
    if (isSensitivePlainObjectKey(k)) {
      out[k] = "[Redacted]";
    }
  }
  if (typeof out.message === "string") {
    out.message = scrubTokenSubstrings(out.message);
  }
  if (typeof out.stack === "string") {
    out.stack = scrubTokenSubstrings(out.stack);
  }
  return out;
});

const relayReqSerializer = wrapRequestSerializer((serialized) => {
  const { raw: _omit, ...rest } = serialized;
  const headers = scrubRequestHeaders(
    rest.headers as unknown as Record<string, string | string[] | undefined>
  );
  return {
    ...rest,
    headers: headers as typeof rest.headers,
    remoteAddress: "[Redacted]",
    remotePort: 0
  };
});

/** Paths redacted from logged objects (case-sensitive keys; HTTP headers are usually lowercased). */
const DEFAULT_REDACT_PATHS = [
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "headers.authorization",
  "headers.Authorization",
  "req.headers.authorization",
  "req.headers.Authorization",
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.access_token",
  "*.refresh_token",
  "access_token",
  "refresh_token",
  "email",
  "*.email",
  "user.email",
  "ip",
  "*.ip",
  "ip_address",
  "*.ip_address",
  "req.headers.cookie",
  'req.headers["x-forwarded-for"]',
  'req.headers["x-real-ip"]',
  "*.secret",
  "*.apiKey"
];

export type CreateLoggerOptions = {
  /** Child logger name (e.g. relay-api / relay-worker). */
  name?: string;
  /** Override env reads (tests). */
  env?: NodeJS.ProcessEnv;
  /** Sync/custom destination (tests); if set, pretty transport is not used. */
  destination?: DestinationStream;
};

function resolveLogLevel(env: NodeJS.ProcessEnv): string {
  if (env.LOG_LEVEL?.trim()) return env.LOG_LEVEL.trim();
  if (env.NODE_ENV === "production") return "info";
  if (env.NODE_ENV === "test" || env.VITEST === "true") return "silent";
  return "debug";
}

function usePrettyStream(env: NodeJS.ProcessEnv): boolean {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (nodeEnv === "production" || nodeEnv === "test") return false;
  const explicit = env.LOG_PRETTY;
  if (explicit === "0" || explicit === "false") return false;
  return true;
}

/**
 * Creates a root logger. Call after `dotenv` / `loadEnv` so `LOG_LEVEL` and `NODE_ENV` match the process.
 */
export function createLogger(options: CreateLoggerOptions = {}): pino.Logger {
  const env =
    options.env !== undefined
      ? { ...process.env, ...options.env }
      : process.env;
  const base: pino.LoggerOptions = {
    name: options.name,
    level: resolveLogLevel(env),
    redact: {
      paths: DEFAULT_REDACT_PATHS,
      censor: "[Redacted]"
    },
    serializers: {
      err: relayErrSerializer,
      req: relayReqSerializer
    }
  };

  if (options.destination) {
    return pino(base, options.destination);
  }

  if (usePrettyStream(env)) {
    const transportDup = pino.transport({
      target: "pino-pretty",
      options: { colorize: true }
    });
    return pino(base, transportDup);
  }

  return pino(base);
}
