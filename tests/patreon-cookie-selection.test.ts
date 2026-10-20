import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPatreonCookieStore } from "../src/auth/cookie-store-selection.js";
import { FilePatreonCookieStore } from "../src/auth/cookie-store.js";
import { DbPatreonCookieStore } from "../src/auth/cookie-store-db.js";
import { TokenEncryption } from "../src/lib/crypto.js";

const input = { filePath: ".fixture/cookies.json", encryption: new TokenEncryption(randomBytes(32).toString("base64")) };
describe("API/worker Patreon vault selection", () => {
  it("retains local file mode and selects the shared adapter explicitly", () => {
    expect(createPatreonCookieStore(input, {})).toBeInstanceOf(FilePatreonCookieStore);
    expect(createPatreonCookieStore({ ...input, prisma: {} as never }, { RELAY_DB_STORE_PATREON_COOKIE: "1" })).toBeInstanceOf(DbPatreonCookieStore);
  });
  it("defaults hosted Prisma runtimes to shared storage and rejects a file override", () => {
    expect(createPatreonCookieStore({ ...input, prisma: {} as never }, { NODE_ENV: "production" })).toBeInstanceOf(DbPatreonCookieStore);
    expect(() => createPatreonCookieStore({ ...input, prisma: {} as never, dbEnabled: false }, { NODE_ENV: "production" })).toThrow("Shared Patreon session storage is required");
  });
  it("requires a consistent explicit setting before splitting API and worker processes", () => {
    expect(() => createPatreonCookieStore({ ...input, prisma: {} as never, requireShared: true }, {})).toThrow("Shared Patreon session storage is required");
    for (const split of ["0", "1"]) {
      expect(createPatreonCookieStore({ ...input, prisma: {} as never, requireShared: true }, {
        RELAY_DB_STORE_PATREON_COOKIE: "1", RELAY_SPLIT_WORKER_PROCESS: split
      })).toBeInstanceOf(DbPatreonCookieStore);
    }
  });
  it("fails on missing Prisma or invalid configuration instead of falling back", () => {
    expect(() => createPatreonCookieStore(input, { RELAY_DB_STORE_PATREON_COOKIE: "1" })).toThrow("requires config.prisma");
    expect(() => createPatreonCookieStore(input, { RELAY_DB_STORE_PATREON_COOKIE: "typo" })).toThrow("must be a boolean");
  });
  it("surfaces database failures without reading a local fallback", async () => {
    const failure = new Error("Database unavailable");
    const store = createPatreonCookieStore({ ...input, dbEnabled: true,
      prisma: { patreonSession: { findUnique: vi.fn().mockRejectedValue(failure) } } as never
    }, {});
    await expect(store.getSessionId("creator")).rejects.toBe(failure);
  });
});
