import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { Prisma, PrismaClient, CreatorPlan } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTOPOST_ACTIVE_DRAFT_SOFT_CAP, AutopostDraftValidationError, patchAutopostDraft, saveAutopostDraft } from "../../src/autopost/autopost-draft-service.js";
import { createPlanningContextSource } from "../../src/conversational-planning/context.js";
import type { PlanSnapshot } from "../../src/conversational-planning/contract.js";
import { createPlanPreparationAdapter } from "../../src/conversational-planning/materializer.js";
import { createConversationalPlanRepository, createConversationalPreparationRepository } from "../../src/conversational-planning/persistence.js";

const targetUrl = process.env.CONVERSATIONAL_PLAN_TEST_DATABASE_URL;
const ordinaryUrl = process.env.DATABASE_URL;
const targetNamePattern = /^relay_cp07_test_[a-f0-9]{32}$/;
const nonce = randomBytes(16).toString("hex");
const suffix = nonce.slice(0, 18);
let client: Client | null = null;
const prismaClients: PrismaClient[] = [];

function assertDedicatedTarget(): URL {
  if (!targetUrl || !ordinaryUrl || targetUrl !== ordinaryUrl) throw new Error("CP-09 proof requires identical dedicated and child DATABASE_URL values");
  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch { throw new Error("CP-09 proof target URL is invalid"); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("CP-09 proof requires loopback PostgreSQL");
  const allowed = new Set(["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "connect_timeout", "application_name"]);
  const keys = [...parsed.searchParams.keys()];
  if (keys.some(key => !allowed.has(key)) || new Set(keys).size !== keys.length) throw new Error("CP-09 proof target has ambiguous connection parameters");
  let name: string;
  try { name = decodeURIComponent(parsed.pathname.replace(/^\//, "")); } catch { throw new Error("CP-09 proof target name is invalid"); }
  if (!targetNamePattern.test(name)) throw new Error("CP-09 proof requires the exact disposable test database name");
  return parsed;
}

function databaseNameFromUrl(parsed: URL): string { return decodeURIComponent(parsed.pathname.replace(/^\//, "")); }
function id(label: string): string { return `cp09_${label}_${suffix}`; }

async function openPrisma(): Promise<PrismaClient> {
  assertDedicatedTarget();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
  prismaClients.push(prisma);
  await prisma.$connect();
  return prisma;
}

function repositoryFor(prisma: PrismaClient) {
  const context = createPlanningContextSource(prisma);
  return { context, repository: createConversationalPlanRepository(prisma, context.loadContext) };
}

function stagedPlan(creatorId: string, planId: string, mediaIds: string[], timed = false, stepMediaIds = mediaIds): PlanSnapshot {
  const now = new Date().toISOString();
  return {
    schema_version: 1, plan_id: planId, creator_id: creatorId, revision: 0, review: "proposed",
    source: { kind: "staged_media", post_id: null, selected_media_ids: mediaIds, creative_work_id: null, creative_series_member_id: null, source_revision: "pending-context-fingerprint" },
    steps: [{
      step_id: "source-step", capability: "prepare_post_draft", depends_on: [], enabled: true,
      title: { mode: "literal", value: `Approved ${planId}`, origin: "creator" }, note: timed ? "Exact approved reminder note" : null,
      time: timed ? { kind: "absolute", at_utc: "2027-01-02T03:04:05.000Z", timezone: "UTC", local: "2027-01-02T03:04" } : null,
      intended_destination: "patreon", source_media_ids: stepMediaIds, target_post_id: null
    }],
    distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Prepare this selected source",
    created_at: now, updated_at: now
  };
}

function existingPostPlan(creatorId: string, planId: string, postId: string, mediaId: string, timed = false): PlanSnapshot {
  const now = new Date().toISOString();
  return {
    schema_version: 1, plan_id: planId, creator_id: creatorId, revision: 0, review: "proposed",
    source: { kind: "existing_post", post_id: postId, selected_media_ids: [mediaId], creative_work_id: null, creative_series_member_id: null, source_revision: "pending-context-fingerprint" },
    steps: [{
      step_id: "source-step", capability: "prepare_post_draft", depends_on: [], enabled: true,
      title: { mode: "literal", value: "Reuse this existing post", origin: "creator" }, note: "Review the existing post",
      time: timed ? { kind: "absolute", at_utc: "2027-01-02T03:04:05.000Z", timezone: "UTC", local: "2027-01-02T03:04" } : null,
      intended_destination: "patreon", source_media_ids: [mediaId], target_post_id: postId
    }],
    distribution_groups: [], unresolved_requests: [], clarifications: [], requested_text_quote: "Prepare this existing post",
    created_at: now, updated_at: now
  };
}

async function provisionCreator(prisma: PrismaClient, creatorId: string): Promise<void> {
  await prisma.tenant.create({ data: { relayCreatorId: creatorId } });
  await prisma.creatorPlanEntitlement.create({ data: { creatorId, plan: CreatorPlan.autopost, source: "pilot", effectiveAt: new Date() } });
}

async function seedMedia(prisma: PrismaClient, creatorId: string, mediaId: string): Promise<void> {
  await prisma.mediaAsset.create({ data: {
    id: mediaId, creatorId, upstreamStatus: "active", currentVersionSeq: 1, currentUpstreamRevision: `upstream-${mediaId}`,
    currentMimeType: "image/png", currentIngestedAt: new Date(), versionsJson: [], ingestOrigin: "RELAY_UPLOAD", processingStatus: "READY"
  } });
}

async function seedExistingPost(prisma: PrismaClient, creatorId: string, postId: string, mediaId: string): Promise<void> {
  const campaignId = id("campaign_existing");
  const now = new Date();
  await prisma.campaign.create({ data: { id: campaignId, creatorId, name: "CP-09 existing source", upstreamUpdatedAt: now, versionSeq: 1 } });
  await prisma.post.create({ data: { id: postId, campaignId, creatorId, upstreamStatus: "active", source: "RELAY", createdAt: now } });
  await prisma.postVersion.create({ data: { postId, versionSeq: 1, upstreamRevision: `upstream-${postId}`, title: "Existing source post", mediaIds: [mediaId], ingestedAt: now } });
  await prisma.mediaAsset.create({ data: {
    id: mediaId, creatorId, postIds: [postId], primaryPostId: postId, upstreamStatus: "active", currentVersionSeq: 1,
    currentUpstreamRevision: `upstream-${mediaId}`, currentMimeType: "image/png", currentIngestedAt: now, versionsJson: [],
    ingestOrigin: "PATREON", processingStatus: "READY"
  } });
}

async function createApprovedPlan(prisma: PrismaClient, creatorId: string, planId: string, mediaIds: string[], timed = false, stepMediaIds = mediaIds) {
  return createApprovedSnapshot(prisma, stagedPlan(creatorId, planId, mediaIds, timed, stepMediaIds), [], mediaIds);
}

async function createApprovedSnapshot(prisma: PrismaClient, candidate: PlanSnapshot, selectedPostIds: string[], selectedMediaIds: string[]) {
  const { context, repository } = repositoryFor(prisma);
  const creatorId = candidate.creator_id, planId = candidate.plan_id;
  const loaded = await context.loadContext(creatorId, candidate);
  candidate.source.source_revision = loaded.sourceFingerprint;
  const created = await repository.create({
    creatorId, clientMutationKey: id(`create_${planId}`),
    command: { operation: "create", latestRequest: "Prepare this selected source", selectedPostIds, selectedMediaIds },
    snapshot: candidate
  });
  if (created.kind !== "ok") throw new Error(`fixture plan create failed: ${created.kind}`);
  const approved = await repository.approve({ creatorId, clientMutationKey: id(`approve_${planId}`), command: { operation: "approve", planId, baseRevision: 0 } });
  if (approved.kind !== "ok") throw new Error(`fixture plan approve failed: ${approved.kind}`);
  const outputs = createConversationalPreparationRepository(prisma);
  const adapter = createPlanPreparationAdapter({ repository, outputs });
  return { context, repository, outputs, adapter, snapshot: approved.current };
}

function failingAfterCommittedUnit(db: PrismaClient): Pick<PrismaClient, "$transaction"> {
  const transaction = (<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => db.$transaction(async tx => {
    const result = await work(tx);
    if ((result as { kind?: string } | null)?.kind === "committed") throw new Error("injected pre-commit failure");
    return result;
  })) as Pick<PrismaClient, "$transaction">["$transaction"];
  return {
    $transaction: transaction
  };
}

function barrier(parties: number, timeoutMs = 10_000): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  let fail!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { release = resolve; fail = reject; });
  const timeout = setTimeout(() => fail(new Error("bounded test barrier timed out")), timeoutMs);
  timeout.unref?.();
  return async () => { arrived++; if (arrived === parties) { clearTimeout(timeout); release(); } await ready; };
}

function gateRealStagingRead(prisma: PrismaClient, waitForBoth: () => Promise<void>): PrismaClient {
  const client = new Proxy(prisma, {
    get(target, property) {
      const delegate = Reflect.get(target, property, target) as unknown;
      if (property !== "mediaAsset" || !delegate || typeof delegate !== "object") {
        return typeof delegate === "function" ? delegate.bind(target) : delegate;
      }
      return new Proxy(delegate, {
        get(mediaDelegate, method) {
          const original = Reflect.get(mediaDelegate, method, mediaDelegate);
          if (method !== "findMany" || typeof original !== "function") return typeof original === "function" ? original.bind(mediaDelegate) : original;
          return async (args: { where?: Record<string, unknown> }) => {
            const rows = await original.call(mediaDelegate, args);
            const where = args.where ?? {};
            const isStagingRead = where.processingStatus === "READY" && where.primaryPostId === null && where.ingestOrigin !== undefined;
            if (isStagingRead) await waitForBoth();
            return rows;
          };
        }
      });
    }
  });
  return client;
}

async function verifyTargetOwnership(prisma: PrismaClient): Promise<void> {
  const parsed = assertDedicatedTarget();
  const rows = await prisma.$queryRaw<Array<{ database_name: string; harness_marker: string | null }>>`
    SELECT current_database() AS database_name, shobj_description(d.oid, 'pg_database') AS harness_marker
      FROM pg_catalog.pg_database d WHERE d.datname = current_database()`;
  const name = databaseNameFromUrl(parsed);
  expect(rows).toEqual([{ database_name: name, harness_marker: `relay_cp07_harness:${name.slice("relay_cp07_test_".length)}` }]);
}

const databaseProof = targetUrl ? describe : describe.skip;

databaseProof("CP-09 real PostgreSQL preparation proof", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const parsed = assertDedicatedTarget();
    client = new Client({ connectionString: targetUrl! });
    await client.connect();
    db = await openPrisma();
    await verifyTargetOwnership(db);
    expect(databaseNameFromUrl(parsed)).toMatch(targetNamePattern);
  });

  afterAll(async () => {
    await Promise.allSettled(prismaClients.map(prisma => prisma.$disconnect()));
    if (client) await client.end().catch(() => undefined);
  });

  it("serializes concurrent same-plan preparation to one real draft, attention event, pointer set, and reservation", async () => {
    const creatorId = id("creator_same"), planId = id("plan_same"), mediaId = id("media_same");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const plan = await createApprovedPlan(db, creatorId, planId, [mediaId], true);
    const secondClient = await openPrisma();
    const second = createPlanPreparationAdapter({ repository: repositoryFor(secondClient).repository, outputs: createConversationalPreparationRepository(secondClient) });
    const results = await Promise.all([
      plan.adapter.prepare({ creatorId, planId, approvedRevision: 1 }),
      second.prepare({ creatorId, planId, approvedRevision: 1 })
    ]);
    expect(results).toEqual([{ kind: "authorities_linked" }, { kind: "authorities_linked" }]);
    const draft = await db.autopostDraft.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    const event = await db.creatorScheduleEvent.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    expect(event).toMatchObject({ eventType: "make_post", destination: "patreon", title: "Review Patreon post", note: "Exact approved reminder note", remindMe: true, postId: null });
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, planId } })).toBe(2);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).autopostDraftId).toBe(draft.id);
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect(await db.creatorScheduleEvent.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
  });

  it("allows only one of two approved plans to reserve the same source media", async () => {
    const creatorId = id("creator_two_plans"), mediaId = id("media_compete"), planA = id("plan_a"), planB = id("plan_b");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const a = await createApprovedPlan(db, creatorId, planA, [mediaId]);
    const b = await createApprovedPlan(db, creatorId, planB, [mediaId]);
    expect(await a.outputs.prepareOutput({ creatorId, planId: planA, approvedRevision: 1, stepId: "source-step", output: "relay_post" })).toMatchObject({ kind: "blocked", code: "source_intent_gap" });
    const results = await Promise.all([
      a.adapter.prepare({ creatorId, planId: planA, approvedRevision: 1 }),
      b.adapter.prepare({ creatorId, planId: planB, approvedRevision: 1 })
    ]);
    expect(results.filter(result => result.kind === "authorities_linked")).toHaveLength(1);
    expect(results.filter(result => result.kind === "blocked" && result.code === "authority_gap")).toHaveLength(1);
    expect(await db.autopostDraft.count({ where: { creatorId } })).toBe(1);
    expect(await db.mediaAsset.count({ where: { id: mediaId, autopostDraftId: { not: null } } })).toBe(1);
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, slot: "draft" } })).toBe(1);
  });

  it("reuses an owned existing post with selected attached media and binds its attention event to that post", async () => {
    const creatorId = id("creator_existing"), planId = id("plan_existing"), postId = id("post_existing"), mediaId = id("media_existing");
    await provisionCreator(db, creatorId); await seedExistingPost(db, creatorId, postId, mediaId);
    const plan = await createApprovedSnapshot(db, existingPostPlan(creatorId, planId, postId, mediaId, true), [postId], [mediaId]);
    expect(await plan.adapter.prepare({ creatorId, planId, approvedRevision: 1 })).toEqual({ kind: "authorities_linked" });
    expect(await plan.outputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "draft" })).toMatchObject({ kind: "blocked", code: "attached_media_reuse_gap" });
    const event = await db.creatorScheduleEvent.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    expect(event).toMatchObject({ eventType: "make_post", destination: "patreon", postId, title: "Review Patreon post", note: "Review the existing post" });
    const pointers = await db.creatorConversationalPlanPointer.findMany({ where: { creatorId, planId } });
    expect(pointers).toHaveLength(2);
    expect(pointers).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "source-step", slot: "relay_post", authorityKind: "relay_post", authorityId: postId }),
      expect.objectContaining({ nodeId: "source-step", slot: "attention_event", authorityKind: "schedule_event", authorityId: event.id })
    ]));
    expect(await db.autopostDraft.count({ where: { creatorId } })).toBe(0);
  });

  it("rejects a real selected-source helper with no step media and does not create an empty draft", async () => {
    const creatorId = id("creator_empty_helper"), planId = id("plan_empty_helper"), mediaId = id("media_empty_helper");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const plan = await createApprovedPlan(db, creatorId, planId, [mediaId], false, []);
    expect(await plan.adapter.prepare({ creatorId, planId, approvedRevision: 1 })).toMatchObject({ kind: "blocked", code: "authority_gap" });
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(0);
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, planId } })).toBe(0);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).autopostDraftId).toBeNull();
  });

  it("rolls back real draft, pointer, and reservation writes when failure is injected before the owning transaction commits", async () => {
    const creatorId = id("creator_rollback"), planId = id("plan_rollback"), mediaId = id("media_rollback");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const plan = await createApprovedPlan(db, creatorId, planId, [mediaId]);
    const outputs = createConversationalPreparationRepository(failingAfterCommittedUnit(db));
    const result = await outputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "draft" });
    expect(result).toMatchObject({ kind: "unavailable", code: "preparation_unavailable" });
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(0);
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, planId } })).toBe(0);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).autopostDraftId).toBeNull();
  });

  it("rolls back only a failed attention unit, then retries by reusing the committed source draft", async () => {
    const creatorId = id("creator_attention_rollback"), planId = id("plan_attention_rollback"), mediaId = id("media_attention_rollback");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const plan = await createApprovedPlan(db, creatorId, planId, [mediaId], true);
    const source = await plan.outputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "draft" });
    expect(source.kind).toBe("linked");
    const draftBefore = await db.autopostDraft.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    const failingOutputs = createConversationalPreparationRepository(failingAfterCommittedUnit(db));
    expect(await failingOutputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "attention_event" })).toMatchObject({ kind: "unavailable", code: "preparation_unavailable" });
    expect(await db.autopostDraft.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toMatchObject({ id: draftBefore.id });
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, planId } })).toBe(1);
    expect(await db.creatorScheduleEvent.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(0);

    expect(await plan.adapter.prepare({ creatorId, planId, approvedRevision: 1 })).toEqual({ kind: "authorities_linked" });
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect(await db.creatorScheduleEvent.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, planId } })).toBe(2);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).autopostDraftId).toBe(draftBefore.id);
  });

  it("restarts against persisted identities and repairs missing draft/attention pointers without overwriting manual edits", async () => {
    const creatorId = id("creator_restart"), planId = id("plan_restart"), mediaId = id("media_restart");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const first = await createApprovedPlan(db, creatorId, planId, [mediaId], true);
    expect(await first.adapter.prepare({ creatorId, planId, approvedRevision: 1 })).toEqual({ kind: "authorities_linked" });
    const original = await db.autopostDraft.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    const originalEvent = await db.creatorScheduleEvent.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    await db.autopostDraft.update({ where: { id: original.id }, data: { title: "Manual edit survives retry", status: "previewing" } });
    await db.creatorScheduleEvent.update({ where: { id: originalEvent.id }, data: {
      title: "Manual event title survives retry", note: "Manual event note survives retry", dueAt: new Date("2027-02-03T04:05:06.000Z"),
      status: "done", externalUrl: "https://creator.example/manual-attention"
    } });
    await db.creatorConversationalPlanPointer.deleteMany({ where: { creatorId, planId, nodeId: "source-step", slot: "draft" } });
    await db.creatorConversationalPlanPointer.deleteMany({ where: { creatorId, planId, nodeId: "source-step", slot: "attention_event" } });

    const restartedClient = await openPrisma();
    const restarted = await createApprovedPlanView(restartedClient, creatorId, planId);
    expect(await restarted.adapter.prepare({ creatorId, planId, approvedRevision: 1 })).toEqual({ kind: "authorities_linked" });
    const repaired = await restartedClient.autopostDraft.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    const repairedEvent = await restartedClient.creatorScheduleEvent.findFirstOrThrow({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } });
    expect(repaired.id).toBe(original.id);
    expect(repaired).toMatchObject({ title: "Manual edit survives retry", status: "previewing" });
    expect(repairedEvent.id).toBe(originalEvent.id);
    expect(repairedEvent).toMatchObject({ title: "Manual event title survives retry", note: "Manual event note survives retry", dueAt: new Date("2027-02-03T04:05:06.000Z"), status: "done", externalUrl: "https://creator.example/manual-attention" });
    expect(await restartedClient.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect(await restartedClient.creatorScheduleEvent.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect(await restartedClient.creatorConversationalPlanPointer.count({ where: { creatorId, planId, nodeId: "source-step", slot: { in: ["draft", "attention_event"] } } })).toBe(2);
  });

  it("keeps the fingerprint stable after reservation and blocks the next attention unit on genuine source drift", async () => {
    const creatorId = id("creator_fingerprint"), planId = id("plan_fingerprint"), mediaId = id("media_fingerprint");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaId);
    const plan = await createApprovedPlan(db, creatorId, planId, [mediaId], true);
    expect((await plan.outputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "draft" })).kind).toBe("linked");
    const current = await plan.repository.get(creatorId, planId);
    expect(current.kind).toBe("ok");
    if (current.kind !== "ok") return;
    expect((await plan.context.loadContext(creatorId, current.current)).sourceFingerprint).toBe(current.current.source.source_revision);
    await db.mediaAsset.update({ where: { id: mediaId }, data: { currentUpstreamRevision: "genuine-source-change" } });
    expect(await plan.outputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "attention_event" })).toMatchObject({ kind: "conflict", code: "stale_source" });
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect(await db.creatorScheduleEvent.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(0);
    expect(await db.creatorConversationalPlanPointer.count({ where: { creatorId, planId } })).toBe(1);
  });

  it("serializes the CP preparation soft-cap recheck across plans", async () => {
    const creatorId = id("creator_cap"), mediaA = id("media_cap_a"), mediaB = id("media_cap_b"), planA = id("plan_cap_a"), planB = id("plan_cap_b");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaA); await seedMedia(db, creatorId, mediaB);
    await db.autopostDraft.createMany({ data: Array.from({ length: AUTOPOST_ACTIVE_DRAFT_SOFT_CAP - 1 }, (_, index) => ({ creatorId, title: `Existing ${index}` })) });
    const a = await createApprovedPlan(db, creatorId, planA, [mediaA]);
    const b = await createApprovedPlan(db, creatorId, planB, [mediaB]);
    const results = await Promise.all([
      a.adapter.prepare({ creatorId, planId: planA, approvedRevision: 1 }),
      b.adapter.prepare({ creatorId, planId: planB, approvedRevision: 1 })
    ]);
    expect(results.filter(result => result.kind === "authorities_linked")).toHaveLength(1);
    expect(results.filter(result => result.kind === "blocked" && result.code === "authority_gap")).toHaveLength(1);
    expect(await db.autopostDraft.count({ where: { creatorId } })).toBe(AUTOPOST_ACTIVE_DRAFT_SOFT_CAP);
  });

  it("uses fresh approved revision guards, rejects foreign creators, and leaves committed outputs intact after cancellation", async () => {
    const creatorId = id("creator_cancel"), foreignCreatorId = id("creator_foreign"), planId = id("plan_cancel"), mediaId = id("media_cancel");
    await provisionCreator(db, creatorId); await provisionCreator(db, foreignCreatorId); await seedMedia(db, creatorId, mediaId);
    const plan = await createApprovedPlan(db, creatorId, planId, [mediaId]);
    expect(await plan.outputs.prepareOutput({ creatorId: foreignCreatorId, planId, approvedRevision: 1, stepId: "source-step", output: "draft" })).toMatchObject({ kind: "unavailable" });
    expect(await plan.outputs.prepareOutput({ creatorId, planId, approvedRevision: 99, stepId: "source-step", output: "draft" })).toMatchObject({ kind: "conflict", code: "approved_revision_conflict" });
    expect(await plan.adapter.prepare({ creatorId, planId, approvedRevision: 1 })).toEqual({ kind: "authorities_linked" });
    const cancelled = await plan.repository.cancel({ creatorId, clientMutationKey: id("cancel"), command: { operation: "cancel", planId, baseRevision: 1 } });
    expect(cancelled).toMatchObject({ kind: "ok", current: { review: "cancelled", revision: 2 } });
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${planId}:step:source-step` } })).toBe(1);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).autopostDraftId).not.toBeNull();
    expect(await plan.outputs.prepareOutput({ creatorId, planId, approvedRevision: 1, stepId: "source-step", output: "draft" })).toMatchObject({ kind: "conflict", code: "approved_revision_conflict" });

    const cancelledPlanId = id("plan_cancel_before"), cancelledMediaId = id("media_cancel_before");
    await seedMedia(db, creatorId, cancelledMediaId);
    const before = await createApprovedPlan(db, creatorId, cancelledPlanId, [cancelledMediaId]);
    expect(await before.repository.cancel({ creatorId, clientMutationKey: id("cancel_before"), command: { operation: "cancel", planId: cancelledPlanId, baseRevision: 1 } })).toMatchObject({ kind: "ok", current: { review: "cancelled" } });
    expect(await before.outputs.prepareOutput({ creatorId, planId: cancelledPlanId, approvedRevision: 1, stepId: "source-step", output: "draft" })).toMatchObject({ kind: "conflict", code: "approved_revision_conflict" });
    expect(await db.autopostDraft.count({ where: { creatorId, conversationalStepKey: `plan:${cancelledPlanId}:step:source-step` } })).toBe(0);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: cancelledMediaId } })).autopostDraftId).toBeNull();
  });

  it("guards concurrent legacy draft saves and media-changing patches with the same real reservation predicate", async () => {
    const creatorId = id("creator_legacy_races"), mediaSave = id("media_legacy_save"), mediaPatch = id("media_legacy_patch");
    const oldMediaA = id("media_patch_old_a"), oldMediaB = id("media_patch_old_b");
    await provisionCreator(db, creatorId); await seedMedia(db, creatorId, mediaSave); await seedMedia(db, creatorId, mediaPatch);
    await seedMedia(db, creatorId, oldMediaA); await seedMedia(db, creatorId, oldMediaB);
    const saveBarrier = barrier(2);
    const saveClientA = gateRealStagingRead(db, saveBarrier), saveClientB = gateRealStagingRead(await openPrisma(), saveBarrier);
    const saveResults = await Promise.allSettled([
      saveAutopostDraft(saveClientA, creatorId, { media_ids: [mediaSave], title: "Legacy A", generate: false }),
      saveAutopostDraft(saveClientB, creatorId, { media_ids: [mediaSave], title: "Legacy B", generate: false })
    ]);
    expect(saveResults.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(saveResults.filter(result => result.status === "rejected" && result.reason instanceof AutopostDraftValidationError)).toHaveLength(1);
    const savedDrafts = await db.autopostDraft.findMany({ where: { creatorId, mediaIds: { has: mediaSave } } });
    expect(savedDrafts).toHaveLength(1);
    const firstDraft = savedDrafts[0]!;
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaSave } })).autopostDraftId).toBe(firstDraft.id);
    const secondDraft = await db.autopostDraft.create({ data: { creatorId, title: "Patch A", mediaIds: [oldMediaA] } });
    const thirdDraft = await db.autopostDraft.create({ data: { creatorId, title: "Patch B", mediaIds: [oldMediaB] } });
    await Promise.all([
      db.mediaAsset.update({ where: { id: oldMediaA }, data: { autopostDraftId: secondDraft.id } }),
      db.mediaAsset.update({ where: { id: oldMediaB }, data: { autopostDraftId: thirdDraft.id } })
    ]);
    const patchBarrier = barrier(2);
    const patchClientA = gateRealStagingRead(db, patchBarrier), patchClientB = gateRealStagingRead(await openPrisma(), patchBarrier);
    const patchResults = await Promise.allSettled([
      patchAutopostDraft(patchClientA, creatorId, secondDraft.id, { media_ids: [mediaPatch] }),
      patchAutopostDraft(patchClientB, creatorId, thirdDraft.id, { media_ids: [mediaPatch] })
    ]);
    expect(patchResults.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(patchResults.filter(result => result.status === "rejected" && result.reason instanceof AutopostDraftValidationError)).toHaveLength(1);
    const patchedMedia = await db.mediaAsset.findUniqueOrThrow({ where: { id: mediaPatch } });
    const afterA = await db.autopostDraft.findUniqueOrThrow({ where: { id: secondDraft.id } });
    const afterB = await db.autopostDraft.findUniqueOrThrow({ where: { id: thirdDraft.id } });
    const winnerId = patchedMedia.autopostDraftId;
    expect([secondDraft.id, thirdDraft.id]).toContain(winnerId);
    const winner = winnerId === secondDraft.id ? afterA : afterB;
    const loser = winnerId === secondDraft.id ? afterB : afterA;
    const winnerOldMedia = winnerId === secondDraft.id ? oldMediaA : oldMediaB;
    const loserOldMedia = winnerId === secondDraft.id ? oldMediaB : oldMediaA;
    expect(winner.mediaIds).toEqual([mediaPatch]);
    expect(loser.mediaIds).toEqual([loserOldMedia]);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: winnerOldMedia } })).autopostDraftId).toBeNull();
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: loserOldMedia } })).autopostDraftId).toBe(loser.id);
    expect(await db.autopostDraft.count({ where: { id: { in: [secondDraft.id, thirdDraft.id] }, mediaIds: { has: mediaPatch } } })).toBe(1);
  });
});

async function createApprovedPlanView(prisma: PrismaClient, creatorId: string, planId: string) {
  const { context, repository } = repositoryFor(prisma);
  const outputs = createConversationalPreparationRepository(prisma);
  return { adapter: createPlanPreparationAdapter({ repository, outputs }), context, repository, outputs };
}
