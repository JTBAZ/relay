import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const migrationDir = "20260717190000_coach_plan_credits";

describe("VS2-T01 coach plan credits migration", () => {
  it("migration SQL defines ledger, reservation, wallet, checks, and RLS", () => {
    const sqlPath = join(repoRoot, "prisma", "migrations", migrationDir, "migration.sql");
    const sql = readFileSync(sqlPath, "utf8");

    expect(sql).toContain('CREATE TYPE "CoachPlanCreditEntryKind"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "coach_plan_credit_ledger"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "coach_plan_credit_reservations"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "coach_plan_credit_wallets"');

    expect(sql).toContain("coach_plan_credit_ledger_amount_nonzero_check");
    expect(sql).toContain("coach_plan_credit_reservations_amount_one_check");
    expect(sql).toContain("coach_plan_credit_ledger_creator_id_idempotency_key_key");
    expect(sql).toContain("coach_plan_credit_reservations_cycle_id_key");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toMatch(/No hardcoded allowance/i);
    expect(sql).toMatch(/No backfill/i);

    expect(sql).toMatch(/ALTER TABLE public\.coach_plan_credit_ledger ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.coach_plan_credit_reservations ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.coach_plan_credit_wallets ENABLE ROW LEVEL SECURITY/i);
  });

  it("Prisma schema validates with Coach Plan credit models", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  }, 60_000);
});
