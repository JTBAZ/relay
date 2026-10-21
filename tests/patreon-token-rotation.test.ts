import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PatreonAuthService } from "../src/auth/auth-service.js";
import { PatreonClient } from "../src/auth/patreon-client.js";
import { FilePatreonTokenStore } from "../src/auth/token-store.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { InMemoryEventBus } from "../src/events/event-bus.js";

import { expiredCredential, proveSharedRotation } from "./helpers/patreon-token-rotation.js";
import { runTokenProcess } from "./helpers/run-token-process.js";

describe("PS-07 file-backed token rotation", () => {
  it("coordinates two actual processes", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-ps07-token-"));
    const path = join(root, "tokens.json"), log = join(root, "rotations.log");
    const key = randomBytes(32).toString("base64");
    await new FilePatreonTokenStore(path, new TokenEncryption(key)).upsert(expiredCredential());
    await Promise.all([runTokenProcess({ key, path, log, creatorId: "c" }), runTokenProcess({ key, path, log, creatorId: "c" })]);
    expect((await readFile(log, "utf8")).trim().split("\n")).toEqual(["rotated"]);
  }, 30_000);
  it("coordinates separate store/service instances and preserves provider identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-ps07-token-"));
    const key = new TokenEncryption(randomBytes(32).toString("base64"));
    await proveSharedRotation(new FilePatreonTokenStore(join(root, "tokens.json"), key), new FilePatreonTokenStore(join(root, "tokens.json"), key));
  });
  it("retains other creators during simultaneous writes and refuses to overwrite corrupt data", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-ps07-token-"));
    const path = join(root, "tokens.json");
    const key = new TokenEncryption(randomBytes(32).toString("base64"));
    const a = new FilePatreonTokenStore(path, key), b = new FilePatreonTokenStore(path, key);
    await Promise.all([a.upsert(expiredCredential("a")), b.upsert(expiredCredential("b"))]);
    expect(await a.listCreatorIds()).toEqual(["a", "b"]);
    await writeFile(path, "corrupt fixture");
    await expect(a.upsert(expiredCredential("c"))).rejects.toThrow("cannot be read");
    expect(await readFile(path, "utf8")).toBe("corrupt fixture");
  });
  it("does not replay token POSTs after an ambiguous network failure, or overwrite the stored pair", async () => {
    const root = await mkdtemp(join(tmpdir(), "relay-ps07-token-"));
    const store = new FilePatreonTokenStore(join(root, "tokens.json"), new TokenEncryption(randomBytes(32).toString("base64")));
    await store.upsert(expiredCredential());
    const fake = vi.fn<typeof fetch>(async () => { throw new Error("secret response"); });
    const auth = new PatreonAuthService(new PatreonClient({ client_id: "fixture", client_secret: "fixture", token_url: "https://www.patreon.com/api/oauth2/token", fetch_impl: fake }), store, new InMemoryEventBus());
    await expect(auth.refreshAndRotate("c", "fixture")).rejects.toMatchObject({ retriable: true });
    expect(fake).toHaveBeenCalledTimes(1);
    expect(await store.getByCreatorId("c")).toEqual(expiredCredential());
    for (const invalid of [{}, { access_token: "new", refresh_token: "new", expires_in: null }]) {
      const client = new PatreonClient({ client_id: "fixture", client_secret: "fixture", token_url: "https://www.patreon.com/api/oauth2/token", fetch_impl: async () => Response.json(invalid) });
      await expect(new PatreonAuthService(client, store, new InMemoryEventBus()).refreshAndRotate("c", "fixture")).rejects.toThrow("invalid token");
      expect(await store.getByCreatorId("c")).toEqual(expiredCredential());
    }
  });
});
