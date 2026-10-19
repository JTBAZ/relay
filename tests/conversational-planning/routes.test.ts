import express, { type Application } from "express";
import request from "supertest";
import * as http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../src/identity/identity-service.js";
import type { TrustedLookup } from "../../src/conversational-planning/compiler.js";
import type { ConversationalPlanningService } from "../../src/conversational-planning/service.js";
import { CONVERSATIONAL_PLANNING_BASE, createConversationalPlanningJsonBodyParser, registerConversationalPlanningRoutes } from "../../src/conversational-planning/routes.js";

const creatorId = "creator-1";
const traceHeader = { "x-trace-id": "route-test-1" };
function setup(options: { enabled?: string; allowlist?: string; aiEnabled?: string; aiAvailable?: boolean; preparationAvailable?: boolean; entitlement?: boolean; accountCreator?: string | null; tenantCreator?: string | null; tenantExists?: boolean; session?: boolean; databaseIdentityReady?: boolean; guardAllowed?: boolean; parserAfterGlobal?: boolean; serviceResult?: unknown } = {}) {
  const session = { token: "opaque-session", user_id: "membership-1", creator_id: creatorId, tier_ids: [], expires_at: "2030-01-01T00:00:00.000Z" };
  const prisma = {
    tenantMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === session.user_id ? { accountId: "account-1", role: "owner" } : null),
      count: vi.fn(async () => 0), findMany: vi.fn(async () => [])
    },
    account: { findUnique: vi.fn(async () => ({ id: "account-1", supabaseUserId: "supabase-user-1", primaryRelayCreatorId: options.accountCreator === undefined ? creatorId : options.accountCreator })) },
    tenant: { findUnique: vi.fn(async () => options.tenantExists === false ? null : { id: "tenant-1", relayCreatorId: options.tenantCreator ?? creatorId }) },
    $executeRawUnsafe: vi.fn(async () => 1)
  } as unknown as PrismaClient;
  const identityService = {
    resolveSession: vi.fn(async token => token === "opaque-session" && options.session !== false ? session : null)
  } as unknown as IdentityService;
  const service = {
    create: vi.fn(async () => options.serviceResult ?? { kind: "clarification", question: "Which source?" }),
    revise: vi.fn(async () => options.serviceResult ?? { kind: "clarification", question: "Which source?" }),
    get: vi.fn(async () => options.serviceResult ?? { kind: "error", code: "not_found" }),
    list: vi.fn(async () => options.serviceResult ?? { kind: "ok", items: [], nextCursor: null }),
    preview: vi.fn(async () => options.serviceResult ?? { kind: "ok", planId: "plan-1", revision: 0, review: "proposed", readiness: { status: "ready", issues: [], pointerCount: 0 } }),
    approve: vi.fn(async () => options.serviceResult ?? { kind: "error", code: "not_found" }),
    cancel: vi.fn(async () => options.serviceResult ?? { kind: "error", code: "not_found" }),
    confirm: vi.fn(async () => options.serviceResult ?? { kind: "preparation_unavailable" }),
    resumePreparation: vi.fn(async () => options.serviceResult ?? { kind: "preparation_unavailable" })
  } as unknown as ConversationalPlanningService;
  const lookup = { hasAutopostEntitlement: vi.fn(async () => options.entitlement ?? true) } as unknown as Pick<TrustedLookup, "hasAutopostEntitlement">;
  const guard = vi.fn(async (_req, _res, _traceId, _creatorId) => options.guardAllowed ?? true);
  const app: Application = express();
  if (options.parserAfterGlobal) app.use(express.json());
  app.use(CONVERSATIONAL_PLANNING_BASE, createConversationalPlanningJsonBodyParser());
  if (!options.parserAfterGlobal) app.use(express.json());
  registerConversationalPlanningRoutes(app, { prisma, identityService, service, lookup, databaseIdentityReady: options.databaseIdentityReady ?? true, settings: { enabled: options.enabled ?? "1", allowlist: options.allowlist ?? creatorId, aiEnabled: options.aiEnabled ?? "1", aiAvailable: options.aiAvailable ?? true, preparationAvailable: options.preparationAvailable ?? false }, assertStudioMutationAllowed: guard });
  return { app, prisma, identityService, service, lookup, guard };
}
const auth = { Authorization: "Bearer opaque-session" };

async function sendChunked(app: Application, path: string, body: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; json: unknown }> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Expected TCP listener");
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: address.port, path, method: "POST", headers: { ...auth, "Content-Type": "application/json", "Transfer-Encoding": "chunked" } }, res => {
        const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8"); let json: unknown = text; try { json = JSON.parse(text); } catch { /* keep text */ }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
        });
      });
      req.on("error", reject); req.end(body);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
afterEach(() => vi.restoreAllMocks());

