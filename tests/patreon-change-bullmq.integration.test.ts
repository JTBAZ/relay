import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PatreonChangeWorkStore } from "../src/patreon/patreon-change-work.js";
import { processPatreonChanges } from "../src/patreon/patreon-change-worker.js";
import { RELAY_JOB_QUEUE_NAMES, type PatreonChangeWorkJobData } from "../src/jobs/queue-names.js";
import { registerRelayBullMqRepeatSchedulers } from "../src/jobs/schedule-bullmq-repeat.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL, redisUrl = process.env.PATREON_CHANGE_TEST_REDIS_URL;
describe.skipIf(!targetUrl || !redisUrl)("PS-08 real BullMQ and PostgreSQL recovery", () => {
  let db: PrismaClient, redis: Redis;
  beforeAll(async () => {
    const target = new URL(targetUrl!), cache = new URL(redisUrl!);
    if (target.hostname !== "127.0.0.1" || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(target.pathname) || target.search || cache.hostname !== "127.0.0.1" || cache.port !== "49953") throw new Error("Use task-owned disposable PostgreSQL and Redis");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    await redis.ping();
  });
  afterAll(async () => { await db?.$disconnect(); await redis?.quit(); });
  async function setup() {
    const id = randomUUID(), creatorId = `ps08_bull_${id}`, prefix = `ps08-${id}`;
    await db.tenant.create({ data: { relayCreatorId: creatorId } });
    const store = new PatreonChangeWorkStore(db);
    await store.accept([{ creatorId, campaignId: "99", resourceType: "member", resourceId: "member-fixture", eventType: "members:update" }], "fixture-hash");
    const row = await db.patreonChangeWork.findFirstOrThrow({ where: { creatorId } });
    await db.patreonChangeWork.update({ where: { id: row.id }, data: { dueAt: new Date(0) } });
    const queue = new Queue<PatreonChangeWorkJobData>(RELAY_JOB_QUEUE_NAMES.PATREON_CHANGE_WORK, { connection: redis, prefix });
    return { store, row, prefix, queue };
  }
  it("registers the production recovery tick independently of incremental autosync", async () => {
    const close = await registerRelayBullMqRepeatSchedulers({ redis, prisma: db, env: { REDIS_URL: redisUrl!, RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS: "0" } });
    const queue = new Queue(RELAY_JOB_QUEUE_NAMES.PATREON_CHANGE_WORK, { connection: redis });
    const members = new Queue(RELAY_JOB_QUEUE_NAMES.PATREON_MEMBER_RECONCILE, { connection: redis });
    try {
      expect(await queue.getRepeatableJobs()).toEqual(expect.arrayContaining([expect.objectContaining({ every: "5000" })]));
      expect(await members.getRepeatableJobs()).toEqual(expect.arrayContaining([expect.objectContaining({ every: "60000" })]));
    }
    finally { await close(); await queue.obliterate({ force: true }); await queue.close(); await members.obliterate({ force: true }); await members.close(); }
  });
  it("recovers a committed receipt after queued dispatch is lost and a new repeat worker starts", async () => {
    const r = await setup();
    await r.queue.add("lost-dispatch", { workId: r.row.id });
    await r.queue.obliterate({ force: true });
    const execute = vi.fn().mockResolvedValue(undefined);
    const consumer = new Worker<PatreonChangeWorkJobData>(RELAY_JOB_QUEUE_NAMES.PATREON_CHANGE_WORK, (job) => processPatreonChanges(new PatreonChangeWorkStore(db), execute, job.data.workId), { connection: redis, prefix: r.prefix });
    try {
      await r.queue.add("recovery-tick", { workId: r.row.id }, { repeat: { every: 200 }, removeOnComplete: true });
      await vi.waitFor(async () => { expect((await db.patreonChangeWork.findUniqueOrThrow({ where: { id: r.row.id } })).status).toBe("completed"); }, { timeout: 10_000 });
      expect(execute).toHaveBeenCalledTimes(1);
      const jobs = await r.queue.getJobs(["delayed", "waiting", "completed"]);
      for (const job of jobs) expect(Object.keys(job.data)).toEqual(["workId"]);
    } finally { await consumer.close(); await r.queue.obliterate({ force: true }); await r.queue.close(); }
  });
  it("keeps duplicate jobs on two actual workers from executing one resource twice", async () => {
    const r = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn(async () => { await gate; });
    const completed: string[] = [];
    const consumers = [1, 2].map(() => {
      const worker = new Worker<PatreonChangeWorkJobData>(RELAY_JOB_QUEUE_NAMES.PATREON_CHANGE_WORK, (job) => processPatreonChanges(r.store, execute, job.data.workId), { connection: redis, prefix: r.prefix });
      worker.on("completed", (job) => { completed.push(job.id!); }); return worker;
    });
    try {
      await Promise.all([r.queue.add("one", { workId: r.row.id }), r.queue.add("two", { workId: r.row.id })]);
      await vi.waitFor(() => { expect(execute).toHaveBeenCalledTimes(1); expect(completed.length).toBe(1); }, { timeout: 10_000 });
      release();
      await vi.waitFor(() => expect(completed).toHaveLength(2), { timeout: 10_000 });
      expect(execute).toHaveBeenCalledTimes(1);
      expect((await db.patreonChangeWork.findUniqueOrThrow({ where: { id: r.row.id } })).status).toBe("completed");
    } finally { release(); await Promise.all(consumers.map((worker) => worker.close())); await r.queue.obliterate({ force: true }); await r.queue.close(); }
  });
});
