import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbPatreonCookieStore } from "../src/auth/cookie-store-db.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { signExtensionConsentCode } from "../src/auth/extension-consent-code.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS13 shared one-use consent and original credential age", () => {
  let first: PrismaClient, second: PrismaClient;
  const children: ChildProcess[] = [], roots: string[] = [];
  const creatorIds: string[] = [], accountIds: string[] = [];
  const key = randomBytes(32).toString("base64"), secret = randomBytes(32).toString("hex"), beforeSecret = process.env.RELAY_EXTENSION_CONSENT_SECRET;
  beforeAll(async () => {
    const target = new URL(targetUrl!);
    if (target.hostname !== "127.0.0.1" || target.port !== "49952" || target.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(target.pathname)) throw new Error("Explicit private PS13 database required");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) }); second = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
    await Promise.all([first.$connect(), second.$connect()]); process.env.RELAY_EXTENSION_CONSENT_SECRET = secret;
    // Exact approved additive migration only, against the asserted private target.
    await first.$executeRawUnsafe(await readFile(resolve("prisma/migrations/20261021010000_extension_consent_claim/migration.sql"), "utf8"));
  });
  afterAll(async () => {
    await Promise.all(children.map((child) => new Promise<void>((done) => {
      if (child.exitCode !== null) return done();
      const timer = setTimeout(() => { child.kill(); done(); }, 10_000);
      child.once("close", () => { clearTimeout(timer); done(); }); child.send("close");
    })));
    if (first) {
      await first.account.deleteMany({ where: { id: { in: accountIds } } });
      await first.tenant.deleteMany({ where: { relayCreatorId: { in: creatorIds } } });
    }
    await Promise.all([first?.$disconnect(), second?.$disconnect()]); process.env.RELAY_EXTENSION_CONSENT_SECRET = beforeSecret;
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }, 30_000);
  async function fixture() {
    const id = randomUUID(), creatorId = `ps13_${id}`, accountId = `ps13_account_${id}`;
    creatorIds.push(creatorId); accountIds.push(accountId);
    await first.tenant.create({ data: { relayCreatorId: creatorId } });
    await first.account.create({ data: { id: accountId, identityAuthProvider: "independent", primaryRelayCreatorId: creatorId } });
    return { creatorId, accountId, store: new DbPatreonCookieStore(first, new TokenEncryption(key)), worker: new DbPatreonCookieStore(second, new TokenEncryption(key)) };
  }
  async function api() {
    const root = await mkdtemp(join(tmpdir(), "relay-ps13-api-")); roots.push(root);
    return new Promise<number>((accept, reject) => {
      const child = spawn(process.execPath, [resolve("node_modules/vite-node/vite-node.mjs"), resolve("tests/helpers/extension-consent-process.ts")], {
        windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, PS13_CONSENT_INPUT: JSON.stringify({ url: targetUrl, key, secret, root }) }
      }); children.push(child);
      const timeout = setTimeout(() => { child.kill(); reject(new Error("Private API fixture timed out")); }, 60_000);
      child.once("message", (message: unknown) => { clearTimeout(timeout); if (message && typeof message === "object" && "port" in message) accept(Number(message.port)); else reject(new Error("Private API fixture unavailable")); });
      child.once("error", () => { clearTimeout(timeout); reject(new Error("Private API fixture unavailable")); });
    });
  }
  it("preserves age across clients and cannot rotate after another client removes/rejects/expires storage", async () => {
    const a = await fixture(); await a.store.upsert(a.creatorId, "before");
    const storedAt = new Date(Date.now() - 89 * 86400000); await first.patreonSession.update({ where: { creatorId: a.creatorId }, data: { storedAt } });
    await a.worker.rotateCredential(a.creatorId, "rotated"); expect((await a.store.checkCredential(a.creatorId)).stored_at).toBe(storedAt.toISOString());
    await a.store.remove(a.creatorId); expect((await a.worker.rotateCredential(a.creatorId, "stale")).status).toBe("none");
    await a.store.upsert(a.creatorId, "fresh"); await a.store.markPatreonRejectedSession(a.creatorId);
    expect((await a.worker.rotateCredential(a.creatorId, "stale")).status).toBe("rejected_remote");
    await a.store.upsert(a.creatorId, "fresh"); await first.patreonSession.update({ where: { creatorId: a.creatorId }, data: { storedAt: new Date("2020-01-01") } });
    expect((await a.worker.rotateCredential(a.creatorId, "stale")).status).toBe("expired_local");
  });
  it("only one of two API processes captures a code, and replay cannot restore a subsequently deleted credential", async () => {
    const a = await fixture(), [portA, portB] = await Promise.all([api(), api()]);
    const installation = "private-installation", code = signExtensionConsentCode({ accountId: a.accountId, installationId: installation }).consent_code;
    const exchange = (port: number, consentCode = code) => fetch(`http://127.0.0.1:${port}/api/v1/auth/extension/consent/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent_code: consentCode, installation_id: installation, session_id: "browser-current" }) });
    const responses = await Promise.all([exchange(portA), exchange(portB)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await a.store.getSessionId(a.creatorId)).toBe("browser-current");
    await a.store.remove(a.creatorId);
    expect((await exchange(portA)).status).toBe(409); expect((await exchange(portB)).status).toBe(409);
    expect(await a.worker.getSessionId(a.creatorId)).toBeNull();
    const fresh = signExtensionConsentCode({ accountId: a.accountId, installationId: installation }).consent_code;
    expect((await exchange(portB, fresh)).status).toBe(200); expect(await a.worker.getSessionId(a.creatorId)).toBe("browser-current");
  }, 120_000);
});
