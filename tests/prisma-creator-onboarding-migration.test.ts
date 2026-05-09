import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("P4-onb-001 creator onboarding migration", () => {
  it("migration SQL defines enum, table, and backfill", () => {
    const sqlPath = join(
      repoRoot,
      "prisma",
      "migrations",
      "20260508180000_creator_onboarding_state",
      "migration.sql"
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain('CREATE TYPE "CreatorOnboardingStep"');
    expect(sql).toContain("'connected'");
    expect(sql).toContain("'import_started'");
    expect(sql).toContain("'organized'");
    expect(sql).toContain("'published'");
    expect(sql).toContain('CREATE TABLE "creator_onboarding_states"');
    expect(sql).toContain("relay_creator_id");
    expect(sql).toMatch(/campaigns/i);
  });

  it("Prisma schema validates (npm run build prerequisite)", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  });
});
