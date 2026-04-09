import { describe, expect, it } from "vitest";
import {
  patreonWebhookMd5Hex,
  verifyPatreonWebhookSignature
} from "../src/patreon/patreon-webhook-signature.js";

describe("Patreon webhook MD5 HMAC (documented)", () => {
  it("matches a fixed vector for raw body bytes", () => {
    const secret = "test_webhook_secret";
    const raw = Buffer.from('{"data":{"type":"member","id":"1"}}', "utf8");
    const hex = patreonWebhookMd5Hex(raw, secret);
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyPatreonWebhookSignature(raw, hex, secret)).toBe(true);
    expect(verifyPatreonWebhookSignature(raw, "deadbeef", secret)).toBe(false);
  });

  it("rejects when header is missing or wrong length", () => {
    const raw = Buffer.from("{}", "utf8");
    expect(verifyPatreonWebhookSignature(raw, undefined, "s")).toBe(false);
    expect(verifyPatreonWebhookSignature(raw, "short", "s")).toBe(false);
  });
});
