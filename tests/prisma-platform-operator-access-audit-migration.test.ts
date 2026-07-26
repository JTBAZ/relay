import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("PMD-071 platform operator access audit migration", () => {
  it("migration SQL defines audit table with RLS", () => {
    const sql = readFileSync(
      join(
        repoRoot,
        "prisma/migrations/20260525180000_platform_operator_access_audits/migration.sql"
      ),
      "utf8"
    );
    expect(sql).toContain('CREATE TABLE "platform_operator_access_audits"');
    expect(sql).toContain("account_id");
    expect(sql).toContain("trace_id");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});
