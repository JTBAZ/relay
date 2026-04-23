import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryIdempotencyStore
} from "../../src/middleware/idempotency-store.js";
import {
  buildIdempotencyMiddleware
} from "../../src/middleware/idempotency-middleware.js";

interface ServerHandle {
  url: string;
  close(): Promise<void>;
  callCount(): number;
}

async function startServer(opts: {
  store: InMemoryIdempotencyStore;
  handler?: (req: express.Request, res: express.Response) => void;
}): Promise<ServerHandle> {
  const app = express();
  app.use(express.json());
  let calls = 0;
  app.post(
    "/echo",
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
    // Pre-reserve the slot manually so the next request sees a held lock.
    await store.tryReserve("echo\0concurrent-key", 60_000);
    handle = await startServer({ store });
    const r = await fetch(`${handle.url}/echo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "concurrent-key"
      },
      body: "{}"
    });
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("IDEMPOTENCY_IN_FLIGHT");
    expect(r.headers.get("retry-after")).toBe("1");
  });
});
