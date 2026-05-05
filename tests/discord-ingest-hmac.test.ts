import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  getDiscordIngestHmacSecret,
  verifyDiscordIngestHmac
} from "../src/discord/discord-ingest-hmac.js";

describe("discord-ingest-hmac", () => {
  it("verifies sha256=<hex> header", () => {
    vi.stubEnv("RELAY_DISCORD_INGEST_HMAC_SECRET", "unit-test-secret");
    try {
      const body = Buffer.from('{"hello":"world"}', "utf8");
      const hex = createHmac("sha256", "unit-test-secret").update(body).digest("hex");
      expect(verifyDiscordIngestHmac(body, `sha256=${hex}`)).toBe(true);
      expect(verifyDiscordIngestHmac(body, hex)).toBe(true);
      expect(verifyDiscordIngestHmac(body, "sha256=deadbeef")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns false when secret missing", () => {
    vi.stubEnv("RELAY_DISCORD_INGEST_HMAC_SECRET", "");
    try {
      const body = Buffer.from("{}");
      expect(getDiscordIngestHmacSecret()).toBeNull();
      expect(verifyDiscordIngestHmac(body, "sha256=abc")).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
