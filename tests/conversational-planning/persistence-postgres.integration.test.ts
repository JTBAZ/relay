import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConversationalPlanRepository, type ConversationalPlanRepository } from "../../src/conversational-planning/persistence.js";
import type { PlanSnapshot, StepPointer, TrustedPlanContext } from "../../src/conversational-planning/contract.js";

const targetUrl = process.env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL;
const ordinaryUrl = process.env.DATABASE_URL;
const targetNamePattern = /^relay_cp07_test_[a-f0-9]{32}$/;
const nonce = randomBytes(16).toString("hex");
const suffix = nonce.slice(0, 20);
let client: Client | null = null;
let connected = false;
let testCreatorA = `cp07_creator_a_${suffix}`;
let testCreatorB = `cp07_creator_b_${suffix}`;
let planId = `cp07_plan_${suffix}`;
let casPlanId = `cp07_cas_plan_${suffix}`;
let roleName: string | null = null;
let roleCreated = false;

function assertDedicatedTarget(): URL {
  if (!targetUrl || !ordinaryUrl || targetUrl !== ordinaryUrl) {
    throw new Error("CP-07 database proof requires identical dedicated and child DATABASE_URL values");
  }
  let parsed: URL;
  try { parsed = new URL(targetUrl); }
  catch { throw new Error("CP-07 database proof target URL is invalid"); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("CP-07 database proof requires PostgreSQL");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("CP-07 database proof requires loopback PostgreSQL");
  const allowedQueryKeys = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "connect_timeout", "application_name"]);
  const queryKeys = [...parsed.searchParams.keys()];
  if (queryKeys.some(key => !allowedQueryKeys.has(key)) || new Set(queryKeys).size !== queryKeys.length) {
    throw new Error("CP-07 database proof target has ambiguous connection parameters");
  }
  let databaseName: string;
  try { databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "")); }
  catch { throw new Error("CP-07 database proof target name is invalid"); }
  if (!targetNamePattern.test(databaseName)) throw new Error("CP-07 database proof requires the exact disposable test database name");
  return parsed;
}

function databaseNameFromUrl(parsed: URL): string {
  return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}

const repositorySourceRevision = "cp07-dbproof-source-v1";
const previewConfig = {
  schemaVersion: 1 as const,
  preset: "tight_crop" as const,
  aspectKey: "1:1" as const,
  compositionId: null,
  compositionProps: null,
  compositionVariantIndex: null,
  overlayDoc: {},
  templateOptions: {},
  destination: { selectedDestinationId: "x", customDestinationUrl: null }
};

function repositoryPlan(creatorId: string, planId: string, sourcePostId: string, extended = false): PlanSnapshot {
  const now = new Date().toISOString();
  const draft = {
    step_id: "draft-step", capability: "prepare_post_draft" as const, depends_on: [], enabled: true,
    title: { mode: "literal" as const, value: "Proof draft", origin: "creator" as const }, note: null, time: null,
    intended_destination: "patreon" as const, source_media_ids: ["proof-media"], target_post_id: null
  };
  const source = { kind: "existing_post" as const, post_id: sourcePostId, selected_media_ids: ["proof-media"], creative_work_id: null, creative_series_member_id: null, source_revision: repositorySourceRevision };
  if (!extended) return {
    schema_version: 1, plan_id: planId, creator_id: creatorId, revision: 0, review: "proposed", source,
    steps: [draft], distribution_groups: [], unresolved_requests: [], clarifications: [],
    requested_text_quote: "Create a post", created_at: now, updated_at: now
  };
  const preview = {
    step_id: "preview-step", capability: "prepare_preview" as const, depends_on: [draft.step_id], enabled: true,
    title: { mode: "literal" as const, value: "Preview", origin: "creator" as const }, note: null, time: null,
    source_step_id: draft.step_id, template_id: "proof-template", template_config_snapshot: previewConfig
  };
  const distribution = {
    step_id: "distribution-step", capability: "prepare_distribution" as const, depends_on: [draft.step_id, preview.step_id], enabled: true,
    title: { mode: "literal" as const, value: "X copy", origin: "creator" as const }, note: null, time: null,
    source_step_id: draft.step_id, preview_step_id: preview.step_id, distribution_group_id: "distribution-group",
    destination: "x" as const, copy_title: { mode: "literal" as const, value: "X copy", origin: "creator" as const }
  };
  const handoff = {
    step_id: "handoff-step", capability: "publish_handoff" as const, depends_on: [distribution.step_id], enabled: true,
    title: { mode: "literal" as const, value: "Hand off", origin: "creator" as const }, note: null, time: null,
    distribution_step_id: distribution.step_id, destination: "x" as const
  };
  return {
    schema_version: 1, plan_id: planId, creator_id: creatorId, revision: 0, review: "proposed", source,
    steps: [draft, preview, distribution, handoff],
    distribution_groups: [{ group_id: "distribution-group", source_step_id: draft.step_id, preview_step_id: preview.step_id, destination_step_ids: [distribution.step_id] }],
    unresolved_requests: [], clarifications: [], requested_text_quote: "Prepare a post and X handoff", created_at: now, updated_at: now
  };
}

