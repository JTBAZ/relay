import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { FilePatreonCookieStore } from "../src/auth/cookie-store.js";

describe("cookie vault HTTP failures", () => {
  it.each(["upsert", "remove", "checkCredential"] as const)("returns a private 503 when %s fails", async (method) => {
    const root = await mkdtemp(join(tmpdir(), "relay-cookie-http-"));
    const { app } = createApp({
      relay_token_encryption_key: randomBytes(32).toString("base64"), patreon_client_id: "fixture", patreon_client_secret: "fixture",
      credential_store_path: join(root, "tokens.json"), cookie_store_path: join(root, "cookies.json"),
      identity_store_path: join(root, "identity.json")
    });
    let failure: { mockRestore(): void } | undefined;
    try {
      const registered = await request(app).post("/api/v1/identity/register").send({
        creator_id: "fixture-creator", email: "fixture@example.com", password: "fixture-password", tier_ids: []
      }).expect(201);
      failure = vi.spyOn(FilePatreonCookieStore.prototype, method).mockRejectedValueOnce(new Error("private-session-material"));
      const token = registered.body.data.token as string;
      const response = method === "checkCredential"
        ? await request(app).get("/api/v1/patreon/cookie/status").query({ creator_id: "fixture-creator" }).set("Authorization", `Bearer ${token}`)
        : await request(app)[method === "upsert" ? "post" : "delete"]("/api/v1/patreon/cookie").set("Authorization", `Bearer ${token}`)
          .send({ creator_id: "fixture-creator", session_id: "fixture-only" });
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("COOKIE_STORE_UNAVAILABLE");
      expect(JSON.stringify(response.body)).not.toContain("private-session-material");
    } finally {
      failure?.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
