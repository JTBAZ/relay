/**
 * Typed environment contract for the generated Escape Hatch site kit (EH-031).
 *
 * Preview / `next build` succeed with empty or minimal env.
 * Runtime paths that need credentials call `requireEnv` / `requireServerEnv`
 * and fail closed. Soft persona remains for local preview when identity is none.
 *
 * Identity provider (ESCAPE_HATCH_IDENTITY_PROVIDER):
 * - unset / none — local preview (soft personas + local-operator admin)
 * - supabase — Path A (EH-030)
 * - portable — Path B (DATABASE_URL + app-managed auth)
 * Unknown strings fail closed.
 */

export type IdentityProviderMode = "none" | "supabase" | "portable";

export type SitePublicEnv = {
  /** Public canonical origin for the site (optional for local preview). */
  NEXT_PUBLIC_SITE_URL: string | undefined;
  /** Optional display name override (falls back to bundle theme / creator). */
  NEXT_PUBLIC_SITE_NAME: string | undefined;
  /** Creator-owned Supabase project URL (browser-safe). */
  NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  /** Supabase anon/publishable key (browser-safe; RLS-enforced). */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string | undefined;
};

export type SiteServerEnv = {
  /** Explicit identity provider: none | supabase | portable. */
  ESCAPE_HATCH_IDENTITY_PROVIDER: string | undefined;
  /** Postgres connection string — Path B / optional direct path. */
  DATABASE_URL: string | undefined;
  /** Server-only session HMAC/pepper for portable opaque tokens. */
  ESCAPE_HATCH_SESSION_SECRET: string | undefined;
  /** Server-side Supabase URL alias when public URL unset. */
  SUPABASE_URL: string | undefined;
  /** Server-side anon key alias when public anon unset. */
  SUPABASE_ANON_KEY: string | undefined;
  /** Supabase service role — server-only; never expose to the browser. */
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  /** Cloudflare R2 / S3-compatible endpoint — optional until storage wiring. */
  R2_ENDPOINT: string | undefined;
  R2_BUCKET: string | undefined;
  R2_ACCESS_KEY_ID: string | undefined;
  R2_SECRET_ACCESS_KEY: string | undefined;
  R2_PUBLIC_BASE_URL: string | undefined;
  /** Stripe keys — optional placeholders for EH-050/051; not required for build. */
  STRIPE_SECRET_KEY: string | undefined;
  STRIPE_WEBHOOK_SECRET: string | undefined;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string | undefined;
};

export type SiteEnv = SitePublicEnv & SiteServerEnv;

/** Env var names documented for creators (names only; no secrets). */
export const SITE_ENV_NAMES = {
  requiredForProduction: [] as const,
  optionalForPreviewBuild: [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SITE_NAME"
  ] as const,
  optionalIdentity: [
    "ESCAPE_HATCH_IDENTITY_PROVIDER",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "ESCAPE_HATCH_SESSION_SECRET"
  ] as const,
  optionalFutureAdapters: [
    "ESCAPE_HATCH_IDENTITY_PROVIDER",
    "DATABASE_URL",
    "ESCAPE_HATCH_SESSION_SECRET",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "R2_ENDPOINT",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_BASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  ] as const
} as const;

export class EnvValidationError extends Error {
  readonly code = "ESCAPE_HATCH_ENV_VALIDATION";
  readonly missing: string[];

  constructor(missing: string[], context?: string) {
    const where = context ? ` (${context})` : "";
    super(
      `Missing required environment variable(s)${where}: ${missing.join(", ")}. ` +
        "See .env.example for names only — never commit secrets."
    );
    this.name = "EnvValidationError";
    this.missing = missing;
  }
}

export class IdentityProviderError extends Error {
  readonly code = "ESCAPE_HATCH_IDENTITY_PROVIDER";

  constructor(message: string) {
    super(message);
    this.name = "IdentityProviderError";
  }
}

