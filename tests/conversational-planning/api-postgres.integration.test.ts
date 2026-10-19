import { randomBytes } from "node:crypto";
import express from "express";
import { PrismaClient, IdentityAuthProvider, TenantRole, CreatorPlan, SubscriptionStatus, MediaUpstreamStatus, MediaIngestOrigin, MediaProcessingStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPlanningContextSource } from "../../src/conversational-planning/context.js";
import { createConversationalPlanningService } from "../../src/conversational-planning/service.js";
import { CONVERSATIONAL_PLANNING_BASE, createConversationalPlanningJsonBodyParser, registerConversationalPlanningRoutes } from "../../src/conversational-planning/routes.js";
import { createConversationalPlanRepository } from "../../src/conversational-planning/persistence.js";
import { DbIdentityStore } from "../../src/identity/identity-store-db.js";
import { IdentityService } from "../../src/identity/identity-service.js";
import { hashOpaqueSessionToken } from "../../src/identity/session-token-hash.js";
import type { PlanningProvider, PlanningProviderInput, PlanningProviderResponse } from "../../src/conversational-planning/intent.js";

const targetUrl = process.env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL;
const ordinaryUrl = process.env.DATABASE_URL;
const databasePrefix = "relay_cp07_test_";
const databaseNamePattern = /^relay_cp07_test_[a-f0-9]{32}$/;
const testNonce = randomBytes(16).toString("hex");
const idSuffix = testNonce.slice(0, 18);
const creatorA = `cp08a_${idSuffix}`;
const creatorB = `cp08b_${idSuffix}`;
const tokenExpired = `cp08expired_session_${testNonce}`;
const sourceRequest = "Create a draft titled CP08 proof draft";
const basePath = `${CONVERSATIONAL_PLANNING_BASE}/plans`;
const databaseProof = targetUrl ? describe : describe.skip;

let pool: Pool | null = null;
let prisma: PrismaClient | null = null;
let identityService: IdentityService | null = null;
let contextSource: ReturnType<typeof createPlanningContextSource> | null = null;
let accountA = "";
let accountB = "";
let membershipA = "";
let membershipB = "";
let unlinkedAccountId = "";
let unlinkedMembershipId = "";
let mediaA = "";
let mediaB = "";
let unlinkedSessionToken = "";

function assertDedicatedTarget(): URL {
  if (!targetUrl || !ordinaryUrl || targetUrl !== ordinaryUrl) throw new Error("CP-08 PostgreSQL evidence requires identical dedicated and child database URLs");
  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch { throw new Error("CP-08 database target is invalid"); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("CP-08 requires loopback PostgreSQL");
  const allowedQueryKeys = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "connect_timeout", "application_name"]);
  const keys = [...parsed.searchParams.keys()];
  if (keys.some(key => !allowedQueryKeys.has(key)) || new Set(keys).size !== keys.length) throw new Error("CP-08 target URL has ambiguous connection parameters");
  let databaseName: string;
  try { databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "")); } catch { throw new Error("CP-08 database name is invalid"); }
  if (!databaseNamePattern.test(databaseName)) throw new Error("CP-08 requires the exact disposable database name");
  return parsed;
}