function repositoryContext(creatorId: string, plan: PlanSnapshot): TrustedPlanContext {
  const sourcePostId = plan.source.post_id!;
  const templateIds = plan.steps.flatMap(step => step.capability === "prepare_preview" ? [step.template_id] : []);
  return {
    authenticatedCreatorId: creatorId,
    ownedMediaIds: new Set(plan.source.selected_media_ids),
    sourceMediaRelations: new Map(plan.source.selected_media_ids.map(mediaId => [mediaId, {
      post_ids: new Set([sourcePostId]), creative_work_ids: new Set<string>(), creative_series_member_ids: new Set<string>()
    }])),
    ownedPostIds: new Set([sourcePostId]),
    ownedTemplateIds: new Set(templateIds),
    ownedCreativeWorkIds: new Set(),
    ownedCreativeSeriesMemberIds: new Set(),
    verifiedSeriesMemberPartLabels: new Map(),
    currentTemplateConfigs: new Map(templateIds.map(id => [id, structuredClone(previewConfig)])),
    connectedDestinations: new Set(["patreon", "x"]),
    hasAutopostEntitlement: true,
    currentSourceRevision: plan.source.source_revision,
    ownedTargetPostIds: new Set([sourcePostId])
  };
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("unsafe generated PostgreSQL identifier");
  return `"${value}"`;
}

