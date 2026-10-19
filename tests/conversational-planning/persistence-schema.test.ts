import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schema = readFileSync(fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)), "utf8");
const migration = readFileSync(fileURLToPath(new URL("../../prisma/migrations/20261015120000_creator_conversational_plans/migration.sql", import.meta.url)), "utf8");

const model = (name: string) => {
  const match = new RegExp(`model ${name} \\{([\\s\\S]*?)^\\}`, "m").exec(schema);
  if (!match) throw new Error(`missing model ${name}`);
  return match[1];
};

describe("conversational plan persistence schema", () => {
  it("declares only the finite review, pointer-slot, and authority-kind enums", () => {
    expect(schema).toMatch(/enum CreatorConversationalPlanReview\s*\{\s*proposed\s+approved_for_preparation\s+cancelled\s*\}/);
    expect(schema).toMatch(/enum CreatorConversationalPlanPointerSlot\s*\{\s*draft\s+attention_event\s+relay_post\s+preview_media\s+distribution_plan\s+variant\s+current_attempt\s+engagement_event\s*\}/);
    expect(schema).toMatch(/enum CreatorConversationalPlanAuthorityKind\s*\{\s*autopost_draft\s+schedule_event\s+relay_post\s+preview_media\s+distribution_plan\s+distribution_variant\s+distribution_attempt\s*\}/);
  });

  it("models current plan, immutable revisions, and identity-only pointers with scoped keys", () => {
    const plan = model("CreatorConversationalPlan");
    expect(plan).toMatch(/\bcreatorId\s+String/);
    expect(plan).toMatch(/\bschemaVersion\s+Int/);
    expect(plan).toMatch(/\brevision\s+Int/);
    expect(plan).toMatch(/\breview\s+CreatorConversationalPlanReview/);
    expect(plan).toMatch(/\bsourceRef\s+Json/);
    expect(plan).toMatch(/\bsnapshot\s+Json/);
    expect(plan).toMatch(/\bclientCreateKey\s+String/);
    expect(plan).toContain("references: [relayCreatorId], onDelete: Restrict, onUpdate: Cascade");
    expect(plan).toContain("@@unique([id, creatorId])");
    expect(plan).toMatch(/@@unique\(\[creatorId, clientCreateKey\], map: "creator_conversational_plans_creator_id_client_create_key_key"\)/);
    expect(plan).toMatch(/@@index\(\[creatorId, updatedAt\(sort: Desc\)\], map: "creator_conversational_plans_creator_id_updated_at_idx"\)/);

    const revision = model("CreatorConversationalPlanRevision");
    expect(revision).toMatch(/\bclientMutationKey\s+String/);
    expect(revision).toMatch(/\brequestHash\s+String/);
    expect(revision).toMatch(/@@unique\(\[planId, revision\], map: "creator_conversational_plan_revisions_plan_id_revision_key"\)/);
    expect(revision).toMatch(/@@unique\(\[creatorId, clientMutationKey\], map: "ccp_rev_creator_mutation_key_uq"\)/);
    expect(revision).toMatch(/@@index\(\[creatorId, planId, createdAt\], map: "ccp_rev_creator_plan_created_idx"\)/);
    expect(revision).toContain("references: [id, creatorId], onDelete: Cascade, onUpdate: Cascade");

    const pointer = model("CreatorConversationalPlanPointer");
    expect(pointer).toMatch(/\bnodeId\s+String/);
    expect(pointer).toMatch(/\bslot\s+CreatorConversationalPlanPointerSlot/);
    expect(pointer).toMatch(/\bauthorityKind\s+CreatorConversationalPlanAuthorityKind/);
    expect(pointer).toMatch(/\bauthorityId\s+String/);
    expect(pointer).toMatch(/@@unique\(\[planId, nodeId, slot\], map: "creator_conversational_plan_pointers_plan_id_node_id_slot_key"\)/);
    expect(pointer).toMatch(/@@index\(\[creatorId, authorityKind, authorityId\], map: "ccp_ptr_creator_authority_idx"\)/);
    expect(pointer).not.toMatch(/\b(status|success|publishedAt|publicationEvidence)\b/i);
  });

  it("adds only nullable unique authority correlation columns", () => {
    expect(model("AutopostDraft")).toMatch(/\bconversationalStepKey\s+String\?\s+@unique\(map: "autopost_drafts_conversational_step_key_key"\) @map\("conversational_step_key"\)/);
    expect(model("CreatorScheduleEvent")).toMatch(/\bconversationalStepKey\s+String\?\s+@unique\(map: "creator_schedule_events_conversational_step_key_key"\) @map\("conversational_step_key"\)/);
    expect(model("PostDistributionPlan")).toMatch(/\bconversationalGroupKey\s+String\?\s+@unique\(map: "post_distribution_plans_conversational_group_key_key"\) @map\("conversational_group_key"\)/);
    expect(migration).toContain('ALTER TABLE "autopost_drafts" ADD COLUMN "conversational_step_key" TEXT;');
    expect(migration).toContain('ALTER TABLE "creator_schedule_events" ADD COLUMN "conversational_step_key" TEXT;');
    expect(migration).toContain('ALTER TABLE "post_distribution_plans" ADD COLUMN "conversational_group_key" TEXT;');
    expect(migration).not.toMatch(/\bUPDATE\s+(public\.)?(autopost_drafts|creator_schedule_events|post_distribution_plans)\b/i);
  });

  it("enforces version, revision, tenant, and child-scope constraints in SQL", () => {
    expect(migration).toContain('CHECK ("schema_version" = 1)');
    expect(migration).toContain('CONSTRAINT "creator_conversational_plans_revision_check" CHECK ("revision" >= 0)');
    expect(migration).toContain('CONSTRAINT "creator_conversational_plan_revisions_revision_check" CHECK ("revision" >= 0)');
    expect(migration).toContain('FOREIGN KEY ("creator_id") REFERENCES "tenants"("relay_creator_id")');
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
    expect(migration).toContain('FOREIGN KEY ("plan_id", "creator_id")');
    expect(migration).toContain('REFERENCES "creator_conversational_plans"("id", "creator_id")');
    expect(migration.match(/ON DELETE CASCADE ON UPDATE CASCADE/g)).toHaveLength(2);
    expect(migration).toContain('CONSTRAINT "creator_conversational_plan_pointers_slot_kind_check" CHECK');
    for (const pair of [
      "draft' AND \"authority_kind\" = 'autopost_draft",
      "attention_event', 'engagement_event') AND \"authority_kind\" = 'schedule_event",
      "relay_post' AND \"authority_kind\" = 'relay_post",
      "preview_media' AND \"authority_kind\" = 'preview_media",
      "distribution_plan' AND \"authority_kind\" = 'distribution_plan",
      "variant' AND \"authority_kind\" = 'distribution_variant",
      "current_attempt' AND \"authority_kind\" = 'distribution_attempt"
    ]) expect(migration).toContain(pair);
  });

  it("enables fail-closed RLS and revokes browser/public roles without broad policies", () => {
    for (const table of ["creator_conversational_plans", "creator_conversational_plan_revisions", "creator_conversational_plan_pointers"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM authenticated`);
    }
    expect(migration).not.toMatch(/FORCE ROW LEVEL SECURITY|CREATE\s+POLICY|GRANT\s+.+\s+TO\s+(PUBLIC|anon|authenticated|service_role)/i);
    expect(migration).toMatch(/IF EXISTS \(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname = 'anon'\)/);
    expect(migration).toMatch(/IF EXISTS \(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname = 'authenticated'\)/);
  });

  it("keeps every declared DDL identifier within PostgreSQL's limit and maps shortened names exactly", () => {
    const ddlNames = [...migration.matchAll(/\b(?:TYPE|TABLE|INDEX|CONSTRAINT)\s+"([^"]+)"/g)].map(match => match[1]);
    expect(ddlNames.length).toBeGreaterThan(0);
    expect(ddlNames.every(name => Buffer.byteLength(name, "utf8") <= 63)).toBe(true);
    for (const name of ["ccp_rev_creator_mutation_key_uq", "ccp_rev_creator_plan_created_idx", "ccp_ptr_creator_authority_idx"]) {
      expect(schema).toContain(`map: "${name}"`);
      expect(migration).toContain(`"${name}"`);
    }
  });
});
