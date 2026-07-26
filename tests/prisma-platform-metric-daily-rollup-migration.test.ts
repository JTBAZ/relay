import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("PMD-050 platform metric daily rollup migration", () => {
  it("migration SQL defines rollup table with unique grain and RLS", () => {
    const sqlPath = join(
      repoRoot,
      "prisma",
      "migrations",
      "20260525120000_platform_metric_daily_rollups",
      "migration.sql"
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain('CREATE TABLE "platform_metric_daily_rollups"');
    expect(sql).toContain("metric_key");
    expect(sql).toContain("day_utc");
    expect(sql).toContain("scope_id");
    expect(sql).toContain("source_freshness");
    expect(sql).toContain("generated_at");
    expect(sql).toContain("platform_metric_daily_rollups_metric_key_day_utc_scope_scope_id_key");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("Prisma schema validates", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  }, 60_000);
});
