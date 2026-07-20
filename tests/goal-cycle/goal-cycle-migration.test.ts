import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const migrationDir = "20260717180000_creator_goal_cycles";

describe("VS1-T01 creator goal cycles migration", () => {
  it("migration SQL defines cycle tables, active uniqueness, cascades, and RLS", () => {
    const sqlPath = join(repoRoot, "prisma", "migrations", migrationDir, "migration.sql");
    const sql = readFileSync(sqlPath, "utf8");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "creator_goal_cycles"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "creator_goal_cycle_checkpoints"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "creator_goal_cycle_revisions"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "creator_goal_cycle_slots"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "creator_goal_cycle_progress"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "creator_goal_cycle_outcomes"');

    expect(sql).toContain("creator_goal_cycles_creator_id_active_scope_key");
    expect(sql).toContain("creator_goal_cycles_creator_id_start_idempotency_key_key");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toMatch(/No backfill/i);
    expect(sql).not.toMatch(/INSERT INTO.*posting.?goal/i);

    expect(sql).toMatch(/ALTER TABLE public\.creator_goal_cycles ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.creator_goal_cycle_outcomes ENABLE ROW LEVEL SECURITY/i);
  });

  it("Prisma schema validates with Goal Cycle models", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  }, 60_000);
});
