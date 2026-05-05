/**
 * HMAC signing must match `src/discord/discord-ingest-hmac.ts` (Relay API verification).
 */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyDiscordIngestHmac } from "../src/discord/discord-ingest-hmac.js";

function signBodyUtf8(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("Discord bridge HMAC (bot vs API)", () => {
  it("accepts sha256=<hex> for UTF-8 JSON body", () => {
    vi.stubEnv("RELAY_DISCORD_INGEST_HMAC_SECRET", "test-secret-32bytes-minimum___");
    try {
      const body = '{"discord_guild_id":"1","discord_channel_id":"2","discord_message_id":"3","attachments":[]}';
      const hex = signBodyUtf8(body, "test-secret-32bytes-minimum___");
      expect(verifyDiscordIngestHmac(Buffer.from(body, "utf8"), `sha256=${hex}`)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
