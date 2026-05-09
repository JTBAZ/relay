import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");

describe("P5a-db-002 analytics pilot migration", () => {
  it("migration SQL defines enums, tables, FKs, and RLS", () => {
    const sqlPath = join(
      repoRoot,
      "prisma",
      "migrations",
      "20260509130000_p5a_analytics_pilot_schema",
      "migration.sql"
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain('CREATE TYPE "CreatorMembershipEventType"');
    expect(sql).toContain('CREATE TYPE "CreatorMembershipEventSource"');
    expect(sql).toContain('CREATE TYPE "RelayEngagementEventType"');
    expect(sql).toContain('CREATE TABLE "creator_membership_events"');
    expect(sql).toContain('CREATE TABLE "patreon_insights_imports"');
    expect(sql).toContain('CREATE TABLE "patreon_insights_post_metrics"');
    expect(sql).toContain('CREATE TABLE "relay_engagement_events"');
    expect(sql).toContain("patreon_insights_imports_creator_id_file_hash_key");
    expect(sql).toContain("patreon_insights_post_metrics_post_id_fkey");
    expect(sql).toContain("relay_engagement_events_media_id_fkey");
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("Prisma schema validates (npm run build prerequisite)", () => {
    execSync("npx prisma validate", { cwd: repoRoot, stdio: "pipe" });
  });
});

describe("P5a-db-003 membership event dedupe migration", () => {
  it("migration SQL adds composite unique on membership ledger", () => {
    const sqlPath = join(
      repoRoot,
      "prisma",
      "migrations",
      "20260509140000_p5a_membership_event_dedupe",
      "migration.sql"
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain("CREATE UNIQUE INDEX");
    expect(sql).toContain(
      "creator_membership_events_creator_id_patreon_member_id_event_type_occurred_at_key"
    );
  });
});