function readOptional(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Load the full typed env snapshot. Never throws — preview chassis may run
 * with all fields undefined.
 */
export function loadEnv(): SiteEnv {
  return {
    NEXT_PUBLIC_SITE_URL: readOptional("NEXT_PUBLIC_SITE_URL"),
    NEXT_PUBLIC_SITE_NAME: readOptional("NEXT_PUBLIC_SITE_NAME"),
    NEXT_PUBLIC_SUPABASE_URL: readOptional("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: readOptional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    ESCAPE_HATCH_IDENTITY_PROVIDER: readOptional(
      "ESCAPE_HATCH_IDENTITY_PROVIDER"
    ),
    DATABASE_URL: readOptional("DATABASE_URL"),
    ESCAPE_HATCH_SESSION_SECRET: readOptional("ESCAPE_HATCH_SESSION_SECRET"),
    SUPABASE_URL: readOptional("SUPABASE_URL"),
    SUPABASE_ANON_KEY: readOptional("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: readOptional("SUPABASE_SERVICE_ROLE_KEY"),
    R2_ENDPOINT: readOptional("R2_ENDPOINT"),
    R2_BUCKET: readOptional("R2_BUCKET"),
    R2_ACCESS_KEY_ID: readOptional("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: readOptional("R2_SECRET_ACCESS_KEY"),
    R2_PUBLIC_BASE_URL: readOptional("R2_PUBLIC_BASE_URL"),
    STRIPE_SECRET_KEY: readOptional("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: readOptional("STRIPE_WEBHOOK_SECRET"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: readOptional(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
    )
  };
}

/** Server secret-like keys reject placeholder values in `requireEnv`. */
export function isSecretLikeEnvKey(key: keyof SiteEnv): boolean {
  const name = String(key);
  if (name === "DATABASE_URL") return true;
  if (name === "ESCAPE_HATCH_SESSION_SECRET") return true;
  if (name === "ESCAPE_HATCH_IDENTITY_PROVIDER") return false;
  if (name === "SUPABASE_URL" || name === "NEXT_PUBLIC_SUPABASE_URL") return false;
  if (name.startsWith("NEXT_PUBLIC_")) {
    return /KEY|TOKEN|SECRET/i.test(name);
  }
  return /SECRET|KEY|TOKEN|PASSWORD/i.test(name);
}

/**
 * Fail-closed helper for runtime paths that need specific vars.
 * Do not call at module top-level for preview routes — build must succeed
 * without credentials. Secret-like keys treat placeholder values as missing.
 */
export function requireEnv(
  keys: readonly (keyof SiteEnv)[],
  context?: string
): Pick<SiteEnv, (typeof keys)[number]> {
  const env = loadEnv();
  const missing: string[] = [];
  const out = {} as Pick<SiteEnv, (typeof keys)[number]>;
  for (const key of keys) {
    const value = env[key];
    if (
      value === undefined ||
      (isSecretLikeEnvKey(key) && isPlaceholderSecret(value)) ||
      ((key === "SUPABASE_URL" || key === "NEXT_PUBLIC_SUPABASE_URL") &&
        isPlaceholderSupabaseUrl(value))
    ) {
      missing.push(key);
    } else {
      out[key] = value;
    }
  }
  if (missing.length > 0) {
    throw new EnvValidationError(missing, context);
  }
  return out;
}

/** Alias for server-only adapter entrypoints. */
export function requireServerEnv(
  keys: readonly (keyof SiteServerEnv)[],
  context?: string
): Pick<SiteEnv, (typeof keys)[number]> {
  return requireEnv(keys, context);
}

/** True when a value looks like an unfilled placeholder (fail closed in prod paths). */
export function isPlaceholderSecret(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const lower = value.toLowerCase().trim();
  if (lower.length === 0) return true;
  // Normalize separators so replace-me / replace_me / replace.me all match.
  const normalized = lower.replace(/[-.\s]+/g, "_");
  return (
    normalized.includes("changeme") ||
    normalized.includes("your_") ||
    normalized.includes("replace_me") ||
    normalized === "todo" ||
    normalized === "xxx" ||
    // Empty-looking: only quotes / punctuation / whitespace
    /^["'`._-]+$/.test(lower)
  );
}

/** True when a Supabase URL is missing or a documented placeholder. */
export function isPlaceholderSupabaseUrl(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const lower = value.toLowerCase().trim();
  if (lower.length === 0) return true;
  if (isPlaceholderSecret(value)) return true;
  return (
    lower.includes("your_project") ||
    lower.includes("your-project") ||
    lower.includes("example.supabase") ||
    lower === "https://your_project.supabase.co" ||
    lower === "https://your-project.supabase.co"
  );
}

/**
 * Resolve the effective Supabase project URL (public preferred, server alias fallback).
 */
export function resolveSupabaseUrl(env: SiteEnv = loadEnv()): string | undefined {
  const primary = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  if (!primary || isPlaceholderSupabaseUrl(primary)) return undefined;
  return primary;
}

/**
 * Resolve the effective anon/publishable key (public preferred, server alias fallback).
 */
export function resolveSupabaseAnonKey(
  env: SiteEnv = loadEnv()
): string | undefined {
  const primary = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  if (!primary || isPlaceholderSecret(primary)) return undefined;
  return primary;
}

/**
 * True when URL + anon key are present and non-placeholder.
 * Does not prove network reachability (CI-safe).
 */
export function isSupabaseIdentityConfigured(
  env: SiteEnv = loadEnv()
): boolean {
  return Boolean(resolveSupabaseUrl(env) && resolveSupabaseAnonKey(env));
}

/**
 * True when service role is present and non-placeholder (server-only paths).
 */
export function isSupabaseServiceRoleConfigured(
  env: SiteEnv = loadEnv()
): boolean {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(key && !isPlaceholderSecret(key));
}

/**
 * True when Path B portable env is present (DATABASE_URL + session secret).
 * Does not prove network reachability (CI-safe).
 */
export function isPortableIdentityConfigured(
  env: SiteEnv = loadEnv()
): boolean {
  return Boolean(
    env.DATABASE_URL &&
      !isPlaceholderSecret(env.DATABASE_URL) &&
      env.ESCAPE_HATCH_SESSION_SECRET &&
      !isPlaceholderSecret(env.ESCAPE_HATCH_SESSION_SECRET)
  );
}

/**
 * Resolve identity provider mode.
 * - Explicit `none` | `supabase` | `portable` when set.
 * - Unset: EH-030 compat — supabase when Supabase env configured, else none.
 *   Portable requires an explicit `portable` provider (never auto-selected).
 * - Unknown strings throw IdentityProviderError (fail closed).
 */
export function resolveIdentityProvider(
  env: SiteEnv = loadEnv()
): IdentityProviderMode {
  const raw = env.ESCAPE_HATCH_IDENTITY_PROVIDER;
  if (raw === undefined) {
    if (isSupabaseIdentityConfigured(env)) return "supabase";
    return "none";
  }
  const normalized = raw.toLowerCase();
  if (normalized === "none" || normalized === "unset") return "none";
  if (normalized === "supabase") return "supabase";
  if (normalized === "portable") return "portable";
  throw new IdentityProviderError(
    `Unknown ESCAPE_HATCH_IDENTITY_PROVIDER "${raw}". Use none, supabase, or portable.`
  );
}

/**
 * Safe resolve for request paths — unknown provider fails closed to none
 * with configured=false semantics (callers should treat as local_preview).
 * Prefer resolveIdentityProvider when you need the throw.
 */
export function resolveIdentityProviderSafe(
  env: SiteEnv = loadEnv()
): IdentityProviderMode | "invalid" {
  try {
    return resolveIdentityProvider(env);
  } catch {
    return "invalid";
  }
}

/** True when an authoritative identity path is active (not local_preview). */
export function isIdentityPathConfigured(env: SiteEnv = loadEnv()): boolean {
  const mode = resolveIdentityProviderSafe(env);
  if (mode === "invalid" || mode === "none") return false;
  if (mode === "supabase") return isSupabaseIdentityConfigured(env);
  if (mode === "portable") return isPortableIdentityConfigured(env);
  return false;
}
