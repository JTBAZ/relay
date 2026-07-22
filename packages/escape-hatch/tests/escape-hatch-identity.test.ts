/**
 * EH-030 Supabase identity/data path: SQL/RLS review, env honesty,
 * adapter readiness (no live network), entitlement fail-closed,
 * soft persona never authorizes, productionSafe false.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  effectiveTierIds,
  parseEntitlementSnapshot,
  rejectClientPersonaTiers
} from "../template/lib/identity/entitlements.js";
import {
  isPlaceholderSecret,
  isPlaceholderSupabaseUrl,
  isSupabaseIdentityConfigured,
  isSupabaseServiceRoleConfigured,
  loadEnv,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl
} from "../template/lib/env.js";
import {
  createSiteAdapters,
  createStubAdapters
} from "../template/lib/adapters/index.js";

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

function setRealLookingIdentityEnv(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://eh-test-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    "eh_ci_anon_key_not_a_secret_aaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eh_ci_service_role_not_a_secret_bbbbbbbbbbbbbbbbbbbb";
}

describe("EH-030 status (preserved under EH-032)", () => {
  it("keeps EH-030 supabase capability evidence under EH-032 with next EH-033", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-032");
    expect(status.slice).toBe("EH-032");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-033");
    expect(status.nextSlice.title).toMatch(/Private media/i);
    expect(status.blockers.some((b) => /EH-033/i.test(b))).toBe(true);
    expect(status.blockers.some((b) => /No hard patron identity/i.test(b))).toBe(
      false
    );

    const identity = status.capabilities.find(
      (c) => c.id === "generated-site-identity"
    );
    expect(identity?.state).toBe("preview_only");
    expect(identity?.evidence).toMatch(/RLS|Supabase|portable/i);
    expect(identity?.evidence).toMatch(/productionSafe remains false/i);
    expect(identity?.nextSlice).toBe("EH-033");
    expect(identity?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/db/migrations/0002_identity_rls.sql",
        "packages/escape-hatch/tests/escape-hatch-identity.test.ts"
      ])
    );
  });
});

describe("EH-030 SQL migrations and RLS review", () => {
  it("ships identity schema and migration files", () => {
    const files = [
      "db/migrations/0001_preview_chassis.sql",
      "db/migrations/0002_identity_rls.sql",
      "db/schema/0001_preview_chassis.sql",
      "db/schema/0002_identity_rls.sql",
      "db/README.md",
      "scripts/bootstrap-identity.md"
    ];
    for (const rel of files) {
      expect(existsSync(join(TEMPLATE, rel))).toBe(true);
    }
  });

  it("defines membership, entitlement, and fail-closed RLS structures", () => {
    const sql = readFileSync(
      join(TEMPLATE, "db/migrations/0002_identity_rls.sql"),
      "utf8"
    );

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_profiles/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_site_memberships/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS eh_entitlement_snapshots/);
    expect(sql).toMatch(/REFERENCES auth\.users\(id\)/);
    expect(sql).toMatch(/role\s+TEXT NOT NULL CHECK[\s\S]*admin[\s\S]*operator[\s\S]*patron/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/eh_private\.is_site_staff/);
    expect(sql).toMatch(/eh_entitlement_snapshots_select_own/);
    expect(sql).toMatch(/auth_user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/0002_identity_rls/);
    // Patrons must not get blanket SELECT on all entitlements
    expect(sql).not.toMatch(
      /CREATE POLICY eh_entitlement_snapshots_select_all[\s\S]*USING\s*\(\s*true\s*\)/i
    );
  });

  it("fail-closes member SELECT on posts/media (no blanket membership premium access)", () => {
    const sql = readFileSync(
      join(TEMPLATE, "db/migrations/0002_identity_rls.sql"),
      "utf8"
    );
    const schema = readFileSync(
      join(TEMPLATE, "db/schema/0002_identity_rls.sql"),
      "utf8"
    );
    const readme = readFileSync(join(TEMPLATE, "db/README.md"), "utf8");

    // Member policies must not solely grant membership-wide SELECT
    expect(sql).not.toMatch(
      /CREATE POLICY eh_posts_select_member[\s\S]*?USING\s*\(\s*eh_private\.is_site_member\(site_id\)\s*\)\s*;/s
    );
    expect(sql).not.toMatch(
      /CREATE POLICY eh_media_objects_select_member[\s\S]*?USING\s*\(\s*eh_private\.is_site_member\(site_id\)\s*\)\s*;/s
    );

    // Fail-closed: public published only, or staff
    expect(sql).toMatch(
      /CREATE POLICY eh_posts_select_member[\s\S]*?is_site_staff\(site_id\)[\s\S]*?access_level = 'public'[\s\S]*?published_at IS NOT NULL/s
    );
    expect(sql).toMatch(
      /CREATE POLICY eh_posts_select_public[\s\S]*?access_level = 'public'[\s\S]*?published_at IS NOT NULL/s
    );
    expect(sql).toMatch(
      /CREATE POLICY eh_media_objects_select_member[\s\S]*?is_site_staff\(site_id\)[\s\S]*?access_level = 'public'/s
    );

    // Staff keep full access
    expect(sql).toMatch(/CREATE POLICY eh_posts_staff_all/);
    expect(sql).toMatch(/CREATE POLICY eh_media_objects_staff_all/);

    // Schema mirror + README honesty (EH-032 entitled SELECT via 0004)
    expect(schema).toMatch(/access_level = 'public' AND published_at IS NOT NULL/);
    expect(schema).toMatch(/never blanket is_site_member on premium rows/i);
    expect(readme).toMatch(/EH-032|entitled|fresh_entitlement/i);
    expect(readme).toMatch(/membership alone never grants blanket SELECT|Stale \/ expired \/ revoked/i);
    expect(readme).toMatch(/published_at IS NOT NULL/);
  });
  it("documents bootstrap without live secrets", () => {
    const bootstrap = readFileSync(
      join(TEMPLATE, "scripts/bootstrap-identity.md"),
      "utf8"
    );
    expect(bootstrap).toMatch(/NEVER commit|never commit/i);
    expect(bootstrap).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(bootstrap).toMatch(/eh_site_memberships/);
    expect(bootstrap).not.toMatch(/eyJhbGciOi/);
    expect(bootstrap).not.toMatch(/sk_live_/);
  });
});

describe("EH-030 env honesty", () => {
  afterEach(() => {
    clearIdentityEnv();
  });

  it("treats unset and placeholder env as not configured", () => {
    clearIdentityEnv();
    expect(isSupabaseIdentityConfigured(loadEnv())).toBe(false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "replace_me";
    expect(isPlaceholderSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)).toBe(
      true
    );
    expect(isPlaceholderSecret(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)).toBe(
      true
    );
    expect(isSupabaseIdentityConfigured(loadEnv())).toBe(false);
  });

  it("detects real-looking non-placeholder env (CI fake values)", () => {
    clearIdentityEnv();
    setRealLookingIdentityEnv();
    const env = loadEnv();
    expect(resolveSupabaseUrl(env)).toBe(
      "https://eh-test-project.supabase.co"
    );
    expect(resolveSupabaseAnonKey(env)?.startsWith("eh_ci_anon")).toBe(true);
    expect(isSupabaseIdentityConfigured(env)).toBe(true);
    expect(isSupabaseServiceRoleConfigured(env)).toBe(true);
  });

  it("documents public and server env names in .env.example without secrets", () => {
    const example = readFileSync(join(TEMPLATE, ".env.example"), "utf8");
    expect(example).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(example).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(example).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(example).toMatch(/NEVER commit real secrets/i);
    expect(example).not.toMatch(/eyJhbGci/);
    expect(example).not.toMatch(/sk_live_/);
  });
});

describe("EH-030 adapter health", () => {
  afterEach(() => {
    clearIdentityEnv();
  });

  it("reports degraded Auth/DB when identity env is unset", async () => {
    clearIdentityEnv();
    const adapters = createSiteAdapters();
    expect(adapters.auth.implementation).toBe("stub");
    expect(adapters.database.implementation).toBe("stub");
    const auth = await adapters.auth.health();
    const db = await adapters.database.health();
    expect(auth.ok).toBe(false);
    expect(db.ok).toBe(false);
    expect(await adapters.auth.getSession()).toBeNull();
  });

  it("reports Auth/DB ready only with real non-placeholder env and labels preview", async () => {
    clearIdentityEnv();
    setRealLookingIdentityEnv();
    const adapters = createSiteAdapters();
    expect(adapters.auth.implementation).toBe("supabase");
    expect(adapters.database.implementation).toBe("supabase");
    const auth = await adapters.auth.health();
    const db = await adapters.database.health();
    expect(auth.ok).toBe(true);
    expect(db.ok).toBe(true);
    if (auth.ok) {
      expect(auth.detail).toMatch(/EH-033|preview|not production-safe/i);
    }
    if (db.ok) {
      expect(db.detail).toMatch(/EH-033|preview|not production-safe/i);
    }
    // Storage remains stub until EH-033
    const storage = await adapters.storage.health();
    expect(storage.ok).toBe(false);
  });

  it("keeps createStubAdapters always degraded", async () => {
    setRealLookingIdentityEnv();
    const stubs = createStubAdapters();
    expect((await stubs.auth.health()).ok).toBe(false);
    expect((await stubs.database.health()).ok).toBe(false);
  });
});

describe("EH-030 entitlement fail-closed", () => {
  it("rejects invalid snapshots and client persona tiers", () => {
    expect(parseEntitlementSnapshot(null).ok).toBe(false);
    expect(parseEntitlementSnapshot({}).ok).toBe(false);
    expect(rejectClientPersonaTiers(["tier_gold", "tier_platinum"])).toEqual(
      []
    );

    const stale = parseEntitlementSnapshot({
      site_id: "site_1",
      auth_user_id: "user_1",
      tier_ids: ["t_gold"],
      source: "manual",
      observed_at: "2020-01-01T00:00:00.000Z",
      stale_after: "2020-01-02T00:00:00.000Z"
    });
    expect(stale.ok).toBe(true);
    if (stale.ok) {
      expect(stale.stale).toBe(true);
      expect(effectiveTierIds(stale)).toEqual([]);
    }

    const fresh = parseEntitlementSnapshot({
      site_id: "site_1",
      auth_user_id: "user_1",
      tier_ids: ["t_gold"],
      source: "patreon",
      observed_at: "2099-01-01T00:00:00.000Z",
      stale_after: "2099-12-31T00:00:00.000Z"
    });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      expect(effectiveTierIds(fresh)).toEqual(["t_gold"]);
    }
  });
});

describe("EH-030 auth routes and package honesty", () => {
  it("ships login/callback/logout with POST-only logout", () => {
    const logout = readFileSync(
      join(TEMPLATE, "app/auth/logout/route.ts"),
      "utf8"
    );
    expect(logout).toMatch(/export async function POST/);
    expect(logout).toMatch(/export async function GET/);
    expect(logout).toMatch(/405/);
    expect(logout).toMatch(/Allow:\s*"POST"/);

    expect(existsSync(join(TEMPLATE, "app/login/page.tsx"))).toBe(true);
    expect(existsSync(join(TEMPLATE, "app/auth/callback/route.ts"))).toBe(true);

    const packageJson = JSON.parse(
      readFileSync(join(TEMPLATE, "package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies["@supabase/supabase-js"]).toBeTruthy();
    expect(packageJson.dependencies["@supabase/ssr"]).toBeTruthy();
    expect(packageJson.dependencies.next).toBe("15.5.21");
  });

  it("admin attention requires identity-aware gate (not soft persona)", () => {
    const route = readFileSync(
      join(TEMPLATE, "app/api/admin/attention/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/assertAdminMutationAccess/);
    expect(route).toMatch(/Soft persona/);
    expect(route).toMatch(/never authorize/i);
  });

  it("admin pages require staff session for inventory when identity configured", () => {
    const pages = [
      "app/admin/page.tsx",
      "app/admin/posts/page.tsx",
      "app/admin/media/page.tsx",
      "app/admin/tiers/page.tsx"
    ];
    for (const rel of pages) {
      const src = readFileSync(join(TEMPLATE, rel), "utf8");
      expect(src).toMatch(/redirectIfAdminSignInRequired/);
      expect(src).toMatch(/AdminAccessDenied|read_allowed/);
      expect(src).toMatch(/loadAdmin/);
    }

    const gate = readFileSync(
      join(TEMPLATE, "lib/identity/admin-access.ts"),
      "utf8"
    );
    expect(gate).toMatch(/export async function assertAdminReadAccess/);
    expect(gate).toMatch(/soft persona never unlocks admin reads/i);
    expect(gate).not.toMatch(/personaTier|softPersona|demoPersona/i);

    const loaders = readFileSync(
      join(TEMPLATE, "lib/admin/load-admin.ts"),
      "utf8"
    );
    expect(loaders).toMatch(/assertAdminReadAccess/);
    expect(loaders).toMatch(/read_allowed:\s*false/);
  });
});

describe("EH-030 admin read gate behavior", () => {
  afterEach(() => {
    clearIdentityEnv();
  });

  it("allows local_preview admin reads when identity env is unset", async () => {
    clearIdentityEnv();
    const { assertAdminReadAccess } = await import(
      "../template/lib/identity/admin-access.js"
    );
    const access = await assertAdminReadAccess("site_test");
    expect(access.allowed).toBe(true);
    expect(access.identity.mode).toBe("local_preview");
  });

  it("denies admin reads without staff session when Supabase is configured", async () => {
    clearIdentityEnv();
    setRealLookingIdentityEnv();
    const { assertAdminReadAccess } = await import(
      "../template/lib/identity/admin-access.js"
    );
    const access = await assertAdminReadAccess("site_test");
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toBe("sign_in_required");
      expect(access.identity.mode).toBe("supabase");
      expect(access.identity.isStaff).toBe(false);
    }
  });

  it("withholds inventory from admin loaders when identity is configured without session", async () => {
    const { fillTemplate } = await import("../src/fill-template.js");
    const { pathToFileURL } = await import("node:url");
    const sampleBundle = join(PACKAGE_ROOT, "fixtures", "sample.bundle.json");
    const mediaDir = join(PACKAGE_ROOT, "fixtures", "media");
    const result = fillTemplate({
      bundle: JSON.parse(readFileSync(sampleBundle, "utf8")),
      slug: `eh-030-admin-gate-${Date.now()}`,
      mediaSourceDir: mediaDir,
      clean: true
    });

    const prevCwd = process.cwd();
    try {
      process.chdir(result.outDir);

      clearIdentityEnv();
      const loadAdminUrl = pathToFileURL(
        join(result.outDir, "lib/admin/load-admin.ts")
      ).href;
      const {
        loadAdminPosts,
        loadAdminMedia,
        loadAdminTiers,
        loadAdminOverview
      } = await import(loadAdminUrl);

      const localPosts = await loadAdminPosts();
      expect(localPosts.read_allowed).toBe(true);
      expect(localPosts.posts.length).toBeGreaterThan(0);

      setRealLookingIdentityEnv();
      const deniedPosts = await loadAdminPosts();
      expect(deniedPosts.read_allowed).toBe(false);
      expect(deniedPosts.deny_reason).toBe("sign_in_required");
      expect(deniedPosts.posts).toEqual([]);

      const deniedMedia = await loadAdminMedia();
      expect(deniedMedia.read_allowed).toBe(false);
      expect(deniedMedia.rows).toEqual([]);

      const deniedTiers = await loadAdminTiers();
      expect(deniedTiers.read_allowed).toBe(false);
      expect(deniedTiers.tiers).toEqual([]);

      const deniedOverview = await loadAdminOverview();
      expect(deniedOverview.read_allowed).toBe(false);
      expect(deniedOverview.post_count).toBe(0);
      expect(deniedOverview.media_count).toBe(0);
      expect(deniedOverview.tier_count).toBe(0);
      expect(deniedOverview.adapters).toEqual([]);
      expect(deniedOverview.creator_display_name).toBe("");
    } finally {
      process.chdir(prevCwd);
      clearIdentityEnv();
      rmSync(result.outDir, { recursive: true, force: true });
    }
  });
});
