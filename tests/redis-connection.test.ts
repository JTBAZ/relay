import * as net from "node:net";
import * as tls from "node:tls";
import { describe, expect, it } from "vitest";
import {
  getRedisConnectionOptions,
  getRedisConnectionOptionsIfConfigured,
  parseRedisUrl,
  type RedisConnectionOptions
} from "../src/lib/redis.js";

function probeTcp(opts: RedisConnectionOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const finishOk = (sock: net.Socket | tls.TLSSocket) => {
      sock.removeAllListeners();
      sock.destroy();
      resolve();
    };
    const onErr = (err: Error) => {
      reject(err);
    };

    if (opts.tls) {
      const sock = tls.connect(
        {
          host: opts.host,
          port: opts.port,
          servername: opts.host,
          rejectUnauthorized: true
        },
        () => finishOk(sock)
      );
      sock.on("error", onErr);
      sock.setTimeout(5000, () => {
        sock.destroy();
        reject(new Error("TLS connect timeout"));
      });
      return;
    }

    const sock = net.connect({ host: opts.host, port: opts.port }, () => finishOk(sock));
    sock.on("error", onErr);
    sock.setTimeout(5000, () => {
      sock.destroy();
      reject(new Error("TCP connect timeout"));
    });
  });
}

describe("parseRedisUrl", () => {
  it("parses redis://host:port", () => {
    expect(parseRedisUrl("redis://localhost:6379")).toEqual({
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
      tls: undefined
    });
  });

  it("defaults port to 6379", () => {
    expect(parseRedisUrl("redis://127.0.0.1")).toMatchObject({
      host: "127.0.0.1",
      port: 6379
    });
  });

  it("parses db from path", () => {
    expect(parseRedisUrl("redis://localhost:6379/3")).toMatchObject({ db: 3 });
  });

  it("parses username and password", () => {
    expect(
      parseRedisUrl("redis://u:p%40ss@example.com:6380/0")
    ).toMatchObject({
      host: "example.com",
      port: 6380,
      username: "u",
      password: "p@ss",
      db: 0
    });
  });

  it("parses password-only userinfo", () => {
    expect(parseRedisUrl("redis://:secret@10.0.0.1/1")).toMatchObject({
      host: "10.0.0.1",
      password: "secret",
      db: 1,
      username: undefined
    });
  });

  it("sets tls for rediss://", () => {
    expect(parseRedisUrl("rediss://cache.example:6380")).toEqual({
      host: "cache.example",
      port: 6380,
      username: undefined,
      password: undefined,
      db: undefined,
      tls: {}
    });
  });

  it("rejects empty string", () => {
    expect(() => parseRedisUrl("   ")).toThrow(/empty/);
  });

  it("rejects non-redis scheme", () => {
    expect(() => parseRedisUrl("http://localhost:6379")).toThrow(/redis/);
  });

  it("rejects bad db path", () => {
    expect(() => parseRedisUrl("redis://localhost/abc")).toThrow(/DB index/);
  });
});

describe("getRedisConnectionOptions", () => {
  it("throws when REDIS_URL is missing", () => {
    expect(() => getRedisConnectionOptions({})).toThrow(/REDIS_URL is not set/);
  });

  it("reads REDIS_URL from env bag", () => {
    expect(
      getRedisConnectionOptions({ REDIS_URL: "redis://127.0.0.1:9" })
    ).toMatchObject({ host: "127.0.0.1", port: 9 });
  });
});

describe("getRedisConnectionOptionsIfConfigured", () => {
  it("returns undefined when unset", () => {
    expect(getRedisConnectionOptionsIfConfigured({})).toBeUndefined();
  });
});

const runRedisProbe =
  process.env.SKIP_REDIS_IT === "0" && Boolean(process.env.REDIS_URL?.trim());

describe.skipIf(!runRedisProbe)("redis URL probe (set SKIP_REDIS_IT=0 and REDIS_URL)", () => {
  it("TCP/TLS reaches host:port from REDIS_URL", async () => {
    const opts = parseRedisUrl(process.env.REDIS_URL!.trim());
    await expect(probeTcp(opts)).resolves.toBeUndefined();
  });
});
