import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePatronCollectionsStore } from "../../src/gallery/patron-collections-store.js";
import {
  InMemoryIdempotencyStore
} from "../../src/middleware/idempotency-store.js";
import {
  buildIdempotencyMiddleware,
  markIdempotencyPreWriteFailure
} from "../../src/middleware/idempotency-middleware.js";

interface ServerHandle {
  url: string;
  close(): Promise<void>;
  callCount(): number;
}

async function startServer(opts: {
  store: InMemoryIdempotencyStore;
  callerId?: (req: express.Request) => string | undefined;
  handler?: (req: express.Request, res: express.Response) => void;
}): Promise<ServerHandle> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { relayRateLimitKey?: string }).relayRateLimitKey =
      opts.callerId ? opts.callerId(req) : "account-1";
    next();
  });
  let calls = 0;
  const router = express.Router();
  router.all(
    ["/echo", "/collections/:collection_id/entries"],
    buildIdempotencyMiddleware({ store: opts.store, scope: "echo" }),
    (req, res) => {
      calls += 1;
      if (opts.handler) {
        opts.handler(req, res);
        return;
      }
      // Default: 201 with body echoed + a serial number to detect re-execution.
      res.setHeader("Cache-Control", "private, no-store");
      res.status(201).json({ ok: true, n: calls, body: req.body });
    }
  );
  app.use("/first", router);
  app.use("/second", router);
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
    callCount: () => calls
  };
}

