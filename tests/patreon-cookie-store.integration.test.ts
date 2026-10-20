import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FilePatreonCookieStore } from "../src/auth/cookie-store.js";
import { DbPatreonCookieStore } from "../src/auth/cookie-store-db.js";
import { migratePatreonCookieVault } from "../src/auth/migrate-cookie-vault.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { runCookieProcess } from "./helpers/run-cookie-process.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-06 shared session PostgreSQL persistence", () => {
  let first: PrismaClient;
  let second: PrismaClient;
  const roots: string[] = [];
  const key = randomBytes(32).toString("base64");
  const encryption = new TokenEncryption(key);
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search ||
      !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Cookie tests require a disposable loopback database");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  }, 30_000);
  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    await Promise.all(roots.map((path) => rm(path, { recursive: true, force: true })));
  });
  const vault = () => new DbPatreonCookieStore(first, encryption);
  const worker = () => new DbPatreonCookieStore(second, encryption);
  async function creator() {
    const id = `ps06_${randomUUID()}`;
    await first.tenant.create({ data: { relayCreatorId: id } });
    return id;
  }
  async function local() {
    const root = await mkdtemp(join(tmpdir(), "relay-cookie-migration-"));
    roots.push(root);
    const sourcePath = join(root, "cookies.json");
    return { sourcePath, store: new FilePatreonCookieStore(sourcePath, encryption) };
  }

  it("shares encrypted updates, remote rejection and voluntary deletion across clients and restart", async () => {
    const a = await creator();
    const b = await creator();
    await Promise.all([vault().upsert(a, "session-a"), worker().upsert(b, "session-b")]);
    expect(await worker().getSessionId(a)).toBe("session-a");
    expect(await vault().getSessionId(b)).toBe("session-b");
    const record = await first.patreonSession.findUniqueOrThrow({ where: { creatorId: a } });
    expect(record.encryptedSessionId).not.toContain("session-a");
    await worker().markPatreonRejectedSession(a, "session-a");
    expect(await vault().getSessionId(a)).toBeNull();
    expect(await vault().hasRemoteRejectionMarker(a)).toBe(true);
    await vault().upsert(a, "fresh-a");
    await worker().markPatreonRejectedSession(a, "session-a");
    expect(await vault().getSessionId(a)).toBe("fresh-a");
    expect(await vault().hasRemoteRejectionMarker(a)).toBe(false);
    await worker().remove(a);
    expect(await new DbPatreonCookieStore(first, encryption).getSessionId(a)).toBeNull();
    expect(await vault().getSessionId(b)).toBe("session-b");
    expect(await first.patreonSession.findUniqueOrThrow({ where: { creatorId: a } })).toMatchObject({ encryptedSessionId: null, rejectedAt: null });
  });

  it("retains writes from two actual processes", async () => {
    const ids = await Promise.all(Array.from({ length: 4 }, creator));
    await Promise.all([runCookieProcess({ key, url: targetUrl, ids: ids.slice(0, 2) }), runCookieProcess({ key, url: targetUrl, ids: ids.slice(2) })]);
    for (const id of ids) expect(await vault().getSessionId(id)).toBe(`fixture-${id}`);
  }, 30_000);

  it("fails closed on corrupt stored material or an unknown key label", async () => {
    const id = await creator();
    await vault().upsert(id, "fixture-session");
    const record = await first.patreonSession.findUniqueOrThrow({ where: { creatorId: id } });
    await first.patreonSession.update({ where: { creatorId: id }, data: { encryptedSessionId: "" } });
    await expect(worker().getCookieLocalStatus(id)).rejects.toThrow("record is invalid");
    await first.patreonSession.update({ where: { creatorId: id }, data: { encryptedSessionId: record.encryptedSessionId, keyId: "unknown-key" } });
    await expect(worker().getSessionId(id)).rejects.toThrow("key is unavailable");
    expect((await first.patreonSession.findUniqueOrThrow({ where: { creatorId: id } })).encryptedSessionId).toBe(record.encryptedSessionId);
  });

  it("does not purge a fresh upload after reading an expired older record", async () => {
    const id = await creator();
    await vault().upsert(id, "expired");
    await first.patreonSession.update({ where: { creatorId: id }, data: { storedAt: new Date("2000-01-01") } });
    let refresh = true;
    const raced = first.$extends({ query: { patreonSession: {
      async findUnique({ args, query }) {
        const row = await query(args);
        if (args.where.creatorId === id && refresh) { refresh = false; await worker().upsert(id, "fresh"); }
        return row;
      }
    } } });
    expect(await new DbPatreonCookieStore(raced as unknown as PrismaClient, encryption).getSessionId(id)).toBeNull();
    expect(await vault().getSessionId(id)).toBe("fresh");
  });

  it("resumes a partial migration without extending age or restoring hosted deletions/rejections", async () => {
    const a = await creator();
    const missing = `ps06_${randomUUID()}`;
    const removed = await creator();
    const rejected = await creator();
    const source = await local();
    await source.store.upsert(a, "old-a");
    await source.store.upsert(missing, "old-b");
    await source.store.upsert(removed, "deleted-c");
    await source.store.markPatreonRejectedSession(rejected);
    const data = JSON.parse(await readFile(source.sourcePath, "utf8"));
    data.records[a].stored_at = "2000-01-01T00:00:00.000Z";
    await writeFile(source.sourcePath, JSON.stringify(data));
    const before = await readFile(source.sourcePath, "utf8");
    const migrate = () => migratePatreonCookieVault({ prisma: first, encryption, sourcePath: source.sourcePath, apply: true });
    await expect(migrate()).rejects.toThrow("existing studio");
    expect((await first.patreonSession.findUniqueOrThrow({ where: { creatorId: a } })).storedAt?.toISOString()).toBe("2000-01-01T00:00:00.000Z");
    expect(await vault().getCookieLocalStatus(a)).toBe("expired_local");
    expect(await vault().getSessionId(a)).toBeNull();
    await first.tenant.create({ data: { relayCreatorId: missing } });
    await worker().upsert(missing, "fresh-b");
    await worker().remove(removed);
    expect(await migrate()).toMatchObject({ imported: 1, preserved: 3 });
    expect(await worker().getSessionId(a)).toBeNull();
    expect(await vault().getSessionId(missing)).toBe("fresh-b");
    expect(await vault().getSessionId(removed)).toBeNull();
    expect(await worker().hasRemoteRejectionMarker(rejected)).toBe(true);
    await worker().remove(rejected);
    expect(await migrate()).toMatchObject({ imported: 0, preserved: 4 });
    expect(await vault().hasRemoteRejectionMarker(rejected)).toBe(false);
    expect(await readFile(source.sourcePath, "utf8")).toBe(before);
    expect(await readFile(`${source.sourcePath}.ps06-backup.json`, "utf8")).toBe(before);
    expect(before).not.toContain("old-a");
  });

  it("dry-runs without changing rows or making a backup; wrong keys fail before writes", async () => {
    const id = await creator();
    const source = await local();
    await source.store.upsert(id, "fixture-session");
    expect(await migratePatreonCookieVault({ prisma: first, encryption, sourcePath: source.sourcePath })).toMatchObject({ dryRun: true, wouldImport: 1, imported: 0 });
    expect(await first.patreonSession.findUnique({ where: { creatorId: id } })).toBeNull();
    await expect(stat(`${source.sourcePath}.ps06-backup.json`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(migratePatreonCookieVault({ prisma: first, encryption: new TokenEncryption(randomBytes(32).toString("base64")), sourcePath: source.sourcePath, apply: true })).rejects.toThrow();
    expect(await first.patreonSession.findUnique({ where: { creatorId: id } })).toBeNull();
  });

  it("serializes migration with an arriving hosted upload", async () => {
    const id = await creator();
    const source = await local();
    await source.store.upsert(id, "legacy-session");
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let pause = true;
    const paused = first.$extends({ query: { patreonSession: {
      async findUnique({ args, query }) {
        const row = await query(args);
        if (args.where.creatorId === id && pause) { pause = false; enter(); await gate; }
        return row;
      }
    } } });
    const migration = migratePatreonCookieVault({ prisma: paused as unknown as PrismaClient, encryption, sourcePath: source.sourcePath, apply: true });
    await entered;
    const upload = worker().upsert(id, "hosted-session");
    try {
      await vi.waitFor(async () => {
        const [row] = await first.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'
        ) AS waiting`;
        expect(row!.waiting).toBe(true);
      });
    } finally { release(); }
    await Promise.all([migration, upload]);
    expect(await vault().getSessionId(id)).toBe("hosted-session");
  }, 30_000);

  it("requires a real studio and denies browser-role table access", async () => {
    await expect(vault().upsert(`unmapped_${randomUUID()}`, "fixture-session")).rejects.toThrow();
    const role = `ps06_reader_${randomUUID().replaceAll("-", "")}`;
    await first.$executeRawUnsafe(`CREATE ROLE "${role}"`);
    try {
      await expect(first.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.patreonSession.findMany();
      })).rejects.toThrow();
      const [table] = await first.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'patreon_sessions'`;
      expect(table!.relrowsecurity).toBe(true);
    } finally { await first.$executeRawUnsafe(`DROP ROLE "${role}"`); }
  });
});
