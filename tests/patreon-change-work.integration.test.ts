import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PatreonChangeWorkStore, PATREON_CHANGE_MAX_WAIT_MS } from "../src/patreon/patreon-change-work.js";
import { processPatreonChanges } from "../src/patreon/patreon-change-worker.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-08 durable change work PostgreSQL", () => {
  let db: PrismaClient, worker: PrismaClient;
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (url.hostname !== "127.0.0.1" || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname) || url.search) throw new Error("Use a disposable loopback test database");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    worker = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([db.$connect(), worker.$connect()]);
  });
  afterAll(async () => { await Promise.all([db?.$disconnect(), worker?.$disconnect()]); });
  const store = () => new PatreonChangeWorkStore(db);
  async function setup() {
    const creatorId = `ps08_${randomUUID()}`;
    await db.tenant.create({ data: { relayCreatorId: creatorId } });
    const change = { creatorId, campaignId: "99", resourceType: "post" as const, resourceId: "123", eventType: "posts:update" };
    const accept = (hash = "A") => store().accept([change], hash);
    const row = () => db.patreonChangeWork.findFirstOrThrow({ where: { creatorId } });
    const due = async () => { const r = await row(); await db.patreonChangeWork.update({ where: { id: r.id }, data: { dueAt: new Date(0), retryNotBefore: null } }); return r.id; };
    return { change, creatorId, accept, row, due };
  }
  it("survives acknowledgment before any queue dispatch and processes after a fresh store starts", async () => {
    const r = await setup(); await r.accept(); const id = await r.due();
    const execute = vi.fn().mockResolvedValue(undefined);
    await processPatreonChanges(new PatreonChangeWorkStore(worker), execute, id);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "123", eventType: "posts:update" }));
    expect(await r.row()).toMatchObject({ status: "completed", generation: 1, completedGeneration: 1 });
  });
  it("coalesces duplicates without storing a receipt per delivery and preserves A-to-B-to-A", async () => {
    const r = await setup(); await Promise.all([r.accept(), r.accept(), r.accept()]);
    expect(await r.row()).toMatchObject({ generation: 1 });
    await r.accept("B"); await r.accept("A");
    expect(await r.row()).toMatchObject({ generation: 3 });
    expect(await db.patreonChangeWork.count({ where: { creatorId: r.creatorId } })).toBe(1);
  });
  it("retains identical thin events after processing starts or completes", async () => {
    const r = await setup(); await r.accept(); const id = await r.due();
    const first = await store().claim(id);
    await r.accept(); await store().finish(first!);
    expect(await r.row()).toMatchObject({ status: "pending", generation: 2, completedGeneration: 1 });
    await processPatreonChanges(store(), async () => {}, await r.due());
    await r.accept();
    expect(await r.row()).toMatchObject({ status: "pending", generation: 3, completedGeneration: 2 });
  });
  it("caps continuous-event debounce and preserves newer arrivals during execution", async () => {
    const r = await setup(); await r.accept();
    const before = await r.row();
    await db.patreonChangeWork.update({ where: { id: before.id }, data: { firstPendingAt: new Date(Date.now() - PATREON_CHANGE_MAX_WAIT_MS - 1) } });
    await r.accept("B"); expect((await r.row()).dueAt.getTime()).toBeLessThanOrEqual(Date.now());
    const claim = await store().claim(before.id); expect(claim).not.toBeNull();
    await r.accept("C"); await store().finish(claim!);
    expect(await r.row()).toMatchObject({ status: "pending", generation: 3, completedGeneration: 2, attempts: 0 });
    await processPatreonChanges(store(), async () => {}, await r.due());
    expect(await r.row()).toMatchObject({ status: "completed", completedGeneration: 3 });
  });
  it("only one of two workers claims a resource; expired leases recover and stale owners cannot finish it", async () => {
    const r = await setup(); await r.accept(); const id = await r.due();
    const claims = await Promise.all([store().claim(id), new PatreonChangeWorkStore(worker).claim(id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const old = claims.find(Boolean)!;
    await db.patreonChangeWork.update({ where: { id }, data: { leaseUntil: new Date(0) } });
    const fresh = await new PatreonChangeWorkStore(worker).claim(id); expect(fresh?.leaseToken).not.toBe(old.leaseToken);
    await store().finish(old);
    expect((await r.row()).status).toBe("running");
    await store().finish(fresh!); expect((await r.row()).status).toBe("completed");
  });
  it("retains exhausted retries and provider delays, redacts failures, and supports scoped retry", async () => {
    const r = await setup(); await r.accept();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const id = await r.due();
      await expect(processPatreonChanges(store(), async () => { throw Object.assign(new Error("secret fixture body"), { retryAfterMs: 1_800_000 }); }, id)).rejects.toThrow("requires retry");
      const row = await r.row(); expect(row.attempts).toBe(attempt);
      expect(row.dueAt.getTime()).toBeGreaterThan(Date.now() + 1_790_000);
      expect(JSON.stringify(row)).not.toContain("secret fixture");
    }
    expect((await r.row()).status).toBe("failed");
    expect(await store().retryFailed((await r.row()).id, "other-creator")).toBe(false);
    expect(await store().retryFailed((await r.row()).id, r.creatorId)).toBe(true);
    expect((await r.row()).dueAt.getTime()).toBeGreaterThan(Date.now() + 1_790_000);
    await processPatreonChanges(store(), async () => {}, await r.due());
    expect((await r.row()).status).toBe("completed");
  });
  it("does not let arrivals during or after a throttled attempt bypass its provider delay", async () => {
    const r = await setup(); await r.accept(); const id = await r.due();
    const claim = await store().claim(id);
    await r.accept("B");
    await store().finish(claim!, { retryAfterMs: 1_800_000 });
    const delayed = (await r.row()).dueAt.getTime();
    await r.accept("C");
    expect((await r.row()).dueAt.getTime()).toBeGreaterThanOrEqual(delayed);
    expect(await store().claim(id)).toBeNull();
  });
  it("fences completion against concurrent acceptance without stranding new work", async () => {
    const r = await setup(); await r.accept(); const id = await r.due();
    const claim = await store().claim(id);
    await Promise.all([store().finish(claim!), new PatreonChangeWorkStore(worker).accept([r.change], "B")]);
    const row = await r.row();
    expect(row).toMatchObject({ generation: 2, status: "pending", leaseToken: null });
  });
  it("cannot acknowledge an unclaimed pending receipt", async () => {
    const r = await setup(); await r.accept();
    await store().finish(await r.row());
    expect(await r.row()).toMatchObject({ status: "pending", completedGeneration: 0 });
  });
  it("enables RLS, keeps receipts private, and cascades creator deletion", async () => {
    const r = await setup(); await r.accept();
    const result = await db.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE oid = 'patreon_change_work'::regclass`;
    expect(result[0]!.relrowsecurity).toBe(true);
    const grants = await db.$queryRaw<Array<{ grantee: string }>>`SELECT grantee FROM information_schema.role_table_grants WHERE table_name='patreon_change_work' AND grantee IN ('PUBLIC','anon','authenticated')`;
    expect(grants).toEqual([]);
    await db.tenant.delete({ where: { relayCreatorId: r.creatorId } });
    expect(await db.patreonChangeWork.count({ where: { creatorId: r.creatorId } })).toBe(0);
  });
  it("rolls back accumulated acceptance on failure and retains unprocessed work beyond retention", async () => {
    const r = await setup();
    await expect(store().accept([r.change, { ...r.change, creatorId: "missing-tenant" }], "A")).rejects.toThrow();
    expect(await db.patreonChangeWork.count({ where: { creatorId: r.creatorId } })).toBe(0);
    await r.accept(); const id = await r.due();
    await db.patreonChangeWork.update({ where: { id }, data: { completedAt: new Date(0) } });
    await store().retain(); expect((await r.row()).status).toBe("pending");
    await processPatreonChanges(store(), async () => {}, id);
    await db.patreonChangeWork.update({ where: { id }, data: { completedAt: new Date(0) } });
    await store().retain(); expect(await db.patreonChangeWork.count({ where: { id } })).toBe(0);
  });
  it("retains a crash on the final attempt as failed instead of stranding a running lease", async () => {
    const r = await setup(); await r.accept(); const id = await r.due();
    await db.patreonChangeWork.update({ where: { id }, data: { attempts: 4 } });
    await store().claim(id);
    await db.patreonChangeWork.update({ where: { id }, data: { leaseUntil: new Date(0) } });
    await store().retain(); expect(await r.row()).toMatchObject({ status: "failed", attempts: 5, leaseToken: null });
  });
});
