import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TokenEncryption } from "../src/lib/crypto.js";
import { PatreonWebhookMetadataStore } from "../src/patreon/patreon-webhook-metadata-store.js";

describe("PatreonWebhookMetadataStore Postgres dual-read", () => {
  it("resolves opaque token + secret from WebhookEndpoint when the file store is empty", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-wh-meta-"));
    const key = randomBytes(32).toString("base64");
    const encryption = new TokenEncryption(key);
    const filePath = join(tempDir, "patreon_webhook_metadata.json");
    const opaque = "afd50a37c5f9655d2e7166bc9a6ba02fdfbe9ec258f0a46b";
    const creatorId = "cr_dual_read_probe";
    const plaintextSecret = "patreon-webhook-hmac-secret";
    const encrypted = encryption.encrypt(plaintextSecret);

    const prisma = {
      webhookEndpoint: {
        findUnique: async (args: {
          where: { opaqueDeliveryToken?: string; relayCreatorId?: string };
          select?: { relayCreatorId: true; opaqueDeliveryToken: true };
        }) => {
          if (args.where.opaqueDeliveryToken === opaque) {
            return { relayCreatorId: creatorId, opaqueDeliveryToken: opaque };
          }
          if (args.where.relayCreatorId === creatorId) {
            return {
              id: "we_1",
              relayCreatorId: creatorId,
              patreonCampaignNumericId: "123",
              encryptedSecret: Buffer.from(encrypted, "utf8"),
              keyId: "RELAY_TOKEN_ENCRYPTION_KEY",
              opaqueDeliveryToken: opaque,
              patreonWebhookId: "wh_1",
              uriRegistered: `https://api.example/platform/${opaque}`,
              registrationStatus: "ok",
              triggers: ["members:pledge:create"],
              createdAt: new Date("2026-04-26T15:43:39.291Z"),
              updatedAt: new Date("2026-04-26T15:43:39.291Z")
            };
          }
          return null;
        }
      }
    };

    const store = new PatreonWebhookMetadataStore(filePath, encryption, prisma as never);
    expect(await store.getCreatorIdForOpaqueToken(opaque)).toBe(creatorId);
    const meta = await store.getByCreatorId(creatorId);
    expect(meta?.registration_status).toBe("ok");
    expect(store.decryptWebhookSecret(meta!)).toBe(plaintextSecret);

    const hydrated = JSON.parse(await readFile(filePath, "utf8")) as {
      token_index: Record<string, string>;
      records: Record<string, { opaque_delivery_token: string }>;
    };
    expect(hydrated.token_index[opaque]).toBe(creatorId);
    expect(hydrated.records[creatorId]?.opaque_delivery_token).toBe(opaque);
  });
});
