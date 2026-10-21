import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbPatreonTokenStore } from "../src/auth/token-store-db.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { expiredCredential, proveSharedRotation } from "./helpers/patreon-token-rotation.js";
import { runTokenProcess } from "./helpers/run-token-process.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-07 shared PostgreSQL token rotation", () => {
  let first: PrismaClient, second: PrismaClient;
  const key = randomBytes(32).toString("base64");
  const encryption = new TokenEncryption(key);
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Token tests require a disposable loopback database");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
  });
  const creator = () => `ps07_${randomUUID()}`;
  const store = (db: PrismaClient) => new DbPatreonTokenStore(db, encryption);
  it("serializes two services before reading and rotating a shared credential", async () => {
    await proveSharedRotation(store(first), store(second), creator());
  });
  it("coordinates actual API/worker processes against shared PostgreSQL", async () => {
    const id = creator();
    await store(first).upsert(expiredCredential(id));
    const root = await mkdtemp(join(tmpdir(), "relay-ps07-token-pg-")), log = join(root, "rotations.log");
    await Promise.all([runTokenProcess({ key, url: targetUrl!, log, creatorId: id }), runTokenProcess({ key, url: targetUrl!, log, creatorId: id })]);
    expect((await readFile(log, "utf8")).trim().split("\n")).toEqual(["rotated"]);
    expect((await store(second).getByCreatorId(id))?.provider_user_id).toBe(`${id}-fixture-user`);
  }, 30_000);
  it("rolls back a failed rotation, releases the lock, and preserves other creators", async () => {
    const id = creator(), other = creator();
    await Promise.all([store(first).upsert(expiredCredential(id)), store(second).upsert({ ...expiredCredential(other), provider_user_id: `${other}-user` })]);
    await expect(store(first).updateForCreator(id, async () => { throw new Error("synthetic failure"); })).rejects.toThrow("synthetic failure");
    expect(await store(second).getByCreatorId(id)).toEqual(expiredCredential(id));
    await store(second).updateForCreator(id, async (row) => ({ ...row!, access_token: "retry-success" }));
    expect((await store(first).getByCreatorId(id))!.access_token).toBe("retry-success");
    expect((await store(first).getByCreatorId(other))!.access_token).toBe("old-access");
  });
});
