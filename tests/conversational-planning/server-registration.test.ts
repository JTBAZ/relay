import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import express, { type Application } from "express";
import request from "supertest";
import * as http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanningModelContext } from "../../src/conversational-planning/intent.js";
import { createConfiguredPlanningProvider, createApp, mountRelayJsonBodyParsers } from "../../src/server.js";
import type { ProviderBudget } from "../../src/gallery-editor/provider.js";
import { CONVERSATIONAL_PLANNING_BASE } from "../../src/conversational-planning/routes.js";
import { FileProviderBudget } from "../../src/gallery-editor/budget.js";
import { providerBudgetForRoute } from "../../src/gallery-editor/routes.js";
import * as galleryRoutesModule from "../../src/gallery-editor/routes.js";
import * as contextModule from "../../src/conversational-planning/context.js";
import * as persistenceModule from "../../src/conversational-planning/persistence.js";
import * as materializerModule from "../../src/conversational-planning/materializer.js";
import * as serviceModule from "../../src/conversational-planning/service.js";
import * as intentModule from "../../src/conversational-planning/intent.js";
import * as planningRoutesModule from "../../src/conversational-planning/routes.js";
import type { PrismaClient } from "@prisma/client";

const validEnv = () => ({
  RELAY_CONVERSATIONAL_PLANNING_ENABLED: "1",
  RELAY_CONVERSATIONAL_PLANNING_AI_ENABLED: "1",
  RELAY_CONVERSATIONAL_PLANNING_ALLOWLIST: " creator-1,creator-2 ",
  LIBRARY_EDITOR_INTERPRETER_MODEL: "exact-model-v2",
  LIBRARY_EDITOR_MODEL_PRICING_JSON: JSON.stringify({ "exact-model-v2": { inputUsdPerMillion: 1, outputUsdPerMillion: 2 } }),
  OPENAI_API_KEY: "test-key"
});
function baseConfig(tempDir: string) {
  return {
    patreon_client_id: "c", patreon_client_secret: "s", relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"), ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"), export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"), gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    analytics_store_path: join(tempDir, "analytics.json"), clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"), payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"), deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}
const context: PlanningModelContext = {
  request_clock: { received_at_utc: "2026-10-17T12:00:00.000Z", local_date: "2026-10-17", timezone: "UTC" }, plan_revision: null,
  selected: { media_ids: [], post_ids: [], work_id: null }, media: [], posts: [], templates: [], destinations: [], creator_timezone: "UTC",
  editable_nodes: [], allowed_request_kinds: ["primary_draft", "teaser", "followup"], allowed_social_actions: [], prior_clarification: null
};
const output = JSON.stringify({ base_revision: null, outcome: "clarification", question: "Which source?", requests: [] });

