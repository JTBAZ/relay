import express from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  create: vi.fn(), read: vi.fn(), revise: vi.fn(), apply: vi.fn(), undo: vi.fn(),
}));
vi.mock("../src/gallery-editor/service.js", () => ({
  GalleryEditorService: class { constructor() { return service; } },
}));

import { editorHistoryReader, registerGalleryEditorRoutes } from "../src/gallery-editor/routes.js";
import type { EditorState } from "../src/gallery-editor/state.js";

const base = "/api/v1/gallery/editor";
const principal = { creatorId: "alice", actorId: "actor-a" };
const emptyCart = { revision: 0, actions: [], items: [], dependencies: {}, conflicts: [], notice: "notice" };
const session = { id: "session-a", creatorId: "alice", revision: 0, context: { selectedPostIds: [] }, messages: [], cart: emptyCart };

function app(options: { storesReady?: boolean; authorize?: ReturnType<typeof vi.fn>; prisma?: unknown } = {}) {
  const server = express(); server.use(express.json());
  const authorize = options.authorize ?? vi.fn(async () => principal);
  registerGalleryEditorRoutes(server, {
    prisma: (options.prisma ?? {}) as PrismaClient,
    authorize,
    traceId: () => "trace-test",
    storageRoot: ".",
    storesReady: options.storesReady ?? true,
  });
  return { server, authorize };
}

beforeEach(() => {
  vi.stubEnv("RELAY_GALLERY_EDITOR_ENABLED", "1");
  vi.stubEnv("RELAY_GALLERY_EDITOR_ALLOWLIST", "alice");
  vi.stubEnv("RELAY_GALLERY_EDITOR_AI_ENABLED", "0");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("LIBRARY_EDITOR_MODEL_PRICING_JSON", "");
  vi.clearAllMocks();
  service.create.mockResolvedValue(session);
  service.read.mockResolvedValue(session);
  service.revise.mockResolvedValue(session);
  service.apply.mockResolvedValue({ id: "receipt-a" });
  service.undo.mockResolvedValue({ id: "receipt-a", reversedAt: "2026-01-01T00:00:00.000Z" });
});
afterEach(() => vi.unstubAllEnvs());