describe("idempotency middleware", () => {
  let handle: ServerHandle;

  afterEach(async () => {
    if (handle) await handle.close();
    vi.restoreAllMocks();
  });

  it("absent header is a no-op pass-through (handler runs normally)", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore() });
    const r1 = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 })
    });
    expect(r1.status).toBe(201);
    const r2 = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 })
    });
    expect(r2.status).toBe(201);
    // Without the header we re-execute every time; both calls hit the handler.
    expect(handle.callCount()).toBe(2);
  });

  it("rejects malformed Idempotency-Key with 400", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore() });
    const r = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "x".repeat(300)
      },
      body: "{}"
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("retries an explicitly known pre-write failure after recovery", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore(), handler: (_req, res) => {
      if (handle.callCount() === 1) {
        markIdempotencyPreWriteFailure(res);
        res.status(503).json({ error: "Read unavailable" });
        return;
      }
      res.status(201).json({ ok: true });
    } });
    const options = {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "read-recovery" }, body: "{}"
    };
    expect((await fetch(`${handle.url}/echo`, options)).status).toBe(503);
    const retry = await fetch(`${handle.url}/echo`, options);
    expect(retry.status).toBe(201);
    expect(retry.headers.get("idempotency-replayed")).toBeNull();
    const replay = await fetch(`${handle.url}/echo`, options);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(handle.callCount()).toBe(2);
  });

  it("replays the original response on retry with the same key + body", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore() });
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "abc-123"
    };
    const body = JSON.stringify({ x: 1, y: 2 });
    const r1 = await fetch(`${handle.url}/echo`, { method: "POST", headers, body });
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { n: number };
    const r2 = await fetch(`${handle.url}/echo`, { method: "POST", headers, body });
    expect(r2.status).toBe(201);
    const j2 = (await r2.json()) as { n: number };
    // n captures call count; if we replayed the cached body, n2 must equal n1.
    expect(j2.n).toBe(j1.n);
    expect(handle.callCount()).toBe(1);
    expect(r2.headers.get("idempotency-replayed")).toBe("true");
  });

  it.each([201, 400])("still replays status %s if a handler marks it as pre-write", async (status) => {
    handle = await startServer({ store: new InMemoryIdempotencyStore(), handler: (_req, res) => {
      markIdempotencyPreWriteFailure(res);
      res.status(status).json({ status });
    } });
    const options = { method: "POST", headers: { "Idempotency-Key": "status-guard" } };
    expect((await fetch(`${handle.url}/echo`, options)).status).toBe(status);
    const replay = await fetch(`${handle.url}/echo`, options);
    expect(replay.status).toBe(status);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(handle.callCount()).toBe(1);
  });

  it("keeps the reservation protected if releasing a pre-write failure fails", async () => {
    const store = new InMemoryIdempotencyStore();
    vi.spyOn(store, "release").mockRejectedValue(new Error("Store unavailable"));
    handle = await startServer({ store, handler: (_req, res) => {
      markIdempotencyPreWriteFailure(res);
      res.status(503).json({ error: "Read unavailable" });
    } });
    const options = { method: "POST", headers: { "Idempotency-Key": "release-failure" } };
    expect((await fetch(`${handle.url}/echo`, options)).status).toBe(503);
    expect((await fetch(`${handle.url}/echo`, options)).status).toBe(409);
    expect(handle.callCount()).toBe(1);
  });

  it.each([false, true])("protects an unclassified 500, including a committed write (%s)", async (committed) => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-idem-uncertain-"));
    const collections = new FilePatronCollectionsStore(join(tempDir, "collections.json"));
    handle = await startServer({ store: new InMemoryIdempotencyStore(), handler: async (_req, res) => {
      try {
        if (committed) await collections.createCollection("creator-1", "account-1", "Saved art");
        throw new Error("Follow-up unavailable");
      } catch {
        res.status(500).json({ error: "Follow-up unavailable" });
      }
    } });
    const options = {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "uncertain", "Idempotency-Pre-Write-Failure": "true" },
      body: JSON.stringify({ idempotencyPreWriteFailure: true })
    };
    const first = await fetch(`${handle.url}/echo`, options);
    expect(first.status).toBe(500);
    const original = await first.json();
    const retry = await fetch(`${handle.url}/echo`, options);
    expect(retry.status).toBe(500);
    expect(retry.headers.get("idempotency-replayed")).toBe("true");
    expect(await retry.json()).toEqual(original);
    expect(handle.callCount()).toBe(1);
    expect((await collections.load()).collections).toHaveLength(committed ? 1 : 0);
  });

  it("rejects same-key + different-body with 422 IDEMPOTENCY_KEY_REUSE", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore() });
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "abc-456"
    };
    await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ x: 1 })
    });
    const r2 = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ x: 2 })
    });
    expect(r2.status).toBe(422);
    const body = (await r2.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  it("treats structurally-identical bodies (different key order) as the same hash", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore() });
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "abc-canon"
    };
    const r1 = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ a: 1, b: 2 })
    });
    expect(r1.status).toBe(201);
    const r2 = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ b: 2, a: 1 })
    });
    expect(r2.status).toBe(201);
    expect(handle.callCount()).toBe(1);
  });

  it("returns 409 IDEMPOTENCY_IN_FLIGHT when a concurrent request still holds the lock", async () => {
    const store = new InMemoryIdempotencyStore();
    let finishFirst!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    handle = await startServer({ store, handler: (_req, res) => {
      finishFirst = () => res.status(201).json({ ok: true });
      started();
    } });
    const options = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "concurrent-key"
      },
      body: "{}"
    };
    const first = fetch(`${handle.url}/echo`, options);
    await pending;
    try {
      const r = await fetch(`${handle.url}/echo`, options);
      expect(r.status).toBe(409);
      const body = (await r.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("IDEMPOTENCY_IN_FLIGHT");
      expect(r.headers.get("retry-after")).toBe("1");
      expect(handle.callCount()).toBe(1);
    } finally {
      finishFirst();
      await first;
    }
  });

  it("keeps a running write reserved after disconnect and replays its eventual result", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-idem-disconnect-"));
    const collections = new FilePatronCollectionsStore(join(tempDir, "collections.json"));
    let started!: () => void;
    let disconnected!: () => void;
    let releaseWrite!: () => void;
    let finished!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    const closed = new Promise<void>((resolve) => { disconnected = resolve; });
    const writeAllowed = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const writeFinished = new Promise<void>((resolve) => { finished = resolve; });
    handle = await startServer({
      store: new InMemoryIdempotencyStore(),
      handler: async (_req, res) => {
        const first = handle.callCount() === 1;
        if (first) {
          res.once("close", disconnected);
          started();
          await writeAllowed;
        }
        const collection = await collections.createCollection("creator-1", "account-1", "Saved art");
        res.status(201).json({ collection });
        if (first) finished();
      }
    });
    const controller = new AbortController();
    const options = {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "create-collection" },
      body: "{}"
    };
    const original = fetch(`${handle.url}/echo`, { ...options, signal: controller.signal }).catch(error => error);
    await pending;
    controller.abort();
    expect(await original).toMatchObject({ name: "AbortError" });
    await closed;
    try {
      const retry = await fetch(`${handle.url}/echo`, options);
      expect(retry.status).toBe(409);
      expect((await retry.json()).error.code).toBe("IDEMPOTENCY_IN_FLIGHT");
      expect(handle.callCount()).toBe(1);
      expect((await collections.load()).collections).toHaveLength(0);
      releaseWrite();
      await writeFinished;
      const saved = (await collections.load()).collections;
      expect(saved).toHaveLength(1);
      const replay = await fetch(`${handle.url}/echo`, options);
      expect(replay.status).toBe(201);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      expect(await replay.json()).toEqual({ collection: saved[0] });
      expect(handle.callCount()).toBe(1);
      expect((await collections.load()).collections).toHaveLength(1);
    } finally {
      releaseWrite();
      await writeFinished;
    }
  });

  it.each([
    { order: "before", preWriteFailure: false },
    { order: "after", preWriteFailure: false },
    { order: "before", preWriteFailure: true },
    { order: "after", preWriteFailure: true }
  ])("ignores an expired request completing $order the newer request (pre-write failure: $preWriteFailure)", async ({ order, preWriteFailure }) => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    let startedA!: () => void;
    let startedB!: () => void;
    let finishA = () => {};
    let finishB = () => {};
    const pendingA = new Promise<void>((resolve) => { startedA = resolve; });
    const pendingB = new Promise<void>((resolve) => { startedB = resolve; });
    handle = await startServer({
      store: new InMemoryIdempotencyStore(),
      handler: (req, res) => {
        const finish = () => {
          if (res.writableEnded) return;
          const failed = req.body.owner === "A" && preWriteFailure;
          if (failed) markIdempotencyPreWriteFailure(res);
          res.status(failed ? 503 : 201).json({ owner: req.body.owner });
        };
        if (req.body.owner === "A") { finishA = finish; startedA(); }
        else { finishB = finish; startedB(); }
      }
    });
    const send = (owner: string) => fetch(`${handle.url}/echo`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "expired-key" },
      body: JSON.stringify({ owner })
    });
    const a = send("A");
    let b: Promise<Response> | undefined;
    await pendingA;
    try {
      clock.mockReturnValue(now + 60_001);
      b = send("B");
      await pendingB;
      if (order === "before") {
        finishA();
        expect((await a).status).toBe(preWriteFailure ? 503 : 201);
        const retry = await send("B");
        expect(retry.status).toBe(409);
        expect((await retry.json()).error.code).toBe("IDEMPOTENCY_IN_FLIGHT");
      }
      finishB();
      expect((await b).status).toBe(201);
      if (order === "after") {
        finishA();
        expect((await a).status).toBe(preWriteFailure ? 503 : 201);
      }
      const replay = await send("B");
      expect(replay.status).toBe(201);
      expect(replay.headers.get("idempotency-replayed")).toBe("true");
      expect(await replay.json()).toEqual({ owner: "B" });
      const changedBody = await send("A");
      expect(changedBody.status).toBe(422);
      expect((await changedBody.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSE");
      expect(handle.callCount()).toBe(2);
    } finally {
      finishA();
      finishB();
      await Promise.all([a, b]);
    }
  });

  it.each(["{}", '{"different":true}'])("isolates another caller from replay and body mismatch (%s)", async (body) => {
    handle = await startServer({ store: new InMemoryIdempotencyStore(), callerId: req => req.header("x-test-caller") });
    const headers = { "content-type": "application/json", "Idempotency-Key": "shared-key" };
    const first = await fetch(`${handle.url}/echo`, {
      method: "POST", headers: { ...headers, "x-test-caller": "alice" }, body: "{}"
    });
    expect(first.status).toBe(201);
    const second = await fetch(`${handle.url}/echo`, {
      method: "POST", headers: { ...headers, "x-test-caller": "bob" }, body
    });
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotency-replayed")).toBeNull();
    expect(handle.callCount()).toBe(2);
  });

  it("does not share in-flight reservations across callers", async () => {
    let finishAlice!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    handle = await startServer({
      store: new InMemoryIdempotencyStore(), callerId: req => req.header("x-test-caller"),
      handler: (req, res) => {
        if (req.header("x-test-caller") === "alice") {
          finishAlice = () => res.status(201).json({ owner: "alice" });
          started();
        } else res.status(201).json({ owner: "bob" });
      }
    });
    const headers = { "content-type": "application/json", "Idempotency-Key": "shared-key" };
    const alice = fetch(`${handle.url}/echo`, { method: "POST", headers: { ...headers, "x-test-caller": "alice" }, body: "{}" });
    await pending;
    try {
      const bob = await fetch(`${handle.url}/echo`, { method: "POST", headers: { ...headers, "x-test-caller": "bob" }, body: "{}" });
      expect(bob.status).toBe(201);
      expect(await bob.json()).toEqual({ owner: "bob" });
      expect(handle.callCount()).toBe(2);
    } finally {
      finishAlice();
      await alice;
    }
  });

  it.each([
    ["POST", "/collections/a/entries", "POST", "/collections/b/entries"],
    ["POST", "/echo", "PUT", "/echo"],
    ["POST", "/first/echo", "POST", "/second/echo"]
  ])("isolates %s %s from %s %s", async (firstMethod, firstPath, secondMethod, secondPath) => {
    handle = await startServer({ store: new InMemoryIdempotencyStore() });
    const options = { headers: { "content-type": "application/json", "Idempotency-Key": "shared-key" }, body: "{}" };
    expect((await fetch(`${handle.url}${firstPath}`, { ...options, method: firstMethod })).status).toBe(201);
    const second = await fetch(`${handle.url}${secondPath}`, { ...options, method: secondMethod });
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotency-replayed")).toBeNull();
    expect(handle.callCount()).toBe(2);
  });

  it("requires trusted caller context only when a replay key is supplied", async () => {
    handle = await startServer({ store: new InMemoryIdempotencyStore(), callerId: () => undefined });
    const keyed = await fetch(`${handle.url}/echo`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "shared-key" }, body: "{}"
    });
    expect(keyed.status).toBe(500);
    expect((await keyed.json()).error.code).toBe("INTERNAL");
    expect(handle.callCount()).toBe(0);
    expect((await fetch(`${handle.url}/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(201);
    expect(handle.callCount()).toBe(1);
  });
});