async function sendChunked(app: Application, path: string, body: string) {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Expected TCP listener");
  try {
    return await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: address.port, path, method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } }, res => {
        const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject); req.end(body);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("CP server registration", () => {
  it("keeps AI unavailable unless exact feature, allowlist, model, pricing, and key configuration are present", async () => {
    const budget = { reserve: vi.fn(async () => "reservation-1"), settle: vi.fn(async () => {}) } as unknown as ProviderBudget;
    const construct = vi.spyOn(intentModule, "createPlanningProvider");
    expect(createConfiguredPlanningProvider(budget, {})).toBeNull();
    expect(createConfiguredPlanningProvider(budget, { ...validEnv(), RELAY_CONVERSATIONAL_PLANNING_AI_ENABLED: "0" })).toBeNull();
    expect(createConfiguredPlanningProvider(budget, { ...validEnv(), LIBRARY_EDITOR_INTERPRETER_MODEL: "" })).toBeNull();
    expect(createConfiguredPlanningProvider(budget, { ...validEnv(), OPENAI_API_KEY: "  " })).toBeNull();
    expect(createConfiguredPlanningProvider(budget, { ...validEnv(), LIBRARY_EDITOR_MODEL_PRICING_JSON: JSON.stringify({ "other-model": { inputUsdPerMillion: 1, outputUsdPerMillion: 2 } }) })).toBeNull();
    expect(createConfiguredPlanningProvider(budget, { ...validEnv(), LIBRARY_EDITOR_MODEL_PRICING_JSON: JSON.stringify({ "exact-model-v2": { inputUsdPerMillion: 1, outputUsdPerMillion: 2, cachedInputUsdPerMillion: 3 } }) })).toBeNull();
    expect(createConfiguredPlanningProvider(budget, { ...validEnv(), RELAY_CONVERSATIONAL_PLANNING_ALLOWLIST: "*" })).toBeNull();
    expect(budget.reserve).not.toHaveBeenCalled();
    expect(budget.settle).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
    construct.mockRestore();

    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: output }] }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }));
    const provider = createConfiguredPlanningProvider(budget, validEnv(), fetch as unknown as typeof globalThis.fetch);
    expect(provider).not.toBeNull();
    const response = await provider!.respond({ request: "Which post?", context, responseSchema: {} as never, maxOutputTokens: 3000, signal: new AbortController().signal });
    expect(JSON.parse(response.text)).toEqual(JSON.parse(output));
    expect(budget.reserve).toHaveBeenCalledWith(expect.objectContaining({ model: "exact-model-v2", phase: "development" }));
    expect(budget.settle).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(requestBody.model).toBe("exact-model-v2");
  });

  it("shares an injected gallery budget and preserves its existing fallback path", () => {
    const injected = { reserve: vi.fn(async () => "id"), settle: vi.fn(async () => {}) } as unknown as ProviderBudget;
    expect(providerBudgetForRoute({ providerBudget: injected })).toBe(injected);
    const legacy = providerBudgetForRoute({});
    expect(legacy).toBeInstanceOf(FileProviderBudget);
    expect((legacy as FileProviderBudget).path).toBe(join(process.env.RELAY_GALLERY_EDITOR_DATA_DIR ?? ".relay-data", "gallery-editor-budget.json"));
  });

  it("passes the same constructed budget through both real createApp registrations", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cp-wire-"));
    const env = validEnv();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const galleryRegistration = vi.spyOn(galleryRoutesModule, "registerGalleryEditorRoutes").mockImplementation(() => {});
    const planningRegistration = vi.spyOn(planningRoutesModule, "registerConversationalPlanningRoutes").mockImplementation(() => {});
    const lookup = { hasAutopostEntitlement: vi.fn(async () => true), lookup: {} };
    const source = { lookup, loadContext: vi.fn(async () => ({ context: {}, sourceFingerprint: "fingerprint" })), buildRequestContext: vi.fn(async () => ({ kind: "unavailable", code: "source_scope" })) };
    vi.spyOn(contextModule, "createPlanningContextSource").mockReturnValue(source as never);
    const planningRepository = { get: vi.fn() };
    vi.spyOn(persistenceModule, "createConversationalPlanRepository").mockReturnValue(planningRepository as never);
    const preparationOutputs = { prepareOutput: vi.fn() };
    const createOutputs = vi.spyOn(persistenceModule, "createConversationalPreparationRepository").mockReturnValue(preparationOutputs as never);
    const preparation = { prepare: vi.fn() };
    const createAdapter = vi.spyOn(materializerModule, "createPlanPreparationAdapter").mockReturnValue(preparation as never);
    const createService = vi.spyOn(serviceModule, "createConversationalPlanningService").mockReturnValue({} as never);
    const provider = { respond: vi.fn() };
    const planningProvider = vi.spyOn(intentModule, "createPlanningProvider").mockReturnValue(provider as never);
    const prisma = {} as PrismaClient;
    const config = {
      ...baseConfig(tempDir), prisma, relay_db_store_identity: true,
      relay_db_store_canonical: false, relay_db_store_watermark: false, relay_db_store_sync_health: false,
      relay_db_store_overrides: false, relay_db_store_collections: false, relay_db_store_saved_filters: false,
      relay_db_store_layout: false, relay_db_store_dlq: false, relay_db_store_events: false,
      relay_db_store_analytics: false, relay_db_store_patron_engagement: false, relay_db_store_clone: false,
      relay_db_store_payments: false, relay_db_store_migration: false, relay_db_store_deploy: false,
      relay_db_store_creator_oauth: false
    };
    createApp(config);
    const galleryBudget = galleryRegistration.mock.calls[0]?.[1].providerBudget;
    expect(galleryBudget).toBeInstanceOf(FileProviderBudget);
    expect(planningProvider).toHaveBeenCalledWith(expect.objectContaining({ budget: galleryBudget, modelId: "exact-model-v2", phase: "development" }));
    const planningOptions = planningRegistration.mock.calls[0]?.[1];
    expect(planningOptions?.service).toBeDefined();
    expect(planningOptions?.settings.aiAvailable).toBe(true);
    expect(planningOptions?.settings.preparationAvailable).toBe(true);
    expect(planningOptions?.databaseIdentityReady).toBe(true);
    expect(planningOptions?.prisma).toBe(prisma);
    expect(typeof planningOptions?.assertStudioMutationAllowed).toBe("function");
    expect(createOutputs).toHaveBeenCalledWith(prisma);
    expect(createAdapter).toHaveBeenCalledWith({ repository: planningRepository, outputs: preparationOutputs });
    expect(createService).toHaveBeenCalledWith(expect.objectContaining({ repository: planningRepository, context: source, preparation, provider: provider }));
  });

  it("keeps the actual preparation route guard closed when the feature is disabled despite a configured adapter", async () => {
    const adapter = { prepare: vi.fn(async () => ({ kind: "authorities_linked" as const })) };
    const service = {
      resumePreparation: vi.fn(async (...args: unknown[]) => {
        void args;
        return adapter.prepare();
      })
    };
    const session = { token: "opaque-session", user_id: "membership-1", creator_id: "creator-1", tier_ids: [], expires_at: "2030-01-01T00:00:00.000Z" };
    const prisma = {
      tenantMembership: { findUnique: vi.fn(async () => ({ accountId: "account-1", role: "owner" })) },
      account: { findUnique: vi.fn(async () => ({ id: "account-1", supabaseUserId: "supabase-user-1", primaryRelayCreatorId: "creator-1" })) },
      tenant: { findUnique: vi.fn(async () => ({ id: "tenant-1", relayCreatorId: "creator-1" })) },
      $executeRawUnsafe: vi.fn(async () => 1)
    } as unknown as PrismaClient;
    const identityService = { resolveSession: vi.fn(async () => session) } as never;
    const app = express();
    app.use(CONVERSATIONAL_PLANNING_BASE, planningRoutesModule.createConversationalPlanningJsonBodyParser());
    app.use(express.json());
    planningRoutesModule.registerConversationalPlanningRoutes(app, {
      prisma, identityService, service: service as never,
      lookup: { hasAutopostEntitlement: vi.fn(async () => true) },
      databaseIdentityReady: true,
      settings: { enabled: "0", allowlist: "creator-1", preparationAvailable: true },
      assertStudioMutationAllowed: vi.fn(async () => true)
    });
    const result = await request(app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans/plan-1/resume-preparation`).set("Authorization", "Bearer opaque-session").send({ approvedRevision: 4 });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FEATURE_DISABLED");
    expect(service.resumePreparation).not.toHaveBeenCalled();
    expect(adapter.prepare).not.toHaveBeenCalled();
  });

  it("mounts the bounded prefix parser before global JSON parsing in the actual createApp path", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cp-server-"));
    const { app } = createApp(baseConfig(tempDir));
    const tooLarge = JSON.stringify({ payload: "x".repeat(17 * 1024) });
    const sized = await request(app).post(`${CONVERSATIONAL_PLANNING_BASE}/plans`).set("content-type", "application/json").send(tooLarge);
    expect(sized.status).toBe(413);
    expect(sized.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(sized.headers["cache-control"]).toBe("private, no-store");
    const chunked = await sendChunked(app, `${CONVERSATIONAL_PLANNING_BASE}/plans`, tooLarge);
    expect(chunked.status).toBe(413);
    expect(chunked.headers["cache-control"]).toBe("private, no-store");
    const unavailable = await request(app).get(`${CONVERSATIONAL_PLANNING_BASE}/capabilities`);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe("DATABASE_IDENTITY_REQUIRED");
    expect(unavailable.headers["cache-control"]).toBe("private, no-store");
    const unrelated = await request(app).post("/api/v1/not-a-route").send({ ok: true });
    expect(unrelated.status).toBe(404);
  });

  it("keeps the exported parser mount safe when an upstream parser already populated req.body", async () => {
    const app = express();
    app.use(express.json());
    mountRelayJsonBodyParsers(app);
    app.post(`${CONVERSATIONAL_PLANNING_BASE}/parser-probe`, (req, res) => res.json(req.body));
    app.post("/ordinary-parser-probe", (req, res) => res.json(req.body));
    expect((await request(app).post(`${CONVERSATIONAL_PLANNING_BASE}/parser-probe`).send({ later: true })).body).toEqual({ later: true });
    expect((await request(app).post("/ordinary-parser-probe").send({ ordinary: true })).body).toEqual({ ordinary: true });
  });
});
