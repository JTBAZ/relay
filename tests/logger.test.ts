import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/lib/logger.js";
import { TEST_RAW_TOKEN_LEAK_MARK } from "../src/lib/pii-scrub.js";

async function flushPino(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
}

describe("createLogger", () => {
  it("redacts lowercase authorization in nested req.headers", async () => {
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const log = createLogger({
      name: "test",
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "development" }
    });

    log.info(
      { req: { headers: { authorization: "Bearer super-secret-token" } } },
      "incoming"
    );

    await flushPino();
    const line = chunks.join("");
    expect(line).not.toContain("super-secret-token");
    expect(line).toContain("[Redacted]");
    expect(line).toContain("incoming");
  });

  it("redacts Authorization when the key is capitalized", async () => {
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const log = createLogger({
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "development" }
    });

    log.info({ headers: { Authorization: "Bearer other-secret" } }, "out");

    await flushPino();
    const line = chunks.join("");
    expect(line).not.toContain("other-secret");
    expect(line).toContain("[Redacted]");
  });

  it("P2-obs-008: err serializer redacts token fields and token patterns in message", async () => {
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const log = createLogger({
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "development" }
    });

    const err = new Error(`oauth failed access_token=${TEST_RAW_TOKEN_LEAK_MARK}`) as Error & {
      access_token: string;
    };
    err.access_token = TEST_RAW_TOKEN_LEAK_MARK;
    log.info({ err }, "handler_error");

    await flushPino();
    const line = chunks.join("");
    expect(line).not.toContain(TEST_RAW_TOKEN_LEAK_MARK);
    const row = JSON.parse(line.trim()) as { err: { access_token?: string; message: string }; msg: string };
    expect(row.msg).toBe("handler_error");
    expect(row.err.access_token).toBe("[Redacted]");
    expect(row.err.message).toContain("access_token=[Redacted]");
    expect(Object.prototype.hasOwnProperty.call(row.err, "raw")).toBe(false);
  });

  it("P2-obs-008: req serializer redacts forwarded-for and remoteAddress", async () => {
    const chunks: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const log = createLogger({
      destination: dest,
      env: { LOG_LEVEL: "info", NODE_ENV: "development" }
    });

    const fakeReq = {
      method: "GET",
      originalUrl: "/api/v1/x",
      headers: {
        "x-forwarded-for": "203.0.113.1",
        host: "localhost"
      },
      socket: { remoteAddress: "192.168.1.2", remotePort: 12345 }
    };

    log.info({ req: fakeReq as unknown as import("node:http").IncomingMessage }, "with_req");

    await flushPino();
    const line = chunks.join("");
    expect(line).not.toContain("203.0.113");
    expect(line).not.toContain("192.168");
    expect(line).toContain("[Redacted]");
  });
});