describe("conversational planning routes", () => {
  it("uses the real requireAccount path and rejects absent, invalid, or unlinked sessions", async () => {
    const h = setup();
    expect((await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(traceHeader)).status).toBe(401);
    expect((await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, ...traceHeader })).status).toBe(200);
    expect(h.identityService.resolveSession).toHaveBeenCalledWith("opaque-session", { cleanupExpired: false });
    const invalidSession = setup({ session: false });
    expect((await request(invalidSession.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, ...traceHeader })).body.error.code).toBe("AUTH_ERROR");
    const unlinked = setup(); (unlinked.prisma.tenantMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await request(unlinked.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, ...traceHeader })).status).toBe(401);
    expect(h.service.list).toHaveBeenCalledOnce();
  });

  it("rejects file-backed identity, absent creator linkage, and absent or mismatched Tenant", async () => {
    const file = setup({ databaseIdentityReady: false });
    const fileDenied = await request(file.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth);
    expect(fileDenied.body.error.code).toBe("DATABASE_IDENTITY_REQUIRED");
    expect(file.identityService.resolveSession).not.toHaveBeenCalled();
    const unlinked = setup({ accountCreator: null });
    expect((await request(unlinked.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth)).body.error.code).toBe("CREATOR_NOT_LINKED");
    const noTenant = setup({ tenantExists: false });
    expect((await request(noTenant.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth)).body.error.code).toBe("CREATOR_NOT_PROVISIONED");
    const mismatch = setup({ tenantCreator: "creator-other" });
    expect((await request(mismatch.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth)).body.error.code).toBe("CREATOR_NOT_PROVISIONED");
    expect(noTenant.service.list).not.toHaveBeenCalled();
  });

  it("checks the allowlist exactly and fails closed on disabled or wildcard configuration", async () => {
    const disabled = setup({ enabled: "0" });
    expect((await request(disabled.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth)).body.error.code).toBe("FEATURE_DISABLED");
    expect(disabled.service.list).not.toHaveBeenCalled();
    const notListed = setup({ allowlist: " creator-10, creator-11 " });
    expect((await request(notListed.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth)).status).toBe(403);
    const wildcard = setup({ allowlist: "*" });
    expect((await request(wildcard.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth)).status).toBe(403);
    const caps = await request(disabled.app).get(`${CONVERSATIONAL_PLANNING_BASE}/capabilities`).set(auth);
    expect(caps.body.data).toMatchObject({ enabled: false, ai_enabled: false, ai_available: false, preparation_available: false, entitled: true });
    expect(caps.headers["cache-control"]).toBe("private, no-store");
    const noProvider = setup({ aiEnabled: "1", aiAvailable: false });
    const noProviderCaps = await request(noProvider.app).get(`${CONVERSATIONAL_PLANNING_BASE}/capabilities`).set(auth);
    expect(noProviderCaps.body.data).toMatchObject({ enabled: true, ai_enabled: true, ai_available: false });
    const unlistedCaps = setup({ allowlist: "creator-other" });
    const unlisted = await request(unlistedCaps.app).get(`${CONVERSATIONAL_PLANNING_BASE}/capabilities`).set(auth);
    expect(unlisted.body.data).toMatchObject({ enabled: false, ai_enabled: false, ai_available: false });
  });

  it("requires effective Autopost on reads and writes without reaching the service", async () => {
    const h = setup({ entitlement: false });
    const result = await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1`).set({ ...auth, ...traceHeader });
    expect(result.status).toBe(403);
    expect(result.body.error).toMatchObject({ code: "PLAN_REQUIRED", trace_id: "route-test-1", details: [{ field: "required_plan", issue: "autopost" }] });
    expect(h.service.get).not.toHaveBeenCalled();
    expect(h.lookup.hasAutopostEntitlement).toHaveBeenCalledWith(creatorId);
  });

  it("returns private no-store trace envelopes and keeps GETs side-effect-free", async () => {
    const h = setup();
    const outcomes = await Promise.all([
      request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, ...traceHeader }),
      request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1`).set({ ...auth, ...traceHeader }),
      request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/preview`).set({ ...auth, ...traceHeader }),
      request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/capabilities`).set({ ...auth, ...traceHeader })
    ]);
    for (const result of outcomes) {
      expect(result.headers["cache-control"]).toBe("private, no-store");
      expect(result.body.meta?.trace_id ?? result.body.error?.trace_id).toBe("route-test-1");
    }
    expect(h.service.list).toHaveBeenCalledOnce(); expect(h.service.get).toHaveBeenCalledOnce(); expect(h.service.preview).toHaveBeenCalledOnce();
    expect(h.guard).not.toHaveBeenCalled();
    expect((h.prisma as unknown as { creatorPlanEntitlement?: unknown }).creatorPlanEntitlement).toBeUndefined();
  });

  it("rejects strict keys, enum values, revisions and list query data before service work", async () => {
    const h = setup();
    const base = { clientMutationKey: "k1", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [] };
    const extra = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth).send({ ...base, creatorId });
    expect(extra.status).toBe(400);
    const invalidRevise = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/revise`).set(auth).send({ mode: "automatic", clientMutationKey: "k2", baseRevision: 0 });
    expect(invalidRevise.status).toBe(400);
    const invalidReview = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/approve`).set(auth).send({ clientMutationKey: "k3", baseRevision: -1 });
    expect(invalidReview.status).toBe(400);
    const badPatch = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/revise`).set(auth).send({ mode: "manual", clientMutationKey: "k4", baseRevision: 0, patch: [{ step_id: "draft-1", field: "status", value: "approved" }] });
    expect(badPatch.status).toBe(400);
    const emptyPatch = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/revise`).set(auth).send({ mode: "manual", clientMutationKey: "k-empty-patch", baseRevision: 0, patch: [] });
    expect(emptyPatch.status).toBe(400);
    expect(emptyPatch.body.error.code).toBe("INVALID_REQUEST");
    const invalidQuery = await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans?limit=101&unexpected=1`).set(auth);
    expect(invalidQuery.status).toBe(400);
    const extraReadQuery = await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1?creatorId=other`).set(auth);
    expect(extraReadQuery.status).toBe(400);
    const extraCapabilityQuery = await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/capabilities?model=secret`).set(auth);
    expect(extraCapabilityQuery.status).toBe(400);
    const extraPreviewQuery = await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/preview?source=client`).set(auth);
    expect(extraPreviewQuery.status).toBe(400);
    const extraMutationQuery = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/cancel?creatorId=other`).set(auth).send({ clientMutationKey: "k5", baseRevision: 0 });
    expect(extraMutationQuery.status).toBe(400);
    const badCursor = Buffer.from(JSON.stringify({ updatedAt: "October 16, 2026", id: "plan-1" })).toString("base64url");
    const malformedCursor = await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans?cursor=${badCursor}`).set(auth);
    expect(malformedCursor.status).toBe(400);
    expect(h.service.create).not.toHaveBeenCalled(); expect(h.service.revise).not.toHaveBeenCalled(); expect(h.service.approve).not.toHaveBeenCalled(); expect(h.service.list).not.toHaveBeenCalled();
    expect(h.service.get).not.toHaveBeenCalled(); expect(h.service.preview).not.toHaveBeenCalled(); expect(h.service.cancel).not.toHaveBeenCalled();
  });

  it("runs the injected Studio write guard only for authenticated mutations", async () => {
    const h = setup();
    await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth);
    const response = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth).send({ clientMutationKey: "k", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [] });
    expect(response.status).toBe(200);
    expect(h.guard).toHaveBeenCalledOnce();
    expect(h.guard).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(String), creatorId);
    const blocked = setup({ guardAllowed: false });
    await request(blocked.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth).send({ clientMutationKey: "k", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [] });
    expect(blocked.service.create).not.toHaveBeenCalled();
  });

  it("requires the exact resume body, normal mutation guards, and real preparation availability", async () => {
    const path = `${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/resume-preparation`;
    const unavailable = setup();
    const missingAdapter = await request(unavailable.app).post(path).set({ ...auth, ...traceHeader }).send({ approvedRevision: 4 });
    expect(missingAdapter.status).toBe(503); expect(missingAdapter.body.error.code).toBe("PREPARATION_UNAVAILABLE");
    expect(unavailable.service.resumePreparation).not.toHaveBeenCalled();

    const available = setup({ preparationAvailable: true, serviceResult: { kind: "stored", current: { plan_id: "plan-1", revision: 4, review: "approved_for_preparation" }, recordedRevision: 4, pointers: [] } });
    const result = await request(available.app).post(path).set({ ...auth, ...traceHeader }).send({ approvedRevision: 4 });
    expect(result.status).toBe(200); expect(result.body.data).toMatchObject({ recordedRevision: 4 });
    expect(available.service.resumePreparation).toHaveBeenCalledWith({ accountId: "account-1", creatorId }, "plan-1", { approvedRevision: 4 });
    expect(available.guard).toHaveBeenCalledOnce();
    for (const body of [{ approvedRevision: -1 }, { approvedRevision: 1.2 }, { approvedRevision: 1, clientMutationKey: "no-ledger" }, { approvedRevision: 1, snapshot: {} }]) {
      const invalid = await request(available.app).post(path).set({ ...auth, ...traceHeader }).send(body);
      expect(invalid.status).toBe(400);
    }
    expect(available.service.resumePreparation).toHaveBeenCalledOnce();
    const noEntitlement = setup({ preparationAvailable: true, entitlement: false });
    expect((await request(noEntitlement.app).post(path).set({ ...auth, ...traceHeader }).send({ approvedRevision: 4 })).status).toBe(403);
    expect(noEntitlement.service.resumePreparation).not.toHaveBeenCalled();
    const disabled = setup({ preparationAvailable: true, enabled: "0" });
    expect((await request(disabled.app).post(path).set({ ...auth, ...traceHeader }).send({ approvedRevision: 4 })).status).toBe(403);
    expect(disabled.service.resumePreparation).not.toHaveBeenCalled();
    const locked = setup({ preparationAvailable: true, guardAllowed: false });
    expect((await request(locked.app).post(path).set({ ...auth, ...traceHeader }).send({ approvedRevision: 4 })).status).toBe(423);
    expect(locked.service.resumePreparation).not.toHaveBeenCalled();
  });

  it("never invokes resume through read-only routes and preserves service adapter-unavailable mapping", async () => {
    const h = setup({ preparationAvailable: true });
    await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1`).set(auth);
    await request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/preview`).set(auth);
    expect(h.service.resumePreparation).not.toHaveBeenCalled();
    const unavailable = await request(h.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/resume-preparation`).set(auth).send({ approvedRevision: 2 });
    expect(unavailable.status).toBe(503); expect(unavailable.body.error.code).toBe("PREPARATION_UNAVAILABLE");
    expect(unavailable.headers["cache-control"]).toBe("private, no-store");
    const partial = setup({ preparationAvailable: true, serviceResult: { kind: "error", code: "authority_gap" } });
    const partialResult = await request(partial.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/resume-preparation`).set(auth).send({ approvedRevision: 2 });
    expect(partialResult.status).toBe(422); expect(partialResult.body.error.code).toBe("AUTHORITY_GAP");
  });

  it("allows recorded AI replay while AI is disabled and delegates new AI availability to the service", async () => {
    const replay = setup({ aiEnabled: "0", serviceResult: { kind: "stored", current: { plan_id: "plan-1", revision: 0 }, recordedRevision: 0, pointers: [] } });
    const replayed = await request(replay.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth).send({ clientMutationKey: "replay-key", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [] });
    expect(replayed.status).toBe(200); expect(replay.service.create).toHaveBeenCalledOnce();
    const unavailable = setup({ aiEnabled: "0", serviceResult: { kind: "error", code: "provider_unavailable" } });
    const result = await request(unavailable.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set(auth).send({ clientMutationKey: "new-key", latestRequest: "Create a draft", selectedPostIds: [], selectedMediaIds: [] });
    expect(result.status).toBe(503); expect(result.body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("makes absent and foreign plan IDs indistinguishable", async () => {
    const h = setup({ serviceResult: { kind: "error", code: "not_found" } });
    const [missing, foreign] = await Promise.all(["no-such-plan", "another-creators-plan"].map(planId => request(h.app).get(`${CONVERSATIONAL_PLANNING_BASE}/plans/${planId}`).set(auth)));
    expect(missing.status).toBe(404); expect(foreign.status).toBe(404);
    expect(missing.body.error.code).toBe(foreign.body.error.code);
    expect(missing.body.error.message).toBe(foreign.body.error.message);
  });

  it("bounds already-parsed JSON and oversized declared Content-Length", async () => {
    const parsed = setup({ parserAfterGlobal: true });
    const payload = JSON.stringify({ clientMutationKey: "k", latestRequest: "x".repeat(16 * 1024), selectedPostIds: [], selectedMediaIds: [] });
    const result = await request(parsed.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, "Content-Type": "application/json" }).send(payload);
    expect(result.status).toBe(413); expect(result.headers["cache-control"]).toBe("private, no-store"); expect(parsed.service.create).not.toHaveBeenCalled();
    const requestLimit = setup();
    const tooLong = await request(requestLimit.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, "Content-Type": "application/json" }).send({ clientMutationKey: "k", latestRequest: "x".repeat(4001), selectedPostIds: [], selectedMediaIds: [] });
    expect(tooLong.status).toBe(413); expect(tooLong.body.error.code).toBe("REQUEST_TOO_LARGE"); expect(requestLimit.service.create).not.toHaveBeenCalled();
    const header = setup();
    const declared = await request(header.app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set({ ...auth, "Content-Type": "application/json", "Content-Length": String(16 * 1024 + 1) }).send("{}");
    expect(declared.status).toBe(413); expect(header.service.create).not.toHaveBeenCalled();
  });

  it("bounds chunked request bodies without relying on Content-Length", async () => {
    const h = setup();
    const result = await sendChunked(h.app, `${CONVERSATIONAL_PLANNING_BASE}/plans`, `{"latestRequest":"${"x".repeat(16 * 1024)}"}`);
    expect(result.status).toBe(413);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect((result.json as { error: { code: string } }).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(h.service.create).not.toHaveBeenCalled();
  });
});

