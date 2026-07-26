import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("PMD-041 platform telemetry migration", () => {
  it("migration SQL defines platform_telemetry_events with RLS", () => {
    const sqlPath = join(
      repoRoot,
      "prisma",
      "migrations",
      "20260524160000_platform_telemetry_events",
      "migration.sql"
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain('CREATE TABLE "platform_telemetry_events"');
    expect(sql).toContain("platform_telemetry_events_event_name_occurred_at_idx");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("Prisma schema validates", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  }, 60_000);
});