async function expectSqlstate(sql: string, params: unknown[], code: string): Promise<void> {
  if (!client) throw new Error("database client unavailable");
  await client.query("BEGIN");
  let caught: unknown;
  try { await client.query(sql, params); }
  catch (error) { caught = error; }
  try {
    expect((caught as { code?: string } | undefined)?.code).toBe(code);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function addTenant(creatorId: string): Promise<void> {
  if (!client) throw new Error("database client unavailable");
  await client.query(
    "INSERT INTO public.tenants (id, relay_creator_id) VALUES ($1, $2)",
    [`cp07_tenant_${creatorId}`, creatorId]
  );
}

async function insertPlan(id: string, creatorId: string, createKey = `create_${id}`): Promise<void> {
  if (!client) throw new Error("database client unavailable");
  await client.query(
    `INSERT INTO public.creator_conversational_plans
      (id, creator_id, schema_version, revision, review, source_ref, snapshot, client_create_key, updated_at)
     VALUES ($1, $2, 1, 0, 'proposed', '{}'::jsonb, '{}'::jsonb, $3, CURRENT_TIMESTAMP)`,
    [id, creatorId, createKey]
  );
}

const databaseProof = targetUrl ? describe : describe.skip;

databaseProof("CP-07 disposable PostgreSQL schema proof", () => {
  beforeAll(async () => {
    const parsed = assertDedicatedTarget();
    client = new Client({ connectionString: targetUrl! });
    await client.connect();
    connected = true;
    const actual = await client.query(
      `SELECT current_database() AS database_name,
              shobj_description(d.oid, 'pg_database') AS harness_marker
         FROM pg_catalog.pg_database d
        WHERE d.datname = current_database()`
    );
    const expectedName = databaseNameFromUrl(parsed);
    expect(actual.rows).toHaveLength(1);
    expect(actual.rows[0].database_name).toBe(expectedName);
    expect(actual.rows[0].harness_marker).toBe(`relay_cp07_harness:${expectedName.slice("relay_cp07_test_".length)}`);
  });

  afterAll(async () => {
    if (connected && client) await client.end();
  });

  it("has the expected PostgreSQL enum, check, index, foreign-key, RLS, and grant shape", async () => {
    if (!client) throw new Error("database client unavailable");
    const enumRows = await client.query(
      `SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_catalog.pg_type t
         JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = ANY($1::text[])
        GROUP BY t.typname`,
      [["CreatorConversationalPlanReview", "CreatorConversationalPlanPointerSlot", "CreatorConversationalPlanAuthorityKind"]]
    );
    const enumMap = new Map(enumRows.rows.map(row => [row.typname as string, row.labels as string[]]));
    expect(enumMap.get("CreatorConversationalPlanReview")).toEqual(["proposed", "approved_for_preparation", "cancelled"]);
    expect(enumMap.get("CreatorConversationalPlanPointerSlot")).toEqual(["draft", "attention_event", "relay_post", "preview_media", "distribution_plan", "variant", "current_attempt", "engagement_event"]);
    expect(enumMap.get("CreatorConversationalPlanAuthorityKind")).toEqual(["autopost_draft", "schedule_event", "relay_post", "preview_media", "distribution_plan", "distribution_variant", "distribution_attempt"]);

    const checks = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_catalog.pg_constraint
        WHERE conrelid = ANY(ARRAY[
          'public.creator_conversational_plans'::regclass,
          'public.creator_conversational_plan_revisions'::regclass,
          'public.creator_conversational_plan_pointers'::regclass
        ]) AND contype = 'c'`
    );
    const checkMap = new Map(checks.rows.map(row => [row.conname as string, row.definition as string]));
    expect(checkMap.get("creator_conversational_plans_schema_version_check")).toContain("schema_version = 1");
    expect(checkMap.get("creator_conversational_plans_revision_check")).toContain("revision >= 0");
    expect(checkMap.get("creator_conversational_plan_revisions_revision_check")).toContain("revision >= 0");
    expect(checkMap.get("creator_conversational_plan_pointers_slot_kind_check")).toContain("authority_kind");

    const indexes = await client.query(
      `SELECT tablename, indexname, indexdef
         FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [["creator_conversational_plans", "creator_conversational_plan_revisions", "creator_conversational_plan_pointers",
        "autopost_drafts", "creator_schedule_events", "post_distribution_plans"]]
    );
    const indexMap = new Map(indexes.rows.map(row => [row.indexname as string, row.indexdef as string]));
    for (const name of [
      "creator_conversational_plans_creator_id_client_create_key_key",
      "creator_conversational_plans_creator_id_updated_at_idx",
      "creator_conversational_plan_revisions_plan_id_revision_key",
      "ccp_rev_creator_mutation_key_uq",
      "ccp_rev_creator_plan_created_idx",
      "creator_conversational_plan_pointers_plan_id_node_id_slot_key",
      "ccp_ptr_creator_authority_idx",
      "creator_conversational_plan_pointers_plan_id_node_id_idx",
      "autopost_drafts_conversational_step_key_key",
      "creator_schedule_events_conversational_step_key_key",
      "post_distribution_plans_conversational_group_key_key"
    ]) expect(indexMap.has(name), `missing index ${name}`).toBe(true);
    for (const name of [
      "creator_conversational_plans_creator_id_client_create_key_key",
      "creator_conversational_plan_revisions_plan_id_revision_key",
      "ccp_rev_creator_mutation_key_uq",
      "creator_conversational_plan_pointers_plan_id_node_id_slot_key",
      "autopost_drafts_conversational_step_key_key",
      "creator_schedule_events_conversational_step_key_key",
      "post_distribution_plans_conversational_group_key_key"
    ]) expect(indexMap.get(name)).toMatch(/CREATE UNIQUE INDEX/i);

    const rls = await client.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [["creator_conversational_plans", "creator_conversational_plan_revisions", "creator_conversational_plan_pointers"]]
    );
    expect(rls.rows).toHaveLength(3);
    for (const table of rls.rows) {
      expect(table.relrowsecurity, `${table.relname} RLS enabled`).toBe(true);
      expect(table.relforcerowsecurity, `${table.relname} RLS not forced`).toBe(false);
    }
    const policies = await client.query(
      `SELECT tablename FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [["creator_conversational_plans", "creator_conversational_plan_revisions", "creator_conversational_plan_pointers"]]
    );
    expect(policies.rows).toHaveLength(0);
    const grants = await client.query(
      `SELECT c.relname, acl.grantee, r.rolname, acl.privilege_type
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
         LEFT JOIN pg_catalog.pg_roles r ON r.oid = acl.grantee
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
          AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))`,
      [["creator_conversational_plans", "creator_conversational_plan_revisions", "creator_conversational_plan_pointers"]]
    );
    expect(grants.rows).toHaveLength(0);

    const foreignKeys = await client.query(
      `SELECT conname, confrelid::regclass::text AS target_table, confdeltype
         FROM pg_catalog.pg_constraint
        WHERE conrelid = ANY(ARRAY[
          'public.creator_conversational_plans'::regclass,
          'public.creator_conversational_plan_revisions'::regclass,
          'public.creator_conversational_plan_pointers'::regclass
        ]) AND contype = 'f'`
    );
    const fkMap = new Map(foreignKeys.rows.map(row => [row.conname as string, row]));
    expect(fkMap.get("creator_conversational_plans_creator_id_fkey")).toMatchObject({ target_table: "tenants", confdeltype: "r" });
    expect(fkMap.get("creator_conversational_plan_revisions_plan_id_creator_id_fkey")).toMatchObject({ target_table: "creator_conversational_plans", confdeltype: "c" });
    expect(fkMap.get("creator_conversational_plan_pointers_plan_id_creator_id_fkey")).toMatchObject({ target_table: "creator_conversational_plans", confdeltype: "c" });
    expect(foreignKeys.rows.every(row => row.target_table === "tenants" || row.target_table === "creator_conversational_plans")).toBe(true);
  });

  it("enforces tenant and composite child scope, numeric revision constraints, and pointer slot/kind", async () => {
    if (!client) throw new Error("database client unavailable");
    await addTenant(testCreatorA);
    await addTenant(testCreatorB);

    await expectSqlstate(
      `INSERT INTO public.creator_conversational_plans
        (id, creator_id, schema_version, revision, review, source_ref, snapshot, client_create_key, updated_at)
       VALUES ($1, $2, 1, 0, 'proposed', '{}'::jsonb, '{}'::jsonb, $3, CURRENT_TIMESTAMP)`,
      [`cp07_missing_plan_${suffix}`, `cp07_missing_creator_${suffix}`, `missing_create_${suffix}`], "23503"
    );
    await expectSqlstate(
      `INSERT INTO public.creator_conversational_plans
        (id, creator_id, schema_version, revision, review, source_ref, snapshot, client_create_key, updated_at)
       VALUES ($1, $2, 1, -1, 'proposed', '{}'::jsonb, '{}'::jsonb, $3, CURRENT_TIMESTAMP)`,
      [`cp07_bad_rev_${suffix}`, testCreatorA, `bad_revision_${suffix}`], "23514"
    );

    await client.query("BEGIN");
    await insertPlan(planId, testCreatorA);
    await client.query(
      `INSERT INTO public.creator_conversational_plan_revisions
        (id, plan_id, creator_id, revision, client_mutation_key, request_hash, snapshot)
       VALUES ($1, $2, $3, 0, $4, $5, '{}'::jsonb)`,
      [`cp07_revision0_${suffix}`, planId, testCreatorA, `create_${suffix}`, `hash_${suffix}`]
    );
    await client.query("COMMIT");
    const created = await client.query(
      `SELECT p.revision, count(r.id)::int AS revision_count
         FROM public.creator_conversational_plans p
         JOIN public.creator_conversational_plan_revisions r ON r.plan_id = p.id AND r.creator_id = p.creator_id
        WHERE p.id = $1 GROUP BY p.revision`, [planId]
    );
    expect(created.rows).toEqual([{ revision: 0, revision_count: 1 }]);

    await expectSqlstate(
      `INSERT INTO public.creator_conversational_plan_revisions
        (id, plan_id, creator_id, revision, client_mutation_key, request_hash, snapshot)
       VALUES ($1, $2, $3, 1, $4, $5, '{}'::jsonb)`,
      [`cp07_bad_child_${suffix}`, planId, testCreatorB, `bad_child_${suffix}`, `hash_bad_${suffix}`], "23503"
    );
    await expectSqlstate(
      `INSERT INTO public.creator_conversational_plan_pointers
        (id, plan_id, creator_id, node_id, slot, authority_kind, authority_id)
       VALUES ($1, $2, $3, $4, 'draft', 'autopost_draft', $5)`,
      [`cp07_bad_pointer_${suffix}`, planId, testCreatorB, `node_${suffix}`, `authority_${suffix}`], "23503"
    );
    await client.query(
      `INSERT INTO public.creator_conversational_plan_pointers
        (id, plan_id, creator_id, node_id, slot, authority_kind, authority_id)
       VALUES ($1, $2, $3, $4, 'draft', 'autopost_draft', $5)`,
      [`cp07_good_pointer_${suffix}`, planId, testCreatorA, `node_${suffix}`, `authority_${suffix}`]
    );
    await expectSqlstate(
      `INSERT INTO public.creator_conversational_plan_pointers
        (id, plan_id, creator_id, node_id, slot, authority_kind, authority_id)
       VALUES ($1, $2, $3, $4, 'draft', 'schedule_event', $5)`,
      [`cp07_bad_slot_${suffix}`, planId, testCreatorA, `bad_node_${suffix}`, `authority_bad_${suffix}`], "23514"
    );
    await expectSqlstate(
      `INSERT INTO public.creator_conversational_plan_revisions
        (id, plan_id, creator_id, revision, client_mutation_key, request_hash, snapshot)
       VALUES ($1, $2, $3, -1, $4, $5, '{}'::jsonb)`,
      [`cp07_bad_revision_${suffix}`, planId, testCreatorA, `bad_revision_key_${suffix}`, `hash_bad_revision_${suffix}`], "23514"
    );
  });

  it("supports nullable legacy correlation keys and rejects duplicate non-null keys", async () => {
    if (!client) throw new Error("database client unavailable");
    const draftIds = [`cp07_draft1_${suffix}`, `cp07_draft2_${suffix}`, `cp07_draft3_${suffix}`, `cp07_draft4_${suffix}`];
    await client.query("INSERT INTO public.autopost_drafts (id, creator_id, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($3, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [draftIds[0], testCreatorA, draftIds[1]]);
    await client.query("INSERT INTO public.autopost_drafts (id, creator_id, conversational_step_key, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [draftIds[2], testCreatorA, `step_${suffix}`]);
    await expectSqlstate("INSERT INTO public.autopost_drafts (id, creator_id, conversational_step_key, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [draftIds[3], testCreatorA, `step_${suffix}`], "23505");

    const eventIds = [`cp07_event1_${suffix}`, `cp07_event2_${suffix}`, `cp07_event3_${suffix}`, `cp07_event4_${suffix}`];
    await client.query("INSERT INTO public.creator_schedule_events (id, creator_id, event_type, title, due_at, created_at, updated_at) VALUES ($1, $2, 'custom', 'cp07', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($3, $2, 'custom', 'cp07', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [eventIds[0], testCreatorA, eventIds[1]]);
    await client.query("INSERT INTO public.creator_schedule_events (id, creator_id, event_type, title, due_at, conversational_step_key, created_at, updated_at) VALUES ($1, $2, 'custom', 'cp07', CURRENT_TIMESTAMP, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [eventIds[2], testCreatorA, `step_${suffix}`]);
    await expectSqlstate("INSERT INTO public.creator_schedule_events (id, creator_id, event_type, title, due_at, conversational_step_key, created_at, updated_at) VALUES ($1, $2, 'custom', 'cp07', CURRENT_TIMESTAMP, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [eventIds[3], testCreatorA, `step_${suffix}`], "23505");

    const campaignId = `cp07_campaign_${suffix}`;
    const postId = `cp07_post_${suffix}`;
    await client.query("INSERT INTO public.campaigns (id, creator_id, name, upstream_updated_at, version_seq) VALUES ($1, $2, 'cp07', CURRENT_TIMESTAMP, 1)", [campaignId, testCreatorA]);
    await client.query("INSERT INTO public.posts (id, campaign_id, creator_id, upstream_status, created_at) VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP)", [postId, campaignId, testCreatorA]);
    const distributionIds = [`cp07_dist1_${suffix}`, `cp07_dist2_${suffix}`, `cp07_dist3_${suffix}`, `cp07_dist4_${suffix}`];
    await client.query("INSERT INTO public.post_distribution_plans (id, creator_id, post_id, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ($4, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [distributionIds[0], testCreatorA, postId, distributionIds[1]]);
    await client.query("INSERT INTO public.post_distribution_plans (id, creator_id, post_id, conversational_group_key, created_at, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [distributionIds[2], testCreatorA, postId, `group_${suffix}`]);
    await expectSqlstate("INSERT INTO public.post_distribution_plans (id, creator_id, post_id, conversational_group_key, created_at, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [distributionIds[3], testCreatorA, postId, `group_${suffix}`], "23505");
  });

  it("allows exactly one concurrent compare-and-swap winner for a revision", async () => {
    if (!client || !targetUrl) throw new Error("database client unavailable");
    await insertPlan(casPlanId, testCreatorA);
    const first = new Client({ connectionString: targetUrl });
    const second = new Client({ connectionString: targetUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
      const winner = await first.query(
        `UPDATE public.creator_conversational_plans
            SET revision = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND creator_id = $2 AND revision = 0 RETURNING revision`,
        [casPlanId, testCreatorA]
      );
      const losingUpdate = second.query(
        `UPDATE public.creator_conversational_plans
            SET revision = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND creator_id = $2 AND revision = 0 RETURNING revision`,
        [casPlanId, testCreatorA]
      );
      await first.query("COMMIT");
      const loser = await losingUpdate;
      await second.query("COMMIT");
      expect(winner.rowCount).toBe(1);
      expect(loser.rowCount).toBe(0);
      const current = await client.query("SELECT revision FROM public.creator_conversational_plans WHERE id = $1", [casPlanId]);
      expect(current.rows).toEqual([{ revision: 1 }]);
    } finally {
      await Promise.allSettled([first.query("ROLLBACK"), second.query("ROLLBACK")]);
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("restricts tenant deletion and proves RLS is empty for a non-bypass role", async () => {
    if (!client) throw new Error("database client unavailable");
    await expectSqlstate("DELETE FROM public.tenants WHERE relay_creator_id = $1", [testCreatorA], "23503");

    const candidate = `relay_cp07_rls_${randomBytes(16).toString("hex")}`;
    const existing = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1", [candidate]);
    expect(existing.rows).toHaveLength(0);
    roleName = candidate;
    const quotedRole = quoteIdentifier(candidate);
    try {
      await client.query(`CREATE ROLE ${quotedRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      roleCreated = true;
      await client.query(`GRANT SELECT ON public.creator_conversational_plans, public.creator_conversational_plan_revisions, public.creator_conversational_plan_pointers TO ${quotedRole}`);
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${quotedRole}`);
      const visible = await client.query("SELECT id FROM public.creator_conversational_plans WHERE creator_id = $1", [testCreatorA]);
      expect(visible.rows).toHaveLength(0);
      await client.query("ROLLBACK");
    } finally {
      if (roleCreated && roleName) {
        await client.query("ROLLBACK").catch(() => undefined);
        const role = quoteIdentifier(roleName);
        await client.query(`REVOKE ALL ON public.creator_conversational_plans, public.creator_conversational_plan_revisions, public.creator_conversational_plan_pointers FROM ${role}`);
        await client.query(`DROP ROLE ${role}`);
        roleCreated = false;
      }
    }
  });

  it("does not cascade authority deletion through identity-only pointers", async () => {
    if (!client) throw new Error("database client unavailable");
    const authorityId = `cp07_authority_${suffix}`;
    const draftId = `cp07_authority_draft_${suffix}`;
    await client.query("INSERT INTO public.autopost_drafts (id, creator_id, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", [draftId, testCreatorA]);
    await client.query(
      `INSERT INTO public.creator_conversational_plan_pointers
        (id, plan_id, creator_id, node_id, slot, authority_kind, authority_id)
       VALUES ($1, $2, $3, $4, 'draft', 'autopost_draft', $5)`,
      [`cp07_authority_pointer_${suffix}`, planId, testCreatorA, `authority_node_${suffix}`, authorityId]
    );
    await client.query("UPDATE public.creator_conversational_plan_pointers SET authority_id = $1 WHERE id = $2", [draftId, `cp07_authority_pointer_${suffix}`]);
    await client.query("DELETE FROM public.autopost_drafts WHERE id = $1", [draftId]);
    const pointer = await client.query("SELECT authority_id FROM public.creator_conversational_plan_pointers WHERE id = $1", [`cp07_authority_pointer_${suffix}`]);
    expect(pointer.rows).toEqual([{ authority_id: draftId }]);
  });
});

databaseProof("CP-07 conversational plan repository PostgreSQL proof", () => {
  const prismaClients: PrismaClient[] = [];
  let db: PrismaClient;
  const openPrisma = async (): Promise<PrismaClient> => {
    assertDedicatedTarget();
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    prismaClients.push(prisma);
    await prisma.$connect();
    return prisma;
  };
  const makeRepository = (prisma: PrismaClient): ConversationalPlanRepository => createConversationalPlanRepository(
    prisma,
    async (authenticatedCreatorId, plan) => ({
      context: repositoryContext(authenticatedCreatorId, plan),
      sourceFingerprint: plan.source.source_revision
    })
  );
  const fixtureId = (label: string) => `cp07_repo_${label}_${randomBytes(10).toString("hex")}`;
  const provisionCreator = async (prisma: PrismaClient, creatorId: string) => {
    await prisma.tenant.create({ data: { relayCreatorId: creatorId } });
  };
  const createInput = (creatorId: string, planId: string, key: string, latestRequest = "Create a post") => ({
    creatorId,
    clientMutationKey: key,
    command: { operation: "create" as const, latestRequest, selectedPostIds: ["proof-post"], selectedMediaIds: ["proof-media"] },
    snapshot: repositoryPlan(creatorId, planId, "proof-post")
  });
  const seedPost = async (prisma: PrismaClient, creatorId: string) => {
    const campaignId = fixtureId("campaign"), postId = fixtureId("post");
    await prisma.campaign.create({ data: { id: campaignId, creatorId, name: "CP-07 repository proof", upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    await prisma.post.create({ data: { id: postId, campaignId, creatorId, upstreamStatus: "active", source: "RELAY", createdAt: new Date() } });
    return postId;
  };

  beforeAll(async () => {
    const parsed = assertDedicatedTarget();
    db = await openPrisma();
    const current = await db.$queryRaw<Array<{ database_name: string; harness_marker: string | null }>>`
      SELECT current_database() AS database_name,
             shobj_description(d.oid, 'pg_database') AS harness_marker
        FROM pg_catalog.pg_database d
       WHERE d.datname = current_database()`;
    expect(current).toHaveLength(1);
    expect(current[0]?.database_name).toBe(databaseNameFromUrl(parsed));
    expect(current[0]?.harness_marker).toBe(`relay_cp07_harness:${databaseNameFromUrl(parsed).slice("relay_cp07_test_".length)}`);
  });

  afterAll(async () => {
    await Promise.allSettled(prismaClients.map(prisma => prisma.$disconnect()));
  });

  it("persists create and revision zero across a fresh Prisma client, then replays the old create key", async () => {
    const creatorId = fixtureId("creator"), planId = fixtureId("plan"), key = fixtureId("create");
    await provisionCreator(db, creatorId);
    const repo = makeRepository(db);
    const input = createInput(creatorId, planId, key);
    const created = await repo.create(input);
    expect(created).toMatchObject({ kind: "ok", recordedRevision: 0, current: { plan_id: planId, revision: 0 } });

    const restarted = makeRepository(await openPrisma());
    expect(await restarted.get(creatorId, planId)).toMatchObject({ kind: "ok", current: { plan_id: planId, revision: 0 }, pointers: [] });
    const approved = await repo.approve({ creatorId, clientMutationKey: fixtureId("approve"), command: { operation: "approve", planId, baseRevision: 0 } });
    expect(approved).toMatchObject({ kind: "ok", recordedRevision: 1, current: { revision: 1, review: "approved_for_preparation" } });
    expect(await restarted.create(input)).toMatchObject({ kind: "ok", recordedRevision: 0, current: { plan_id: planId, revision: 1 } });
    expect(await db.creatorConversationalPlanRevision.count({ where: { creatorId, planId } })).toBe(2);
  });

  it("arbitrates concurrent same-key creates to one plan/revision while returning the replay to both callers", async () => {
    const creatorId = fixtureId("creator"), planId = fixtureId("plan"), key = fixtureId("create");
    await provisionCreator(db, creatorId);
    const input = createInput(creatorId, planId, key);
    const first = makeRepository(db), second = makeRepository(await openPrisma());
    const results = await Promise.all([first.create(input), second.create(structuredClone(input))]);
    expect(results.map(result => result.kind)).toEqual(["ok", "ok"]);
    expect(results.map(result => result.kind === "ok" ? result.recordedRevision : -1)).toEqual([0, 0]);
    expect(await db.creatorConversationalPlan.count({ where: { id: planId, creatorId } })).toBe(1);
    expect(await db.creatorConversationalPlanRevision.count({ where: { planId, creatorId, revision: 0 } })).toBe(1);
  });

  it("allows exactly one concurrent different-key CAS revision and writes no losing history", async () => {
    const creatorId = fixtureId("creator"), planId = fixtureId("plan");
    await provisionCreator(db, creatorId);
    const first = makeRepository(db), second = makeRepository(await openPrisma());
    const input = createInput(creatorId, planId, fixtureId("create"));
    expect((await first.create(input)).kind).toBe("ok");
    const outcomes = await Promise.all([
      first.approve({ creatorId, clientMutationKey: fixtureId("approve"), command: { operation: "approve", planId, baseRevision: 0 } }),
      second.cancel({ creatorId, clientMutationKey: fixtureId("cancel"), command: { operation: "cancel", planId, baseRevision: 0 } })
    ]);
    expect(outcomes.filter(result => result.kind === "ok")).toHaveLength(1);
    expect(outcomes.filter(result => result.kind === "revision_conflict")).toHaveLength(1);
    expect(await db.creatorConversationalPlanRevision.count({ where: { planId, creatorId } })).toBe(2);
    expect(await db.creatorConversationalPlan.findUnique({ where: { id: planId } })).toMatchObject({ revision: 1 });
  });

  it("rejects changed-hash replay, scopes foreign creators, and rejects proposed pointer writes", async () => {
    const creatorId = fixtureId("creator"), foreignCreatorId = fixtureId("creator"), planId = fixtureId("plan"), key = fixtureId("create");
    await Promise.all([provisionCreator(db, creatorId), provisionCreator(db, foreignCreatorId)]);
    const repo = makeRepository(db), input = createInput(creatorId, planId, key);
    expect((await repo.create(input)).kind).toBe("ok");
    expect(await repo.create({ ...input, command: { ...input.command, latestRequest: "A different normalized creator request" } })).toEqual({ kind: "idempotency_conflict" });
    expect(await repo.get(foreignCreatorId, planId)).toEqual({ kind: "not_found" });
    expect(await repo.putCheckedPointer(creatorId, planId, { node_id: "draft-step", slot: "draft", kind: "autopost_draft", authority_id: fixtureId("draft") })).toMatchObject({ kind: "revision_conflict", code: "plan_not_approved" });
  });

  it("checks live relay-post, draft, group-plan, variant, and handoff-attempt authorities without changing them", async () => {
    const creatorId = fixtureId("creator"), planId = fixtureId("plan");
    await provisionCreator(db, creatorId);
    const postId = await seedPost(db, creatorId);
    const draft = await db.autopostDraft.create({ data: { creatorId, conversationalStepKey: `plan:${planId}:step:draft-step` } });
    const distributionPlan = await db.postDistributionPlan.create({ data: {
      creatorId, postId, sourceDraftId: draft.id, conversationalGroupKey: `plan:${planId}:group:distribution-group`
    } });
    const variant = await db.postDistributionVariant.create({ data: { creatorId, planId: distributionPlan.id, postId, destination: "x" } });
    const attempt = await db.postDistributionAttempt.create({ data: { creatorId, variantId: variant.id, postId, destination: "x" } });
    const statusesBefore = {
      draft: (await db.autopostDraft.findUniqueOrThrow({ where: { id: draft.id } })).status,
      distribution: (await db.postDistributionPlan.findUniqueOrThrow({ where: { id: distributionPlan.id } })).status,
      variant: (await db.postDistributionVariant.findUniqueOrThrow({ where: { id: variant.id } })).status,
      attempt: (await db.postDistributionAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status
    };
    const input = createInput(creatorId, planId, fixtureId("create"));
    input.command.selectedPostIds = [postId];
    input.snapshot = repositoryPlan(creatorId, planId, postId, true);
    const repo = makeRepository(db);
    expect((await repo.create(input)).kind).toBe("ok");
    expect((await repo.approve({ creatorId, clientMutationKey: fixtureId("approve"), command: { operation: "approve", planId, baseRevision: 0 } })).kind).toBe("ok");
    const pointers: StepPointer[] = [
      { node_id: "draft-step", slot: "draft", kind: "autopost_draft", authority_id: draft.id },
      { node_id: "draft-step", slot: "relay_post", kind: "relay_post", authority_id: postId },
      { node_id: "distribution-group", slot: "distribution_plan", kind: "distribution_plan", authority_id: distributionPlan.id },
      { node_id: "distribution-step", slot: "variant", kind: "distribution_variant", authority_id: variant.id },
      { node_id: "handoff-step", slot: "current_attempt", kind: "distribution_attempt", authority_id: attempt.id }
    ];
    for (const pointer of pointers) expect((await repo.putCheckedPointer(creatorId, planId, pointer)).kind).toBe("ok");
    const count = await db.creatorConversationalPlanPointer.count({ where: { planId, creatorId } });
    expect(await repo.putCheckedPointer(creatorId, planId, pointers[0]!)).toMatchObject({ kind: "ok", pointer: pointers[0] });
    expect(await db.creatorConversationalPlanPointer.count({ where: { planId, creatorId } })).toBe(count);
    expect(await repo.putCheckedPointer(creatorId, planId, { ...pointers[4]!, authority_id: fixtureId("replacement-attempt") })).toMatchObject({ kind: "pointer_conflict", code: "occupied_slot_immutable" });
    expect(await repo.listCheckedPointers(creatorId, planId)).toMatchObject({ kind: "ok", pointers: expect.arrayContaining(pointers) });
    expect({
      draft: (await db.autopostDraft.findUniqueOrThrow({ where: { id: draft.id } })).status,
      distribution: (await db.postDistributionPlan.findUniqueOrThrow({ where: { id: distributionPlan.id } })).status,
      variant: (await db.postDistributionVariant.findUniqueOrThrow({ where: { id: variant.id } })).status,
      attempt: (await db.postDistributionAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status
    }).toEqual(statusesBefore);
  });

  it("uses the plan row lock for a concurrent pointer insert and reports an authority deletion gap", async () => {
    const creatorId = fixtureId("creator"), planId = fixtureId("plan");
    await provisionCreator(db, creatorId);
    const postId = await seedPost(db, creatorId);
    const repo = makeRepository(db), secondRepo = makeRepository(await openPrisma());
    const input = createInput(creatorId, planId, fixtureId("create"));
    input.command.selectedPostIds = [postId];
    input.snapshot = repositoryPlan(creatorId, planId, postId);
    expect((await repo.create(input)).kind).toBe("ok");
    expect((await repo.approve({ creatorId, clientMutationKey: fixtureId("approve"), command: { operation: "approve", planId, baseRevision: 0 } })).kind).toBe("ok");
    const draft = await db.autopostDraft.create({ data: { creatorId, conversationalStepKey: `plan:${planId}:step:draft-step` } });
    const pointer: StepPointer = { node_id: "draft-step", slot: "draft", kind: "autopost_draft", authority_id: draft.id };
    const results = await Promise.all([repo.putCheckedPointer(creatorId, planId, pointer), secondRepo.putCheckedPointer(creatorId, planId, pointer)]);
    expect(results.map(result => result.kind)).toEqual(["ok", "ok"]);
    expect(await db.creatorConversationalPlanPointer.count({ where: { planId, creatorId, nodeId: pointer.node_id, slot: pointer.slot } })).toBe(1);
    await db.autopostDraft.delete({ where: { id: draft.id } });
    expect(await repo.get(creatorId, planId)).toMatchObject({ kind: "authority_gap", code: "draft_owner_or_correlation_mismatch" });
    expect(await repo.create(input)).toMatchObject({ kind: "authority_gap", code: "draft_owner_or_correlation_mismatch" });
  });

  it("rejects foreign drafts and wrong distribution parents or destinations", async () => {
    const creatorId = fixtureId("creator"), foreignCreatorId = fixtureId("creator"), planId = fixtureId("plan");
    await Promise.all([provisionCreator(db, creatorId), provisionCreator(db, foreignCreatorId)]);
    const postId = await seedPost(db, creatorId), repo = makeRepository(db);
    const plan = repositoryPlan(creatorId, planId, postId, true), input = createInput(creatorId, planId, fixtureId("create"));
    input.command.selectedPostIds = [postId]; input.snapshot = plan;
    expect((await repo.create(input)).kind).toBe("ok");
    expect((await repo.approve({ creatorId, clientMutationKey: fixtureId("approve"), command: { operation: "approve", planId, baseRevision: 0 } })).kind).toBe("ok");
    const foreignDraft = await db.autopostDraft.create({ data: { creatorId: foreignCreatorId, conversationalStepKey: `plan:${planId}:step:draft-step` } });
    expect(await repo.putCheckedPointer(creatorId, planId, { node_id: "draft-step", slot: "draft", kind: "autopost_draft", authority_id: foreignDraft.id })).toMatchObject({ kind: "authority_gap", code: "draft_owner_or_correlation_mismatch" });

    const correctPlan = await db.postDistributionPlan.create({ data: { creatorId, postId, conversationalGroupKey: `plan:${planId}:group:distribution-group` } });
    const foreignParent = await db.postDistributionPlan.create({ data: { creatorId, postId, conversationalGroupKey: fixtureId("wrong-group") } });
    const wrongDestination = await db.postDistributionVariant.create({ data: { creatorId, planId: correctPlan.id, postId, destination: "patreon" } });
    const wrongParent = await db.postDistributionVariant.create({ data: { creatorId, planId: foreignParent.id, postId, destination: "x" } });
    expect((await repo.putCheckedPointer(creatorId, planId, { node_id: "distribution-group", slot: "distribution_plan", kind: "distribution_plan", authority_id: correctPlan.id })).kind).toBe("ok");
    expect(await repo.putCheckedPointer(creatorId, planId, { node_id: "distribution-step", slot: "variant", kind: "distribution_variant", authority_id: wrongDestination.id })).toMatchObject({ kind: "authority_gap", code: "variant_parent_or_destination_mismatch" });
    expect(await repo.putCheckedPointer(creatorId, planId, { node_id: "distribution-step", slot: "variant", kind: "distribution_variant", authority_id: wrongParent.id })).toMatchObject({ kind: "authority_gap", code: "variant_parent_or_destination_mismatch" });
  });
});
