/**
 * EH-031 Portable identity/data path: SQL/RLS without auth.users,
 * provider mode matrix, scrypt/session helpers, adapter honesty,
 * admin gate parity — no live DB required. productionSafe false.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  IdentityProviderError,
  isPortableIdentityConfigured,
  isSupabaseIdentityConfigured,
  loadEnv,
  resolveIdentityProvider,
  resolveIdentityProviderSafe
} from "../template/lib/env.js";
import {
  createSiteAdapters,
  createStubAdapters
} from "../template/lib/adapters/index.js";
import {
  hashPassword,
  hashSessionToken,
  mintSessionToken,
  PORTABLE_SESSION_COOKIE,
  portableSessionCookieOptions,
  verifyPassword
} from "../template/lib/portable-auth/crypto.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");

const IDENTITY_ENV_KEYS = [
  "ESCAPE_HATCH_IDENTITY_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "ESCAPE_HATCH_SESSION_SECRET"
] as const;

function clearIdentityEnv(): void {
  for (const key of IDENTITY_ENV_KEYS) {
    delete process.env[key];
  }
}

function setPortableEnv(): void {
  process.env.ESCAPE_HATCH_IDENTITY_PROVIDER = "portable";
  process.env.DATABASE_URL =
    "postgresql://escape_hatch:escape_hatch_dev_only@127.0.0.1:5433/escape_hatch";
  process.env.ESCAPE_HATCH_SESSION_SECRET =
    "eh_ci_session_secret_not_a_real_secret_cccccccccccccccc";
}

function setSupabaseEnv(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://eh-test-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    "eh_ci_anon_key_not_a_secret_aaaaaaaaaaaaaaaaaaaaaaaa";
}

describe("EH-031 status (preserved under EH-032)", () => {
  it("keeps portable identity evidence under EH-032 with next EH-034", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-062");
    expect(status.slice).toBe("EH-062");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-063");
    expect(status.nextSlice.title).toMatch(/patreon|sync/i);
    expect(status.blockers.some((b) => /EH-031/i.test(b))).toBe(false);
    expect(status.blockers.some((b) => /EH-034|Milestone 3|paywall UX/i.test(b))).toBe(true);

    const identity = status.capabilities.find(
      (c) => c.id === "generated-site-identity"
    );
    expect(identity?.state).toBe("preview_only");
    expect(identity?.evidence).toMatch(/portable|Path B/i);
    expect(identity?.evidence).toMatch(/productionSafe remains false/i);
    expect(identity?.nextSlice).toBe("EH-063");
    expect(identity?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/db/migrations/0003_portable_identity.sql",
        "packages/escape-hatch/tests/escape-hatch-portable-identity.test.ts"
      ])
    );
  });
});

describe("EH-031 portable SQL and RLS review", () => {
  it("ships portable migration, schema, and docker-init without auth.users", () => {
    const files = [
      "db/migrations/0003_portable_identity.sql",
      "db/schema/0003_portable_identity.sql",
      "db/docker-init/01_preview_chassis.sql",
      "db/docker-init/02_portable_identity.sql",
      "lib/portable-auth/crypto.ts",
      "lib/portable-auth/session.ts",
      "app/auth/portable/login/route.ts",
      "components/PortableLoginForm.tsx"
    ];
    for (const rel of files) {
      expect(existsSync(join(TEMPLATE, rel))).toBe(true);
    }
  });

  it("defines app-managed users/sessions and eh.user_id RLS (no auth.uid)", () => {
    const sql = readFileSync(
      join(TEMPLATE, "db/migrations/0003_portable_identity.sql"),
      "utf8"
    );

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_users/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_sessions/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_site_memberships/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_entitlement_snapshots/);
    expect(sql).toMatch(/REFERENCES eh_users\(id\)/);
    expect(sql).not.toMatch(/REFERENCES auth\.users/);
    expect(sql).not.toMatch(/=\s*auth\.uid\(\)|auth\.uid\(\)\s*=/);
    expect(sql).toMatch(/current_setting\('eh\.user_id'/);
    expect(sql).toMatch(/eh_private\.current_user_id/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/eh_private\.is_site_staff/);
    expect(sql).toMatch(/0003_portable_identity/);

    // Fail-closed posts/media (same honesty as EH-030)
    expect(sql).toMatch(
      /CREATE POLICY eh_posts_select_member[\s\S]*?is_site_staff\(site_id\)[\s\S]*?access_level = 'public'[\s\S]*?published_at IS NOT NULL/s
    );
    expect(sql).toMatch(
      /CREATE POLICY eh_media_objects_select_member[\s\S]*?is_site_staff\(site_id\)[\s\S]*?access_level = 'public'/s
    );
    expect(sql).not.toMatch(
      /CREATE POLICY eh_posts_select_member[\s\S]*?USING\s*\(\s*eh_private\.is_site_member\(site_id\)\s*\)\s*;/s
    );
  });

  it("keeps Path A 0002 intact with auth.users", () => {
    const sql = readFileSync(
      join(TEMPLATE, "db/migrations/0002_identity_rls.sql"),
      "utf8"
    );
    expect(sql).toMatch(/REFERENCES auth\.users\(id\)/);
    expect(sql).toMatch(/auth\.uid\(\)/);
  });

  it("documents Path A vs Path B without secrets", () => {
    const ops = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    const bootstrap = readFileSync(
      join(TEMPLATE, "scripts/bootstrap-identity.md"),
      "utf8"
    );
    const readme = readFileSync(join(TEMPLATE, "db/README.md"), "utf8");
    const compose = readFileSync(join(TEMPLATE, "docker-compose.yml"), "utf8");

    expect(ops).toMatch(/Path A/i);
    expect(ops).toMatch(/Path B/i);
    expect(ops).toMatch(/ESCAPE_HATCH_IDENTITY_PROVIDER/);
    expect(ops).toMatch(/127\.0\.0\.1:5433/);
    expect(bootstrap).toMatch(/0003_portable_identity/);
    expect(bootstrap).toMatch(/scrypt/i);
    expect(bootstrap).not.toMatch(/eyJhbGciOi/);
    expect(readme).toMatch(/\*\*Do not\*\* mix|Do not mix/i);
    expect(compose).toMatch(/127\.0\.0\.1:5433/);
    expect(compose).toMatch(/docker-init/);
  });
});

describe("EH-031 provider mode matrix", () => {
  afterEach(() => {
    clearIdentityEnv();
  });

  it("resolves none/unset, supabase auto-detect, portable explicit, unknown fail-closed", () => {
    clearIdentityEnv();
    expect(resolveIdentityProvider(loadEnv())).toBe("none");

    setSupabaseEnv();
    expect(resolveIdentityProvider(loadEnv())).toBe("supabase");
    expect(isSupabaseIdentityConfigured(loadEnv())).toBe(true);

    clearIdentityEnv();
    process.env.ESCAPE_HATCH_IDENTITY_PROVIDER = "none";
    setSupabaseEnv();
    expect(resolveIdentityProvider(loadEnv())).toBe("none");

    clearIdentityEnv();
    setPortableEnv();
    expect(resolveIdentityProvider(loadEnv())).toBe("portable");
    expect(isPortableIdentityConfigured(loadEnv())).toBe(true);

    clearIdentityEnv();
    process.env.DATABASE_URL =
      "postgresql://escape_hatch:escape_hatch_dev_only@127.0.0.1:5433/escape_hatch";
    process.env.ESCAPE_HATCH_SESSION_SECRET =
      "eh_ci_session_secret_not_a_real_secret_cccccccccccccccc";
    // Portable never auto-selected without explicit provider
    expect(resolveIdentityProvider(loadEnv())).toBe("none");

    clearIdentityEnv();
    process.env.ESCAPE_HATCH_IDENTITY_PROVIDER = "magic";
    expect(() => resolveIdentityProvider(loadEnv())).toThrow(
      IdentityProviderError
    );
    expect(resolveIdentityProviderSafe(loadEnv())).toBe("invalid");
  });
});

describe("EH-031 portable crypto helpers", () => {
  it("hashes and verifies passwords with scrypt; never stores plaintext", () => {
    const hash = hashPassword("correct-horse-battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("correct-horse-battery");
    expect(verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(verifyPassword("wrong-password-here", hash)).toBe(false);
  });

  it("mints opaque session tokens and hashes with pepper", () => {
    const token = mintSessionToken();
    expect(token.length).toBeGreaterThan(20);
    const a = hashSessionToken(token, "pepper-one");
    const b = hashSessionToken(token, "pepper-two");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(PORTABLE_SESSION_COOKIE).toBe("eh_portable_session");
    const opts = portableSessionCookieOptions({ secure: true });
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe("lax");
  });
});

describe("EH-031 portable adapter health", () => {
  afterEach(() => {
    clearIdentityEnv();
  });

  it("reports portable Auth/DB ready only with real env and labels preview", async () => {
    clearIdentityEnv();
    setPortableEnv();
    const adapters = createSiteAdapters();
    expect(adapters.auth.implementation).toBe("portable");
    expect(adapters.database.implementation).toBe("postgres");
    const auth = await adapters.auth.health();
    const db = await adapters.database.health();
    expect(auth.ok).toBe(true);
    expect(db.ok).toBe(true);
    if (auth.ok) {
      expect(auth.detail).toMatch(/preview|productionSafe|Milestone|Path B/i);
    }
    if (db.ok) {
      expect(db.detail).toMatch(/0003|Path B|preview|productionSafe|Milestone/i);
    }
  });

  it("preserves Supabase adapters when Path A env is set without portable", async () => {
    clearIdentityEnv();
    setSupabaseEnv();
    const adapters = createSiteAdapters();
    expect(adapters.auth.implementation).toBe("supabase");
    expect(adapters.database.implementation).toBe("supabase");
    expect((await adapters.auth.health()).ok).toBe(true);
  });

  it("keeps createStubAdapters always degraded", async () => {
    setPortableEnv();
    const stubs = createStubAdapters();
    expect((await stubs.auth.health()).ok).toBe(false);
    expect((await stubs.database.health()).ok).toBe(false);
  });
});

describe("EH-031 admin gate for portable provider", () => {
  afterEach(() => {
    clearIdentityEnv();
  });

  it("denies admin reads without staff session when portable is configured", async () => {
    clearIdentityEnv();
    setPortableEnv();
    const { assertAdminReadAccess } = await import(
      "../template/lib/identity/admin-access.js"
    );
    const access = await assertAdminReadAccess("site_test");
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toBe("sign_in_required");
      expect(access.identity.mode).toBe("portable");
      expect(access.identity.isStaff).toBe(false);
    }
  });

  it("denies admin when provider string is invalid", async () => {
    clearIdentityEnv();
    process.env.ESCAPE_HATCH_IDENTITY_PROVIDER = "nope";
    const { assertAdminReadAccess } = await import(
      "../template/lib/identity/admin-access.js"
    );
    const access = await assertAdminReadAccess("site_test");
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toBe("provider_invalid");
      expect(access.identity.mode).toBe("invalid");
    }
  });
});

describe("EH-031 auth route honesty", () => {
  it("ships portable login POST-only and logout clears portable", () => {
    const login = readFileSync(
      join(TEMPLATE, "app/auth/portable/login/route.ts"),
      "utf8"
    );
    expect(login).toMatch(/export async function POST/);
    expect(login).toMatch(/export async function GET/);
    expect(login).toMatch(/405/);

    const logout = readFileSync(
      join(TEMPLATE, "app/auth/logout/route.ts"),
      "utf8"
    );
    expect(logout).toMatch(/portableLogout/);
    expect(logout).toMatch(/export async function POST/);

    const pkg = JSON.parse(
      readFileSync(join(TEMPLATE, "package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.pg).toBeTruthy();
    expect(pkg.dependencies["@supabase/supabase-js"]).toBeTruthy();
  });

  it("wraps portable DB work in BEGIN so SET LOCAL eh.user_id sticks", () => {
    const db = readFileSync(
      join(TEMPLATE, "lib/portable-auth/db.ts"),
      "utf8"
    );
    expect(db).toMatch(/query\("BEGIN"\)/);
    expect(db).toMatch(/set_config\('eh\.user_id'/);
    expect(db).toMatch(/is_local|SET LOCAL/i);
    expect(db).toMatch(/COMMIT/);
    expect(db).toMatch(/ROLLBACK/);
  });
});
