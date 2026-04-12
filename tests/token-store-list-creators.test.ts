import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilePatreonTokenStore } from "../src/auth/token-store.js";
import { TokenEncryption } from "../src/lib/crypto.js";

describe("FilePatreonTokenStore.listCreatorIds", () => {
  const tmpRoot = join(process.cwd(), ".tmp-test-token-list");

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns sorted creator ids from the credential file", async () => {
    await mkdir(tmpRoot, { recursive: true });
    const path = join(tmpRoot, "creds.json");
    const key = Buffer.alloc(32, 7).toString("base64");
    const enc = new TokenEncryption(key);
    const store = new FilePatreonTokenStore(path, enc);
    await store.upsert({
      creator_id: "z",
      access_token: "a",
      refresh_token: "r",
      access_token_expires_at: new Date().toISOString(),
      credential_health_status: "healthy"
    });
    await store.upsert({
      creator_id: "a",
      access_token: "a",
      refresh_token: "r",
      access_token_expires_at: new Date().toISOString(),
      credential_health_status: "healthy"
    });
    const ids = await store.listCreatorIds();
    expect(ids).toEqual(["a", "z"]);
    const raw = JSON.parse(await readFile(path, "utf8")) as { records: unknown };
    expect(raw.records).toBeDefined();
  });
});
