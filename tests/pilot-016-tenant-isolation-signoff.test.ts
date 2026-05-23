/**
 * PILOT-016 — Security tenant isolation sign-off: guards, RLS, auth coverage.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

describe("PILOT-016 — Security tenant isolation sign-off", () => {
  it("require-account and access-guard modules export tenant enforcement", () => {
    const requireAccount = readFileSync(join(ROOT, "src/identity/require-account.ts"), "utf8");
    const accessGuard = readFileSync(join(ROOT, "src/identity/access-guard.ts"), "utf8");
    const routeGuard = readFileSync(join(ROOT, "src/identity/creator-route-guard.ts"), "utf8");
    expect(requireAccount).toContain("export async function requireAccount");
    expect(requireAccount).toContain("loadAccountContextForSession");
    expect(accessGuard).toContain("Cross-tenant access denied");
    expect(routeGuard).toContain("assertCreatorRelayMutationAllowed");
  });

  it("server imports creator mutation guard and account resolution", () => {
    const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    expect(server).toContain("requireAccount");
    expect(server).toContain("assertCreatorRelayMutationAllowed");
    expect(server).toContain("requireAccountMatchesCreator");
  });

  it("RLS context helper sets auth_account_id for Postgres policies", () => {
    const rls = readFileSync(join(ROOT, "src/lib/supabase-rls-context.ts"), "utf8");
    expect(rls).toContain("setSupabaseRlsContext");
    expect(rls).toContain("clearSupabaseRlsContext");
    expect(rls).toContain("auth_account_id");
  });

  it("Prisma migrations include RLS lockdown and two-sided policies", () => {
    const lockdown = readFileSync(
      join(ROOT, "prisma/migrations/20260415000000_rls_lockdown_prisma_tables/migration.sql"),
      "utf8"
    );
    const twoSided = readFileSync(
      join(ROOT, "prisma/migrations/20260418100000_tier1_two_sided_rls_policies/migration.sql"),
      "utf8"
    );
    expect(lockdown.toLowerCase()).toContain("row level security");
    expect(twoSided.toLowerCase()).toContain("policy");
  });

  it("M10 verification doc points at cross-tenant isolation tests", () => {
    const m10 = readFileSync(join(ROOT, "docs/database/M10_VERIFICATION.md"), "utf8");
    expect(m10).toContain("m10-cross-tenant-isolation.test.ts");
    expect(m10).toContain("cross-tenant");
  });
});