describe("gallery editor route access", () => {
  it("does not run a handler when authorization declines, including receipt reads", async () => {
    const authorize = vi.fn(async (_req, res) => { res.status(401).json({ error: { code: "UNAUTHORIZED" } }); return null; });
    const { server } = app({ authorize });
    const response = await request(server).get(`${base}/sessions/session-a`);
    expect(response.status).toBe(401);
    expect(authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
    expect(service.read).not.toHaveBeenCalled();
  });

  it("rejects creator spoofing in both body and query before touching the service", async () => {
    const { server } = app();
    const body = await request(server).post(`${base}/sessions`).send({ creator_id: "bob", context: { selectedPostIds: [] } });
    const query = await request(server).get(`${base}/sessions/session-a?creator_id=bob`);
    for (const response of [body, query]) {
      expect(response.status).toBe(403);
      expect(response.body.error).toMatchObject({ code: "FORBIDDEN", trace_id: "trace-test" });
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
    expect(service.create).not.toHaveBeenCalled();
    expect(service.read).not.toHaveBeenCalled();
  });

  it("requires both the account allowlist and ready stores for mutation, while reporting capabilities", async () => {
    vi.stubEnv("RELAY_GALLERY_EDITOR_ALLOWLIST", "bob");
    const blocked = app();
    const capabilities = await request(blocked.server).get(`${base}/capabilities`);
    expect(capabilities.body.data).toMatchObject({ enabled: false, aiAvailable: false });
    const denied = await request(blocked.server).post(`${base}/sessions`).send({ context: { selectedPostIds: [] } });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("EDITOR_DISABLED");
    vi.stubEnv("RELAY_GALLERY_EDITOR_ALLOWLIST", "alice");
    const notReady = app({ storesReady: false });
    const unavailable = await request(notReady.server).post(`${base}/sessions`).send({ context: { selectedPostIds: [] } });
    expect(unavailable.status).toBe(403);
    expect(unavailable.body.error.code).toBe("EDITOR_DISABLED");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("serves a manual session while AI is disabled and makes no cart write on turn", async () => {
    const { server } = app();
    const read = await request(server).get(`${base}/sessions/session-a`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ data: { id: "session-a" }, meta: { trace_id: "trace-test" } });
    expect(service.read).toHaveBeenCalledWith("alice", "actor-a", "session-a");
    service.read.mockClear();
    const turn = await request(server).post(`${base}/sessions/session-a/turn`).send({ revision: 0, message: "Rename it" });
    expect(turn.status).toBe(503);
    expect(turn.body.error.code).toBe("AI_DISABLED");
    expect(service.read).not.toHaveBeenCalled();
    expect(service.revise).not.toHaveBeenCalled();
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("reads receipts and permits scoped Undo after the feature flag is off", async () => {
    vi.stubEnv("RELAY_GALLERY_EDITOR_ENABLED", "0");
    service.read.mockResolvedValueOnce({ ...session, lastReceipt: { id: "receipt-a", sessionId: "session-a" } });
    const { server, authorize } = app();
    const read = await request(server).get(`${base}/sessions/session-a`);
    const undo = await request(server).post(`${base}/commits/receipt-a/undo`).send({});
    expect(read.status).toBe(200);
    expect(read.body.data.lastReceipt.id).toBe("receipt-a");
    expect(undo.status).toBe(200);
    expect(undo.body.data.receipt).toMatchObject({ id: "receipt-a", reversedAt: expect.any(String) });
    expect(service.read).toHaveBeenCalledWith("alice", "actor-a", "session-a");
    expect(service.undo).toHaveBeenCalledWith("alice", "actor-a", "receipt-a");
    expect(authorize.mock.calls.map(call => call[2])).toEqual([false, true]);
    const revise = await request(server).patch(`${base}/sessions/session-a`).send({ revision: 0, actions: [] });
    expect(revise.body.error.code).toBe("EDITOR_DISABLED");
    expect(service.revise).not.toHaveBeenCalled();
  });
});

function snapshot(): EditorState {
  return {
    scope: { posts: ["p1"], works: ["w1"], series: ["s1"], collections: [] },
    tables: {
      posts: [{ id: "p1" }], versions: [{ postId: "p1", title: "Current source" }],
      presentations: [{ postId: "p1", titleMode: "inherit_work", relayTitle: null }], overrides: [],
      works: [{ id: "w1", title: "Current work", titleMode: "inherit_series" }],
      workMembers: [{ postId: "p1", creativeWorkId: "w1" }],
      series: [{ id: "s1", title: "O'Brien's \"Old\" Series" }],
      seriesMembers: [{ creativeSeriesId: "s1", creativeWorkId: "w1", partLabel: "Part One" }],
      collections: [], collectionPosts: [],
    },
  } as EditorState;
}

describe("gallery editor receipt title history", () => {
  it("matches a composed inherited old series alias, with quoted names kept in SQL parameters", async () => {
    const old = snapshot();
    const current = structuredClone(old); current.tables.series[0].title = "New Series";
    const queryRaw = vi.fn(async (..._args: unknown[]) => [{ before: old, after: current }]);
    const history = editorHistoryReader({ $queryRawUnsafe: queryRaw } as unknown as PrismaClient);
    const query = "O'Brien's \"Old\" Series — Part One";
    expect(await history.search("alice", query)).toEqual([{ postId: "p1", matchedTitle: query, provenance: "historical" }]);
    expect(queryRaw.mock.calls[0][0]).toContain("creator_id = $1");
    expect(queryRaw.mock.calls[0][0]).not.toContain("O'Brien");
    expect(queryRaw.mock.calls[0].slice(1, 3)).toEqual(["alice", "%O'Brien's \"Old\" Series%"]);
    expect(queryRaw.mock.calls[0][3]).toContain('\\"Old');
    expect(queryRaw.mock.calls[0][3]).not.toBe(queryRaw.mock.calls[0][2]);
  });

  it("does not match prompt-like text or return partial titles, and bounds receipt search", async () => {
    const old = snapshot();
    const queryRaw = vi.fn(async (..._args: unknown[]) => [{ before: old, after: old }]);
    const history = editorHistoryReader({ $queryRawUnsafe: queryRaw } as unknown as PrismaClient);
    expect(await history.search("alice", "O'Brien's \"Old\" Series — Missing Part")).toEqual([]);
    expect(await history.search("alice", "  ")).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    queryRaw.mockResolvedValueOnce(Array.from({ length: 1001 }, () => ({ before: old, after: old })));
    await expect(history.search("alice", "O'Brien")).rejects.toMatchObject({ code: "HISTORY_LIMIT" });
  });
});
