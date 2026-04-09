import { describe, expect, it } from "vitest";
import { extractCampaignIdFromPatreonWebhookPayload } from "../src/patreon/patreon-webhook-platform.js";

describe("extractCampaignIdFromPatreonWebhookPayload", () => {
  it("reads campaign id from data.relationships.campaign", () => {
    const parsed = {
      data: {
        type: "member",
        id: "m1",
        relationships: {
          campaign: { data: { type: "campaign", id: "123456" } }
        }
      }
    };
    expect(extractCampaignIdFromPatreonWebhookPayload(parsed)).toBe("123456");
  });

  it("falls back to included campaign resource", () => {
    const parsed = {
      data: { type: "x", id: "1" },
      included: [{ type: "campaign", id: "999" }]
    };
    expect(extractCampaignIdFromPatreonWebhookPayload(parsed)).toBe("999");
  });
});