function expectedDatabaseName(parsed: URL): string { return decodeURIComponent(parsed.pathname.replace(/^\//, "")); }

function routeApp(provider?: PlanningProvider, aiEnabled = "1") {
  if (!prisma || !identityService || !contextSource) throw new Error("guarded CP-08 fixture is not initialized");
  const repository = createConversationalPlanRepository(prisma, contextSource.loadContext);
  const service = createConversationalPlanningService({ repository, context: contextSource, ...(provider ? { provider } : {}), now: () => new Date("2026-10-17T09:30:00.000Z") });
  const app = express();
  app.use(CONVERSATIONAL_PLANNING_BASE, createConversationalPlanningJsonBodyParser());
  registerConversationalPlanningRoutes(app, {
    prisma, identityService, service, lookup: contextSource.lookup,
    // The fixture uses the real Prisma-backed identity store and service above.
    databaseIdentityReady: true,
    settings: { enabled: "1", allowlist: `${creatorA},${creatorB}`, aiEnabled, aiAvailable: Boolean(provider), preparationAvailable: false },
    // This is only the test mount's Studio write restriction; it does not authorize a caller.
    assertStudioMutationAllowed: async () => true
  });
  return app;
}

function providerFor(title: string, beforeRespond?: () => Promise<void>): PlanningProvider & { calls: PlanningProviderInput[] } {
  const calls: PlanningProviderInput[] = [];
  const responseFor = (input: PlanningProviderInput): PlanningProviderResponse => {
    const revising = input.context.plan_revision !== null;
    const revisionTitle = "CP08 AI revised title";
    const quote = revising ? `Change the title to ${revisionTitle}` : sourceRequest;
    const handle = input.context.editable_nodes[0]?.handle ?? null;
    return {
      text: JSON.stringify({
        base_revision: revising ? input.context.plan_revision : null, outcome: "proposal", question: null,
        requests: [{
          command: revising ? "revise" : "add", target_handle: revising ? handle : null, changed_fields: revising ? ["title"] : [], kind: "primary_draft",
          source_ref: { mode: "selection", id: null }, destination: "patreon", title_mode: "literal", title_text: revising ? revisionTitle : title,
          template_ref: { mode: "none", value: null }, enabled: null, delivery_intent: revising ? "none" : "draft_only", social_action: null,
          time_kind: "none", local_date: null, weekday: null, weekday_qualifier: null, timezone: null,
          day_offset: null, target_destination: null, local_time: null, time_text: null,
          request_quote: quote
        }]
      }), usage: { inputTokens: 12, outputTokens: 18, costUsd: 0.0001 }, finishReason: "stop"
    };
  };
  return { calls, async respond(input) { calls.push(input); await beforeRespond?.(); return responseFor(input); } };
}

async function seedCreator(creatorId: string, accountId: string, membershipId: string, mediaId: string): Promise<void> {
  if (!prisma || !identityService) throw new Error("guarded CP-08 fixture is not initialized");
  const tenantId = `cp08_tenant_${creatorId}`;
  await prisma.tenant.create({ data: { id: tenantId, relayCreatorId: creatorId } });
  await prisma.account.create({ data: {
    id: accountId, emailNorm: `${creatorId}@example.invalid`, identityAuthProvider: IdentityAuthProvider.independent,
    primaryRelayCreatorId: creatorId
  } });
  await prisma.tenantMembership.create({ data: { id: membershipId, accountId, tenantId, role: TenantRole.patron, tierIds: [] } });
  const now = new Date("2026-10-17T09:00:00.000Z");
  await prisma.creatorPlanEntitlement.create({ data: { creatorId, plan: CreatorPlan.autopost, source: "pilot", effectiveAt: now, expiresAt: new Date("2027-01-01T00:00:00.000Z") } });
  await prisma.mediaAsset.create({ data: {
    id: mediaId, creatorId, postIds: [], primaryPostId: null,
    upstreamStatus: MediaUpstreamStatus.active, currentVersionSeq: 1, currentUpstreamRevision: "cp08-staged-v1",
    currentMimeType: "image/png", currentUpstreamUrl: null, currentRole: "primary", currentStorageKey: null,
    currentIngestedAt: now, versionsJson: [{ version_seq: 1, upstream_revision: "cp08-staged-v1", mime_type: "image/png", role: "primary" }],
    ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD, processingStatus: MediaProcessingStatus.READY
  } });
  // Use the actual DbIdentityStore and IdentityService session-issuance path. Only the
  // session row/token hash is stored; the opaque token remains in test memory.
  const issued = await identityService.issueSessionForUser({
    user_id: membershipId, creator_id: creatorId, email: `${creatorId}@example.invalid`, password_hash: "",
    auth_provider: "independent", tier_ids: [], created_at: now.toISOString(), updated_at: now.toISOString()
  });
  issuedTokens.set(creatorId, issued.token);
}

async function seedUnlinkedAccount(): Promise<void> {
  if (!prisma || !identityService) throw new Error("guarded CP-08 fixture is not initialized");
  const now = new Date("2026-10-17T09:00:00.000Z");
  unlinkedAccountId = `cp08_unlinked_account_${idSuffix}`;
  unlinkedMembershipId = `cp08_unlinked_member_${idSuffix}`;
  await prisma.account.create({ data: {
    id: unlinkedAccountId, emailNorm: `unlinked-${idSuffix}@example.invalid`, identityAuthProvider: IdentityAuthProvider.independent,
    primaryRelayCreatorId: null
  } });
  await prisma.tenantMembership.create({ data: { id: unlinkedMembershipId, accountId: unlinkedAccountId, tenantId: `cp08_tenant_${creatorA}`, role: TenantRole.patron, tierIds: [] } });
  const issued = await identityService.issueSessionForUser({ user_id: unlinkedMembershipId, creator_id: creatorA, email: `unlinked-${idSuffix}@example.invalid`, password_hash: "", auth_provider: "independent", tier_ids: [], created_at: now.toISOString(), updated_at: now.toISOString() });
  unlinkedSessionToken = issued.token;
}

const issuedTokens = new Map<string, string>();

async function creatorLifecycleSnapshot(creatorIds: readonly string[]) {
  if (!prisma) throw new Error("guarded CP-08 fixture is not initialized");
  const [plans, revisions, pointers, entitlements, sessions, accounts, media] = await Promise.all([
    prisma.creatorConversationalPlan.findMany({ where: { creatorId: { in: [...creatorIds] } }, orderBy: { id: "asc" } }),
    prisma.creatorConversationalPlanRevision.findMany({ where: { creatorId: { in: [...creatorIds] } }, orderBy: { id: "asc" } }),
    prisma.creatorConversationalPlanPointer.findMany({ where: { creatorId: { in: [...creatorIds] } }, orderBy: { id: "asc" } }),
    prisma.creatorPlanEntitlement.findMany({ where: { creatorId: { in: [...creatorIds] } }, orderBy: { creatorId: "asc" } }),
    prisma.session.findMany({ where: { tenantMembershipId: { in: [membershipA, membershipB, unlinkedMembershipId] } }, orderBy: { id: "asc" }, select: { id: true, tenantMembershipId: true, tokenHash: true, expiresAt: true, lastUsedAt: true, revokedAt: true } }),
    prisma.account.findMany({ where: { id: { in: [accountA, accountB, unlinkedAccountId] } }, orderBy: { id: "asc" }, select: { id: true, primaryRelayCreatorId: true, updatedAt: true } }),
    prisma.mediaAsset.findMany({ where: { creatorId: { in: [...creatorIds] } }, orderBy: { id: "asc" }, select: { id: true, creatorId: true, processingStatus: true, ingestOrigin: true, currentVersionSeq: true, currentUpstreamRevision: true, autopostDraftId: true } })
  ]);
  return JSON.stringify({ plans, revisions, pointers, entitlements, sessions, accounts, media });
}

databaseProof("CP-08 disposable PostgreSQL API lifecycle proof", () => {
  beforeAll(async () => {
    const parsed = assertDedicatedTarget();
    const databaseName = expectedDatabaseName(parsed);
    pool = new Pool({ connectionString: targetUrl! });
    const markerConnection = await pool.connect();
    try {
      const result = await markerConnection.query(
        `SELECT current_database() AS database_name,
                shobj_description(d.oid, 'pg_database') AS harness_marker
           FROM pg_catalog.pg_database d
          WHERE d.datname = current_database()`
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].database_name).toBe(databaseName);
      expect(result.rows[0].harness_marker).toBe(`relay_cp07_harness:${databaseName.slice(databasePrefix.length)}`);
    } finally { markerConnection.release(); }

    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("external network disabled in CP-08 integration test"); });
    await prisma.$connect();
    identityService = new IdentityService(new DbIdentityStore(prisma));
    contextSource = createPlanningContextSource(prisma);

    accountA = `cp08_account_a_${idSuffix}`;
    accountB = `cp08_account_b_${idSuffix}`;
    membershipA = `cp08_member_a_${idSuffix}`;
    membershipB = `cp08_member_b_${idSuffix}`;
    mediaA = `cp08_media_a_${idSuffix}`;
    mediaB = `cp08_media_b_${idSuffix}`;
    await seedCreator(creatorA, accountA, membershipA, mediaA);
    await seedCreator(creatorB, accountB, membershipB, mediaB);
    await seedUnlinkedAccount();
    await prisma.session.create({ data: {
      tenantMembershipId: membershipA, tokenHash: hashOpaqueSessionToken(tokenExpired),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"), kind: "web"
    } });
  });

  afterAll(async () => {
    // Release every app and pool connection before the reviewed harness drops its whole DB.
    try { if (prisma) await prisma.$disconnect(); }
    finally {
      try { if (pool) await pool.end(); }
      finally { vi.restoreAllMocks(); }
    }
  });

  it("creates, reads, previews, AI and manually revises, approves, cancels, and replays in a new service instance with AI disabled", async () => {
    if (!prisma) throw new Error("guarded CP-08 fixture is not initialized");
    const provider = providerFor("CP08 proof draft");
    const app = routeApp(provider);
    const authA = { Authorization: `Bearer ${issuedTokens.get(creatorA)}` };
    const createBody = { clientMutationKey: `create-${idSuffix}`, latestRequest: sourceRequest, selectedPostIds: [], selectedMediaIds: [mediaA] };
    const created = await request(app).post(basePath).set(authA).send(createBody);
    expect(created.status).toBe(200);
    expect(created.body.data.kind).toBe("stored");
    const planId = created.body.data.current.plan_id as string;
    expect(created.body.data.current).toMatchObject({ creator_id: creatorA, revision: 0, review: "proposed" });
    expect(provider.calls).toHaveLength(1);

    const beforeRead = await creatorLifecycleSnapshot([creatorA, creatorB]);
    const read = await request(app).get(`${basePath}/${planId}`).set(authA);
    const preview = await request(app).get(`${basePath}/${planId}/preview`).set(authA);
    expect(read.status).toBe(200);
    expect(read.body.data.current.plan_id).toBe(planId);
    expect(read.body.data.editHandles).toHaveLength(1);
    expect(preview.status).toBe(200);
    expect(preview.body.data.readiness.status).toBe("ready");
    expect(await creatorLifecycleSnapshot([creatorA, creatorB])).toBe(beforeRead);

    const step = read.body.data.current.steps[0] as { step_id: string };
    const revised = await request(app).post(`${basePath}/${planId}/revise`).set(authA).send({
      mode: "manual", clientMutationKey: `manual-${idSuffix}`, baseRevision: 0,
      patch: [{ step_id: step.step_id, field: "title", value: { mode: "literal", value: "CP08 manually revised", origin: "creator" } }]
    });
    expect(revised.status).toBe(200);
    expect(revised.body.data.current.revision).toBe(1);
    expect(revised.body.data.recordedRevision).toBe(1);
    expect(provider.calls).toHaveLength(1);

    const aiProvider = providerFor("unused for revision; chosen from validated context");
    const aiRevised = await request(routeApp(aiProvider)).post(`${basePath}/${planId}/revise`).set(authA).send({
      mode: "ai", clientMutationKey: `ai-revise-${idSuffix}`, baseRevision: 1,
      latestRequest: "Change the title to CP08 AI revised title", selectedPostIds: [], selectedMediaIds: [mediaA]
    });
    expect(aiRevised.status).toBe(200);
    expect(aiRevised.body.data.current.revision).toBe(2);
    expect(aiRevised.body.data.current.steps[0].title.value).toBe("CP08 AI revised title");
    expect(aiProvider.calls).toHaveLength(1);

    const confirmedBeforeApproval = await request(app).post(`${basePath}/${planId}/confirm`).set(authA).send({ clientMutationKey: `confirm-${idSuffix}`, baseRevision: 2 });
    expect(confirmedBeforeApproval.status).toBe(503);
    expect(confirmedBeforeApproval.body.error.code).toBe("PREPARATION_UNAVAILABLE");
    expect((await request(app).get(`${basePath}/${planId}`).set(authA)).body.data.current.review).toBe("proposed");

    const approved = await request(app).post(`${basePath}/${planId}/approve`).set(authA).send({ clientMutationKey: `approve-${idSuffix}`, baseRevision: 2 });
    expect(approved.status).toBe(200);
    expect(approved.body.data.current).toMatchObject({ revision: 3, review: "approved_for_preparation" });
    const cancelled = await request(app).post(`${basePath}/${planId}/cancel`).set(authA).send({ clientMutationKey: `cancel-${idSuffix}`, baseRevision: 3 });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.current).toMatchObject({ revision: 4, review: "cancelled" });
    const history = await prisma.creatorConversationalPlanRevision.findMany({ where: { creatorId: creatorA, planId }, orderBy: { revision: "asc" }, select: { revision: true } });
    expect(history.map(row => row.revision)).toEqual([0, 1, 2, 3, 4]);

    const restarted = routeApp(undefined, "0");
    const replay = await request(restarted).post(basePath).set(authA).send(createBody);
    expect(replay.status).toBe(200);
    expect(replay.body.data.kind).toBe("stored");
    expect(replay.body.data.recordedRevision).toBe(0);
    expect(replay.body.data.current).toMatchObject({ plan_id: planId, revision: 4, review: "cancelled" });
  });

  it("enforces creator, plan, and media isolation; changed-key collision costs no extra provider call", async () => {
    const provider = providerFor("CP08 proof draft");
    const app = routeApp(provider);
    const authA = { Authorization: `Bearer ${issuedTokens.get(creatorA)}` };
    const authB = { Authorization: `Bearer ${issuedTokens.get(creatorB)}` };
    expect((await request(app).get(basePath)).status).toBe(401);
    expect((await request(app).get(basePath).set({ Authorization: "Bearer invalid-cp08-session" })).status).toBe(401);
    const sessionCreatorNotLinked = await request(app).get(basePath).set({ Authorization: `Bearer ${unlinkedSessionToken}` });
    expect(sessionCreatorNotLinked.status).toBe(403);
    expect(sessionCreatorNotLinked.body.error.code).toBe("CREATOR_NOT_LINKED");
    await expect(prisma!.account.create({ data: {
      id: `cp08_missing_tenant_account_${idSuffix}`, emailNorm: `missing-tenant-${idSuffix}@example.invalid`,
      identityAuthProvider: IdentityAuthProvider.independent, primaryRelayCreatorId: `cp08_missing_tenant_${idSuffix}`
    } })).rejects.toMatchObject({ code: "P2003" });
    const beforeForeignMedia = await prisma!.creatorConversationalPlan.count({ where: { creatorId: creatorA } });
    const foreignMedia = await request(app).post(basePath).set(authA).send({ clientMutationKey: `foreign-media-${idSuffix}`, latestRequest: sourceRequest, selectedPostIds: [], selectedMediaIds: [mediaB] });
    expect(foreignMedia.status).toBe(503);
    expect(provider.calls).toHaveLength(0);
    expect(await prisma!.creatorConversationalPlan.count({ where: { creatorId: creatorA } })).toBe(beforeForeignMedia);

    const created = await request(app).post(basePath).set(authA).send({ clientMutationKey: `isolation-${idSuffix}`, latestRequest: sourceRequest, selectedPostIds: [], selectedMediaIds: [mediaA] });
    expect(created.status).toBe(200);
    const planId = created.body.data.current.plan_id as string;
    const foreignGet = await request(app).get(`${basePath}/${planId}`).set(authB);
    expect(foreignGet.status).toBe(404);
    const foreignRevise = await request(app).post(`${basePath}/${planId}/revise`).set(authB).send({ mode: "manual", clientMutationKey: `foreign-revise-${idSuffix}`, baseRevision: 0, patch: [{ step_id: "not-this-creators-step", field: "enabled", value: false }] });
    expect(foreignRevise.status).toBe(404);

    const sameKeyDifferentRequest = await request(app).post(basePath).set(authA).send({ clientMutationKey: `isolation-${idSuffix}`, latestRequest: `${sourceRequest} changed`, selectedPostIds: [], selectedMediaIds: [mediaA] });
    expect(sameKeyDifferentRequest.status).toBe(409);
    expect(sameKeyDifferentRequest.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(provider.calls).toHaveLength(1);
  });

  it("serializes duplicate create and competing revision writes through the real repository", async () => {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const provider = providerFor("CP08 proof draft", async () => {
      arrivals++;
      if (arrivals === 2) release();
      await Promise.race([barrier, new Promise<void>(resolve => setTimeout(resolve, 250))]);
    });
    const app = routeApp(provider);
    const authA = { Authorization: `Bearer ${issuedTokens.get(creatorA)}` };
    const body = { clientMutationKey: `raced-create-${idSuffix}`, latestRequest: sourceRequest, selectedPostIds: [], selectedMediaIds: [mediaA] };
    const duplicateResults = await Promise.all([request(app).post(basePath).set(authA).send(body), request(app).post(basePath).set(authA).send(body)]);
    expect(duplicateResults.map(result => result.status)).toEqual([200, 200]);
    expect(new Set(duplicateResults.map(result => result.body.data.current.plan_id)).size).toBe(1);
    expect(provider.calls.length).toBeGreaterThanOrEqual(1);
    expect(provider.calls.length).toBeLessThanOrEqual(2);
    const planId = duplicateResults[0]!.body.data.current.plan_id as string;
    const snapshot = duplicateResults[0]!.body.data.current as { steps: Array<{ step_id: string }> };
    const revise = (key: string, title: string) => request(app).post(`${basePath}/${planId}/revise`).set(authA).send({ mode: "manual", clientMutationKey: key, baseRevision: 0, patch: [{ step_id: snapshot.steps[0]!.step_id, field: "title", value: { mode: "literal", value: title, origin: "creator" } }] });
    const results = await Promise.all([revise(`cas-left-${idSuffix}`, "Winner left"), revise(`cas-right-${idSuffix}`, "Winner right")]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    expect(results.find(result => result.status === 409)?.body.error.code).toBe("REVISION_CONFLICT");
    const finalRead = await request(app).get(`${basePath}/${planId}`).set(authA);
    expect(finalRead.body.data.current.revision).toBe(1);
    expect(finalRead.body.data.current.steps[0].title.value).toMatch(/^Winner (left|right)$/);
  });

  it("keeps expired DB sessions on readonly GET, then preserves legacy default cleanup", async () => {
    if (!prisma || !identityService) throw new Error("guarded CP-08 fixture is not initialized");
    const app = routeApp(undefined, "0");
    const expiredHash = hashOpaqueSessionToken(tokenExpired);
    const before = await prisma.session.findUniqueOrThrow({ where: { tokenHash: expiredHash }, select: { id: true, expiresAt: true, lastUsedAt: true, revokedAt: true } });
    const response = await request(app).get(`${basePath}`).set({ Authorization: `Bearer ${tokenExpired}` });
    expect(response.status).toBe(401);
    const afterReadonly = await prisma.session.findUniqueOrThrow({ where: { tokenHash: expiredHash }, select: { id: true, expiresAt: true, lastUsedAt: true, revokedAt: true } });
    expect(afterReadonly).toEqual(before);
    expect(await identityService.resolveSession(tokenExpired)).toBeNull();
    expect(await prisma.session.findUnique({ where: { tokenHash: expiredHash }, select: { id: true } })).toBeNull();
  });
});

